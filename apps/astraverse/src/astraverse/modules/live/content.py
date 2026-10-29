"""Deterministic output gate; topic instructions remain model guidance, not a guarantee."""
import re
import unicodedata
from astraverse.modules.conversation.policy import OUTPUT_NOTICE, prohibited
from .program import LiveProgram


def compact(text: str) -> str:
    text = unicodedata.normalize('NFKC', text).casefold()
    text = ''.join(c for c in text if unicodedata.category(c) != 'Cf')
    return re.sub(r'[\W_]+', '', text)


def blocked_output(text: str, program: LiveProgram) -> bool:
    normalized = compact(text)
    return (not text.strip() or text.strip() == OUTPUT_NOTICE or prohibited(text)
            or any(term and term in normalized for term in (compact(t) for t in program.blocked_terms.splitlines())))
