import { useEffect, useState } from "react";
import {
  Puzzle,
  RefreshCw,
  Play,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { readResponse } from "@/shared/api/http";
type Plugin = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  tools: string[];
  enabled: boolean;
  supported: boolean;
};
type Inventory = { plugins: Plugin[]; workspace: string };
const samples: Record<string, object> = {
  "calculator.evaluate": { expression: "(128 + 64) / 3" },
  "notes.save": { name: "灵感.txt", text: "今天的灵感" },
  "notes.read": { name: "灵感.txt" },
  "workspace.read": { name: "example.txt" },
  "clipboard.write": { text: "你好，AstraVerse" },
};
export default function PluginSettings() {
  const [data, setData] = useState<Inventory | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState<string | null>(null);
  const [selected, setSelected] = useState("clock.now");
  const [args, setArgs] = useState("{}");
  const [result, setResult] = useState("");
  async function load() {
    try {
      setError("");
      setData(await readResponse<Inventory>(await fetch("/api/plugins")));
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取插件失败");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function toggle(plugin: Plugin) {
    setBusy(true);
    setError("");
    try {
      setData(
        await readResponse<Inventory>(
          await fetch(`/api/plugins/${plugin.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: !plugin.enabled }),
          }),
        ),
      );
      setConsent(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  async function run() {
    setBusy(true);
    setError("");
    setResult("");
    try {
      const parsed: unknown = JSON.parse(args);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
        throw new Error("参数必须为 JSON 对象");
      const value = await readResponse<unknown>(
        await fetch("/api/plugins/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool: selected, arguments: parsed }),
        }),
      );
      setResult(JSON.stringify(value, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : "调用失败");
    } finally {
      setBusy(false);
    }
  }
  const owner = data?.plugins.find((p) => p.tools.includes(selected));
  return (
    <div className="plugin-settings mcp-panel">
      <div className="settings-intro">
        <div>
          <span className="settings-eyebrow">PLUGIN LIBRARY</span>
          <h3>为伙伴，扩展日常能力。</h3>
          <p>
            内置插件可供所有角色 Agent 与本机 MCP
            客户端调用。按需启用，权限随时可撤回。
          </p>
        </div>
        <Puzzle size={26} />
      </div>
      <div className="plugin-toolbar">
        <span>
          {data?.plugins.filter((p) => p.enabled).length || 0} 个插件已启用
        </span>
        <button onClick={() => void load()} disabled={busy}>
          <RefreshCw size={14} />
          刷新
        </button>
      </div>
      {error && (
        <div className="settings-feedback error" role="alert">
          {error}
        </div>
      )}
      <div className="plugin-grid">
        {data?.plugins.map((p) => (
          <article className="plugin-card" key={p.id}>
            <div className="plugin-card-head">
              <span className="plugin-icon">
                <Puzzle size={19} />
              </span>
              <div>
                <h4>{p.name}</h4>
                <small>
                  {p.supported ? "内置 · 本地运行" : "当前系统不支持"}
                </small>
              </div>
              <button
                disabled={busy || !p.supported}
                className={p.enabled ? "plugin-enabled" : ""}
                onClick={() => (p.enabled ? void toggle(p) : setConsent(p.id))}
              >
                {p.enabled ? "已启用 · 停用" : "启用"}
              </button>
            </div>
            <p>{p.description}</p>
            <div className="plugin-permissions">
              <ShieldCheck size={13} />
              {p.permissions.join(" · ")}
            </div>
            <details>
              <summary>{p.tools.length} 个工具</summary>
              {p.tools.map((t) => (
                <code key={t}>{t}</code>
              ))}
            </details>
            {consent === p.id && (
              <div className="plugin-consent">
                <p>
                  启用后，角色聊天和本机 MCP
                  客户端可以使用以上权限。停用会阻止后续调用。
                </p>
                <button onClick={() => setConsent(null)}>取消</button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void toggle(p)}
                >
                  同意权限并启用
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      <details className="settings-detail">
        <summary>在聊天中使用插件</summary>
        <p>
          直接发送以下指令，角色会调用真实插件。涉及便签和剪贴板的插件请先启用。
        </p>
        <pre>
          {
            "现在几点？\n计算 (128 + 64) / 3\n查看系统信息\n列出便签\n保存便签：灵感.txt\n今天想到的新点子\n读取便签：灵感.txt\n读取剪贴板\n复制到剪贴板：你好\n列出工作文件\n读取工作文件：example.txt"
          }
        </pre>
        <p>
          工作文件目录：<code>{data?.workspace}</code>。只支持该目录内的普通
          UTF-8 文本文件。插件结果可能保存在当前角色会话中。
        </p>
      </details>
      <details className="settings-detail">
        <summary>工具调用台</summary>
        <label className="field">
          工具
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setArgs(JSON.stringify(samples[e.target.value] || {}, null, 2));
              setResult("");
            }}
          >
            {data?.plugins.flatMap((p) =>
              p.tools.map((t) => (
                <option key={t} value={t}>
                  {p.name} · {t}
                  {p.enabled ? "" : "（未启用）"}
                </option>
              )),
            )}
          </select>
        </label>
        <label className="field">
          参数
          <textarea
            rows={5}
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            spellCheck={false}
          />
        </label>
        <div className="mcp-run">
          <span>执行会立即使用对应权限；同名便签会覆盖。</span>
          <button
            className="primary"
            disabled={busy || !owner?.enabled}
            onClick={() => void run()}
          >
            {busy ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <Play size={14} />
            )}
            执行
          </button>
        </div>
        <pre>{result || "调用后显示真实结果。"}</pre>
      </details>
      <p className="plugin-footnote">
        当前支持内置插件，不下载或执行第三方代码。新增插件通过后端白名单注册。
      </p>
    </div>
  );
}
