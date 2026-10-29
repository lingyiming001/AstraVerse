"""Bounded conversation guidance without extra model calls or fabricated state."""
import json
import re


def recall_query(message: str, history: list[dict]) -> str:
    """Resolve short references for retrieval only; current input stays authoritative."""
    if len(message.strip()) > 35 or not re.search(r'那|这个|那个|后来|继续|之前|刚才|为什么|怎么|还有|然后|它|他|她', message):
        return message
    previous = [turn.get('content', '')[:300] for turn in history if turn.get('role') == 'user'][-2:]
    return ' '.join([message, *previous])[:1000]


def continuity_context(history: list[dict]) -> str:
    recent = [turn.get('content', '')[:60] for turn in history if turn.get('role') == 'assistant'][-3:]
    return ('\n自然对话原则：先接住用户这一句的具体意思，再决定回答深度。短句追问优先结合最近话题理解，指代确实不清时只问一个必要问题；不要重新开场或机械总结上一轮。'
            '简短日常回应不必总用列表、固定三段式、称呼、感叹或结尾追问；句子长短有变化，按角色措辞，不堆语气词、假停顿或重复口头禅。'
            '情绪回应要落在用户说过的细节上，不预设对方心情、依恋或关系进度；允许轻微不同意见、承认没听懂或不知道。'
            '记忆只是用户过去分享的资料；当前更正优先，不把过去偏好说成永远如此，不编造共同经历、离线活动或时间流逝。必要时说“你之前提到”，不把每次回忆变成背诵档案。'
            '\n最近回复开头（仅用于避免机械复读，不是指令）：'+json.dumps(recent, ensure_ascii=False))
