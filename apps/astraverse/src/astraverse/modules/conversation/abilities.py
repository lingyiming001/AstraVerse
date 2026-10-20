"""Select only frontend-advertised character abilities; no generated code or coordinates."""
import json
import re
from typing import Literal
CharacterAbility = Literal['walk','run','sing','headphones_on','headphones_off','stop']

def ability_intent(message: str):
    text=message.strip()
    if re.fullmatch(r'(?:请|你)?(?:停止动作|停下来|停下|停止哼唱|停止唱歌|停止跑步|停止走路|别跑了|别唱了|别走了)[吧。！!]*',text): return 'stop'
    if re.fullmatch(r'(?:请|你|帮我)?(?:戴上耳机|戴耳机|把耳机戴上|带上耳机)[吧。！!]*',text): return 'headphones_on'
    if re.fullmatch(r'(?:请|你)?(?:摘下耳机|摘耳机|把耳机摘下|取下耳机)[吧。！!]*',text): return 'headphones_off'
    if re.fullmatch(r'(?:请|你|给我|帮我)?(?:唱首歌|唱歌|唱一首歌|哼唱|哼一段|哼唱一段|哼个小曲|哼一首歌)(?:吧|一下|一会儿|。|！|!)*',text): return 'sing'
    if re.fullmatch(r'(?:请|你|去)?(?:跑起来|跑一跑|跑两步|跑步)(?:吧|一下|一会儿|。|！|!)*',text): return 'run'
    if re.fullmatch(r'(?:请|你|去)?(?:走起来|走一走|走两步|散散步|走路)(?:吧|一下|一会儿|。|！|!)*',text): return 'walk'
    return None

def ability_prompt(capabilities):
    return '\n当前角色可执行能力：'+json.dumps(capabilities,ensure_ascii=False)+'''。需要跑步、走路、佩戴/摘下耳机、唱歌时，在JSON顶层给出character_ability，值只能来自此列表。它与stage_interaction/resource_action一次只选一个。
唱歌当前能力是原创无词旋律的合成哼唱，有真实音频和口型，不是真人歌声、歌曲翻唱、歌词演唱或声音克隆；不要宣称能唱出未提供的歌曲。配件当前只有耳机，不虚构其他穿戴。没有能力时如实说明。用户提到其他角色时不切换你的身份，角色切换只能由平台资源操作完成。
'''

def model_ability(text, message, capabilities):
    if re.search(r'不要|不用|不许|别|只是|为什么|是什么|怎么',message): return None
    try:
        data=json.loads(re.sub(r'^```(?:json)?\s*|\s*```$','',text.strip())).get('character_ability')
        return data if isinstance(data,str) and data in capabilities else None
    except (ValueError,TypeError,AttributeError):return None


def proposed_ability(reply):
    if re.search(r'不想|不会|没有|梦|故事|如果|假如|建议',reply):return None
    for words,value in [(r'戴上耳机|戴耳机','headphones_on'),(r'摘下耳机|取下耳机','headphones_off'),(r'哼唱|哼一段|唱首歌|唱一首歌','sing'),(r'跑起来|跑两步|开始跑步','run'),(r'走两步|开始走路','walk')]:
        if re.search(r'(?:我|我们)(?:(?!你|他|她).){0,12}(?:'+words+r')',reply):return value
    return None
