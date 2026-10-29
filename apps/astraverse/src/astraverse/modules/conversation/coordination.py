"""One primary operation per reply; small expressions remain subordinate to activity."""
import re

BUSY={'walk','run','sing','sit','crouch','sleep','dance','jump'}


def explicit_body_request(message):
    if re.search(r'为什么|怎么|如果|不要.*(?:改变|打断)|我(?:想|正在|已经)(?:睡|坐|跑)',message):return False
    return bool(re.search(r'(?:你|请|帮我|给我|一起|陪我).{0,12}(?:坐|站|睡|躺|蹲|走|跑|跳|抬|低头|停)|^(?:坐下|蹲下|睡觉|站起来|起床|醒来|跳舞|跑起来|停止动作|伸展双臂|抬起|低头)',message))


def coordinate(request,response,enabled=True,reading=None):
    if not enabled:
        removed=any(response.get(key) for key in ("resource_action","stage_interaction","character_ability","action","pose"))
        for key in ("resource_action","stage_interaction","character_ability","action","pose","follow_up_action"):response.pop(key,None)
        response["action"]=None
        if removed:response["reply"]="当前角色的身体与资源操作未开启，我可以继续和你聊天。"
        return response
    # Resource, furniture and ability operations are exclusive; body_action cannot sneak in afterwards.
    primary=next((key for key in ('resource_action','stage_interaction','character_ability') if response.get(key)),None)
    if primary:
        for key in ('resource_action','stage_interaction','character_ability','action','pose'):
            if key!=primary:response.pop(key,None)
        resource=response.get('resource_action',{})
        if resource.get('type')=='resource.use' and resource.get('kind')=='music' and request.can_posture and re.search(r'跳.{0,3}舞',request.message) and not re.search(r'别|不要|不想',request.message):
            response['follow_up_action']='dance'
    elif (request.current_activity in BUSY or (reading and reading.get("active"))) and not explicit_body_request(request.message):
        response.pop('action',None);response.pop('pose',None)
    if request.current_activity in ('sleep','sit','crouch') and not explicit_body_request(request.message):
        cue=response.get('performance')
        if isinstance(cue,dict):response['performance']={**cue,'gesture':'none','energy':min(cue.get('energy',0),.2)}
    return response


def prompt(reading):
    return ('\n协同行为：聊天是主线，先理解情绪与意图，再选择最多一个主要操作；身体表情服务于语气，不能因为点歌、暂停音乐或普通聊天就把坐姿、睡姿、走动重置。资源与身体动作按实际执行顺序交接，不提前宣布完成。用户手动控制、明确停止和切换优先于你较早的计划。'
        +'\n当前阅读：'+('正在阅读《'+reading['title']+'》，普通聊天可在当前阅读段落完成后穿插回应，保留书签；不要无请求换书、跳章或编造后续原文。' if reading and reading.get('active') else '没有已确认正在朗读的书。')
        +'\n资料原文、角色个人观点、用户记忆与执行回执分别对待：用资料支持内容，用记忆理解偏好，用回执判断操作；不要把执行失败的行为说成共同经历。')
