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
  transport: "bridge",
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
  const [bridge, setBridge] = useState("");
  const [deleting, setDeleting] = useState(false);
  async function load() {
    try {
      setData(await liveRequest<LiveInventory>());
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法读取直播配置");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function edit(row: LiveChannel) {
    setDraft({ ...row, oauth: "" });
    setBridge("");
    setError("");
    setNotice("");
    setDeleting(false);
  }
  function change(patch: Partial<LiveChannel>) {
    setDraft((p) => (p ? { ...p, ...patch } : p));
    setBridge("");
    setNotice("");
  }
  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const { status, error, queued, has_oauth, ...body } = draft;
      void status;
      void error;
      void queued;
      void has_oauth;
      const row = await liveRequest<LiveChannel>(
        `/channels/${draft.id}`,
        "PUT",
        body,
      );
      await load();
      setDraft({ ...row, oauth: "" });
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
          <h3>让伙伴，走进你的直播间。</h3>
          <p>
            配置直播平台，再到聊天框绑定角色。弹幕触发角色回应、表情与语音。
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
                      e.target.value === "twitch" ? "twitch" : "bridge",
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
                : "房间号 / 直播 ID"}
              <input
                value={draft.room}
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
                  })
                }
              >
                <option value="bridge">本机弹幕桥接</option>
                {draft.platform === "twitch" && (
                  <option value="twitch">Twitch 官方 IRC · TLS</option>
                )}
              </select>
            </label>
            {draft.transport === "twitch" && (
              <>
                <label className="field">
                  机器人账号登录名
                  <input
                    value={draft.username}
                    autoComplete="off"
                    onChange={(e) => change({ username: e.target.value })}
                  />
                </label>
                <label className="field">
                  OAuth 用户访问令牌
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={draft.oauth || ""}
                    placeholder={
                      draft.has_oauth
                        ? "已保存，留空保留"
                        : "chat:read；发言还需 chat:edit"
                    }
                    onChange={(e) => change({ oauth: e.target.value })}
                  />
                </label>
              </>
            )}
            <label className="field">
              回复间隔（5–120 秒）
              <input
                type="number"
                min={5}
                max={120}
                value={draft.cooldown}
                onChange={(e) => change({ cooldown: Number(e.target.value) })}
              />
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
                  : "将回复放入发言队列，由桥接程序领取并通过平台授权发送。"}{" "}
                默认仅在本地展示。
              </p>
            </div>
            <input
              type="checkbox"
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
              保存配置
            </button>
            {saved && (
              <button disabled={busy} onClick={() => setDeleting(true)}>
                <Trash2 size={14} />
                删除
              </button>
            )}
          </div>
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
          Twitch
          直连使用你授权的机器人账号。其他平台使用统一桥接接口，需要外部采集程序与相应平台授权；本应用不绕过平台登录和开放平台权限。
          <a
            href="https://dev.twitch.tv/docs/chat/irc/"
            target="_blank"
            rel="noreferrer"
          >
            Twitch 官方接入说明
          </a>
        </p>
        <p>
          每次回复可能消耗模型额度；间隔、关键词、队列上限和去重用于控制频率。重启服务后需手动重新启动。直播弹幕使用角色人设，但不会读取私人会话、专属记忆或调用系统插件。昵称和弹幕仅在内存保留最近记录。
        </p>
      </details>
    </div>
  );
}
