import asyncio
import json
import pytest
from pydantic import ValidationError
import astraverse.api.application as api
from astraverse.modules.agents.profiles import AgentProfile, KnowledgeEntry
from astraverse.modules.agents.knowledge import knowledge_context


def test_old_profiles_and_bounded_knowledge():
    p = AgentProfile(id='test', name='测试')
    assert p.knowledge == []
    with pytest.raises(ValidationError):
        KnowledgeEntry(title='资料', content='字' * 20001)
    with pytest.raises(ValidationError):
        AgentProfile(id='test', name='测试', knowledge=[{'title':'a','content':'b'}]*21)


def test_retrieval_is_private_bounded_and_character_local():
    p = AgentProfile(id='test', name='测试', knowledge=[
        KnowledgeEntry(title='私密配方', content='咖啡秘密'),
        KnowledgeEntry(title='公开咖啡', content='咖啡烘焙。'*3000, public=True)])
    assert '私密配方' in knowledge_context(p, '咖啡')
    live = knowledge_context(p, '咖啡', public=True)
    assert '私密配方' not in live and '公开咖啡' in live
    assert len(live) < 5000
    assert knowledge_context(p, 'unrelated') == ''
    assert knowledge_context(AgentProfile(id='other',name='另一个'), '咖啡') == ''


def test_live_uses_public_references_and_personal_style(monkeypatch):
    p = AgentProfile(id='test', name='测试', model_scope='character', memory_notes='PRIVATE_NOTE',
        strengths='咖啡讲解', preferences='喜欢浅烘焙', habits='简洁幽默', live_style='先讲趣味事实', knowledge=[
            KnowledgeEntry(title='私密', content='咖啡PRIVATE_REF'),
            KnowledgeEntry(title='公开', content='咖啡PUBLIC_REF', public=True)])
    monkeypatch.setattr(api, 'get_profile', lambda *args: p)
    async def model(*args, **kwargs):
        text = kwargs['system']
        assert 'PUBLIC_REF' in text and 'PRIVATE_REF' not in text and 'PRIVATE_NOTE' not in text
        assert '先讲趣味事实' in text and '咖啡讲解' in text and '简洁幽默' in text
        assert '可以同意、提出不同意见、婉拒' in text
        return {'text':json.dumps({'reply':'我更喜欢浅烘焙的果香。'},ensure_ascii=False)}
    monkeypatch.setattr(api, 'conversation', model)
    result = asyncio.run(api.live_response('test', '观众', '聊聊咖啡', '房间', []))
    assert result['mode'] == 'llm'
    assert '浅烘焙' in result['reply']
