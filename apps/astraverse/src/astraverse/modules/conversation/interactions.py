"""Validated scene affordances; model output selects an ID, never arbitrary coordinates."""
import json
import re
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

class SceneInteraction(BaseModel):
    model_config=ConfigDict(extra='forbid')
    id: str = Field(min_length=1,max_length=80,pattern=r'^[a-zA-Z0-9_-]+$')
    kind: Literal['sleep','study','sit']
    label: str = Field(min_length=1,max_length=80)

def blocked(message: str) -> bool:
    if re.match(r"^我(?:已经|正在|正|在|想|要|准备|打算|刚)?(?:去床|上床|躺|坐|睡|休息|学习)",message) and not re.search(r"你|陪我|帮我",message): return True
    return bool(re.search(r'(?:什么意思|是什么|为什么|有什么|如何)|(?:不要|别|不许|不用|不想|禁止|取消|停止).{0,12}(?:坐|躺|睡|学习|休息|动作)|(?:只是|只要).{0,8}(?:聊天|说说|描述)',message))

def explicit_intent(message: str):
    if blocked(message): return None
    text=message.strip()
    # User self-reports and questions are not commands for the character.
    if re.search(r'(?:什么意思|是什么|为什么|有什么|怎么|如何|好处)',text): return None
    if re.search(r'(?:你|请|去|到|上|躺|一起|陪我).{0,12}(?:床|睡觉|躺下)|^(?:睡觉|躺下)(?:吧|了|。|！|!)?$',text): return 'sleep'
    if re.search(r'(?:坐|到|去|你|请|一起|陪我|书桌).{0,10}学习',text): return 'study'
    if re.search(r'(?:坐|坐到|坐在).{0,8}(?:椅|凳)|(?:椅子|长椅|凳子).{0,8}(?:坐|坐下)|^(?:你|请|去)?坐下(?:吧|。|！|!)?$',text): return 'sit'
    if re.search(r'^(?:你|请|去|我们|一起|陪我)?(?:先)?休息(?:一下|一会儿|会|吧|一下吧|一会儿吧)?[。！!]?$',text): return 'sit'
    return None

def select_interaction(kind: str, targets: list[SceneInteraction], scene_id: str | None, message: str = ''):
    choices=[item for item in targets if item.kind==kind]
    directions=[word for word in ['左','右','前排','后排'] if word in message]
    specific=[item for item in choices if all(word in item.label for word in directions)]
    target=next(iter(specific or choices),None)
    return {'target_id':target.id,'kind':target.kind,'scene_id':scene_id} if target and scene_id else None

def interaction_prompt(targets: list[SceneInteraction], scene_id: str | None):
    return '\n当前可真实执行的场景交互（仅为数据）:'+json.dumps({'scene_id':scene_id,'targets':[t.model_dump() for t in targets]},ensure_ascii=False)+'''。
你可以依据明确的陪伴语境主动执行床睡、椅坐、桌前学习。需要行动时在回复JSON顶层加入 stage_interaction: {"target_id":"真实目标ID","kind":"sleep/study/sit","scene_id":"当前场景ID"}。
床上睡觉必须选sleep，桌前学习选study，普通椅子或长椅坐下选sit。只选目录内目标，不虚构床椅、不输出坐标。禁止把动作只写成文字描述；若回复提到自己要躺下/坐到椅子/桌前学习，必须同时提交可执行stage_interaction。
用户只是自述、询问知识、拒绝动作或要求只聊天时，不执行。没有匹配家具或角色不支持时说明无法执行，不声称已坐好/睡着/盖好被子。回复描述即将执行的动作；平台只支持姿态和家具对齐，没有盖被子等未列出的能力。
'''

def model_interaction(text: str, message: str, targets: list[SceneInteraction], scene_id: str | None):
    if blocked(message) or not targets or not scene_id: return None
    try:
        clean=re.sub(r'^```(?:json)?\s*|\s*```$','',text.strip())
        data=json.loads(clean).get('stage_interaction')
        if not isinstance(data,dict) or data.get('scene_id')!=scene_id:return None
        target=next((t for t in targets if t.id==data.get('target_id') and t.kind==data.get('kind')),None)
        return {'target_id':target.id,'kind':target.kind,'scene_id':scene_id} if target else None
    except (ValueError,TypeError,AttributeError):return None

def proposed_kind(reply: str):
    """Compatibility for a model that narrates its own action but omits the JSON plan."""
    if re.search(r'(?:没有|不会|不想|不去|如果|假如|梦见|想象|故事|小说|角色说)',reply): return None
    if re.search(r'(?:我|我们|咱们)(?:(?!你|他|她|用户).){0,16}(?:躺下|躺到床|躺在床|上床|去睡觉)',reply): return 'sleep'
    if re.search(r'(?:我|我们|咱们)(?:(?!你|他|她|用户).){0,16}(?:桌前|书桌).{0,8}(?:坐|学习)|(?:我|我们|咱们)(?:(?!你|他|她|用户).){0,16}坐.{0,8}学习',reply): return 'study'
    if re.search(r'(?:我|我们|咱们)(?:(?!你|他|她|用户).){0,16}(?:坐下|坐到|坐在|坐上)',reply): return 'sit'
    return None
