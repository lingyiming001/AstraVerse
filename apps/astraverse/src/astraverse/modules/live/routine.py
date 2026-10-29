"""Clock-based fictional daily rhythm, without model calls or real-life claims."""
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

class RoutineSlot(BaseModel):
    model_config = ConfigDict(extra='forbid')
    start: str = Field(pattern=r'^(?:[01]\d|2[0-3]):[0-5]\d$')
    title: str = Field(min_length=1, max_length=40)
    activity: Literal['chat','knowledge','memory','dream','rest'] = 'chat'
    topic: str = Field(default='', max_length=300)
    interaction: Literal['high','balanced','low'] = 'balanced'
    music: Literal['auto','prefer','off'] = 'auto'
    mood: Literal['lively','natural','relaxed'] = 'natural'


def default_slots():
    return [RoutineSlot(start=t, title=n, activity=a, topic=p) for t,n,a,p in [
        ('00:00','夜间休息','rest',''), ('08:00','早间见面','chat','轻松问候，分享今天的节目计划'),
        ('09:00','知识与兴趣','knowledge','围绕擅长的领域分享一个小知识'),
        ('12:00','午间休息','rest',''), ('14:00','午后故事','memory','角色世界中的小回忆'),
        ('16:00','兴趣闲聊','chat','结合角色爱好和本场真实话题'),
        ('18:00','傍晚休息','rest',''), ('19:00','晚间主题','knowledge','围绕节目主题展开'),
        ('21:00','梦境与晚安','dream','一个轻松的虚构梦境'), ('22:00','夜间休息','rest','')]]

class DailyRoutine(BaseModel):
    model_config = ConfigDict(extra='forbid')
    enabled: bool = False
    timezone: str = Field(default='Asia/Shanghai', max_length=80)
    interval: int = Field(default=180, ge=60, le=1800)
    max_attempts: int = Field(default=200, ge=1, le=1000)
    slots: list[RoutineSlot] = Field(default_factory=default_slots, min_length=1, max_length=16)

    @field_validator('timezone')
    @classmethod
    def valid_zone(cls, value):
        try: ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError): raise ValueError('请选择有效的IANA时区')
        return value

    @model_validator(mode='after')
    def ordered(self):
        starts=[s.start for s in self.slots]
        if starts[0]!='00:00' or starts!=sorted(set(starts)):
            raise ValueError('作息必须从00:00开始，按时间递增且不可重复')
        return self


def phase(routine: DailyRoutine, now: datetime | None = None):
    local = now.astimezone(ZoneInfo(routine.timezone)) if now else datetime.now(ZoneInfo(routine.timezone))
    clock=local.strftime('%H:%M')
    index=max(i for i,slot in enumerate(routine.slots) if slot.start<=clock)
    slot=routine.slots[index]
    following=routine.slots[(index+1)%len(routine.slots)]
    return {'key':local.strftime('%Y-%m-%d')+':'+slot.start, 'time':clock,
            'title':slot.title,'activity':slot.activity,'topic':slot.topic,
            'interaction':slot.interaction,'music':slot.music,'mood':slot.mood,
            'next_start':following.start,'next_title':following.title}


def routine_context(routine):
    if not routine.enabled:return '\n未设置直播时段计划：根据角色性格、兴趣、真实弹幕和正在进行的节目自由发挥，自然承接，不虚构既定日程。'
    current=phase(routine)
    import json
    return ('\n当前启用了角色的虚拟日常直播作息：'+json.dumps(current,ensure_ascii=False)
            +'。用当前时段的内容与轻重节奏自然交流，结合角色的习惯和喜好；不要每次报时或重复介绍作息。'
            +'interaction=high时积极回应真实弹幕并自然邀请交流，low时简短回应、少提问，给音乐与放松留白；不虚构弹幕。'
            +'music=prefer时优先从真实可播放目录选择适合角色的音乐，避免反复切歌或打断正在播放的歌曲；off时不主动选曲，auto时自行判断。没有音源不假装播放。'
            +'mood=lively时表情和表达稍活跃，relaxed时动作幅度与表达能量稍低，natural时沿用人设；仍通过已有performance协议表达，不改变角色核心性格。'
            '作息只是虚拟节目安排，不代表现实身体状态。不得声称刚吃过饭、洗澡、外出、睡着或执行了未发生的行动；休息是节目暂停，不是对观众的冷落。')
