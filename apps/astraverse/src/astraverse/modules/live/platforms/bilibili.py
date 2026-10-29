"""Bilibili Open Live: signed lifecycle API plus authenticated binary WebSocket."""
import asyncio
import contextlib
import hashlib
import hmac
import json
import struct
import time
import uuid
import zlib
from urllib.parse import urlparse
import websockets
from .common import PlatformError,checked

ROOT='https://live-open.biliapi.com'
LIMIT=2_000_000

def signed_headers(body,key,secret,*,timestamp=None,nonce=None):
    headers={'x-bili-accesskeyid':key,'x-bili-content-md5':hashlib.md5(body).hexdigest(),
             'x-bili-signature-method':'HMAC-SHA256','x-bili-signature-nonce':nonce or uuid.uuid4().hex,
             'x-bili-signature-version':'1.0','x-bili-timestamp':str(timestamp if timestamp is not None else int(time.time()))}
    signing='\n'.join(f'{k}:{v}' for k,v in sorted(headers.items()))
    headers['Authorization']=hmac.new(secret.encode(),signing.encode(),hashlib.sha256).hexdigest()
    return {**headers,'Content-Type':'application/json','Accept':'application/json'}

def packet(operation,body=b''):
    return struct.pack('>IHHII',16+len(body),16,1,operation,1)+body

def packets(data,depth=0):
    if depth>3 or len(data)>LIMIT:raise PlatformError('B站长连数据超出安全边界。')
    out=[];offset=0
    while offset<len(data):
        if len(data)-offset<16:raise PlatformError('B站长连数据头不完整。')
        size,header,version,operation,_=struct.unpack_from('>IHHII',data,offset)
        if header<16 or size<header or size>LIMIT or offset+size>len(data):raise PlatformError('B站长连数据长度无效。')
        body=data[offset+header:offset+size];offset+=size
        if version==2:
            decoder=zlib.decompressobj();decoded=decoder.decompress(body,LIMIT+1)
            if len(decoded)>LIMIT or decoder.unconsumed_tail:raise PlatformError('B站压缩数据过大。')
            out.extend(packets(decoded,depth+1))
        elif version==3:
            import brotli
            decoder=brotli.Decompressor();decoded=bytearray()
            for i in range(0,len(body),128):
                decoded.extend(decoder.process(body[i:i+128]))
                if len(decoded)>LIMIT:raise PlatformError('B站压缩数据过大。')
            out.extend(packets(bytes(decoded),depth+1))
        elif operation in (5,8):
            try:out.append((operation,json.loads(body)))
            except (ValueError,UnicodeError):raise PlatformError('B站长连消息格式无效。')
    return out

def message_event(data,room,anchor_id):
    if data.get('cmd')!='LIVE_OPEN_PLATFORM_DM':return None
    item=data.get('data',{});text=item.get('msg','')
    if not isinstance(text,str) or not text.strip():return None
    identity=str(item.get('open_id') or item.get('uid') or '')
    mid=str(item.get('msg_id') or '')
    if not mid:return None  # Do not manufacture unstable IDs for replayed payloads.
    return {'id':mid[:120],'user':str(item.get('uname') or 'B站观众')[:80],'text':text[:500],'room':room,'is_self':bool(anchor_id and identity==anchor_id)}

class Bilibili:
    def __init__(self,row,client,persist=None):
        self.row=row;self.client=client;self.game_id=None;self.anchor_id=''

    async def api(self,path,payload):
        c=self.row['credentials'];body=json.dumps(payload,separators=(',',':'),ensure_ascii=False).encode()
        response=await self.client.post(ROOT+path,content=body,headers=signed_headers(body,c['access_key'],c['access_secret']))
        data=checked(response,'B站')
        code=data.get('code')
        if code!=0:raise PlatformError(f'B站开放平台拒绝请求（代码{code if isinstance(code,int) else "未知"}），请检查项目权限与主播身份码。',fatal=True)
        return data.get('data',{})

    async def listen(self,on_message,on_ready):
        c=self.row['credentials']
        try:
            self.game_id=None
            data=await self.api('/v2/app/start',{'app_id':int(c['app_id']),'code':c['identity_code']})
            self.game_id=data.get('game_info',{}).get('game_id')
            if not self.game_id:raise PlatformError('B站未返回有效场次ID。',fatal=True)
            anchor=data.get('anchor_info',{})
            if str(anchor.get('room_id'))!=self.row['room']:raise PlatformError('B站身份码对应房间与配置不一致，请填写真实长房间号。',fatal=True)
            self.anchor_id=str(anchor.get('open_id') or anchor.get('uid') or '')
            info=data.get('websocket_info',{});urls=info.get('wss_link',[]);auth=info.get('auth_body')
            if not urls or not isinstance(auth,str):raise PlatformError('B站未返回长连鉴权信息。',fatal=True)
            async def project_heartbeat():
                while True:
                    await asyncio.sleep(20)
                    await self.api('/v2/app/heartbeat',{'game_id':self.game_id})
            project=asyncio.create_task(project_heartbeat())
            try:
                error=None
                for url in urls[:5]:
                    host=urlparse(url)
                    if host.scheme!='wss' or not (host.hostname or '').endswith(('.bilibili.com','.biliapi.com','.chat.bilibili.com')):continue
                    try:
                        async with websockets.connect(url,open_timeout=15,max_size=LIMIT,ping_interval=None) as ws:
                            await ws.send(packet(7,auth.encode()))
                            async def ws_heartbeat():
                                while True:
                                    await asyncio.sleep(20);await ws.send(packet(2))
                            authorized=False;receiving=None
                            heart=asyncio.create_task(ws_heartbeat())
                            try:
                                while True:
                                    receiving=asyncio.create_task(ws.recv())
                                    done,_=await asyncio.wait((receiving,project,heart),return_when=asyncio.FIRST_COMPLETED,timeout=70)
                                    if receiving not in done:
                                        receiving.cancel()
                                        with contextlib.suppress(asyncio.CancelledError):await receiving
                                        if project.done():await project
                                        if heart.done():await heart
                                        raise PlatformError('B站心跳响应超时。')
                                    raw=receiving.result()
                                    if not isinstance(raw,bytes):continue
                                    for op,event in packets(raw):
                                        if op==8:
                                            if event.get('code')!=0:raise PlatformError('B站长连鉴权失败。',fatal=True)
                                            authorized=True
                                            await on_ready()
                                        elif op==5 and authorized:
                                            message=message_event(event,self.row['room'],self.anchor_id)
                                            if message:await on_message(message)
                            finally:
                                if receiving and not receiving.done():
                                    receiving.cancel()
                                    with contextlib.suppress(asyncio.CancelledError,Exception):await receiving
                                heart.cancel()
                                with contextlib.suppress(asyncio.CancelledError,Exception):await heart
                    except asyncio.CancelledError:raise
                    except PlatformError as exc:
                        if exc.fatal:raise
                        error=exc
                    except Exception:error=PlatformError('B站长连中断。')
                raise error or PlatformError('B站没有可用的官方长连地址。',fatal=True)
            finally:
                project.cancel()
                with contextlib.suppress(asyncio.CancelledError,Exception):await project
        finally:
            if self.game_id:
                with contextlib.suppress(Exception):await self.api('/v2/app/end',{'app_id':int(c['app_id']),'game_id':self.game_id})

    async def send(self,text):
        raise PlatformError('B站开放平台接入仅接收消息；请使用本地语音/字幕回应。',fatal=True)
