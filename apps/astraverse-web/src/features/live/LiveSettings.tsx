import { useEffect, useState } from "react";
import { Radio, Plus, Save, Trash2 } from "lucide-react";
import {
  liveRequest,
  liveChanged,
  liveStatus,
  type LiveChannel,
  type LiveInventory,
} from "@/features/live/liveApi";
const create = (): LiveChannel => ({
  id: crypto.randomUUID(),
  name: "我的直播间",
  platform: "bilibili",
  room: "",
  transport: "bilibili",
  credentials: {},
  username: "",
  oauth: "",
  agent_id: null,
  cooldown: 12,
  keyword: "",
  voice: true,
  send_to_platform: false,
});
export default function LiveSettings() {
  const [data, setData] = useState<LiveInventory>({
    platforms: [],
    channels: [],
  });
  const [draft, setDraft] = useState<LiveChannel | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [bridge, setBridge] = useState("");
  const [deleting, setDeleting] = useState(false);
  async function load() {
    try {
      const inventory = await liveRequest<LiveInventory>();
      setData({ ...inventory, channels: inventory.channels.filter((c) => c.transport !== "local") });
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法读取直播配置");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function edit(row: LiveChannel) {
    setDirty(false);
    setDraft({ ...row, oauth: "" });
    setBridge("");
    setError("");
    setNotice("");
    setDeleting(false);
  }
  function change(patch: Partial<LiveChannel>) {
    setDirty(true);
    setDraft((p) => (p ? { ...p, ...patch } : p));
    setBridge("");
    setNotice("");
  }
  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const body = Object.fromEntries([
        "id", "name", "platform", "room", "transport", "username", "oauth",
        "credentials", "youtube_mode", "agent_id", "cooldown", "keyword", "voice", "send_to_platform",
      ].map((key) => [key, draft[key as keyof LiveChannel]]));
      const row = await liveRequest<LiveChannel>(
        `/channels/${draft.id}`,
        "PUT",
        body,
      );
      await load();
      setDraft({ ...row, oauth: "" });
      setDirty(false);
      setNotice(
        "已保存。请在聊天框绑定角色并启动互动。修改配置会停止当前连接。",
      );
      liveChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    if (!draft || dirty) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await liveRequest<{ verified: boolean; message: string }>(`/channels/${draft.id}/check`, "POST");
      setNotice(result.message);
    } catch (e) { setError(e instanceof Error ? e.message : "连接检查失败"); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!draft) return;
    setBusy(true);
    try {
      await liveRequest(`/channels/${draft.id}`, "DELETE");
      setDraft(null);
      setDeleting(false);
      await load();
      liveChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }
  async function config() {
    if (!draft) return;
    setError("");
    try {
      setBridge(
        JSON.stringify(
          await liveRequest(`/channels/${draft.id}/bridge-config`, "POST"),
          null,
          2,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "请先保存配置");
    }
  }
  const saved = !!draft && data.channels.some((c) => c.id === draft.id);
  return (
    <div className="live-settings">
      <div className="settings-intro">
        <div>
          <span className="settings-eyebrow">LIVE CONNECTIONS</span>
          <h3>连接你的直播间</h3>
          <p>
            选择平台、填写授权，再检查连接。角色通过语音、字幕与表情回应观众。
          </p>
        </div>
        <Radio size={26} />
      </div>
      <div className="live-room-list">
        {data.channels.map((c) => (
          <button
            className={draft?.id === c.id ? "active" : ""}
            key={c.id}
            onClick={() => edit(c)}
          >
            <strong>{c.name}</strong>
            <small>
              {data.platforms.find((p) => p.id === c.platform)?.name} · {c.room}{" "}
              · {liveStatus[c.status || "stopped"]}
            </small>
          </button>
        ))}
        <button onClick={() => edit(create())}>
          <Plus size={15} />
          添加直播间
        </button>
      </div>
      {error && (
        <div role="alert" className="settings-feedback error">
          {error}
        </div>
      )}
      {notice && <div className="settings-feedback">{notice}</div>}
      {draft ? (
        <section className="live-editor">
          <div className="live-editor-heading"><div><span className="settings-eyebrow">CHANNEL SETTINGS</span><h4>{draft.name || "新直播间"}</h4></div><span className="live-editor-badge">{dirty ? "有未保存修改" : saved ? "配置已保存" : "待保存"}</span></div>
          <div className="live-dev-guide">
            <strong>{draft.transport === "twitch" ? "Twitch · IRC 接入" : draft.transport === "bilibili" ? "B站 · 官方互动接入" : draft.transport === "youtube" ? "YouTube · 聊天 API" : "本机桥接 · 自定义接入"}</strong>
            <p>{draft.transport === "twitch" ? "账号先启用 2FA，再注册应用。读取聊天需 chat:read；回发需 chat:edit。机器人登录名必须与令牌所属账号一致。" : draft.transport === "bilibili" ? "项目 App ID、开发者密钥和主播身份码需对应可用的开放平台项目。填写真实长房间号；检查仅验证配置完整性，启动后才验证平台鉴权。" : draft.transport === "youtube" ? "填写本场直播的视频 ID，不是频道 ID。持续流需要网络支持 HTTP/2；REST 轮询需关注 API 配额。" : "保存后展开桥接配置，取得本机接口与令牌；由你的采集程序向接口投递弹幕。"}</p>
            {draft.transport === "twitch" && <a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noopener noreferrer">打开 Twitch 应用控制台 ↗</a>}
            {draft.transport === "bilibili" && <a href="https://open-live.bilibili.com/open-manage" target="_blank" rel="noopener noreferrer">打开 B站项目后台 ↗</a>}
          </div>
          <div className="live-section-label">01 / 直播间与接入方式</div>
          <div className="live-fields">
            <label className="field">
              直播间名称
              <input
                value={draft.name}
                maxLength={60}
                onChange={(e) => change({ name: e.target.value })}
              />
            </label>
            <label className="field">
              直播平台
              <select
                value={draft.platform}
                onChange={(e) =>
                  change({
                    platform: e.target.value,
                    transport:
                      ["twitch", "youtube", "bilibili"].includes(e.target.value) ? e.target.value as LiveChannel["transport"] : "bridge",
                    credentials: {}, credential_status: {}, oauth: "", has_oauth: false,
                    send_to_platform: false,
                  })
                }
              >
                {data.platforms.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                    {p.direct ? " · 可直连" : " · 需弹幕桥接"}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {draft.transport === "twitch"
                ? "Twitch 频道登录名（不含 #）"
                : draft.transport === "youtube" ? "YouTube 直播视频 ID（11位）" : "房间号（B站填写真实长房间号）"}
              <input
                value={draft.room}
                placeholder={draft.transport === "twitch" ? "例如 rowanx001，不填网址或 #" : draft.transport === "youtube" ? "例如 jfKfPfyJRdk（11位）" : "填写纯数字房间号"}
                maxLength={120}
                onChange={(e) => change({ room: e.target.value })}
              />
            </label>
            <label className="field">
              接入方式
              <select
                value={draft.transport}
                onChange={(e) =>
                  change({
                    transport: e.target.value as LiveChannel["transport"],
                    send_to_platform: e.target.value === "bilibili" ? false : draft.send_to_platform,
                  })
                }
              >
                <option value="bridge">本机弹幕桥接</option>
                {draft.platform === "youtube" && <option value="youtube">YouTube 官方聊天 API</option>}
                {draft.platform === "bilibili" && <option value="bilibili">B站官方开放平台 · 接收弹幕</option>}
                {draft.platform === "twitch" && (
                  <option value="twitch">Twitch 官方 IRC · TLS</option>
                )}
              </select>
            </label>
            {draft.transport === "youtube" && <label className="field">聊天接收模式
              <select value={draft.youtube_mode || "stream"} onChange={(e) => change({ youtube_mode: e.target.value as "stream" | "poll" })}>
                <option value="stream">持续流 · 推荐长时间直播</option><option value="poll">REST轮询 · 需核对配额</option>
              </select>
            </label>}
            {draft.transport === "twitch" && (
              <>
                <label className="field">
                  机器人账号登录名
                  <input
                    value={draft.username}
                    placeholder="令牌所属账号，例如 rowanx001"
                    autoComplete="off"
                    onChange={(e) => change({ username: e.target.value })}
                  />
                </label>
              </>
            )}
            {(draft.transport === "twitch" || draft.transport === "youtube") && <>
              <label className="field">OAuth 用户访问令牌
                <input type="password" autoComplete="new-password" value={draft.oauth || ""}
                  placeholder={draft.has_oauth ? "已保存，留空保留" : "填写访问令牌，或配置下方刷新授权"}
                  onChange={(e) => change({ oauth: e.target.value })} />
              </label>
            </>}
            {draft.transport === "bilibili" && <p>需要获批的B站互动开放平台项目与主播身份码。此接口接收弹幕，角色通过直播画面的语音、字幕和表情回应。</p>}
          </div>
          {draft.transport !== "bridge" && <details className="settings-detail" open={draft.transport === "bilibili"}>
            <summary>{draft.transport === "bilibili" ? "B站项目授权" : "自动续期授权（长时间直播建议配置）"}</summary>
            <p>密钥仅保存在本机配置，页面不回显。留空保留已有值；更换平台会清除旧平台授权。请勿将设置页加入直播画面。</p>
            <div className="live-fields">
              {(draft.transport === "bilibili"
                ? [["app_id", "项目 App ID"], ["access_key", "Access Key"], ["access_secret", "Access Secret"], ["identity_code", "主播身份码"]]
                : [["client_id", "OAuth Client ID"], ["client_secret", "OAuth Client Secret"], ["refresh_token", "Refresh Token"]]
              ).map(([key, label]) => <label className="field" key={key}><span>{label} <small className="live-credential-state">{draft.credentials?.[key as keyof NonNullable<LiveChannel["credentials"]>] ? "已填写" : draft.credential_status?.[key] ? "已保存" : "未配置"}</small></span>
                <input type={key === "client_id" || key === "app_id" ? "text" : "password"} autoComplete="new-password"
                  value={draft.credentials?.[key as keyof NonNullable<LiveChannel["credentials"]>] || ""}
                  placeholder={draft.credential_status?.[key] ? "已保存，留空保留" : label}
                  onChange={(e) => change({ credentials: { ...draft.credentials, [key]: e.target.value } })} />
              </label>)}
            </div>
          </details>}
          <div className="live-section-label">02 / 弹幕响应策略</div>
          <div className="live-fields">
            <label className="field">
              回复间隔（5–120 秒）
              <input
                type="number"
                min={5}
                max={120}
                value={draft.cooldown}
                onChange={(e) => change({ cooldown: Number(e.target.value) })}
              />
              <small>收到弹幕后的回复节流，与自主直播的话题间隔独立。</small>
            </label>
            <label className="field">
              触发关键词
              <input
                value={draft.keyword}
                maxLength={40}
                placeholder="留空回应所有弹幕，可填角色名或 @角色"
                onChange={(e) => change({ keyword: e.target.value })}
              />
            </label>
          </div>
          <div className="live-section-label">03 / 语音与平台回发</div>
          <label className="agent-toggle">
            <div>
              <strong>允许朗读角色回应</strong>
              <p>还需打开聊天框的角色语音开关。仅当前显示的绑定角色会演出。</p>
            </div>
            <input
              type="checkbox"
              checked={draft.voice}
              onChange={(e) => change({ voice: e.target.checked })}
            />
          </label>
          <label className="agent-toggle">
            <div>
              <strong>将回复发送到直播间</strong>
              <p>
                {draft.transport === "twitch"
                  ? "启动后以机器人账号自动发言；需 chat:edit 授权。"
                  : draft.transport === "youtube" ? "启动后通过官方 API 发言；需要 youtube.force-ssl 或 youtube 授权。"
                  : draft.transport === "bilibili" ? "B站开放平台不提供通用弹幕发送；请用本地语音和字幕回应。"
                  : "将回复放入发言队列，由桥接程序领取并通过平台授权发送。"}{" "}
                默认仅在本地展示。
              </p>
            </div>
            <input
              type="checkbox"
              disabled={draft.transport === "bilibili"}
              checked={draft.send_to_platform}
              onChange={(e) => change({ send_to_platform: e.target.checked })}
            />
          </label>
          <div className="live-actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() => void save()}
            >
              <Save size={14} />
              {busy ? "处理中…" : "保存配置"}
            </button>
            {saved && <button disabled={busy || dirty} title={dirty ? "请先保存修改，再检查连接" : "检查服务器中已保存的配置"} onClick={() => void check()}>检查连接</button>}
            {saved && (
              <button disabled={busy} onClick={() => setDeleting(true)}>
                <Trash2 size={14} />
                删除
              </button>
            )}
          </div>
          {dirty && <p className="live-save-hint" role="status">修改尚未生效。保存会停止当前连接；保存后检查连接，再回直播面板启动。</p>}
          {saved && <details className="settings-detail"><summary>开发诊断 · 连接标识与状态</summary>
            <dl className="live-diagnostics"><dt>Channel ID</dt><dd>{draft.id}</dd><dt>接入类型</dt><dd>{draft.transport}</dd><dt>连接状态（载入时）</dt><dd>{liveStatus[draft.status || "stopped"] || draft.status}</dd><dt>角色绑定</dt><dd>{draft.agent_id || "尚未绑定 · 请到直播面板选择角色"}</dd></dl>
            <button disabled={busy} onClick={() => void load()}>刷新直播间列表</button>
            <p>列表显示最新状态；检查连接不会开始推流。画面和声音通过 OBS 配置。</p>
          </details>}
          {deleting && (
            <div className="plugin-consent">
              <p>删除直播间会停止互动并清除该直播间配置。</p>
              <button onClick={() => setDeleting(false)}>取消</button>
              <button disabled={busy} onClick={() => void remove()}>
                确认删除
              </button>
            </div>
          )}
          {saved && draft.transport === "bridge" && (
            <details className="settings-detail">
              <summary>弹幕桥接接入配置</summary>
              <p>
                房间号本身不会自动连接平台。请使用你拥有授权的弹幕采集程序，将弹幕转为下方
                JSON 并发送到本机接口。配置包含私有令牌，请勿展示在直播画面中。
              </p>
              <button onClick={() => (bridge ? setBridge("") : void config())}>
                {bridge ? "隐藏令牌" : "显示桥接配置"}
              </button>
              {bridge && <pre>{bridge}</pre>}
              <p>
                发言队列为 GET outbox?after=序号，携带相同
                Authorization。桥接程序负责发送及去重；队列不代表平台送达。
              </p>
            </details>
          )}
        </section>
      ) : (
        <div className="agent-thread-notice">添加一个直播间，开始配置。</div>
      )}
      <details className="settings-detail">
        <summary>连接条件与互动规则</summary>
        <p>
          B站使用官方互动开放平台；Twitch 使用授权机器人 IRC；YouTube 默认使用官方持续流，REST备用模式遵守返回的轮询间隔。
          本功能连接聊天，不负责推流，请使用 OBS 等工具发送直播画面和音频。YouTube 长时间轮询需核对 API 配额，不能仅凭令牌保证全天运行。
          <a
            href="https://dev.twitch.tv/docs/chat/irc/"
            target="_blank"
            rel="noreferrer"
          >
            Twitch 官方接入说明
          </a>
        </p>
        <p>
          每次回复可能消耗模型额度；间隔、关键词、队列上限和去重用于控制频率。重启服务后需手动重新启动。直播弹幕使用角色人设，但不会读取私人会话、专属记忆或调用系统插件。近期弹幕保留为直播上下文；已回应的公开内容可形成场次记录，相关内容按角色兴趣保留为长期记忆。不按昵称建立观众档案，可在直播页查看或清除记忆。
        </p>
      </details>
    </div>
  );
}
