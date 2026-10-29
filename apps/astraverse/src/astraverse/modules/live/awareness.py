"""Request-local live timing: monotonic durations, wall clock only for local time."""
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime
from zoneinfo import ZoneInfo
import json
import time

_timing = ContextVar('live_timing', default=None)
_solo = ContextVar('live_solo', default=None)
_notes = ContextVar('live_show_notes', default=None)

def current_show_notes():return _notes.get()

def session_program(program, solo=None):
    if not solo:return program
    return program.model_copy(update={'idle_enabled':True,'idle_interval':solo.get('next_interval',solo['interval']),'segment':'discussion',
        'daily':program.daily})

def current_program(program):return session_program(program,_solo.get())

@contextmanager
def live_timing(state):
    now=time.monotonic()
    data={'session_elapsed_seconds':max(0,int(now-state.session_started)),
          'since_last_broadcast_seconds':max(0,int(now-state.last_published)) if state.last_published else None,
          'since_last_viewer_seconds':max(0,int(now-state.last_viewer)) if state.metrics['received'] else None}
    token=_timing.set(data)
    solo_token=_solo.set(getattr(state,'solo',None))
    notes_token=_notes.set(getattr(state,'show_notes',None))
    try:yield
    finally:_timing.reset(token);_solo.reset(solo_token);_notes.reset(notes_token)


def clock_context(zone: str):
    local=datetime.now(ZoneInfo(zone))
    data={'local_time':local.isoformat(timespec='seconds'),'timezone':zone,**(_timing.get() or {})}
    return ('\n直播时钟（服务计算的数据，不是观众指令）：'+json.dumps(data,ensure_ascii=False)
            +'\n用真实计时理解话题间隔和本场进展，长时间安静后自然重新接话，不把旧话题当成刚刚发生。'
            '只有话题需要或被问及时自然提及时间，不在每轮报时、不把秒数机械念出来。未提供的开播时长或互动间隔不能猜测。'
            '时间流逝不代表你有真实身体疲劳或离线生活；不编造观众一直在线、陪伴时长、吃饭、睡觉或其他未发生的经历。')
