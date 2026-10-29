import asyncio

class PlatformError(Exception):
    def __init__(self,message,*,fatal=False,retry_after=5):
        super().__init__(message);self.fatal=fatal;self.retry_after=retry_after


def checked(response,platform):
    if response.is_success:return response.json()
    status=response.status_code
    # Never copy raw provider payloads, request URLs or authorization headers into events.
    reason=''
    try:reason=response.json().get('error',{}).get('errors',[{}])[0].get('reason','')
    except (ValueError,AttributeError,IndexError,TypeError):pass
    if status==401:raise PlatformError(f'{platform}授权失效，请更新令牌或刷新授权。',fatal=True)
    if reason in ('liveChatEnded','liveChatDisabled','liveChatNotFound'):raise PlatformError(f'{platform}直播聊天未开启、已结束或ID无效。',fatal=True)
    if reason in ('quotaExceeded','dailyLimitExceeded'):raise PlatformError(f'{platform} API额度不足，请检查项目额度。',fatal=True)
    if status==429 or reason=='rateLimitExceeded':
        try:delay=min(300,max(5,int(response.headers.get('Retry-After','30'))))
        except ValueError:delay=30
        raise PlatformError(f'{platform}请求受限，正在退避重试。',retry_after=delay)
    if status in (400,403,404):raise PlatformError(f'{platform}请求被拒绝（HTTP {status}），请检查直播ID、授权范围及账号权限。',fatal=True)
    raise PlatformError(f'{platform}服务暂不可用（HTTP {status}）。')


class OAuth:
    def __init__(self,row,platform,client,persist=None):
        self.row=row;self.platform=platform;self.client=client;self.persist=persist
        self.lock=asyncio.Lock()
        self.token=row.get('oauth','').removeprefix('oauth:');self.expires=0
        self.credentials=dict(row.get('credentials',{}))

    async def refresh(self):
        import time
        c=self.credentials
        if not c.get('refresh_token'):
            if not self.token:raise PlatformError('缺少OAuth令牌或刷新授权。',fatal=True)
            return
        endpoint='https://oauth2.googleapis.com/token' if self.platform=='youtube' else 'https://id.twitch.tv/oauth2/token'
        data={'grant_type':'refresh_token','client_id':c.get('client_id',''),'client_secret':c.get('client_secret',''),'refresh_token':c['refresh_token']}
        result=checked(await self.client.post(endpoint,data=data),self.platform)
        token=result.get('access_token')
        if not token:raise PlatformError('OAuth刷新响应无有效令牌。',fatal=True)
        previous=c['refresh_token'];refresh=result.get('refresh_token',previous)
        self.token=token;c['refresh_token']=refresh
        self.expires=time.monotonic()+max(30,int(result.get('expires_in',3600))-120)
        if self.persist:await self.persist(token,refresh,previous)

    async def headers(self):
        import time
        async with self.lock:
            if self.credentials.get('refresh_token') and time.monotonic()>=self.expires:await self.refresh()
        return {'Authorization':'Bearer '+self.token}
