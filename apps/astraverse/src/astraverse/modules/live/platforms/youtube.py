"""YouTube chat: official StreamList with optional server-paced REST polling."""
import asyncio
import re
import time
import grpc
from .youtube_wire import Request,Response,payload
from datetime import datetime,timezone
from .common import OAuth, PlatformError, checked

ROOT='https://www.googleapis.com/youtube/v3'

def video_id(value):
    if re.fullmatch(r'[A-Za-z0-9_-]{11}',value):return value
    raise PlatformError('YouTube直播ID应是11位视频ID，不是频道ID或网址。',fatal=True)


def message_event(item,room,self_id):
    snippet=item.get('snippet',{});author=item.get('authorDetails',{})
    if snippet.get('type')!='textMessageEvent':return None
    text=snippet.get('textMessageDetails',{}).get('messageText','')
    if not isinstance(text,str) or not text.strip() or not item.get('id'):return None
    return {'id':item['id'][:120],'user':str(author.get('displayName') or 'YouTube观众')[:80],'text':text[:500],'room':room,'is_self':bool(self_id and author.get('channelId')==self_id)}

class YouTube:
    def __init__(self,row,client,persist=None):
        self.row=row;self.client=client;self.auth=OAuth(row,'youtube',client,persist)
        self.chat_id=None;self.self_id=None;self.page=None;self.primed=False
        self.started=datetime.now(timezone.utc)

    async def get(self,path,params):
        return checked(await self.client.get(ROOT+path,params=params,headers=await self.auth.headers()),'YouTube')

    async def connect(self):
        video=video_id(self.row['room'])
        data=await self.get('/videos',{'part':'liveStreamingDetails','id':video})
        items=data.get('items',[])
        self.chat_id=items[0].get('liveStreamingDetails',{}).get('activeLiveChatId') if items else None
        if not self.chat_id:raise PlatformError('YouTube视频尚未直播、未开启聊天或已结束。',fatal=True)
        own=await self.get('/channels',{'part':'id','mine':'true'})
        self.self_id=next((item['id'] for item in own.get('items',[]) if item.get('id')),None)
        if not self.self_id:raise PlatformError('YouTube授权账号没有可用频道，无法可靠过滤自身消息。',fatal=True)

    async def accept(self,result,on_message):
        if result.get('offlineAt') or any(item.get('snippet',{}).get('type')=='chatEndedEvent' for item in result.get('items',[])):
            raise PlatformError('YouTube直播聊天已结束。',fatal=True)
        if not result.get('nextPageToken'):raise PlatformError('YouTube未返回聊天续页令牌，已停止以避免重复拉取。',fatal=True)
        for item in result.get('items',[]):
            if not self.primed:
                try:
                    published=datetime.fromisoformat(item['snippet']['publishedAt'].replace('Z','+00:00'))
                    if published<self.started:continue
                except (ValueError,KeyError,TypeError):continue
            event=message_event(item,self.row['room'],self.self_id)
            if event:await on_message(event)
        self.primed=True;self.page=result['nextPageToken']

    async def listen(self,on_message,on_ready):
        await self.connect()
        if self.row.get('youtube_mode','stream')=='poll':
            await self.poll(on_message,on_ready)
        else:await self.stream(on_message,on_ready)

    async def poll(self,on_message,on_ready):
        first=True
        while True:
            params={'part':'snippet,authorDetails','liveChatId':self.chat_id,'maxResults':200}
            if self.page:params['pageToken']=self.page
            result=await self.get('/liveChat/messages',params)
            # Validate before reporting readiness, but allow messages on the first page.
            if result.get('offlineAt'):raise PlatformError('YouTube直播聊天已结束。',fatal=True)
            if not result.get('nextPageToken'):raise PlatformError('YouTube未返回聊天续页令牌。',fatal=True)
            if first:await on_ready();first=False
            await self.accept(result,on_message)
            await asyncio.sleep(max(1,float(result.get('pollingIntervalMillis',5000))/1000))

    async def stream(self,on_message,on_ready):
        headers=await self.auth.headers()
        lifetime=min(3600,max(1,self.auth.expires-time.monotonic())) if self.auth.expires else 3600
        try:
            async with grpc.aio.secure_channel('dns:///youtube.googleapis.com:443',grpc.ssl_channel_credentials(),options=(('grpc.max_receive_message_length',2_000_000),)) as channel:
                await asyncio.wait_for(channel.channel_ready(),20)
                rpc=channel.unary_stream('/youtube.api.v3.V3DataLiveChatMessageService/StreamList',request_serializer=Request.SerializeToString,response_deserializer=Response.FromString)
                request=Request(chat=self.chat_id,parts=['id','snippet','authorDetails'])
                if self.page:request.cursor=self.page
                call=rpc(request,metadata=(('authorization',headers['Authorization']),),timeout=lifetime)
                first=True
                try:
                    while True:
                        response=await asyncio.wait_for(call.read(),20) if first else await call.read()
                        if response is grpc.aio.EOF:break
                        result=payload(response)
                        if result.get('offlineAt'):raise PlatformError('YouTube直播聊天已结束。',fatal=True)
                        if not result.get('nextPageToken'):raise PlatformError('YouTube流未返回续传令牌。',fatal=True)
                        if first:await on_ready();first=False
                        await self.accept(result,on_message)
                finally:call.cancel()
        except grpc.aio.AioRpcError as exc:
            code=exc.code()
            if code in (grpc.StatusCode.UNAUTHENTICATED,grpc.StatusCode.PERMISSION_DENIED):raise PlatformError('YouTube流授权失败，请检查访问令牌和聊天权限。',fatal=True) from None
            if code in (grpc.StatusCode.NOT_FOUND,grpc.StatusCode.INVALID_ARGUMENT,grpc.StatusCode.FAILED_PRECONDITION):raise PlatformError('YouTube聊天ID、续传令牌无效或直播已结束。',fatal=True) from None
            if code==grpc.StatusCode.RESOURCE_EXHAUSTED:raise PlatformError('YouTube流请求受限或额度不足，请检查项目配额后重新启动。',fatal=True) from None
            if code==grpc.StatusCode.UNIMPLEMENTED:raise PlatformError('YouTube持续流暂不可用，可在设置中选择REST轮询并核对配额。',fatal=True) from None
            raise PlatformError('YouTube持续流中断，正在按续传令牌恢复。') from None
        raise PlatformError('YouTube持续流已结束，正在按续传令牌恢复。')

    async def send(self,text):
        if not self.chat_id:raise PlatformError('YouTube聊天尚未就绪。',fatal=True)
        payload={'snippet':{'liveChatId':self.chat_id,'type':'textMessageEvent','textMessageDetails':{'messageText':('[AI] '+text)[:200]}}}
        result=checked(await self.client.post(ROOT+'/liveChat/messages',params={'part':'snippet'},headers=await self.auth.headers(),json=payload),'YouTube')
        if not result.get('id'):raise PlatformError('YouTube未返回消息ID，发送结果未知。')
        return result['id']
