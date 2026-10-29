"""Deterministic official-protocol fixtures; no platform credentials or network required."""
import asyncio
import hashlib
import hmac
import json
import struct
import zlib
from datetime import timedelta
import httpx
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from astraverse.modules.live import service as live
from astraverse.modules.live.platforms.common import OAuth, PlatformError, checked
from astraverse.modules.live.platforms import bilibili as bili, youtube as yt


def run(task):return asyncio.run(task)

def row(**patch):
    return live.Channel(id='fixture',name='测试',platform='youtube',transport='youtube',room='abcdefghijk',oauth='access-fixture',youtube_mode='poll',**patch).model_dump()


def test_configuration_redaction_preserve_and_platform_change(tmp_path,monkeypatch):
    monkeypatch.setattr(live,'FILE',tmp_path/'live.json');monkeypatch.setattr(live,'runtime',{})
    async def check():
        first=row(credentials={'client_id':'public-id','client_secret':'secret-fixture','refresh_token':'refresh-fixture'})
        result=await live.update('fixture',live.Channel(**first))
        dumped=json.dumps(result)
        for value in ('access-fixture','secret-fixture','refresh-fixture'):assert value not in dumped
        assert result['credential_status']['refresh_token']
        assert 'token' not in result
        await live.update('fixture',live.Channel(**{**first,'oauth':'','credentials':{}}))
        assert live.channel('fixture')['credentials']['refresh_token']=='refresh-fixture'
        await live.update('fixture',live.Channel(**{**first,'platform':'custom','transport':'bridge','oauth':'','credentials':{}}))
        assert not live.channel('fixture')['oauth']
        assert not any(live.channel('fixture')['credentials'].values())
    run(check())


def test_configuration_rejects_invalid_transport_and_control_characters(tmp_path,monkeypatch):
    monkeypatch.setattr(live,'FILE',tmp_path/'live.json')
    with pytest.raises(ValidationError):live.Channel(**row(credentials={'client_secret':'x\r\ny'}))
    async def check():
        with pytest.raises(HTTPException):await live.update('fixture',live.Channel(**{**row(),'transport':'bilibili'}))
        with pytest.raises(HTTPException):await live.update('fixture',live.Channel(**{**row(),'platform':'bilibili','transport':'bilibili','send_to_platform':True}))
    run(check())


def test_oauth_rotation_is_serialized_and_persisted():
    requests=[];saved=[]
    def respond(request):
        requests.append(request)
        assert request.url.host=='oauth2.googleapis.com'
        return httpx.Response(200,json={'access_token':'new-access','refresh_token':'rotated-refresh','expires_in':3600})
    async def check():
        async def persist(*args):saved.append(args)
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            auth=OAuth(row(credentials={'refresh_token':'old-refresh','client_id':'cid','client_secret':'secret'}),'youtube',client,persist)
            headers=await asyncio.gather(auth.headers(),auth.headers())
            assert headers==[{'Authorization':'Bearer new-access'}]*2
            assert saved==[('new-access','rotated-refresh','old-refresh')]
            assert len(requests)==1
    run(check())


def test_twitch_validates_identity_and_required_scopes():
    async def check():
        twitch={**row(),'platform':'twitch','transport':'twitch','room':'room','username':'bot','send_to_platform':True}
        def respond(request):return httpx.Response(200,json={'login':'bot','scopes':['chat:read'],'expires_in':7200})
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            with pytest.raises(PlatformError,match='chat:edit'):await live.twitch_auth(twitch,client)
        def respond(request):return httpx.Response(200,json={'login':'other','scopes':['chat:read','chat:edit'],'expires_in':7200})
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            with pytest.raises(PlatformError,match='不一致'):await live.twitch_auth(twitch,client)
    run(check())


def test_provider_errors_do_not_copy_private_payloads():
    for status,reason in [(401,'invalid'),(403,'quotaExceeded'),(403,'liveChatEnded'),(429,'rateLimitExceeded')]:
        with pytest.raises(PlatformError) as found:
            checked(httpx.Response(status,json={'error':{'message':'secret-token','errors':[{'reason':reason}]}},headers={'Retry-After':'99'}),'测试')
        assert 'secret-token' not in str(found.value)
        assert found.value.fatal==(status!=429)
        if status==429:assert found.value.retry_after==99


def test_youtube_poll_continuation_history_self_and_server_interval(monkeypatch):
    calls=[];messages=[];ready=[];delays=[]
    class Finished(Exception):pass
    async def check():
        async with httpx.AsyncClient() as client:
            adapter=yt.YouTube(row(),client)
            def item(mid,date,author='viewer'):
                return {'id':mid,'snippet':{'type':'textMessageEvent','publishedAt':date.isoformat(),'textMessageDetails':{'messageText':'hello'}},'authorDetails':{'channelId':author,'displayName':'观众'}}
            async def get(path,params):
                calls.append((path,params.copy()))
                if path=='/videos':return {'items':[{'liveStreamingDetails':{'activeLiveChatId':'chat'}}]}
                if path=='/channels':return {'items':[{'id':'self'}]}
                if not params.get('pageToken'):
                    return {'nextPageToken':'cursor1','pollingIntervalMillis':7200,'items':[item('old',adapter.started-timedelta(seconds=10)),item('new',adapter.started+timedelta(seconds=1)),item('mine',adapter.started+timedelta(seconds=1),'self')]}
                assert params['pageToken']=='cursor1'
                raise Finished()
            async def wait(seconds):delays.append(seconds)
            async def on_message(event):messages.append(event)
            async def on_ready():ready.append(True)
            monkeypatch.setattr(adapter,'get',get);monkeypatch.setattr(yt.asyncio,'sleep',wait)
            with pytest.raises(Finished):await adapter.listen(on_message,on_ready)
        assert [m['id'] for m in messages]==['new','mine']
        assert messages[1]['is_self']
        assert ready==[True] and delays==[7.2]
    run(check())


def test_youtube_send_uses_bound_chat_and_reports_id():
    def respond(request):
        body=json.loads(request.content)
        assert request.method=='POST' and request.url.path=='/youtube/v3/liveChat/messages'
        assert body['snippet']['liveChatId']=='bound-chat'
        assert len(body['snippet']['textMessageDetails']['messageText'])==200
        assert request.headers['Authorization']=='Bearer access-fixture'
        return httpx.Response(200,json={'id':'confirmed-id'})
    async def check():
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            adapter=yt.YouTube(row(),client);adapter.chat_id='bound-chat'
            assert await adapter.send('中'*400)=='confirmed-id'
    run(check())


def test_bilibili_signing_canonical_header_and_compressed_packets():
    body=b'{"app_id":123,"code":"test"}'
    headers=bili.signed_headers(body,'key','secret',timestamp=123,nonce='nonce')
    canonical='\n'.join(['x-bili-accesskeyid:key',f'x-bili-content-md5:{hashlib.md5(body).hexdigest()}','x-bili-signature-method:HMAC-SHA256','x-bili-signature-nonce:nonce','x-bili-signature-version:1.0','x-bili-timestamp:123'])
    assert headers['Authorization']==hmac.new(b'secret',canonical.encode(),hashlib.sha256).hexdigest()
    inner=bili.packet(8,b'{"code":0}')+bili.packet(5,b'{"cmd":"LIVE_OPEN_PLATFORM_DM"}')
    compressed=zlib.compress(inner)
    frame=struct.pack('>IHHII',16+len(compressed),16,2,5,1)+compressed
    assert bili.packets(frame)==[(8,{'code':0}),(5,{'cmd':'LIVE_OPEN_PLATFORM_DM'})]
    for bad in (b'bad',struct.pack('>IHHII',15,16,1,5,1)):
        with pytest.raises(PlatformError):bili.packets(bad)
    compressed=zlib.compress(b'x'*(bili.LIMIT+1))
    with pytest.raises(PlatformError):bili.packets(struct.pack('>IHHII',16+len(compressed),16,2,5,1)+compressed)


def test_bilibili_message_filter_and_lifecycle_cleanup(monkeypatch):
    event={'cmd':'LIVE_OPEN_PLATFORM_DM','data':{'msg':'hello','uname':'观众','open_id':'anchor','msg_id':'stable-id'}}
    assert bili.message_event(event,'123','anchor')['is_self']
    assert bili.message_event({'cmd':'OTHER'},'123','anchor') is None
    event['data'].pop('msg_id')
    assert bili.message_event(event,'123','anchor') is None
    paths=[]
    async def api(path,payload):
        paths.append(path)
        if path.endswith('/start'):return {'game_info':{'game_id':'game'},'anchor_info':{'room_id':999}}
        return {}
    async def check():
        async with httpx.AsyncClient() as client:
            adapter=bili.Bilibili({'room':'123','credentials':{'app_id':'123','identity_code':'code'}},client)
            monkeypatch.setattr(adapter,'api',api)
            with pytest.raises(PlatformError,match='房间'):await adapter.listen(None,None)
        assert paths==['/v2/app/start','/v2/app/end']
    run(check())


def test_native_failure_is_fatal_and_stop_cancels_worker(tmp_path,monkeypatch):
    monkeypatch.setattr(live,'FILE',tmp_path/'live.json');monkeypatch.setattr(live,'runtime',{})
    live.save({'fixture':{**row(agent_id='actor'),'token':'bridge-secret'}})
    class Adapter:
        def __init__(self,*args):pass
        async def listen(self,*args):raise PlatformError('授权过期',fatal=True)
    monkeypatch.setattr(live,'YouTube',Adapter)
    async def check():
        state=live.rt('fixture');state.status='connecting'
        await live.native('fixture')
        assert state.status=='error' and state.error=='授权过期'
        assert not state.outbox
        await live.stop('fixture')
        assert state.status=='stopped' and state.adapter is None
    run(check())


def test_bilibili_authenticated_websocket_and_cancel_ends_session(monkeypatch):
    paths=[];sent=[];received=[]
    async def check():
        ready=asyncio.Event()
        class Socket:
            def __init__(self):self.first=True
            async def __aenter__(self):return self
            async def __aexit__(self,*args):pass
            async def send(self,data):sent.append(data)
            async def recv(self):
                if self.first:
                    self.first=False
                    return bili.packet(8,b'{"code":0}')+bili.packet(5,json.dumps({'cmd':'LIVE_OPEN_PLATFORM_DM','data':{'msg':'hello','uname':'viewer','msg_id':'m1','open_id':'viewer'}}).encode())
                await asyncio.Future()
        monkeypatch.setattr(bili.websockets,'connect',lambda *args,**kwargs:Socket())
        async def api(path,payload):
            paths.append(path)
            if path.endswith('/start'):return {'game_info':{'game_id':'game'},'anchor_info':{'room_id':123,'open_id':'anchor'},'websocket_info':{'wss_link':['wss://broadcastlv.chat.bilibili.com/sub'],'auth_body':'{"key":"auth"}'}}
            return {}
        async def message(event):received.append(event);ready.set()
        async def connected():pass
        async with httpx.AsyncClient() as client:
            adapter=bili.Bilibili({'room':'123','credentials':{'app_id':'123','identity_code':'code'}},client)
            monkeypatch.setattr(adapter,'api',api)
            task=asyncio.create_task(adapter.listen(message,connected))
            await asyncio.wait_for(ready.wait(),1)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):await task
        assert paths==['/v2/app/start','/v2/app/end']
        assert struct.unpack('>IHHII',sent[0][:16])[3]==7
        assert received[0]['id']=='m1' and not received[0]['is_self']
        assert not [t for t in asyncio.all_tasks() if t is not asyncio.current_task() and not t.done()]
    run(check())


def test_twitch_irc_ping_join_messages_and_cleanup(tmp_path,monkeypatch):
    from types import SimpleNamespace
    monkeypatch.setattr(live,'FILE',tmp_path/'live.json');monkeypatch.setattr(live,'runtime',{})
    live.save({'fixture':{**row(),'platform':'twitch','transport':'twitch','room':'room','username':'bot','token':'bridge-secret'}})
    lines=iter([b'PING :tmi.twitch.tv\r\n',b':bot!bot@bot.tmi.twitch.tv JOIN #room\r\n',b'@id=m1;display-name=Viewer :viewer!viewer@host PRIVMSG #room :hello\r\n',b'@id=m2 :bot!bot@host PRIVMSG #room :self\r\n'])
    writes=[];messages=[];closed=[]
    class Reader:
        async def readline(self):
            try:return next(lines)
            except StopIteration:raise asyncio.CancelledError()
    class Writer:
        def write(self,data):writes.append(data)
        async def drain(self):pass
        def close(self):closed.append(True)
        async def wait_closed(self):pass
    async def connect(*args,**kwargs):
        assert args==('irc.chat.twitch.tv',6697) and kwargs['ssl']
        return Reader(),Writer()
    async def auth(*args):return SimpleNamespace(token='test-access',expires=float('inf'))
    async def enqueue(cid,event):messages.append(event)
    monkeypatch.setattr(live.asyncio,'open_connection',connect);monkeypatch.setattr(live,'twitch_auth',auth);monkeypatch.setattr(live,'enqueue',enqueue)
    async def check():
        live.rt('fixture').status='connecting'
        with pytest.raises(asyncio.CancelledError):await live.twitch('fixture')
        assert live.rt('fixture').status=='connected' and live.rt('fixture').writer is None
    run(check())
    assert b'PONG :tmi.twitch.tv\r\n' in writes
    assert b'JOIN #room\r\n' in writes
    assert [m.id for m in messages]==['m1'] and closed==[True]


def test_youtube_stream_wire_numbers_match_published_schema():
    from astraverse.modules.live.platforms.youtube_wire import Request,Response,payload
    # Independent protobuf wire fixtures: field 1/chat, 99/cursor, 100/part.
    encoded=Request(chat='chat',cursor='page',parts=['snippet']).SerializeToString()
    assert encoded==b'\x0a\x04chat\x9a\x06\x04page\xa2\x06\x07snippet'
    # response.cursor field 100602 (varint tag 804818), offline_at field 2.
    result=Response.FromString(b'\x12\x03end\xd2\x8f\x31\x04next')
    assert payload(result)=={'offlineAt':'end','nextPageToken':'next','items':[]}


def test_youtube_stream_real_loopback_rpc_resumes_and_filters_history(monkeypatch):
    import grpc
    from astraverse.modules.live.platforms.youtube_wire import Request,Response
    async def check():
        seen=[];events=[];ready=[]
        adapter=None
        async def handler(request,context):
            seen.append((request,dict(context.invocation_metadata())))
            response=Response(cursor='next-cursor')
            for mid,delta,author in [('old',-100,'viewer'),('new',1,'viewer'),('self',1,'mine')]:
                m=response.messages.add(id=mid)
                m.snippet.event_type=1;m.snippet.published=(adapter.started+timedelta(seconds=delta)).isoformat();m.snippet.text.content='hello'
                m.author.channel=author;m.author.name=author
            yield response
        server=grpc.aio.server()
        server.add_generic_rpc_handlers((grpc.method_handlers_generic_handler('youtube.api.v3.V3DataLiveChatMessageService',{'StreamList':grpc.unary_stream_rpc_method_handler(handler,request_deserializer=Request.FromString,response_serializer=Response.SerializeToString)}),))
        port=server.add_insecure_port('127.0.0.1:0')
        await server.start()
        monkeypatch.setattr(yt.grpc.aio,'secure_channel',lambda *args,**kwargs:grpc.aio.insecure_channel(f'127.0.0.1:{port}'))
        async def message(event):events.append(event)
        async def connected():ready.append(True)
        try:
            async with httpx.AsyncClient() as client:
                adapter=yt.YouTube(row(),client);adapter.chat_id='chat';adapter.self_id='mine'
                with pytest.raises(PlatformError,match='恢复'):await adapter.stream(message,connected)
                assert [e['id'] for e in events]==['new','self'] and events[-1]['is_self']
                with pytest.raises(PlatformError,match='恢复'):await adapter.stream(message,connected)
            assert seen[0][0].chat=='chat' and not seen[0][0].cursor
            assert seen[1][0].cursor=='next-cursor'
            assert seen[0][1]['authorization']=='Bearer access-fixture' and ready==[True,True]
        finally:await server.stop(0)
    run(check())


@pytest.mark.parametrize('code_name',['UNAUTHENTICATED','RESOURCE_EXHAUSTED','FAILED_PRECONDITION'])
def test_youtube_stream_terminal_errors_are_sanitized(monkeypatch,code_name):
    import grpc
    from astraverse.modules.live.platforms.youtube_wire import Request,Response
    async def check():
        async def handler(request,context):
            await context.abort(getattr(grpc.StatusCode,code_name),'secret-fixture-details')
            yield Response()
        server=grpc.aio.server()
        server.add_generic_rpc_handlers((grpc.method_handlers_generic_handler('youtube.api.v3.V3DataLiveChatMessageService',{'StreamList':grpc.unary_stream_rpc_method_handler(handler,request_deserializer=Request.FromString,response_serializer=Response.SerializeToString)}),))
        port=server.add_insecure_port('127.0.0.1:0');await server.start()
        monkeypatch.setattr(yt.grpc.aio,'secure_channel',lambda *args,**kwargs:grpc.aio.insecure_channel(f'127.0.0.1:{port}'))
        try:
            async with httpx.AsyncClient() as client:
                adapter=yt.YouTube(row(),client);adapter.chat_id='chat'
                with pytest.raises(PlatformError) as found:await adapter.stream(None,None)
                assert found.value.fatal and 'secret-fixture' not in str(found.value)
        finally:await server.stop(0)
    run(check())
