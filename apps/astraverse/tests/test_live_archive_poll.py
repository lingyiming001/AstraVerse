import asyncio
import time
import pytest
from astraverse.modules.live import archive, service
from astraverse.modules.live.program import LiveProgram
from pydantic import ValidationError


def test_archive_isolation_provenance_and_clear():
    a=archive.begin('a','room');b=archive.begin('b','room')
    archive.record(a,'dream','虚构梦境');archive.record(a,'poll','音乐获得2票');archive.record(b,'reply','OTHER_ROLE')
    archive.end(a);archive.end(b)
    summary=archive.sessions('a')[0]['summary']
    events=archive.detail('a',a)
    assert {e['source_id'] for e in summary}<={e['id'] for e in events}
    assert 'OTHER_ROLE' not in archive.context('a')
    assert archive.detail('b',a) is None
    archive.clear('a');archive.record(a,'reply','late output');archive.end(a)
    assert archive.sessions('a')==[] and archive.context('a')=='' and archive.sessions('b')


def test_open_session_not_used_as_prior_memory():
    sid=archive.begin('a','x');archive.record(sid,'reply','hello')
    assert archive.context('a')==''


def test_poll_validation():
    with pytest.raises(ValidationError):service.PollRequest(question='a',options=['重复','重复'])
    with pytest.raises(ValidationError):service.PollRequest(question='a',options=['a','b'],duration=1)


def room(monkeypatch):
    state=service.Runtime();state.status='waiting';state.archive_id=archive.begin('a','test')
    row=dict(id='test',agent_id='a',name='直播',room='1',transport='bridge',keyword='',voice=False,send_to_platform=False,cooldown=5)
    monkeypatch.setattr(service,'rt',lambda cid:state);monkeypatch.setattr(service,'channel',lambda cid:row)
    monkeypatch.setattr(service,'profile_program',lambda aid:LiveProgram())
    from astraverse.modules.agents.team import AgentTeam
    monkeypatch.setattr(service,'profile_team',lambda aid:AgentTeam())
    events=[]
    async def emit(cid,event):events.append(event)
    monkeypatch.setattr(service,'emit',emit)
    return state,events


def test_votes_change_without_model_queue_and_finish_once(monkeypatch):
    state,events=room(monkeypatch)
    async def run():
        await service.create_poll('test',service.PollRequest(question='聊什么',options=['音乐','书籍']))
        for id,user,text in [('1','Alice','1'),('2','Alice','2'),('3','Bob','2')]:
            result=await service.enqueue('test',service.Danmaku(id=id,user=user,text=text,room='1'))
            assert result['reason']=='vote'
        assert state.queue.empty() and service.public_poll(state.poll)['counts']==[0,2]
        await service.finish_poll('test',True)
        before=len(events);await service.finish_poll('test',True)
        assert len(events)==before and not state.poll['open']
        assert any('书籍获得最多票（2票）' in e.get('text','') for e in events)
        archive.end(state.archive_id)
        assert any(e['kind']=='poll' for e in archive.sessions('a')[0]['summary'])
    asyncio.run(run())


def test_no_voters_and_deadline_do_not_invent_winner(monkeypatch):
    state,events=room(monkeypatch)
    async def run():
        await service.create_poll('test',service.PollRequest(question='去哪',options=['森林','月球']))
        state.poll['deadline']=time.monotonic()-1
        await service.finish_poll('test')
        assert any('没有有效投票' in e.get('text','') for e in events)
    asyncio.run(run())


def test_tie_and_late_votes_are_explicit(monkeypatch):
    state,events=room(monkeypatch)
    async def run():
        await service.create_poll('test',service.PollRequest(question='聊什么',options=['音乐','书籍']))
        for id,text in [('one','1'),('two','2')]:
            await service.enqueue('test',service.Danmaku(id=id,user=id,text=text,room='1'))
        state.poll['deadline']=time.monotonic()-1
        response=await service.enqueue('test',service.Danmaku(id='late',user='late',text='2',room='1'))
        assert response['reason']=='poll-ended' and service.public_poll(state.poll)['counts']==[1,1]
        assert any('本轮并列' in e.get('text','') for e in events)
        assert state.queue.empty()
    asyncio.run(run())
