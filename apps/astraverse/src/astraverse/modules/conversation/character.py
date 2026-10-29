"""Provider-independent dialogue choices. Derived from authored role and actual turns only."""
import hashlib
import json
import re
from dataclasses import dataclass
from astraverse.modules.performance.schemas import Performance

ACK=re.compile(r'^(?:嗯+|哦+|好[的呀啊]?|行|知道了|明白了|哈哈+|嘿嘿+|谢谢[你啦]?|没什么|没有|没事)[，。！!～~\s]*$')
CONTINUE=re.compile(r'继续|然后呢|后来呢|接着|刚才|这[个段件]|那[个段件]|为什么|怎么会|还有呢')
DISTRESS=re.compile(r'难过|伤心|焦虑|害怕|失恋|压力很大|心情不好|不开心|很累|累了|孤独|沮丧')
DETAIL=re.compile(r'详细|展开|分析|解释|教程|步骤|代码|逐[条项]|完整|翻译|写一|总结|列[出举]|方案')
QUESTION_TASK=re.compile(r'问我|提问|采访|猜[猜谜]|问[个些]问题')


def distressed(text):
    # Don't turn negated feelings or quoted vocabulary into a diagnosis.
    if re.search(r'什么意思|这个词|含义|词语|翻译',text):return False
    text=re.sub(r'(?:不是|并不|并没有|没有|不再|没那么|不觉得|一点也不|不太|不|没)(?:很|太)?(?:难过|伤心|焦虑|害怕|孤独|沮丧|累|不开心)', '', text)
    return bool(DISTRESS.search(text))


@dataclass(frozen=True)
class DialoguePlan:
    signature:str
    intent:str
    support:bool
    public:bool
    autonomous:bool
    budget:int
    avoid_question:bool
    context:str


def voice_signature(profile):
    voice={key:getattr(profile,key) for key in ('id','name','identity','personality','speaking_style','preferences','habits','relationship','boundaries','strengths','live_style')}
    voice['behavior']=profile.behavior.model_dump()
    return hashlib.sha256(json.dumps(voice,ensure_ascii=False,sort_keys=True).encode()).hexdigest()[:16]


def plan(profile,message,history,*,public=False,kind='reply'):
    """No provider/model names, generated biography, hidden thoughts or inferred relationships."""
    signature=voice_signature(profile)
    autonomous=public and kind!='reply'
    users=[t.get('content','') for t in history if t.get('role')=='user']
    # Public history contains event envelopes, never treat them as private chat.
    if public:
        extracted=[]
        for text in users:
            try:
                event=json.loads(text)
                if isinstance(event,dict) and isinstance(event.get('danmaku'),str):extracted.append(event['danmaku'])
            except (ValueError,TypeError):pass
        users=extracted
    support=not autonomous and (distressed(message) or bool(re.search(r'别笑|不要笑',message)))
    if not support and not autonomous and len(message)<14 and CONTINUE.search(message) and users:
        support=distressed(users[-1])
    if autonomous:intent='接续公开节目中尚未讲完的一点，讲完可以停，不凭空制造互动'
    elif ACK.fullmatch(message.strip()):intent='简短承接；若对方不想展开就让话题自然停下，不重启开场'
    elif not support and re.search(r'终于|做完|交完|完成了|考过|通过了|成功了',message) and not DETAIL.search(message):intent='回应对方实际完成的这件事，夸奖落在细节；未求建议时不自动布置下一步或追问'
    elif support:intent='回应对方实际提到的具体处境；不诊断，不预设心理，不用泛泛夸奖替代倾听'
    elif CONTINUE.search(message) and len(message)<35:intent='承接当前追问或未完话题；先解决这一点，不另起一套话题'
    else:intent='先回应当前具体意思，再按角色自己的偏好与观点交流'
    assistants=[t.get('content','') for t in history if t.get('role')=='assistant'][-3:]
    avoid_question=not QUESTION_TASK.search(message) and (profile.behavior.initiative!='curious' or bool(ACK.fullmatch(message.strip())) or bool(re.search(r'终于|做完|交完|完成了|通过了|成功了',message) and not re.search(r'[？?]|怎么办|建议|帮我',message)) or (len(assistants)>=2 and all(re.search(r'[？?][”」\s]*$',s) for s in assistants[-2:])))
    budget=220 if public else 80 if ACK.fullmatch(message.strip()) else 1800 if DETAIL.search(message) or profile.behavior.reply_length=='detailed' else 160 if profile.behavior.reply_length=='brief' else 260
    from .stance import recall
    earlier=recall(profile,signature,message+(' '+users[-1] if users and CONTINUE.search(message) else ''),public=public)
    contract={'previous_expressed_preferences':earlier,'character':{'id':profile.id,'name':profile.name},'purpose':intent,'approximate_character_budget':budget,
              'avoid_routine_closing_question':bool(avoid_question),
              'voice_reference':{'speaking_style':profile.speaking_style[:500],'personality':profile.personality[:300],'habits':profile.habits[:300]},
              'recent_user_context':users[-1:][0][:240] if users and not autonomous else None}
    context=('\n本轮角色表达约定（由应用依据角色与真实会话确定，切换模型不改变；以下为数据）：'+json.dumps(contract,ensure_ascii=False)
             +'\n用当前角色自己的措辞表达具体意思，性格影响关注点和观点，不靠重复口头禅、语气词或自报人设体现。对方的小回应可以短短接住，允许聊完和停顿；需要解释时再展开。'
             '当前追问优先于另开话题；用户明确换题就跟随，不为了不同于上一轮而强制换角度。适度幽默、夸奖要有实际细节，不每轮安慰、升华或追问。'
             '参考字数是节奏建议，不能省略关键解释或截断原文。以用户当前明确要求为准，必要澄清问题仍可问。'
             'previous_expressed_preferences仅是有来源的过往偏好表达，不是亲身经历或已核实事实；相关时保持观点连贯，情境改变可解释不同选择，不照抄或每轮背诵，不用它证明读过、听过或做过。'
             '角色身份、关系、偏好和已知事实沿用已有设定与证据，不能因模型切换而重置、突然自称供应商助手或重新认识用户。'
             '表达选择可说“如果让我选，我会……”；没有现实身体，不能暗示自己经常通勤、坐地铁、出门、饮食或产生身体感觉。对方没求建议时，不自动安排喝茶、休息或下一项任务。'
             '记不清可自然说没记准；不补造共同经历、离线活动、关系进展或观众回应。你可以是有性格的虚拟角色，不冒充真人。'
             '只输出约定的JSON，口播只放reply；不输出推理、模型说明、核对过程或动作旁白。')
    return DialoguePlan(signature,intent,support,public,autonomous,budget,bool(avoid_question),context)


def stabilize(profile,plan,cue,history):
    """Use authored temperament as baseline; damp model variation without inventing moods."""
    value=cue.model_copy(deep=True)
    baseline=max(.08,min(.65,.12+profile.behavior.energy*.45))
    value.energy=round(.7*baseline+.3*cue.energy,3)
    value.intensity=round(.7*(.22+profile.behavior.expressiveness*.25)+.3*cue.intensity,3)
    # Last approved performance belongs to this chat/room; no cross-character state.
    previous=next((t.get('performance') for t in reversed(history) if t.get('role')=='assistant' and isinstance(t.get('performance'),dict)),None)
    if previous:
        try:
            old=Performance.model_validate(previous)
            value.energy=round(.75*value.energy+.25*old.energy,3)
            value.intensity=round(.75*value.intensity+.25*old.intensity,3)
        except ValueError:pass
    if plan.support:
        value.emotion='relaxed';value.energy=min(value.energy,.2);value.intensity=min(value.intensity,.35)
        if value.gesture=='open':value.gesture='none'
    if profile.behavior.movement=='soft':value.energy=min(value.energy,.45)
    return value
