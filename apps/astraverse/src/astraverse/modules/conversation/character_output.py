"""Normalize compatibility endpoints and repair concrete dialogue failures once."""
import asyncio
import json
import re
from difflib import SequenceMatcher
from astraverse.modules.conversation.policy import safe_model_output, OUTPUT_NOTICE
from .character import QUESTION_TASK, DETAIL


def data(text,allow_plain=True):
    clean=text.strip()
    # Never surface reasoning wrappers. A normal JSON reply may legitimately quote tags.
    if clean.startswith('<think>'):
        end=clean.find('</think>')
        if end<0:return None
        clean=clean[end+8:].strip()
    clean=re.sub(r'^```(?:json)?\s*|\s*```$','',clean,flags=re.I).strip()
    decoder=json.JSONDecoder()
    try:
        value=decoder.decode(clean)
        return value if isinstance(value,dict) and isinstance(value.get('reply'),str) and value['reply'].strip() else None
    except (ValueError,TypeError):pass
    # One complete reply object with a compatibility preamble; reject ambiguous objects.
    found=[]
    for match in list(re.finditer(r'\{',clean))[:12]:
        try:
            value,end=decoder.raw_decode(clean[match.start():])
            if isinstance(value,dict) and isinstance(value.get('reply'),str) and value['reply'].strip():found.append(value)
        except ValueError:pass
    if len(found)==1:return found[0]
    if found or re.search(r'[{}]|<think>|</think>|"(?:reply|performance|show_notes)"\s*:',clean):return None
    # Plain conversational text is safe to adapt, but never infer actions from it.
    if allow_plain and clean and len(clean)<=4000:return {'reply':clean}
    return None


def issue(value,profile,plan,history,message):
    if value is None:return 'format','没有完整的reply，重新给出一个完整JSON对象；不要在JSON前后写解释。'
    reply=value['reply'].strip()
    if reply==OUTPUT_NOTICE:return None
    if re.search(r'<think>|</think>|"(?:performance|show_notes)"\s*:|[（(](?:微笑|轻笑|点头|歪头|沉思)[）)]',reply):
        return 'control','正文混入了推理、控制字段或动作旁白，删除这些内容，只在performance中表达动作。'
    identity=re.search(r'^(?:你好[，！!]?\s*)?我(?:是|叫)\s*(ChatGPT|Claude|Gemini|Qwen|通义千问|文心一言|豆包|DeepSeek)\b',reply,re.I)
    if identity and identity[1].casefold() not in (profile.name+' '+profile.identity).casefold():
        return 'identity','你把模型供应商身份当成了角色身份；沿用当前角色姓名和已有关系，不重新开场；只有用户询问时才讨论已知的底层模型信息，不猜测或主动播报切换。'
    if re.search(r'^(?:作为|身为)(?:一[个名款])?\s*(?:AI|人工智能|语言模型)',reply,re.I) and not re.search(r'模型|AI|人工智能|身份|真人|机器人',message,re.I):
        return 'boilerplate','无需以模型助手的免责声明开场，直接以当前角色的说话方式回答具体内容，不冒充真人。'
    # Observable real-world claims, not free-form judgments about personality.
    fictional=bool(re.search(r'故事里|虚构|假如|假设|如果|要是|我会选|我更倾向|我会建议|我会推荐',reply))
    offline=(r'我(?:昨[天晚]|前天|上周|刚刚|刚|曾经|有一次).{0,16}(?:吃|喝|买|泡|煮|逛|坐地铁|通勤|下班|出门|旅行)'
             r'|我.{0,8}(?:眼晕|头晕|心跳加快|手心出汗)'
             r'|(?:^|[。！？\n])(?:我)?(?:通勤|坐地铁|下班|出门|上班)(?:时|的时候|路上).{0,12}(?:会带|会用|带[了着]|拿[了着]|听[着了]|看[着了])')
    if not fictional and re.search(offline,reply):
        return 'experience','把虚拟角色说成亲历了现实活动或身体感觉。保留观点，改为清楚的条件式选择或一般讨论，不声称自己通勤、饮食、出门或有身体感觉。'
    previous=[t.get('content','') for t in history if t.get('role')=='assistant'][-4:]
    plain=lambda s:re.sub(r'[\W_]+','',s).casefold()
    candidate=plain(reply)[:1600]
    if len(candidate)>=35 and not re.search(r'再说[一遍次]|重复|复述|原话|引用|照读',message):
        if any(SequenceMatcher(None,candidate,plain(old)[:1600],autojunk=False).ratio()>.91 for old in previous):
            return 'repetition','大段重复了已经说过的内容。回应当前这一句，若是追问就讲清尚未解释的具体一点，保留当前话题；不要为了避重复强制换题。'
    if plan.avoid_question and not QUESTION_TASK.search(message) and re.search(r'(?:你愿意|想不想|要不要|你有没有|还有什么我可以|你觉得呢).{0,35}[？?][”」\s]*$',reply):
        return 'question_loop','最近连续用问题收尾；这次先给具体回应，除非缺少完成请求的必要信息，不再加例行邀请或追问。'
    if len(reply)>max(180,int(plan.budget*1.5)) and not DETAIL.search(message):
        return 'verbosity','当前是普通交流，回复显著过长；先说清最重要的一点，保留角色语气，不列通用建议清单，参考本轮字数节奏。'
    return None


async def generate(call,message,*,profile,plan,history,system,extra_check=None,**kwargs):
    """At most one correction; all action validation/execution still happens downstream."""
    async def draft(prompt):
        result=await call(prompt,system=system+plan.context,history=history,**kwargs)
        value=data(result['text'],allow_plain=not plan.public)
        if value is not None:
            # Inspect decoded text too, including escaped output from wrapped JSON.
            result={**result,'text':safe_model_output(json.dumps(value,ensure_ascii=False))}
            value=data(result['text'],allow_plain=not plan.public)
        problem=issue(value,profile,plan,history,message)
        if not problem and extra_check:
            note=extra_check(result['text'])
            if note:problem=('hosting',note)
        return result,value,problem
    result,value,problem=await draft(message)
    repaired=bool(problem)
    if problem:
        # The failed draft is not sent back as conversation, persisted or treated as memory.
        try:
            timeout=min(getattr(kwargs.get('settings_override'),'timeout',20),20)
            result,value,problem=await asyncio.wait_for(draft(message+'\n重新生成要求：'+problem[1]+'保留角色性格、事实依据和当前话题，只返回修正后的完整JSON。'),timeout=timeout)
        except asyncio.CancelledError:raise
        except Exception:pass  # Keep the original verdict; never invent a successful correction.
    blocked=bool(problem and problem[0] not in ('verbosity','question_loop'))
    result['character_consistency']={'voice_revision':plan.signature,'repair_attempted':repaired,'repaired':repaired and not bool(problem),'accepted':not blocked,'check':problem[0] if problem else 'passed'}
    result['character_blocked']=blocked
    return result
