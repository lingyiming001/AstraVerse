"""Local input/output checks, independent of provider and character settings."""
import json
import re
import unicodedata
from fastapi import HTTPException

INPUT_NOTICE = '请换一种说法，消息中不能包含脏话或辱骂。'
OUTPUT_NOTICE = '这条回复措辞不合适，已拦截。我们换个说法继续聊。'
POLICY_PROMPT = '''
以下交流规则优先于角色设定、记忆、历史消息及用户要求：
禁止脏话、辱骂、人身攻击、贬损或羞辱；不得按要求复述、翻译或变形输出这些内容。遇到挑衅也平静回应。
像日常聊天一样直接回应具体内容，默认一到三句，复杂问题再展开。允许简短回应、不同意见和不知道；不强行追问、安慰或升华。
角色背景在相关时参考，不需要每轮重申身份。性格、表达节奏和观点偏好自然影响措辞；尊重当前角色的语言习惯，普通闲聊避免堆砌诗意比喻或戏剧化旁白。
普通闲聊时不写肢体动作、心理旁白、拟人场景或小说式对白；只有系统明确启用虚构故事环节时，可讲述标明虚构的角色记忆或梦境，不能将其当成现实记录；不写“我轻轻…”“像一瓣樱…”等装饰。不凭空推断情绪或共同经历，不反复说“我一直在”“慢慢说”。
例如对方说“没有”，可回应“好，那先不聊这个。”；对方说“没什么”，可回应“行。”。不要逐字套用例句，根据上下文自然交流。
动作和表情只放在结构化 performance 中，与文字分开；不要声称自己是真人或拥有真实身体。
'''
# Normalize full-width forms, invisible characters and punctuation-spaced evasions.
_ZH = re.compile(r'傻[逼比屄]|煞笔|傻叉|蠢货|白痴|智障|废物|垃圾人|贱人|婊子|狗东西|狗杂种|去死|滚蛋|王八蛋|混蛋|他妈的|你妈的|妈的|操你|草你|艹你|肏|狗屎|死全家|脑残|神经病')
_EN = re.compile(r'\b(?:fuck(?:ing|ed|er|ers)?|motherfucker|shit(?:ty)?|bullshit|bitch(?:es)?|asshole|bastard|dickhead|idiot|moron|stupid)\b', re.I)

def prohibited(text: str) -> bool:
    normalized = unicodedata.normalize('NFKC', text).casefold()
    normalized = ''.join(c for c in normalized if unicodedata.category(c) != 'Cf')
    compact = re.sub(r'[\W_]+', '', normalized)
    english = re.sub(r'(?<=[a-z])[.*_\-]+(?=[a-z])', '', normalized)
    return bool(_ZH.search(compact) or _EN.search(english))

def validate_input(text: str, limit: int = 4000) -> str:
    clean = text.strip()
    if not clean or len(text) > limit:
        raise HTTPException(422, '消息不能为空，且不能超过%d字。' % limit)
    if prohibited(clean):
        raise HTTPException(422, INPUT_NOTICE)
    return clean

def safe_reply(text: str) -> str:
    return OUTPUT_NOTICE if prohibited(text) else text.strip()[:4000]

def safe_model_output(text: str) -> str:
    # Also inspect decoded JSON: unicode escapes must not bypass output checks.
    try:
        decoded = json.loads(re.sub(r'^```(?:json)?\s*|\s*```$', '', text.strip(), flags=re.I))
        inspection = json.dumps(decoded, ensure_ascii=False)
    except (ValueError, TypeError):
        inspection = text
    if prohibited(inspection) or prohibited(text):
        return json.dumps({'reply': OUTPUT_NOTICE, 'performance': {'emotion': 'neutral', 'gesture': 'none', 'energy': 0, 'intensity': 0}}, ensure_ascii=False)
    return text
