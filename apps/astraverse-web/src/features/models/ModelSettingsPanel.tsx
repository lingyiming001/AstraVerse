import { speechVoices, speechLanguages } from "@/features/models/speechOptions";
import { encodeFile, videoFrames } from "@/features/models/media";
import type { ReactNode } from "react";
import { readResponse } from "@/shared/api/http";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  MessageCircle,
  ArrowRight,
  AudioLines,
  Check,
  ChevronRight,
  CircleHelp,
  Eye,
  Film,
  GitBranch,
  Image,
  KeyRound,
  LoaderCircle,
  Plus,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useWorld } from "@/shared/state/workspaceStore";
import {
  capabilities,
  type Attachment,
  type Capability,
  type InferenceResult,
  type ModelSettings,
  type ModelCheck,
  type Provider,
  type Target,
} from "@/features/models/contracts";
const empty: ModelSettings = {
  providers: [],
  routes: {},
  timeout: 45,
  max_tokens: 800,
  auto_text_route: true,
};
const defaultTabs = [
  { id: "providers", name: "平台模型", icon: Server, group: "智能与模型" },
  { id: "routing", name: "能力路由", icon: GitBranch, group: "智能与模型" },
  { id: "playground", name: "多模态实验室", icon: Sparkles, group: "智能与模型" },
];
const pair = (t: Target) => JSON.stringify([t.provider, t.model]);
const target = (v: string): Target => {
  const [provider, model] = JSON.parse(v) as [string, string];
  return { provider, model };
};
export default function ModelSettingsPanel({
  initialTab = "providers",
  tabs = defaultTabs,
  renderSection,
  scopeAgentId,
}: {
  scopeAgentId?: string;
  initialTab?: string;
  tabs?: typeof defaultTabs;
  renderSection?: (tab: string, config: ModelSettings) => ReactNode;
}) {
  const apiBase = scopeAgentId
    ? `/api/agents/${encodeURIComponent(scopeAgentId)}/models`
    : "/api/models";
  const visibleTabs = scopeAgentId
    ? tabs.filter((t) => ["providers", "routing", "playground"].includes(t.id))
    : tabs;
  const [config, setConfig] = useState<ModelSettings>(empty);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(initialTab);
  const [selected, setSelected] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [probing, setProbing] = useState(false);
  const [modelChecks, setModelChecks] = useState<Record<string, ModelCheck>>(
    {},
  );
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const configVersion = useRef(0);
  const [detected, setDetected] = useState<string[]>([]);
  const [cap, setCap] = useState<Capability>("text");
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [filename, setFilename] = useState("");
  const [processing, setProcessing] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [voice, setVoice] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const audioUrl = useRef<string | null>(null);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const value = await readResponse<ModelSettings>(
        await fetch(`${apiBase}/settings`),
      );
      setConfig(value);
      setSelected(value.providers[0]?.id || "");
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      abort.current?.abort();
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    };
  }, []);
  function update(value: ModelSettings) {
    configVersion.current += 1;
    setModelChecks({});
    setConfig(value);
    setDirty(true);
    setMessage("");
    setError("");
  }
  function providerChange(value: Partial<Provider>) {
    update({
      ...config,
      providers: config.providers.map((p) =>
        p.id === selected ? { ...p, ...value } : p,
      ),
    });
  }
  function renameModel(index: number, id: string) {
    const provider = config.providers.find((p) => p.id === selected);
    if (!provider) return;
    const oldId = provider.models[index].id;
    const replace = (t: Target) =>
      t.provider === selected && t.model === oldId ? { ...t, model: id } : t;
    const routes = { ...config.routes };
    for (const capability of capabilities) {
      const route = routes[capability.id];
      if (route)
        routes[capability.id] = {
          primary: replace(route.primary),
          fallbacks: route.fallbacks.map(replace),
        };
    }
    update({
      ...config,
      routes,
      providers: config.providers.map((p) =>
        p.id === selected
          ? {
              ...p,
              models: p.models.map((m, i) => (i === index ? { ...m, id } : m)),
            }
          : p,
      ),
    });
  }
  const provider = config.providers.find((p) => p.id === selected);
  async function save() {
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...config,
        providers: config.providers.map(({ key_configured, ...p }) => ({
          ...p,
          api_key: p.api_key || undefined,
        })),
      };
      const saved = await readResponse<ModelSettings>(
        await fetch(`${apiBase}/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
      setConfig(saved);
      setDirty(false);
      window.dispatchEvent(new Event("astraverse:model-settings-saved"));
      setMessage(
        saved.routes.text
          ? `已保存本层默认文本模型： ${saved.routes.text.primary.model}`
          : scopeAgentId
            ? "已保存：角色模型库尚未配置文本路由，请添加模型后再选择角色专属来源"
            : "已保存：平台尚未配置文本路由",
      );
      return saved;
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
      return null;
    } finally {
      setSaving(false);
    }
  }
  async function checkModel(providerId: string, modelId: string) {
    const key = pair({ provider: providerId, model: modelId });
    const version = configVersion.current;
    setTestingKey(key);
    setError("");
    setModelChecks((previous) => ({
      ...previous,
      [key]: {
        status: "checking",
        message: dirty ? "正在保存配置…" : "正在实际调用模型…",
      },
    }));
    try {
      if (dirty) {
        const saved = await save();
        if (!saved) throw new Error("保存失败，模型未发起测试，请修正配置");
      }
      if (version !== configVersion.current) return;
      setModelChecks((previous) => ({
        ...previous,
        [key]: { status: "checking", message: "正在实际调用模型，请稍候…" },
      }));
      const checked = await readResponse<ModelCheck>(
        await fetch(`${apiBase}/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider_id: providerId, model_id: modelId }),
        }),
      );
      if (version === configVersion.current)
        setModelChecks((previous) => ({ ...previous, [key]: checked }));
    } catch (e) {
      if (version === configVersion.current)
        setModelChecks((previous) => ({
          ...previous,
          [key]: {
            status: "failed",
            message:
              e instanceof Error ? e.message : "测试失败，请检查后端连接",
          },
        }));
    } finally {
      setTestingKey(null);
    }
  }
  function addQwenTts() {
    const official = (entry: Provider) => /^https:\/\/dashscope(?:-intl|-us)?\.aliyuncs\.com(?:\/|$)/.test(entry.base_url);
    const existing = config.providers.find((entry) => entry.id === selected && official(entry)) || config.providers.find(official);
    const chosen: Provider = existing || { id: `provider-${crypto.randomUUID().slice(0, 8)}`, name: "阿里云百炼", base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1", enabled: true, models: [] };
    const old = chosen.models.find((entry) => entry.id === "qwen3-tts-flash");
    const model = { ...old, id: "qwen3-tts-flash", capabilities: Array.from(new Set<Capability>([...(old?.capabilities || []), "speech"])), speech_backend: "dashscope" as const, speech_voice: old?.speech_voice || "Cherry", speech_language: old?.speech_language || "Auto" };
    const updated = { ...chosen, models: [...chosen.models.filter((entry) => entry.id !== model.id), model] };
    const previous = config.routes.speech;
    const primary = { provider: chosen.id, model: model.id };
    const fallbacks = previous ? [previous.primary, ...previous.fallbacks].filter((entry, index, all) => pair(entry) !== pair(primary) && all.findIndex((other) => pair(other) === pair(entry)) === index).slice(0, 3) : [];
    update({ ...config, providers: existing ? config.providers.map((entry) => entry.id === chosen.id ? updated : entry) : [...config.providers, updated], routes: { ...config.routes, speech: { primary, fallbacks } } });
    setSelected(chosen.id);
    setMessage("已添加 Qwen3-TTS 并选择语音路由；请保存配置。原有其他能力与供应商保持不变。");
  }
  function addProvider(local = false) {
    const id = `provider-${crypto.randomUUID().slice(0, 8)}`;
    update({
      ...config,
      providers: [
        ...config.providers,
        {
          id,
          name: local ? "本地模型" : "新的模型供应商",
          base_url: local
            ? "http://127.0.0.1:11434/v1"
            : "https://api.openai.com/v1",
          enabled: true,
          models: [],
        },
      ],
    });
    setSelected(id);
    setDetected([]);
  }
  function removeProvider(id: string) {
    const routes = { ...config.routes };
    for (const capability of capabilities) {
      const route = routes[capability.id];
      if (route?.primary.provider === id) delete routes[capability.id];
      else if (route)
        routes[capability.id] = {
          ...route,
          fallbacks: route.fallbacks.filter((t) => t.provider !== id),
        };
    }
    update({
      ...config,
      providers: config.providers.filter((p) => p.id !== id),
      routes,
    });
    setSelected(config.providers.find((p) => p.id !== id)?.id || "");
  }
  async function probe() {
    if (!provider) return;
    setProbing(true);
    setError("");
    setMessage("");
    try {
      const r = await readResponse<{ status: string; models: string[] }>(
        await fetch(`${apiBase}/probe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider_id: provider.id }),
        }),
      );
      setDetected(r.models);
      setMessage(
        `连接成功，发现 ${r.models.length} 个模型。能力标签需按供应商实际支持选择。`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "连接失败");
    } finally {
      setProbing(false);
    }
  }
  const options = (capability: Capability) =>
    config.providers.flatMap((p) =>
      p.models
        .filter((m) => m.capabilities.includes(capability))
        .map((m) => ({
          value: pair({ provider: p.id, model: m.id }),
          label: `${p.name} / ${m.id}${p.enabled ? "" : "（已停用）"}`,
          disabled: !p.enabled,
        })),
    );
  function primary(capability: Capability, value: string) {
    const routes = { ...config.routes };
    if (!value) delete routes[capability];
    else {
      const current = routes[capability];
      routes[capability] = {
        primary: target(value),
        fallbacks: (current?.fallbacks || []).filter((t) => pair(t) !== value),
      };
    }
    update({ ...config, routes });
  }
  async function fileSelected(file: File | undefined) {
    if (!file) return;
    setError("");
    setProcessing(true);
    setAttachments([]);
    setFilename("");
    try {
      if (file.size > (cap === "video" ? 50 : 8) * 1024 * 1024)
        throw new Error(
          cap === "video" ? "视频最大 50 MB" : "图片/音频最大 8 MB",
        );
      if (cap === "video") {
        if (!file.type.startsWith("video/")) throw new Error("请选择视频文件");
        setAttachments(await videoFrames(file));
        setFilename(`${file.name} · 已采样 4 帧`);
      } else {
        const a = await encodeFile(file);
        if (
          cap === "vision" &&
          !["image/png", "image/jpeg", "image/webp"].includes(a.mime)
        )
          throw new Error("图片支持 PNG / JPEG / WebP");
        if (
          cap === "transcription" &&
          !["audio/wav", "audio/mpeg"].includes(a.mime)
        )
          throw new Error("音频支持 WAV / MP3");
        setAttachments([a]);
        setFilename(file.name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "文件读取失败");
    } finally {
      setProcessing(false);
    }
  }
  async function infer() {
    setError("");
    setResult(null);
    setRunning(true);
    abort.current = new AbortController();
    try {
      const response = await fetch(`${apiBase}/infer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.current.signal,
        body: JSON.stringify({
          capability: cap,
          prompt:
            prompt.trim() ||
            (cap === "transcription" ? "转写这段音频" : "请描述画面"),
          attachments,
          voice: voice || undefined,
        }),
      });
      if (!response.ok) {
        await readResponse(response);
        return;
      }
      if (cap === "speech") {
        if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
        audioUrl.current = URL.createObjectURL(await response.blob());
        setResult({ kind: "audio", url: audioUrl.current });
      } else setResult(await response.json());
    } catch (e) {
      setError(
        e instanceof Error && e.name === "AbortError"
          ? "已停止等待；上游已接收的生成任务可能继续计费。"
          : e instanceof Error
            ? e.message
            : "请求失败",
      );
    } finally {
      setRunning(false);
    }
  }
  async function refreshVideo() {
    if (result?.kind !== "video_job") return;
    setError("");
    try {
      const r = await readResponse<{
        status: string;
        progress?: number;
        error?: string;
      }>(
        await fetch(
          `${apiBase}/video/${encodeURIComponent(result.provider_id)}/${encodeURIComponent(result.id)}`,
        ),
      );
      setResult({ ...result, ...r });
    } catch (e) {
      setError(e instanceof Error ? e.message : "查询失败");
    }
  }
  if (loading)
    return (
      <div className="settings-loading">
        <LoaderCircle className="spin" />
        正在加载模型配置…
      </div>
    );
  return (
    <div
      className={`settings-center ${scopeAgentId ? "character-model-center" : ""}`}
    >
      <aside className="settings-navigation" aria-label="设置分类">
        <span className="settings-nav-title">
          {scopeAgentId ? "角色专属模型配置" : "你的空间，你的偏好"}
        </span>
        {["偏好设置", "智能与模型", "连接与支持"].map((group) => (
          <div className="settings-nav-group" key={group}>
            <small>{group}</small>
            {visibleTabs
              .filter((t) => t.group === group)
              .map((t) => (
                <button
                  key={t.id}
                  className={tab === t.id ? "active" : ""}
                  onClick={() => setTab(t.id)}
                  aria-current={tab === t.id ? "page" : undefined}
                >
                  <t.icon size={16} />
                  {scopeAgentId && t.id === "providers" ? "专属模型" : t.name}
                </button>
              ))}
          </div>
        ))}
        <span className="settings-version">
          AstraVerse <i /> Studio 0.3
        </span>
      </aside>
      <div className="settings-content">
        {scopeAgentId && (
          <div className="settings-eyebrow">
            CHARACTER MODEL LIBRARY · 仅当前角色
          </div>
        )}
        <div className="settings-topline">
          <div>
            <strong>
              {scopeAgentId && tab === "providers"
                ? "角色专属模型"
                : tabs.find((t) => t.id === tab)?.name}
            </strong>
            <small>
              {["general", "character", "agents", "mcp", "help"].includes(tab)
                ? tab === "general" ? "主题、语音与使用偏好，修改后自动保存" : tab === "character" ? "实时调整舞台中的动作与表情" : tab === "agents" ? "管理角色的人设与直播行为" : "管理连接与使用选项"
                : dirty
                  ? "有未保存的模型配置"
                  : "模型配置已同步"}
            </small>
          </div>
          {["providers", "routing", "playground"].includes(tab) && (
            <button
              className="primary save-config"
              onClick={() => void save()}
              disabled={saving || !dirty}
            >
              {saving ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <Save size={14} />
              )}
              保存配置{dirty && <i />}
            </button>
          )}
        </div>
        {error && (
          <div className="settings-feedback error" role="alert">
            <CircleHelp size={16} />
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="关闭错误">
              <X size={14} />
            </button>
          </div>
        )}
        {message && (
          <div className="settings-feedback success" role="status">
            <Check size={16} />
            {message}
          </div>
        )}
        {!["providers", "routing", "playground"].includes(tab) ? (
          renderSection?.(tab, config)
        ) : tab === "providers" ? (
          <>
            <div className="settings-intro">
              <div>
                <span className="settings-eyebrow">CONNECTED INTELLIGENCE</span>
                <h3>每一种灵感，都有合适的模型。</h3>
                <p>连接云端与本地供应商，把选择权留给自己。</p>
              </div>
              <span className="settings-icon">
                <Server size={24} />
              </span>
            </div>
            <div className="model-setup-steps">
              <span>
                <b>1</b>连接供应商
              </span>
              <ChevronRight size={13} />
              <span>
                <b>2</b>添加模型与能力
              </span>
              <ChevronRight size={13} />
              <span>
                <b>3</b>测试并应用
              </span>
            </div>
            <div className="provider-layout">
              <div className="provider-list">
                <div className="list-heading">
                  供应商 <span>{config.providers.length}</span>
                </div>
                {config.providers.map((p) => (
                  <button
                    key={p.id}
                    className={selected === p.id ? "active" : ""}
                    onClick={() => {
                      setSelected(p.id);
                      setDetected([]);
                    }}
                  >
                    <span className="provider-monogram">
                      {p.name.slice(0, 1)}
                    </span>
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {p.models.length} 个模型 ·{" "}
                        {p.enabled ? "已启用" : "已停用"}
                      </small>
                    </span>
                    <ChevronRight size={13} />
                  </button>
                ))}
                <button className="add-provider" onClick={() => addProvider()}>
                  <Plus size={15} />
                  添加供应商
                </button>
                <button
                  className="local-provider"
                  onClick={() => addProvider(true)}
                >
                  连接本地模型 <ArrowRight size={12} />
                </button>
                <button className="add-provider" onClick={addQwenTts}>配置 Qwen3-TTS</button>
                <div className="credential-note">
                  <ShieldCheck size={18} />
                  <p>
                    密钥只保存在本机后端，不写入浏览器存储，也不在查询接口回显。
                  </p>
                </div>
              </div>
              {provider ? (
                <div className="provider-editor">
                  <div className="provider-editor-heading">
                    <div>
                      <span className="settings-eyebrow">
                        PROVIDER CONFIGURATION
                      </span>
                      <h4>{provider.name}</h4>
                    </div>
                    <label className="toggle-label">
                      启用
                      <input
                        aria-label="启用供应商"
                        type="checkbox"
                        checked={provider.enabled}
                        onChange={(e) =>
                          providerChange({ enabled: e.target.checked })
                        }
                      />
                    </label>
                  </div>
                  <div className="settings-field-grid">
                    <label className="field">
                      供应商名称
                      <input
                        aria-label="供应商名称"
                        value={provider.name}
                        onChange={(e) =>
                          providerChange({ name: e.target.value })
                        }
                        placeholder="例如：我的云端模型"
                      />
                    </label>
                    <label className="field">
                      API Base URL
                      <input
                        aria-label="API Base URL"
                        value={provider.base_url}
                        onChange={(e) =>
                          providerChange({ base_url: e.target.value })
                        }
                        placeholder="https://example.com/v1"
                      />
                    </label>
                  </div>
                  <label className="field key-field">
                    <span>
                      <KeyRound size={13} />
                      API Key{" "}
                      <small>
                        {provider.key_configured
                          ? "已安全保存 · 留空保留原密钥"
                          : "可选 · 本地模型可留空"}
                      </small>
                    </span>
                    <input
                      aria-label="API Key"
                      type="password"
                      autoComplete="new-password"
                      value={provider.api_key || ""}
                      onChange={(e) =>
                        providerChange({
                          api_key: e.target.value,
                          clear_key: false,
                        })
                      }
                      placeholder={
                        provider.key_configured
                          ? "•••••••• 已保存"
                          : "粘贴你的 API Key"
                      }
                    />
                  </label>
                  <div className="provider-actions">
                    <button
                      className="secondary"
                      disabled={dirty || probing}
                      onClick={() => void probe()}
                    >
                      {probing ? (
                        <LoaderCircle size={14} className="spin" />
                      ) : (
                        <Activity size={14} />
                      )}
                      测试连接 / 发现模型
                    </button>
                    {provider.key_configured && (
                      <button
                        onClick={() =>
                          providerChange({
                            clear_key: true,
                            api_key: undefined,
                          })
                        }
                        className="text-button"
                      >
                        {provider.clear_key
                          ? "待清除密钥（保存后生效）"
                          : "清除已保存密钥"}
                      </button>
                    )}
                    <button
                      className="danger-button"
                      title="删除此供应商及其关联路由"
                      onClick={() => removeProvider(provider.id)}
                    >
                      <Trash2 size={13} />
                      移除
                    </button>
                  </div>
                  {dirty && (
                    <p className="input-hint">
                      先保存配置，再测试当前供应商连接。
                    </p>
                  )}
                  <div className="model-list-heading">
                    <div>
                      <h4>
                        已配置模型{" "}
                        <span className="configured-count">
                          {provider.models.length}
                        </span>
                      </h4>
                      <p>每个聊天模型都可以单独发起一次真实调用验证。</p>
                    </div>
                    <button
                      onClick={() =>
                        providerChange({
                          models: [
                            ...provider.models,
                            {
                              id: `your-model-${provider.models.length + 1}`,
                              capabilities: ["text"],
                            },
                          ],
                        })
                      }
                    >
                      <Plus size={13} />
                      添加模型
                    </button>
                  </div>
                  {provider.models.length === 0 && (
                    <div className="models-empty">
                      <Sparkles size={23} />
                      <p>添加模型 ID，再标记它实际支持的能力。</p>
                      <small>
                        能力标签用于路由筛选，不会改变模型自身能力。
                      </small>
                    </div>
                  )}
                  <div className="configured-model-grid">
                    {provider.models.map((m, i) => (
                      <div className="model-entry" key={i}>
                        <div>
                          <input
                            aria-label={`模型 ID ${i + 1}`}
                            value={m.id}
                            placeholder="输入供应商的准确模型 ID"
                            onChange={(e) => renameModel(i, e.target.value)}
                          />
                          <button
                            aria-label={`删除模型 ${i + 1}`}
                            onClick={() => {
                              const routes = { ...config.routes };
                              for (const c of capabilities) {
                                const r = routes[c.id];
                                if (
                                  r?.primary.provider === provider.id &&
                                  r.primary.model === m.id
                                )
                                  delete routes[c.id];
                                else if (r)
                                  routes[c.id] = {
                                    ...r,
                                    fallbacks: r.fallbacks.filter(
                                      (t) =>
                                        !(
                                          t.provider === provider.id &&
                                          t.model === m.id
                                        ),
                                    ),
                                  };
                              }
                              update({
                                ...config,
                                routes,
                                providers: config.providers.map((p) =>
                                  p.id === provider.id
                                    ? {
                                        ...p,
                                        models: p.models.filter(
                                          (_, j) => j !== i,
                                        ),
                                      }
                                    : p,
                                ),
                              });
                            }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <div className="capability-chips">
                          {capabilities.map((c) => (
                            <button
                              aria-label={`${m.id} ${c.name}`}
                              aria-pressed={m.capabilities.includes(c.id)}
                              className={
                                m.capabilities.includes(c.id) ? "selected" : ""
                              }
                              key={c.id}
                              onClick={() =>
                                providerChange({
                                  models: provider.models.map((x, j) =>
                                    j === i
                                      ? {
                                          ...x,
                                          capabilities: x.capabilities.includes(
                                            c.id,
                                          )
                                            ? x.capabilities.filter(
                                                (a) => a !== c.id,
                                              )
                                            : [...x.capabilities, c.id],
                                        }
                                      : x,
                                  ),
                                })
                              }
                            >
                              {m.capabilities.includes(c.id) && (
                                <Check size={10} />
                              )}{" "}
                              {c.name}
                            </button>
                          ))}
                        </div>
                        {m.capabilities.includes("speech") && (
                          <div className="settings-field-grid">
                            <label className="field">TTS 协议
                              <select value={m.speech_backend || "openai"} onChange={(event) => providerChange({ models: provider.models.map((entry, index) => index === i ? { ...entry, speech_backend: event.target.value as "openai" | "dashscope" } : entry) })}>
                                <option value="openai">OpenAI 兼容语音</option><option value="dashscope">百炼 Qwen3-TTS</option>
                              </select>
                            </label>
                            {m.speech_backend === "dashscope" && <>
                              <label className="field">默认音色<input value={m.speech_voice || "Cherry"} onChange={(event) => providerChange({ models: provider.models.map((entry, index) => index === i ? { ...entry, speech_voice: event.target.value } : entry) })} /></label>
                              <label className="field">合成语言<select value={m.speech_language || "Auto"} onChange={(event) => providerChange({ models: provider.models.map((entry, index) => index === i ? { ...entry, speech_language: event.target.value } : entry) })}>{speechLanguages.map((value) => <option key={value}>{value}</option>)}</select></label>
                              <p className="input-hint">使用供应商对应地域凭据，单次最多600字符。通用音色名在此协议下使用本模型默认音色。</p>
                            </>}
                          </div>
                        )}
                        <div className="model-test-actions">
                          <span
                            className={`model-check-badge ${modelChecks[pair({ provider: provider.id, model: m.id })]?.status || "untested"}`}
                          >
                            {modelChecks[
                              pair({ provider: provider.id, model: m.id })
                            ]?.status === "success" ? (
                              <Check size={12} />
                            ) : modelChecks[
                                pair({ provider: provider.id, model: m.id })
                              ]?.status === "checking" ? (
                              <LoaderCircle className="spin" size={12} />
                            ) : (
                              <Activity size={12} />
                            )}{" "}
                            {modelChecks[
                              pair({ provider: provider.id, model: m.id })
                            ]?.status === "success"
                              ? "调用成功"
                              : modelChecks[
                                    pair({ provider: provider.id, model: m.id })
                                  ]?.status === "failed"
                                ? "调用失败"
                                : modelChecks[
                                      pair({
                                        provider: provider.id,
                                        model: m.id,
                                      })
                                    ]?.status === "checking"
                                  ? "正在验证"
                                  : "尚未测试"}
                          </span>
                          {m.capabilities.includes("text") ? (
                            <button
                              className="secondary model-test-button"
                              disabled={
                                saving ||
                                testingKey !== null ||
                                !provider.enabled ||
                                !m.id.trim()
                              }
                              onClick={() => void checkModel(provider.id, m.id)}
                            >
                              <Activity size={13} />
                              {testingKey ===
                              pair({ provider: provider.id, model: m.id })
                                ? "正在测试…"
                                : dirty
                                  ? "保存并测试"
                                  : "测试对话"}
                            </button>
                          ) : (
                            <button
                              className="secondary"
                              onClick={() => setTab("playground")}
                            >
                              到实验室测试
                            </button>
                          )}
                        </div>
                        {modelChecks[
                          pair({ provider: provider.id, model: m.id })
                        ] && (
                          <div
                            className={`model-check-result ${modelChecks[pair({ provider: provider.id, model: m.id })].status}`}
                            role="status"
                          >
                            <strong>
                              {
                                modelChecks[
                                  pair({ provider: provider.id, model: m.id })
                                ].message
                              }
                            </strong>
                            {modelChecks[
                              pair({ provider: provider.id, model: m.id })
                            ].latency_ms !== undefined && (
                              <div>
                                <span>
                                  耗时{" "}
                                  {(
                                    (modelChecks[
                                      pair({
                                        provider: provider.id,
                                        model: m.id,
                                      })
                                    ].latency_ms || 0) / 1000
                                  ).toFixed(2)}
                                  s
                                </span>
                                <span>
                                  {modelChecks[
                                    pair({ provider: provider.id, model: m.id })
                                  ].http_status
                                    ? `HTTP ${modelChecks[pair({ provider: provider.id, model: m.id })].http_status}`
                                    : "实际聊天调用"}
                                </span>
                              </div>
                            )}
                            {modelChecks[
                              pair({ provider: provider.id, model: m.id })
                            ].reply && (
                              <p>
                                回复：
                                {
                                  modelChecks[
                                    pair({ provider: provider.id, model: m.id })
                                  ].reply
                                }
                              </p>
                            )}
                          </div>
                        )}
                        {m.capabilities.includes("text") && (
                          <div className="model-chat-action">
                            <span>
                              {config.routes.text?.primary.provider ===
                                provider.id &&
                              config.routes.text.primary.model === m.id
                                ? "当前角色聊天模型"
                                : "可用于角色聊天"}
                            </span>
                            <button
                              className="secondary"
                              disabled={!provider.enabled}
                              onClick={() =>
                                primary(
                                  "text",
                                  pair({ provider: provider.id, model: m.id }),
                                )
                              }
                            >
                              {config.routes.text?.primary.provider ===
                                provider.id &&
                              config.routes.text.primary.model === m.id
                                ? dirty
                                  ? "已选择 · 保存后生效"
                                  : "当前角色聊天模型"
                                : "设为角色聊天模型"}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {provider.models.length > 0 && (
                    <p className="model-test-note">
                      测试会向所选模型发送一次极短请求，可能产生少量 Token
                      费用；不使用备用模型，也不会自动重试。配置改动后需要重新验证。
                    </p>
                  )}
                  {detected.length > 0 && (
                    <div className="discovered-models">
                      <small>
                        从供应商发现 · 点击添加（默认文本能力，可修改）
                      </small>
                      <div>
                        {detected.map((id) => (
                          <button
                            key={id}
                            disabled={provider.models.some((m) => m.id === id)}
                            onClick={() =>
                              providerChange({
                                models: [
                                  ...provider.models,
                                  { id, capabilities: ["text"] },
                                ],
                              })
                            }
                          >
                            <Plus size={11} />
                            {id}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="provider-empty">
                  <div className="empty-orbit">
                    <Server size={35} />
                  </div>
                  <h3>连接你的第一个智能引擎</h3>
                  <p>
                    支持 OpenAI 兼容 API 网关与本地模型。
                    <br />
                    不同能力使用独立端点，按需连接。
                  </p>
                  <button className="primary" onClick={() => addProvider()}>
                    <Plus size={15} />
                    添加模型供应商
                  </button>
                </div>
              )}
            </div>
            <div className="settings-footnote">
              <ShieldCheck size={13} />
              本机单用户配置 · 密钥文件权限 0600 · 不会自动向供应商发起付费生成
            </div>
          </>
        ) : tab === "routing" ? (
          <>
            <div className="settings-intro">
              <div>
                <span className="settings-eyebrow">
                  THE RIGHT MODEL, EVERY TIME
                </span>
                <h3>让能力各归其位。</h3>
                <p>按任务分流，独立选择模型；对话与理解任务支持故障回退。</p>
              </div>
              <span className="settings-icon">
                <GitBranch size={24} />
              </span>
            </div>
            <section className="chat-route-featured">
              <div className="chat-route-heading">
                <span>
                  <MessageCircle size={22} />
                </span>
                <div>
                  <h4>角色聊天模型</h4>
                  <p>这里决定主界面的角色对话实际调用哪个文本大模型。</p>
                </div>
                <span className="route-status ready">
                  {config.routes.text ? "已选择" : "待配置"}
                </span>
              </div>
              <label className="field">
                文本 / 聊天大模型
                <select
                  aria-label="角色聊天模型"
                  value={
                    config.routes.text ? pair(config.routes.text.primary) : ""
                  }
                  onChange={(e) => primary("text", e.target.value)}
                >
                  <option value="">
                    {options("text").length
                      ? "不指定模型"
                      : "尚无文本模型，请先在供应商中添加"}
                  </option>
                  {options("text").map((o) => (
                    <option key={o.value} value={o.value} disabled={o.disabled}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="auto-chat-route">
                <input
                  type="checkbox"
                  checked={config.auto_text_route !== false}
                  onChange={(e) =>
                    update({ ...config, auto_text_route: e.target.checked })
                  }
                />
                <span>未指定时，自动使用第一个启用的文本模型</span>
              </label>
              {config.routes.text && (
                <label className="field">
                  聊天模型故障回退
                  <select
                    aria-label="文本对话回退模型"
                    value={
                      config.routes.text.fallbacks[0]
                        ? pair(config.routes.text.fallbacks[0])
                        : ""
                    }
                    onChange={(e) =>
                      update({
                        ...config,
                        routes: {
                          ...config.routes,
                          text: {
                            primary: config.routes.text!.primary,
                            fallbacks: e.target.value
                              ? [target(e.target.value)]
                              : [],
                          },
                        },
                      })
                    }
                  >
                    <option value="">不自动回退</option>
                    {options("text")
                      .filter(
                        (o) => o.value !== pair(config.routes.text!.primary),
                      )
                      .map((o) => (
                        <option
                          key={o.value}
                          value={o.value}
                          disabled={o.disabled}
                        >
                          {o.label}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <div className="chat-route-bottom">
                <small>
                  {dirty
                    ? "修改尚未保存，保存后立即用于角色聊天。"
                    : "角色回复会标明实际使用的模型；调用失败会显示错误，不会伪装成本地回复。"}
                </small>
                <button
                  className="primary"
                  disabled={saving || !dirty}
                  onClick={() => void save()}
                >
                  <Save size={13} />
                  保存聊天模型
                </button>
              </div>
            </section>
            <div className="route-section-heading">
              其他能力路由 <small>图片、语音与视频单独配置</small>
            </div>
            <div className="route-cards">
              {capabilities
                .filter((c) => c.id !== "text")
                .map((c) => {
                  const route = config.routes[c.id];
                  const available = options(c.id);
                  return (
                    <section className="route-card" key={c.id}>
                      <div className="route-card-heading">
                        <span
                          className={`route-icon ${c.kind === "生成" ? "generation" : ""}`}
                        >
                          {c.id === "speech" || c.id === "transcription" ? (
                            <AudioLines size={18} />
                          ) : c.id.startsWith("video") ? (
                            <Film size={18} />
                          ) : (
                            <Image size={18} />
                          )}
                        </span>
                        <div>
                          <h4>
                            {c.name}
                            <small>{c.en}</small>
                          </h4>
                          <p>{c.description}</p>
                        </div>
                        <span
                          className={
                            route ? "route-status ready" : "route-status"
                          }
                        >
                          {route ? "已路由" : "未配置"}
                        </span>
                      </div>
                      <label className="field">
                        主模型
                        <select
                          aria-label={`${c.name}主模型`}
                          value={route ? pair(route.primary) : ""}
                          onChange={(e) => primary(c.id, e.target.value)}
                        >
                          <option value="">
                            {available.length
                              ? "选择模型"
                              : "先添加支持此能力的模型"}
                          </option>
                          {available.map((o) => (
                            <option
                              key={o.value}
                              value={o.value}
                              disabled={o.disabled}
                            >
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {["text", "vision", "video"].includes(c.id) && route && (
                        <label className="field fallback-field">
                          故障回退 <span>可选</span>
                          <select
                            aria-label={`${c.name}回退模型`}
                            value={
                              route.fallbacks[0] ? pair(route.fallbacks[0]) : ""
                            }
                            onChange={(e) =>
                              update({
                                ...config,
                                routes: {
                                  ...config.routes,
                                  [c.id]: {
                                    ...route,
                                    fallbacks: e.target.value
                                      ? [target(e.target.value)]
                                      : [],
                                  },
                                },
                              })
                            }
                          >
                            <option value="">不自动回退</option>
                            {available
                              .filter((o) => o.value !== pair(route.primary))
                              .map((o) => (
                                <option
                                  key={o.value}
                                  value={o.value}
                                  disabled={o.disabled}
                                >
                                  {o.label}
                                </option>
                              ))}
                          </select>
                        </label>
                      )}
                      {c.kind === "生成" && (
                        <p className="route-note">
                          生成请求不自动重试，避免重复计费。
                        </p>
                      )}
                    </section>
                  );
                })}
            </div>
            <div className="route-parameters">
              <label className="field">
                请求超时（秒）
                <input
                  aria-label="请求超时"
                  type="number"
                  min="5"
                  max="180"
                  value={config.timeout}
                  onChange={(e) =>
                    update({ ...config, timeout: +e.target.value })
                  }
                />
              </label>
              <label className="field">
                对话最大输出 Tokens
                <input
                  aria-label="最大输出 Tokens"
                  type="number"
                  min="64"
                  max="8192"
                  value={config.max_tokens}
                  onChange={(e) =>
                    update({ ...config, max_tokens: +e.target.value })
                  }
                />
              </label>
            </div>
            <div className="settings-alert">
              <CircleHelp size={15} />
              <span>
                能力标签由你声明。供应商需要实现对应兼容端点；视频理解使用 4
                张采样关键帧，不包含声音理解。
              </span>
            </div>
          </>
        ) : tab === "playground" ? (
          <>
            <div className="settings-intro">
              <div>
                <span className="settings-eyebrow">MULTIMODAL PLAYGROUND</span>
                <h3>看见、听见，也创造。</h3>
                <p>使用已保存的路由，实际调用你的模型。</p>
              </div>
              <span className="settings-icon">
                <Sparkles size={24} />
              </span>
            </div>
            {dirty && (
              <div className="settings-alert">
                还有未保存的修改。实验室使用后端已保存的配置，请先保存。
              </div>
            )}
            <div className="playground-capabilities">
              {capabilities.map((c) => (
                <button
                  className={cap === c.id ? "selected" : ""}
                  key={c.id}
                  disabled={running || processing}
                  onClick={() => {
                    setCap(c.id);
                    setAttachments([]);
                    setFilename("");
                    setResult(null);
                    setError("");
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div className="active-route">
              <GitBranch size={13} />
              <span>当前路由</span>
              <strong>
                {config.routes[cap]
                  ? `${config.providers.find((p) => p.id === config.routes[cap]?.primary.provider)?.name} / ${config.routes[cap]?.primary.model}`
                  : "尚未配置"}
              </strong>
              <button onClick={() => setTab("routing")}>
                配置 <ChevronRight size={12} />
              </button>
            </div>
            <label className="field">
              {cap === "speech"
                ? "朗读内容"
                : cap === "transcription"
                  ? "转写任务"
                  : "描述你的想法"}
              <textarea
                aria-label="多模态提示词"
                rows={4}
                placeholder={
                  cap === "video"
                    ? "描述这段视频发生了什么（将发送按时间顺序的4张画面）"
                    : cap === "speech"
                      ? "输入希望角色说出的内容…"
                      : "在这里输入提示词…"
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </label>
            {["vision", "transcription", "video"].includes(cap) && (
              <>
                <button
                  className="upload-zone"
                  disabled={running || processing}
                  onClick={() => picker.current?.click()}
                >
                  {processing ? (
                    <LoaderCircle className="spin" size={24} />
                  ) : (
                    <Upload size={24} />
                  )}
                  <strong>
                    {processing
                      ? "正在准备输入…"
                      : filename ||
                        (cap === "vision"
                          ? "选择一张图片"
                          : cap === "video"
                            ? "选择一个视频"
                            : "选择一段音频")}
                  </strong>
                  <span>
                    {cap === "vision"
                      ? "PNG / JPEG / WebP · 最大 8 MB"
                      : cap === "video"
                        ? "MP4 / WebM · 最大 50 MB · 本地提取4帧"
                        : "WAV / MP3 · 最大 8 MB"}
                  </span>
                </button>
                <input
                  className="hidden"
                  ref={picker}
                  type="file"
                  accept={
                    cap === "vision"
                      ? "image/png,image/jpeg,image/webp"
                      : cap === "video"
                        ? "video/mp4,video/webm"
                        : ".wav,.mp3"
                  }
                  onChange={(e) => {
                    void fileSelected(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                {attachments[0]?.mime.startsWith("image/") && (
                  <div className="attachment-previews">
                    {attachments.map((a, i) => (
                      <img
                        key={i}
                        src={`data:${a.mime};base64,${a.data}`}
                        alt={`输入画面 ${i + 1}`}
                      />
                    ))}
                  </div>
                )}
                <p className="input-hint">
                  仅在点击运行后，输入内容才会发送至所配置的供应商。
                </p>
              </>
            )}
            {cap === "speech" && (
              <label className="field">
                声音
                <select
                  aria-label="合成声音"
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                >
                  <option value="">使用模型默认音色</option>
                  {speechVoices.map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              </label>
            )}
            <div className="playground-run">
              <span>
                {["image", "speech", "video_generate"].includes(cap)
                  ? "可能产生供应商费用，请确认提示词后运行。"
                  : "请求按当前路由执行。"}
              </span>
              {running ? (
                <button
                  className="secondary"
                  onClick={() => abort.current?.abort()}
                >
                  <X size={14} />
                  停止等待
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={
                    dirty ||
                    processing ||
                    !config.routes[cap] ||
                    (["vision", "transcription", "video"].includes(cap) &&
                      !attachments.length) ||
                    (!prompt.trim() &&
                      !["vision", "transcription", "video"].includes(cap))
                  }
                  onClick={() => void infer()}
                >
                  <Sparkles size={14} />
                  运行模型
                </button>
              )}
            </div>
            {running && (
              <div className="inference-wait">
                <LoaderCircle className="spin" size={18} />
                正在等待模型回应…
              </div>
            )}
            {result && (
              <div className="inference-result">
                <div className="result-heading">
                  <span>
                    <Check size={13} />
                    模型结果
                  </span>
                  {"model" in result && <small>{result.model}</small>}
                </div>
                {result.kind === "text" ? (
                  <p className="result-text">{result.text}</p>
                ) : result.kind === "image" ? (
                  <img
                    className="generated-image"
                    src={result.url}
                    alt="模型生成的图像"
                  />
                ) : result.kind === "audio" ? (
                  <audio
                    controls
                    src={result.url}
                    onPlay={() => useWorld.getState().set({ speaking: true })}
                    onPause={() => useWorld.getState().set({ speaking: false })}
                    onEnded={() => useWorld.getState().set({ speaking: false })}
                  />
                ) : (
                  <>
                    <div className="video-job">
                      <Film size={25} />
                      <div>
                        <strong>{result.status}</strong>
                        <small>任务 {result.id}</small>
                        {result.progress !== undefined && (
                          <span>{result.progress}%</span>
                        )}
                      </div>
                      <button
                        className="secondary"
                        onClick={() => void refreshVideo()}
                      >
                        刷新任务状态
                      </button>
                    </div>
                    {result.error && (
                      <p className="settings-feedback error">{result.error}</p>
                    )}
                    {result.status === "completed" && (
                      <video
                        controls
                        src={`${apiBase}/video/${encodeURIComponent(result.provider_id)}/${encodeURIComponent(result.id)}/content`}
                      />
                    )}
                    <p className="input-hint">
                      关闭窗口不会取消供应商上的视频任务，请记录任务 ID。
                    </p>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          null
        )}
      </div>
    </div>
  );
}
