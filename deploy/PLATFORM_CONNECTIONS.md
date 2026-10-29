# B站、Twitch 与 YouTube 直播接入

应用连接直播聊天、驱动角色表情并生成语音/字幕。推流由 OBS 等直播软件负责：在平台后台开启直播权限，选择对应服务或复制该平台当场提供的推流地址与密钥；录制角色舞台并采集应用音频。不要将含密钥的设置页加入直播画面。字幕浏览器源可从角色聊天的直播面板复制。

## 能力范围

| 平台 | 原生接收 | 回应方式 | 长时间连接 |
| --- | --- | --- | --- |
| B站 | 官方互动开放平台文字弹幕 | 本地角色、语音、字幕；本接入没有通用弹幕回发 | 官方项目与WebSocket双心跳、自动重连、停止时结束场次 |
| Twitch | 官方 IRC over TLS | 本地表现；可选机器人账号发言 | 启动及至少每小时验证授权、可选刷新授权、PING/PONG、退避重连 |
| YouTube | 默认官方 StreamList 持续流；可选 REST 轮询 | 本地表现；可选官方聊天发言 | OAuth刷新、断线续传、首批历史过滤、按错误区分重试/停止 |

三个平台也保留外部桥接方式。发送默认关闭。平台已返回消息ID、仅提交到IRC、放入桥接队列是不同状态，界面不会把后两种称为平台确认送达。发布画面与声音是否正常需要在各平台直播预览中实际核对。

## 配置入口

打开「设置 → 直播平台」，添加直播间，保存后点击「检查已保存的连接」。检查不发送聊天或开始推流；YouTube会调用有配额消耗的读取接口。回到角色聊天的「直播弹幕」，绑定角色并启动互动。

授权只保存到本机 `.local/live.json`（原子写入，文件权限0600），不是加密保险库。普通配置列表不会返回访问令牌、刷新令牌、Client Secret、Access Key/Secret或主播身份码；空白字段保留原值，更换平台清除旧平台授权。检查与运行会保存刷新后的令牌；不要手改运行中的文件。

### B站

1. 需要获批的直播互动开放平台项目，普通B站登录/推流授权不足以代替该权限。
2. 选择「B站官方开放平台」，填写主播真实长房间号、项目数字App ID、Access Key、Access Secret、主播身份码。
3. 「检查」仅确认配置完整；启动后调用 `/v2/app/start` 创建官方互动场次，核对返回的主播房间并使用返回的WSS地址及鉴权体。收到鉴权成功响应才显示已连接。
4. 每20秒发送项目心跳及长连心跳。停止/正常断线清理会尝试 `/v2/app/end`；进程崩溃或网络完全不可用时无法保证结束调用送达，平台心跳超时负责回收。
5. 只处理拥有稳定消息ID的 `LIVE_OPEN_PLATFORM_DM`，忽略其他事件、主播自身弹幕和重复消息。该适配器不提供通用弹幕发送，不应打开平台回发。

参考：[官方生命周期文档](https://open-live.bilibili.com/document/eba8e2e1-847d-e908-2e5c-7a1ec7d9266f)。签名使用固定官方HTTPS端点、内容MD5、时间戳、随机数和HMAC-SHA256；本机时钟不准确也可能导致拒绝。

### Twitch

1. 频道填登录名，不含网址或 `#`；机器人用户名必须与用户访问令牌属于同一账号。
2. IRC读取需要 `chat:read`，允许平台发言还需 `chat:edit`。应用访问令牌不能代替用户令牌。EventSub的 `user:read:chat` 等范围不能直接代替IRC范围。
3. 长期运行建议填写同一OAuth应用的Client ID、Client Secret与Refresh Token，支持令牌轮换并保存。只有短期访问令牌时，到期会明确停止并要求更新。
4. 本版使用IRC文字接口，尚未迁移到Twitch推荐的EventSub + Send Chat Message API。发送串行限速，但频道慢速、关注/订阅限制、禁言、验证要求仍可能拒绝发送；返回的频道通知会显示，IRC写入不算送达确认。
5. 需要能访问 `id.twitch.tv:443` 与 `irc.chat.twitch.tv:6697`。HTTP代理连通不能代表IRC端口可达；不要关闭TLS证书校验绕过连接错误。

参考：[IRC](https://dev.twitch.tv/docs/chat/irc/)、[授权验证要求](https://dev.twitch.tv/docs/authentication/validate-tokens/)。

### YouTube

1. 在Google Cloud启用YouTube Data API v3，完成OAuth授权。填写当前正在直播的视频ID（11位），不是频道ID或网址。需要视频公开给授权用户且聊天开启。
2. 用户授权必须可读取自己的YouTube频道；回发需要 `https://www.googleapis.com/auth/youtube.force-ssl` 或 `https://www.googleapis.com/auth/youtube`。建议填写Client ID、Client Secret与Refresh Token用于续期；Google OAuth应用处于测试状态时，刷新令牌可能受测试有效期限制。
3. 默认持续流连接 `youtube.googleapis.com:443`，使用官方gRPC StreamList、TLS、OAuth与续传令牌。需要网络/代理支持HTTP/2 gRPC；它与普通HTTPS的网络兼容性不同。连接失败会报错重试，不会悄悄改为高频轮询。
4. 如持续流不可达，可手动选REST模式；遵守每页 `pollingIntervalMillis` 和 `nextPageToken`。每次list消耗5单位，持续轮询可能很快耗尽默认配额；持续流每次连接也有配额消耗，发言另有消耗。自行检查项目配额，不承诺默认配额可直播全天。
5. 首批返回的、早于本次启动时间的历史不触发回复；同一运行过程重连保留续传令牌。服务重启重新建立起点，不补发停机期间历史。直播结束/关闭聊天/授权失败/配额不足会停止，避免无限错误请求。
6. 回发增加 `[AI]` 前缀并限长。POST响应未知时不自动重发，以免重复弹幕。刷新期间收发串行刷新同一令牌，避免并发轮换冲突。

参考：[持续流及官方协议](https://developers.google.com/youtube/data/live/streaming-live-chat)、[streamList](https://developers.google.com/youtube/data/live/reference/rest/v3/liveChatMessages/streamList)、[REST轮询](https://developers.google.com/youtube/data/live/reference/rest/v3/liveChatMessages/list)、[发言接口](https://developers.google.com/youtube/data/live/reference/rest/v3/liveChatMessages/insert)。

## 每个平台的真实联调

1. 保存授权并检查；B站启动后确认长连鉴权成功。网络错误先核对平台端点、TLS与代理，权限错误核对OAuth范围/开放平台项目。
2. 用另一个观众账号发送唯一文本，确认只入队一次、角色表现与字幕对应、自己发出的平台消息不触发循环。
3. 开启Twitch/YouTube回发后再发一条测试弹幕，在平台页面核对实际出现；B站核对直播画面中的语音与字幕。
4. 人为断网后恢复，观察重连及消息去重；停止互动确认不再生成/发言，B站场次结束。长播验收还需覆盖令牌刷新、平台配额、浏览器语音与OBS音画连续性。

本地协议测试使用模拟响应/本地服务器，不代替真实账号、频道规则、平台审核、推流画面或24小时稳定性验收。
