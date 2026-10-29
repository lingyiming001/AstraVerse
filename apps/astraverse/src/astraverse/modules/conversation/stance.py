"""Source-linked records of expressed preferences, never biography or verified facts."""
import re
from astraverse.modules.agents import profiles


def prepare(c):
    c.execute('CREATE TABLE IF NOT EXISTS character_stances(agent TEXT,scope TEXT,voice TEXT,source TEXT,text TEXT,created INTEGER PRIMARY KEY AUTOINCREMENT,UNIQUE(agent,scope,text))')
    c.execute('CREATE INDEX IF NOT EXISTS stances_by_role ON character_stances(agent,scope,created)')


def clear(agent,scope,c=None):
    if c is None:
        with profiles.database() as connection:clear(agent,scope,connection)
        return
    prepare(c);c.execute('DELETE FROM character_stances WHERE agent=? AND scope=?',(agent,scope))


def record(profile,reply,source,voice,*,public=False,c=None):
    if not source or not voice or (not public and not profile.remember) or (public and not profile.live_program.memory_enabled):return
    if c is None:
        with profiles.database() as connection:record(profile,reply,source,voice,public=public,c=connection)
        return
    prepare(c);scope='public' if public else 'private'
    for sentence in re.split(r'[。！？!?\n]',reply):
        text=sentence.strip()
        if not re.match(r'^我(?:更|比较|还是|通常)?(?:喜欢|偏爱|倾向|会选|更愿意|不太喜欢)',text):continue
        if not 8<=len(text)<=160 or re.search(r'昨天|刚刚|现实|已经|刚才|你|您|用户|观众|我们|咱们|密码|账号|https?://',text):continue
        c.execute('INSERT INTO character_stances(agent,scope,voice,source,text) VALUES(?,?,?,?,?) ON CONFLICT(agent,scope,text) DO UPDATE SET voice=excluded.voice,source=excluded.source',(profile.id,scope,voice,str(source),text))
    c.execute('DELETE FROM character_stances WHERE agent=? AND scope=? AND created NOT IN (SELECT created FROM character_stances WHERE agent=? AND scope=? ORDER BY created DESC LIMIT 24)',(profile.id,scope,profile.id,scope))


def terms(text):
    result=set(re.findall(r'[a-z0-9]{3,}',text.lower()))
    for word in re.findall(r'[\u4e00-\u9fff]+',text):result.update(word[i:i+2] for i in range(len(word)-1))
    return result-{'喜欢','比较','还是','什么','觉得','一个','然后'}


def recall(profile,voice,query,*,public=False):
    if (not public and not profile.remember) or (public and not profile.live_program.memory_enabled):return []
    with profiles.database() as c:
        prepare(c)
        rows=c.execute('SELECT source,text FROM character_stances WHERE agent=? AND scope=? AND voice=? ORDER BY created DESC LIMIT 24',(profile.id,'public' if public else 'private',voice)).fetchall()
    words=terms(query)
    ranked=sorted(enumerate(rows),key=lambda r:(len(terms(r[1][1])&words),-r[0]),reverse=True)
    return [{'source_id':source,'expressed_preference':text} for _,(source,text) in ranked if terms(text)&words][:3]


def entries(profile,*,public=False):
    if (not public and not profile.remember) or (public and not profile.live_program.memory_enabled):return []
    from .character import voice_signature
    with profiles.database() as c:
        prepare(c)
        rows=c.execute('SELECT source,text FROM character_stances WHERE agent=? AND scope=? AND voice=? ORDER BY created DESC LIMIT 24',(profile.id,'public' if public else 'private',voice_signature(profile))).fetchall()
    return [{'source_id':source,'text':text} for source,text in rows]
