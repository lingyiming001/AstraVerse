"""Explicit maintenance reset. Stop API before running; keeps media and book bookmarks."""
import asyncio
import json
import os
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path
from astraverse.core.paths import DATA_DIR
from astraverse.modules.agents import profiles
from astraverse.modules.agents.product_presets import PRESETS
from astraverse.modules.live.service import clear_sessions

async def main():
    saved=profiles.saved_profiles()
    ids=set(PRESETS) | set(saved)
    if profiles.MEMORY.exists():
        with sqlite3.connect(profiles.MEMORY) as db:
            for table in ('agent_messages','agent_revision'):
                if db.execute('SELECT 1 FROM sqlite_master WHERE name=?',(table,)).fetchone():
                    ids.update(row[0] for row in db.execute(f'SELECT DISTINCT agent_id FROM {table}'))
    backup=DATA_DIR/'backups'/('character-reset-'+datetime.now().strftime('%Y%m%d-%H%M%S'))
    backup.mkdir(parents=True,exist_ok=False,mode=0o700)
    for source in (profiles.PROFILES,profiles.MEMORY,DATA_DIR/'live-archive.sqlite3'):
        if not source.exists(): continue
        target=backup/source.name
        if source.suffix=='.sqlite3':
            with sqlite3.connect(source) as src, sqlite3.connect(target) as dst: src.backup(dst)
        else: shutil.copy2(source,target)
        os.chmod(target,0o600)
    independent=DATA_DIR/'agent-models'
    if independent.exists(): shutil.copytree(independent,backup/'agent-models')
    for aid in sorted(ids):
        old=saved.get(aid)
        profile=profiles.template(aid,old.name if old else '我的伙伴')
        await profiles.save_profile(aid,profile)
        await profiles.clear_history(aid)
        await clear_sessions(aid)
        config=profiles.agent_config_path(aid)
        if config.exists(): config.unlink()
    from astraverse.modules.resources.reading import db as reading_db, prepare
    with reading_db() as db:
        prepare(db)
        db.execute('UPDATE book_readers SET active=0')
    print(json.dumps({'reset_roles':sorted(ids),'backup':str(backup),'preserved':'media libraries, books, bookmarks, global model credentials'},ensure_ascii=False))

if __name__=='__main__': asyncio.run(main())
