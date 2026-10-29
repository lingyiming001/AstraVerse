import json
from astraverse.modules.resources.selection import ResourceSummary,model_resource_action,resource_context


def proposal(kind='music',id='song'):
    return json.dumps({'reply':'我们听首歌吧','resource_action':{'type':'resource.use','kind':kind,'resource_id':id}})


def test_autonomous_music_and_book_are_opt_in_and_catalog_bound():
    resources=[ResourceSummary(id='song',name='轻音乐',kind='music'),ResourceSummary(id='book',name='一本书',kind='book',excerpt='正文片段')]
    assert model_resource_action(proposal(),'今天想放松',resources) is None
    assert model_resource_action(proposal(),'今天想放松',resources,initiative=True)['resource_id']=='song'
    assert model_resource_action(proposal('book','book'),'今天想学习',resources,initiative=True)['kind']=='book'
    assert model_resource_action(proposal('music','invented'),'放松',resources,initiative=True) is None


def test_autonomy_does_not_switch_character_and_honors_no_and_recency():
    resources=[ResourceSummary(id='song',name='歌曲',kind='music'),ResourceSummary(id='role',name='角色',kind='character')]
    assert model_resource_action(proposal('character','role'),'今天累了',resources,initiative=True) is None
    assert model_resource_action(proposal(),'不要放音乐',resources,initiative=True) is None
    assert model_resource_action(proposal(),'轻松聊聊',resources,initiative=True,current_music_id='song') is None
    assert model_resource_action(proposal(),'轻松聊聊',resources,initiative=True,recent_ids=['song']) is None
    assert model_resource_action(proposal(),'再放一遍这首歌',resources,initiative=True,current_music_id='song')


def test_book_snippets_bounded_and_nonbook_excerpts_removed():
    resources=[ResourceSummary(id=str(i),name='书籍',kind='book',excerpt=f'EXCERPT_{i}') for i in range(6)]
    resources.append(ResourceSummary(id='song',name='音乐',kind='music',excerpt='MUSIC_EXCERPT'))
    text=resource_context(resources,initiative=True)
    assert 'EXCERPT_3' in text and 'EXCERPT_4' not in text and 'MUSIC_EXCERPT' not in text
    assert '不能声称读完整本书' in text and '不自动切换角色' in text
