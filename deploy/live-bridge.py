#!/usr/bin/env python3
"""Adapter for authorized collectors that export JSONL. Does not scrape platforms.
stdin: {"id":"platform-message-id","user":"viewer","text":"hello","is_self":false}
stdout (--poll-replies): reply JSONL for a separately authorized sender; never auto-posts.
"""
import argparse
import asyncio
import json
import os
import sys
import httpx

async def run(args):
    token=os.environ.get('ASTRAVERSE_LIVE_TOKEN','').removeprefix('Bearer ')
    if not token:raise SystemExit('Set ASTRAVERSE_LIVE_TOKEN from the private bridge configuration.')
    base=f'{args.api.rstrip("/")}/api/live/channels/{args.channel}'
    headers={'Authorization':'Bearer '+token}
    async with httpx.AsyncClient(headers=headers,timeout=15) as client:
        async def ingest():
            while True:
                line=await asyncio.to_thread(sys.stdin.readline)
                if not line:return
                try:
                    row=json.loads(line)
                    payload={key:row[key] for key in ('id','user','text')}
                    payload.update(room=args.room,is_self=bool(row.get('is_self',False)))
                    response=await client.post(base+'/incoming',json=payload)
                    if not response.is_success:print(f'Ingress rejected: HTTP {response.status_code}',file=sys.stderr,flush=True)
                except (ValueError,KeyError,TypeError):print('Invalid collector JSONL: id/user/text required.',file=sys.stderr,flush=True)
                except httpx.HTTPError:print('Ingress unavailable; inspect connection and retry with the same message ID.',file=sys.stderr,flush=True)
        async def replies():
            # A fresh bridge must not replay replies already queued before it started.
            import time
            cursor=int(time.time()*1000)
            while True:
                try:
                    response=await client.get(base+'/outbox',params={'after':cursor})
                    response.raise_for_status()
                    for reply in response.json()['replies']:
                        print(json.dumps(reply,ensure_ascii=False),flush=True)
                        cursor=max(cursor,reply['sequence'])
                except (httpx.HTTPError,ValueError,KeyError):print('Reply polling unavailable.',file=sys.stderr,flush=True)
                await asyncio.sleep(2)
        if args.poll_replies:
            task=asyncio.create_task(replies())
            try:await ingest();await task
            finally:task.cancel()
        else:await ingest()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api',default='http://127.0.0.1:8000')
    parser.add_argument('--channel',required=True)
    parser.add_argument('--room',required=True)
    parser.add_argument('--poll-replies',action='store_true')
    try:asyncio.run(run(parser.parse_args()))
    except KeyboardInterrupt:pass
