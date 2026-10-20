import { useEffect, useState } from "react";
import { Code2, LoaderCircle, Play, Radio, RefreshCw } from "lucide-react";
import { readResponse } from "@/shared/api/http";
interface Tool {
  name: string;
  inputSchema: Record<string, unknown>;
}
export default function McpPanel() {
  const [connection, setConnection] = useState<{
    endpoint: string;
    http_config: object;
    stdio_config: object;
  } | null>(null);
  const [copied, setCopied] = useState("");
  const [tools, setTools] = useState<Tool[]>([]);
  const [planned, setPlanned] = useState<string[]>([]);
  const [selected, setSelected] = useState("system.get_state");
  const [args, setArgs] = useState("{}");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  async function discover() {
    setError("");
    try {
      const r = await readResponse<{ tools: Tool[]; planned: string[] }>(
        await fetch("/api/tools"),
      );
      setTools(r.tools);
      setPlanned(r.planned);
      setConnected(true);
    } catch (e) {
      setConnected(false);
      setError(e instanceof Error ? e.message : "无法连接控制服务");
    }
  }
  useEffect(() => {
    void discover();
    void fetch("/api/mcp/config")
      .then((r) =>
        readResponse<{
          endpoint: string;
          http_config: object;
          stdio_config: object;
        }>(r),
      )
      .then(setConnection)
      .catch(() => {});
  }, []);
  function choose(name: string) {
    setSelected(name);
    setArgs(
      JSON.stringify(
        name === "character.emote"
          ? { emotion: "happy", intensity: 0.7 }
          : name === "character.pose"
            ? { rightArm: 65, rightElbow: 90 }
            : name === "character.move"
              ? { x: 0, z: 0 }
              : name === "character.rotate"
                ? { degrees: 0 }
                : name === "character.speak"
                  ? { text: "你好，很高兴见到你。" }
                  : name === "character.animate"
                    ? { animation: "wave" }
                    : name === "scene.load"
                      ? { scene: "lunar" }
                      : name === "character.presence"
                        ? {
                            naturalMotion: true,
                            gazeTracking: true,
                            breath: 0.6,
                          }
                        : {},
        null,
        2,
      ),
    );
    setResult("");
  }
  async function run() {
    setBusy(true);
    setError("");
    try {
      const argumentsValue: unknown = JSON.parse(args);
      if (
        !argumentsValue ||
        Array.isArray(argumentsValue) ||
        typeof argumentsValue !== "object"
      )
        throw new Error("参数必须是 JSON 对象");
      const data = await readResponse<unknown>(
        await fetch("/api/tools/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool: selected, arguments: argumentsValue }),
        }),
      );
      setResult(JSON.stringify(data, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : "执行失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mcp-panel">
      <div className="settings-intro">
        <div>
          <span className="settings-eyebrow">TOOLS & CONNECTIONS</span>
          <h3>让智能，拥有行动的能力。</h3>
          <p>发现并调试角色工具，指令会同步到已连接的舞台。</p>
        </div>
        <Code2 size={26} />
      </div>
      <div className="mcp-connection">
        <Radio size={17} />
        <span>
          {connected ? "控制服务已连接" : "控制服务未连接"}
          <small>
            {tools.length} 个可执行工具 · {planned.length} 个规划能力
          </small>
        </span>
        <button onClick={() => void discover()} title="刷新工具">
          <RefreshCw size={15} />
        </button>
      </div>
      {error && (
        <div className="settings-feedback error" role="alert">
          {error}
        </div>
      )}
      <section className="mcp-connect-card">
        <span className="settings-eyebrow">CONNECT YOUR APPS</span>
        <h4>连接到 AstraVerse</h4>
        <p>
          支持 Streamable HTTP 与 stdio。其他应用可与指定 Agent
          聊天、控制舞台，并调用已启用的插件。
        </p>
        <code>{connection?.endpoint || "正在读取连接信息…"}</code>
        <p>
          本机单用户服务，共享角色会话。保持 API
          运行；角色聊天使用已配置的大模型，可能产生模型费用。
        </p>
        {connection &&
          (
            [
              ["HTTP", connection.http_config],
              ["stdio", connection.stdio_config],
            ] as const
          ).map(([label, value]) => (
            <details key={label} className="settings-detail">
              <summary>{label} 客户端配置</summary>
              <pre>{JSON.stringify(value, null, 2)}</pre>
              <button
                onClick={() =>
                  void navigator.clipboard
                    .writeText(JSON.stringify(value, null, 2))
                    .then(() => setCopied(label))
                    .catch(() => setError("复制失败，请手动选择配置文本"))
                }
              >
                {copied === label ? "已复制" : "复制配置"}
              </button>
            </details>
          ))}
        <small>
          不同客户端的配置字段可能不同；HTTP 地址填入客户端的 MCP
          服务器地址。启用插件请前往设置中的「插件中心」。
        </small>
      </section>
      <label className="field">
        选择工具
        <select
          aria-label="MCP 工具"
          value={selected}
          onChange={(e) => choose(e.target.value)}
        >
          {tools.map((t) => (
            <option key={t.name}>{t.name}</option>
          ))}
        </select>
      </label>
      <label className="field">
        调用参数（JSON）
        <textarea
          aria-label="MCP 参数"
          rows={5}
          spellCheck={false}
          value={args}
          onChange={(e) => setArgs(e.target.value)}
        />
      </label>
      <div className="mcp-run">
        <span>执行将修改当前空间的运行状态。</span>
        <button
          className="primary"
          disabled={busy || !connected}
          onClick={() => void run()}
        >
          {busy ? (
            <LoaderCircle className="spin" size={14} />
          ) : (
            <Play size={14} />
          )}
          执行工具
        </button>
      </div>
      <pre aria-label="MCP 执行结果">
        {result || "执行后将在这里显示真实的返回结果。"}
      </pre>
      <details className="settings-detail">
        <summary>工具参数规范</summary>
        <pre>
          {JSON.stringify(
            tools.find((t) => t.name === selected)?.inputSchema || {},
            null,
            2,
          )}
        </pre>
      </details>
      <details className="settings-detail">
        <summary>连接外部 MCP 客户端</summary>
        <p>
          先启动本地 API，然后在 MCP 客户端中以 stdio 运行项目的
          astraverse.integrations.mcp.stdio 模块。完整路径与配置示例见 README 的 MCP 接入章节。
        </p>
        <code>ASTRAVERSE_API=http://127.0.0.1:8000</code>
        <p>
          返回 dispatched
          代表已派发，尚未表示浏览器完成渲染。当前仍是本地单用户空间。
        </p>
      </details>
    </div>
  );
}
