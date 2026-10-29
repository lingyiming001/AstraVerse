import asyncio
import time
import pytest
from fastapi import HTTPException
from astraverse.modules.live import service
from astraverse.modules.live.program import LiveProgram
from astraverse.modules.live.routine import DailyRoutine
from astraverse.modules.live.awareness import current_program,live_timing
from astraverse.modules.agents import profiles


def setup(monkeypatch,tmp_path):
    monkeypatch.setattr(service,'FILE',tmp_path/'live.json');monkeypatch.setattr(service,'runtime',{})
    program=LiveProgram(segment='closing',daily=DailyRoutine(enabled=False),idle_max_turns=1)
    monkeypatch.setattr(service,'profile_program',lambda aid:program)
    monkeypatch.setattr(profiles,'profile_status',lambda p:{'mode':'llm'})
    calls=[]
    async def handler(*args):
        effective=current_program(program)
        assert effective.idle_enabled and not effective.daily.enabled and effective.segment=='discussion'
        calls.append(args)
        return {'mode':'llm','reply':f'第{len(calls)}个不同主题，聊聊角色喜欢的音乐与故事'}
    monkeypatch.setattr(service,'idle_handler',handler)
    return program,calls


def ready(state):
    state.last_viewer=state.last_reply=state.last_idle_attempt=time.monotonic()-1000


def test_solo_runs_past_normal_limit_without_any_viewer_and_preserves_role(monkeypatch,tmp_path):
    program,calls=setup(monkeypatch,tmp_path)
    original=program.model_dump()
    async def run():
        row=await service.start_solo(service.SoloRequest(agent_id='actor',duration_minutes=1440,interval=20))
        cid=row['id'];state=service.rt(cid)
        try:
            assert row['transport']=='local' and not row['send_to_platform']
            for _ in range(8):
                ready(state);await service.maybe_idle(cid)
            assert len(calls)==8 and state.metrics['proactive']==8
            assert state.metrics['received']==0 and not state.outbox
            assert state.solo['attempts']==8 and state.status=='connected'
            assert program.model_dump()==original
            assert current_program(program) is program
            assert service.public(service.channel(cid))['solo']['limit']>1000
        finally:await service.stop(cid)
    asyncio.run(run())


def test_solo_deadline_and_manual_stop_prevent_late_output(monkeypatch,tmp_path):
    setup(monkeypatch,tmp_path)
    async def run():
        row=await service.start_solo(service.SoloRequest(agent_id='actor'))
        cid=row['id'];state=service.rt(cid)
        ready(state);state.solo['deadline']=time.monotonic()-1
        await service.maybe_idle(cid)
        assert state.status=='stopped' and state.solo['reason']=='ended'
        assert not await service.publish(cid,'actor',{'reply':'过期输出'},'主持',revision=state.revision)
        assert state.metrics['proactive']==0
        await service.stop(cid)
        await service.start_solo(service.SoloRequest(agent_id='actor'))
        await service.stop(cid)
        assert state.solo['reason']=='manual' and state.worker is None
        assert not await service.publish(cid,'actor',{'reply':'不该输出'},'主持',revision=state.revision)
    asyncio.run(run())


def test_solo_stop_cancels_inflight_generation(monkeypatch,tmp_path):
    setup(monkeypatch,tmp_path)
    async def run():
        row=await service.start_solo(service.SoloRequest(agent_id='actor'))
        cid=row['id'];state=service.rt(cid);ready(state)
        entered=asyncio.Event()
        async def pending(*args):entered.set();await asyncio.Future()
        monkeypatch.setattr(service,'idle_handler',pending)
        task=asyncio.create_task(service.maybe_idle(cid))
        await asyncio.wait_for(entered.wait(),1)
        await service.stop(cid)
        await asyncio.wait_for(task,1)
        assert not state.idle_generation and state.status=='stopped' and state.metrics['proactive']==0
    asyncio.run(run())


def test_solo_fails_clearly_without_model_and_stops_if_model_disappears(monkeypatch,tmp_path):
    setup(monkeypatch,tmp_path)
    async def run():
        monkeypatch.setattr(profiles,'profile_status',lambda p:{'mode':'local-rules'})
        with pytest.raises(HTTPException,match='文本模型'):await service.start_solo(service.SoloRequest(agent_id='actor'))
        assert not service.load()
        monkeypatch.setattr(profiles,'profile_status',lambda p:{'mode':'llm'})
        row=await service.start_solo(service.SoloRequest(agent_id='actor'))
        cid=row['id'];state=service.rt(cid);ready(state)
        async def local(*args):return {'mode':'local-rules','reply':'占位内容'}
        monkeypatch.setattr(service,'idle_handler',local)
        await service.maybe_idle(cid)
        assert state.solo['reason']=='model-unavailable' and state.status=='stopped'
        assert state.metrics['proactive']==0
        await service.stop(cid)
    asyncio.run(run())
