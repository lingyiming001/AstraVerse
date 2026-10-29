import asyncio
from astraverse.modules.resources import library
from astraverse.modules.resources.selection import ResourceSummary

def test_shared_default_private_filter_and_public_live():
    shared=ResourceSummary(id='shared',kind='book',name='共享书',excerpt='实际片段')
    private=ResourceSummary(id='private',kind='music',name='私有歌')
    async def run():
        await library.catalog_save(library.Catalog(resources=[shared,private]))
        assert len(library.visible([shared,private],'a'))==2
        await library.access_save('private',library.Access(agents=['a']))
        assert [r.id for r in library.visible([shared,private],'a')]==['shared','private']
        assert [r.id for r in library.visible([shared,private],'b')]==['shared']
        assert [r.id for r in library.live_catalog('a')]==['shared']
        await library.access_save('private',library.Access(agents=[]))
        assert [r.id for r in library.visible([private],'a')]==[]
        await library.access_save('private',library.Access(agents=None))
        assert len(library.live_catalog('b'))==2
    asyncio.run(run())
