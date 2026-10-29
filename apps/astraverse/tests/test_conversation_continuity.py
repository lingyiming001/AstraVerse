import json
from astraverse.modules.conversation.continuity import recall_query, continuity_context
from astraverse.modules.agents import memory
from astraverse.modules.agents.profiles import AgentProfile, database


def test_short_reference_carries_only_recent_user_topics():
    turns = [{'role':'user','content':'我在学钢琴'}, {'role':'assistant','content':'ASSISTANT_ONLY'},
             {'role':'user','content':'练习节奏很难'}]
    query = recall_query('那怎么练？', turns)
    assert '钢琴' in query and '节奏' in query and 'ASSISTANT_ONLY' not in query
    assert recall_query('想聊聊咖啡', turns) == '想聊聊咖啡'
    assert '当前更正优先' in continuity_context(turns)


def seed():
    with database() as db:
        memory.table(db)
        db.execute('INSERT INTO agent_memories(agent_id,summary) VALUES(?,?)',('a','用户过去分享过兴趣'))
        db.execute('INSERT INTO agent_memory_facts(agent_id,text,source_ids) VALUES(?,?,?)',('a','钢琴节奏练习重要细节','[1]'))
        for n in range(45):
            db.execute('INSERT INTO agent_memory_facts(agent_id,text,source_ids) VALUES(?,?,?)',('a',f'钢琴记录{n}','[2]'))
        db.execute('INSERT INTO agent_memory_facts(agent_id,text,source_ids) VALUES(?,?,?)',('b','钢琴OTHER_CHARACTER','[3]'))


def payload(text):
    return json.JSONDecoder().raw_decode(text[text.index('{'):])[0]


def test_relevance_precedes_recent_rows_and_is_character_isolated():
    seed()
    result = payload(memory.context(AgentProfile(id='a',name='A'),'钢琴节奏练习'))
    assert result['memories'][0]['text'] == '钢琴节奏练习重要细节'
    assert len(result['memories']) <= 10
    assert 'OTHER_CHARACTER' not in str(result)


def test_specific_query_does_not_fill_context_with_unrelated_facts():
    seed()
    result = payload(memory.context(AgentProfile(id='a',name='A'),'咖啡'))
    assert result['memories'] == []
    assert memory.context(AgentProfile(id='a',name='A',remember=False),'钢琴') == ''


def test_clear_memory_prevents_archive_recall():
    import asyncio
    seed()
    with database() as db:
        db.execute('INSERT INTO agent_messages(agent_id,role,text,metadata) VALUES(?,?,?,?)',('a','user','钢琴旧经历','{}'))
    asyncio.run(memory.clear_memory('a'))
    assert memory.context(AgentProfile(id='a',name='A'),'钢琴') == ''
