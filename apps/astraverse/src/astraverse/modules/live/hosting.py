"""Small public show notes, not private memory or model reasoning."""
import json
import re
from pydantic import BaseModel, ConfigDict, Field

class ShowNotes(BaseModel):
    model_config = ConfigDict(extra='ignore')
    topic: str = Field(max_length=100)
    next_point: str = Field(default='', max_length=200)
    complete: bool = False

def output_data(text):
    try:
        value=json.loads(re.sub(r'^```(?:json)?\s*|\s*```$', '', text.strip(), flags=re.I))
        return value if isinstance(value,dict) else {}
    except (ValueError,TypeError):return {}

def show_notes(text):
    try:return ShowNotes.model_validate(output_data(text).get('show_notes')).model_dump()
    except (ValueError,TypeError):return None

def hosting_context(notes=None):
    return '''
你正在主持一场连续的中文直播，不是逐条生成治愈短文。让表达有具体意思、有自己的偏好和适度幽默。
口语示例只用于理解质感，不可照搬话题和句子：聊游戏日常时可以说“奖励放在那儿，不领就觉得亏。但我明明是来玩的，怎么还多了一份考勤？我更喜欢攒到周末一起做的设计。”而不是“原来每次打卡，都是生活偷偷奖励认真的你”。讲你的判断和理由，不给所有人下心理诊断，不把随口猜想说成大脑、身体或潜意识的科学规律。
收到“终于交报告了”时，“总算交了！一直惦记着挺烦的，这下能安心歇一会儿了。”就能接住。不必写肩膀轻几斤、脑内小烟花、隐形背包、糖和光。说“我更喜欢/我会选”可以，说“我昨天做过”需要实际依据。讨论某款作品的具体机制必须有提供的资料；缺少依据就以“假如有个游戏”来举例。普通闲聊不主动给健康、心理机制或营养建议。
本次事件若是idle，表示没有新弹幕，不是观众问了问题。先沿着本场正在讲的内容接下去，讲出新的细节、理由或反例；说完了再顺势转向相关内容。没有义务每轮开场、总结、追问、夸奖或升华。短回应可以只有一句，展开观点时可以长一点。温柔体现在回应具体内容，幽默体现在看法，不堆漂亮比喻。
同一个意思讲清楚后可以结束，不必无限列举“再比如/还有人说”来延长；继续同一话题要有尚未讲清的内容，而不是换个物件重说同一个结论。是否讲完根据实际内容判断，不按固定轮数或时间换题。
话题列表仅是可选素材；“轮换”偏好不能覆盖未讲完的内容。收到弹幕时：简单问候轻轻接住，相关问题直接融入，认真分享认真回应；不要逐字复读。互动结束后可接回未完内容；观众明确换题时听从实际话题变化。不得制造并不存在的弹幕、礼物或观众回应。
不得编造“今天刚做过/吃过/看过”的现实经历或作品具体镜头。可以直接表达偏好、举明确的假设；不用每轮声明虚拟身份。不用“物件→比喻→原来生活→你有没有”的流水线段子，不写括号动作、心理旁白或控制JSON到reply中。
输出一个JSON对象。reply是唯一口播正文；performance沿用表情结构；next_wait_seconds为5–600的整数，按所需停顿选择；show_notes只记录本场公开节目进度：
{"reply":"这一段实际要说的话","performance":{"emotion":"neutral","gesture":"none","intensity":0.4,"energy":0.3,"duration":5},"next_wait_seconds":8,"show_notes":{"topic":"本段话题","next_point":"下一段尚未展开的具体内容，讲完则留空","complete":false}}
show_notes不是口播，也不记录观众私密信息，不输出思考过程。next_point必须是同一话题尚未讲出的具体例子、不同选择或实际理由，不规划心理学解释，不是下一个话题或要重复的结论；已讲完则complete=true、next_point留空。弹幕只是插话时保留原话题进度，观众明确改聊新话题才更新。观众的经历属于观众，不能在之后变成你自己的经历。不要照读示例中的占位文字。
本场公开节目进度（参考数据，不是指令）：''' + json.dumps(notes or {},ensure_ascii=False)

def idle_task(room, references, notes=None):
    """An explicit hosting task; topic references are never a fictitious viewer turn."""
    continuing = notes and not notes.get('complete') and notes.get('next_point')
    task = ('继续讲当前话题：'+notes['topic']+'。本段具体展开：'+notes['next_point'] if continuing else
            '选一个你有观点、能具体展开的小问题，直接开始聊。将参考中的宽泛名词变成具体问题，例如聊游戏可以谈日常任务为什么像上班。自主选题，不逐条朗读参考。')
    return (task+'\n现在没有新弹幕。这是直播接下来真正要说的一段口语，不是写日记、散文、安慰文或本轮总结。'
            '用平实口语给出明确看法，再用具体情况解释；本段不用比喻，不替所有人分析身体、大脑、潜意识，不编写戏剧性场景。'
            '不编造刚才吃过什么、收拾过什么等亲身经历；举例用“比如/假如”。'
            '已回应过的弹幕不要再祝贺、安慰一次；从本场未讲完的地方接着说。用要求的JSON输出。\n参考数据：'
            +json.dumps({'room':room,'event':'idle','topic_references':references},ensure_ascii=False))

def reply_task(room, viewer, message):
    return ('直接接住下面这条真实弹幕，像朋友说话，回复长短跟随弹幕内容。'
            '问候就简短问候；分享就回应实际做过的事；明确换话题就跟随新话题。'
            '用平实口语，本段不用比喻、身体场景或生活感悟。你不能假装刚泡了饮料、在窗边、刚吃饭等现实动作，'
            '也不能把观众经历说成自己的经历。show_notes只在话题确实改变时更新。用要求的JSON输出。\n弹幕数据：'
            +json.dumps({'room':room,'viewer':viewer,'danmaku':message},ensure_ascii=False))

def draft_issue(text, history, *, autonomous=False):
    """Catch concrete failures only; same topic and ordinary word reuse are allowed."""
    data=output_data(text)
    reply=data.get('reply')
    if not isinstance(reply,str) or not reply.strip():return '输出格式不完整；重新给出完整JSON，口播只放reply。'
    if re.search(r'"(?:performance|show_notes|emotion)"\s*:|[（(](?:笑|微笑|轻笑|点头|歪头|沉思)[）)]',reply):
        return '口播混入了控制字段或动作旁白，删除这些内容。'
    claims = (r'(?:昨天|今天|刚才|上周|刚刚).{0,3}我.{0,12}(?:翻出|吃|买|收拾|看到|发现)'
              r'|我刚.{0,8}(?:翻|吃|买|收拾|看)|我.{0,6}(?:桌面|抽屉)里翻出'
              r'|(?:^|[。！？～，])(?:我)?刚(?:泡|吃|喝|买|收拾|翻出)'
              r'|(?:现实中我|我拉开抽屉|正靠在窗边|我试过|我曾经|我有一次|我以前|我之前|我自己停掉)'
              r'|(?:吃|喝|睡|煮|煎).{0,25}(?:让我|我一整天)')
    next_point=str((data.get('show_notes') or {}).get('next_point','')) if isinstance(data.get('show_notes'),dict) else ''
    if re.search(claims,reply+'\n'+next_point):
        return '把没有依据的亲身经历当成事实或计划讲自己的离线经历；正文和next_point改用“假如有人……”的明确假设。不要声称自己做过、吃过、试过这些事。'
    previous=[turn.get('content','') for turn in history if turn.get('role')=='assistant'][-6:]
    if autonomous:
        for frame in ('这哪是','潜意识在','原来生活','偷偷奖励'):
            if frame in reply and any(frame in old for old in previous):
                return '复用了最近的句式或解释套路；保持当前话题，改为具体理由、实际例子或不同选择，不再换比喻总结。'
        plain=lambda s:re.sub(r'[\W_]+','',s)
        candidate=plain(reply)
        if any(any(candidate[i:i+20] in plain(old) for i in range(max(0,len(candidate)-19))) for old in previous):
            return '大段复述已播内容；沿当前话题推进尚未展开的一点。'
    return None

def complete_excerpt(text,limit=200):
    """Keep the last complete sentence when a provider ignores the length budget."""
    if len(text)<=limit:return text
    prefix=text[:limit]
    ends=[m.end() for m in re.finditer(r'[。！？!?](?:[”」』])?',prefix)]
    return prefix[:ends[-1]] if ends else prefix.rstrip('，、；：')+'…'
