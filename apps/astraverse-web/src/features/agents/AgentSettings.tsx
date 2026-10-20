import { speechVoices } from "@/features/models/speechOptions";
import { useEffect, useId, useState } from "react";
import {
  BrainCircuit,
  Check,
  ChevronRight,
  LoaderCircle,
  MessageCircle,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  fetchAgent,
  saveAgent,
  clearAgentThread,
  useAgents,
  type AgentProfile,
  type AgentOption,
} from "@/features/agents/agentApi";
import AgentMemory from "@/features/agents/AgentMemory";
import { readResponse } from "@/shared/api/http";
import type { ModelSettings } from "@/features/models/contracts";
import CharacterModels from "@/features/models/ModelSettingsPanel";
interface Props {
  activeId: string;
  options: AgentOption[];
  models: ModelSettings;
  onActivate?: (id: string) => void;
}
const movementNames = {
  soft: "柔和倾听",
  graceful: "从容优雅",
  lively: "明朗灵动",
};
export default function AgentSettings({
  activeId,
  options,
  models,
  onActivate,
}: Props) {
  const [selected, setSelected] = useState(activeId);
  const [ownModels, setOwnModels] = useState<ModelSettings | null>(null);
  const [ownModelsError, setOwnModelsError] = useState("");
  const [section, setSection] = useState("persona");
  const [drafts, setDrafts] = useState<Record<string, AgentProfile>>({});
  const [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [clearing, setClearing] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const profiles = useAgents((s) => s.profiles),
    routes = useAgents((s) => s.routes);
  useEffect(() => {
    let alive = true;
    setOwnModels(null);
    setOwnModelsError("");
    const refresh = () => {
      void fetch(`/api/agents/${encodeURIComponent(selected)}/models/settings`)
        .then((r) => readResponse<ModelSettings>(r))
        .then((value) => {
          if (alive) {
            setOwnModels(value);
            setOwnModelsError("");
          }
        })
        .catch((e) => {
          if (alive)
            setOwnModelsError(
              e instanceof Error ? e.message : "角色模型读取失败",
            );
        });
    };
    refresh();
    window.addEventListener("astraverse:model-settings-saved", refresh);
    return () => {
      alive = false;
      window.removeEventListener("astraverse:model-settings-saved", refresh);
    };
  }, [selected]);
  const ownAvailable = (ownModels?.providers || [])
    .filter((p) => p.enabled)
    .flatMap((p) =>
      p.models
        .filter((m) => m.capabilities.includes("text"))
        .map((m) => ({
          provider: p.id,
          model: m.id,
          label: `${p.name} · ${m.id}`,
        })),
    );
  const prefix = useId();
  const option = options.find((item) => item.id === selected);
  const draft = drafts[selected],
    profile = profiles[selected];
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(profile);
  const available = models.providers
    .filter((p) => p.enabled)
    .flatMap((p) =>
      p.models
        .filter((m) => m.capabilities.includes("text"))
        .map((m) => ({
          provider: p.id,
          model: m.id,
          label: `${p.name} · ${m.id}`,
        })),
    );
  const pair = (target: { provider: string; model: string }) =>
    JSON.stringify([target.provider, target.model]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setNotice("");
    setConfirmClear(false);
    void fetchAgent(selected, option?.name || "我的伙伴")
      .then((details) => {
        if (!cancelled)
          setDrafts((previous) => ({
            ...previous,
            [selected]: previous[selected] || details.profile,
          }));
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Agent 加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);
  function update(patch: Partial<AgentProfile>) {
    setDrafts((previous) => ({
      ...previous,
      [selected]: { ...previous[selected], ...patch },
    }));
    setNotice("");
  }
  async function save() {
    if (!draft || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveAgent(draft);
      setDrafts((p) => ({ ...p, [saved.profile.id]: saved.profile }));
      setNotice("设定已保存，下一次交流就会使用这份角色设定。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }
  async function reset() {
    setError("");
    try {
      const value = await readResponse<AgentProfile>(
        await fetch(
          `/api/agents/${selected}/template?name=${encodeURIComponent(option?.name || "我的伙伴")}`,
        ),
      );
      update(value);
      setNotice("已载入初始设定，保存后生效。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "载入失败");
    }
  }
  async function clear() {
    setClearing(true);
    setError("");
    try {
      await clearAgentThread(selected);
      setConfirmClear(false);
      setNotice("这位角色的会话记录已清空。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "清空失败");
    } finally {
      setClearing(false);
    }
  }
  function field(
    key:
      | "name"
      | "identity"
      | "background"
      | "personality"
      | "speaking_style"
      | "relationship"
      | "boundaries"
      | "greeting"
      | "memory_notes",
    label: string,
    hint: string,
    limit: number,
    rows = 0,
  ) {
    return (
      <label className="field" htmlFor={`${prefix}-${key}`}>
        <span>{label}</span>
        {rows ? (
          <textarea
            id={`${prefix}-${key}`}
            rows={rows}
            maxLength={limit}
            value={draft?.[key] || ""}
            onChange={(event) => update({ [key]: event.target.value })}
          />
        ) : (
          <input
            id={`${prefix}-${key}`}
            maxLength={limit}
            value={draft?.[key] || ""}
            onChange={(event) => update({ [key]: event.target.value })}
          />
        )}
        <small>{hint}</small>
      </label>
    );
  }
  return (
    <div className="agent-settings">
      <div className="settings-intro">
        <div>
          <span className="settings-eyebrow">A MIND OF THEIR OWN</span>
          <h3>让每一位伙伴，都有自己的性格。</h3>
          <p>独立人设、独立会话，用相处中的细节回应你。</p>
        </div>
        <span className="settings-icon">
          <BrainCircuit size={24} />
        </span>
      </div>
      <div className="agent-picker">
        <label htmlFor={`${prefix}-character`}>
          正在配置的角色
          <select
            id={`${prefix}-character`}
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {options.map((item) => (
              <option value={item.id} key={item.id}>
                {profiles[item.id]?.name || item.name}
                {item.id === activeId ? " · 当前舞台" : ""}
              </option>
            ))}
          </select>
        </label>
        <span>
          <ShieldCheck size={13} />
          绑定角色，切换后各自保留
        </span>
      </div>
      {error && (
        <div className="settings-feedback error" role="alert">
          {error}
          <button aria-label="关闭错误" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {notice && (
        <div className="settings-feedback success" role="status">
          <Check size={14} />
          {notice}
        </div>
      )}
      {loading || !draft ? (
        <div className="agent-loading">
          <LoaderCircle className="spin" size={18} />
          正在读取专属设定…
        </div>
      ) : (
        <>
          <div className="agent-profile-card">
            <div className="agent-profile-avatar">
              {option?.thumbnail ? (
                <img src={option.thumbnail} alt="" />
              ) : (
                <Sparkles size={26} />
              )}
            </div>
            <div>
              <small>CHARACTER AGENT</small>
              <h4>{draft.name || "我的伙伴"}</h4>
              <p>{draft.identity}</p>
              <span>
                {movementNames[draft.behavior.movement]}
                <i />
                {draft.remember ? "会话记忆已开启" : "临时交流"}
              </span>
            </div>
            <span className={`agent-save-state ${dirty ? "is-dirty" : ""}`}>
              {dirty ? "未保存" : "已保存"}
            </span>
          </div>
          <div className="agent-sections">
            {[
              { id: "persona", label: "角色设定" },
              { id: "behavior", label: "表达与表现" },
              { id: "memory", label: "记忆与能力" },
              { id: "models", label: "角色模型" },
            ].map((item) => (
              <button
                key={item.id}
                className={section === item.id ? "active" : ""}
                onClick={() => setSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {section === "models" ? (
            <div className="agent-private-models">
              <div className="settings-feedback">
                这里新增的模型与密钥只属于「{draft.name}
                」，不会写入平台模型库。配置后到「记忆与能力」选择使用角色专属模型；未切换来源前仍使用原模型。
              </div>
                <CharacterModels
                  key={selected}
                  scopeAgentId={selected}
                  initialTab="providers"
                />
            </div>
          ) : section === "persona" ? (
            <div className="agent-form">
              <div className="agent-field-pair">
                {field("name", "角色名字", "对话和舞台中使用的名字", 40)}
                {field("identity", "角色身份", "用一句话描述这位伙伴", 120)}
              </div>
              {field(
                "background",
                "角色背景",
                "世界观、经历与关注的事物；保持设定前后一致",
                1800,
                4,
              )}
              {field(
                "personality",
                "性格特点",
                "例如：温柔慢热、善于倾听、有自己的观点",
                500,
                3,
              )}
              {field(
                "speaking_style",
                "说话方式",
                "语气、措辞习惯，以及希望避免的套话",
                800,
                3,
              )}
              {field(
                "relationship",
                "与你的相处方式",
                "像朋友、同行者或创作搭档，如何倾听与回应",
                600,
                3,
              )}
              {field("greeting", "初次问候", "这位伙伴独有的开场白", 600, 3)}
              {field(
                "boundaries",
                "角色边界",
                "希望遵循的相处约定和行为边界",
                600,
                3,
              )}
            </div>
          ) : section === "behavior" ? (
            <div className="agent-form">
              <div className="agent-field-pair">
                <label className="field">
                  回答长度
                  <select
                    value={draft.behavior.reply_length}
                    onChange={(e) =>
                      update({
                        behavior: {
                          ...draft.behavior,
                          reply_length: e.target
                            .value as AgentProfile["behavior"]["reply_length"],
                        },
                      })
                    }
                  >
                    <option value="brief">简短克制</option>
                    <option value="balanced">自然适中</option>
                    <option value="detailed">充分展开</option>
                  </select>
                </label>
                <label className="field">
                  交流主动性
                  <select
                    value={draft.behavior.initiative}
                    onChange={(e) =>
                      update({
                        behavior: {
                          ...draft.behavior,
                          initiative: e.target
                            .value as AgentProfile["behavior"]["initiative"],
                        },
                      })
                    }
                  >
                    <option value="quiet">安静倾听</option>
                    <option value="balanced">自然互动</option>
                    <option value="curious">好奇探索</option>
                  </select>
                </label>
              </div>
              <label className="field">
                动作气质
                <select
                  value={draft.behavior.movement}
                  onChange={(e) =>
                    update({
                      behavior: {
                        ...draft.behavior,
                        movement: e.target
                          .value as AgentProfile["behavior"]["movement"],
                      },
                    })
                  }
                >
                  {Object.entries(movementNames).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <small>影响手势节奏、音乐律动和身体的舒展方式</small>
              </label>
              {(
                [
                  ["expressiveness", "表情丰富度"],
                  ["energy", "动作活跃度"],
                ] as const
              ).map(([key, label]) => (
                <label className="agent-range" key={key}>
                  <span>
                    {label}
                    <small>
                      {key === "expressiveness"
                        ? "克制含蓄 → 丰富鲜明"
                        : "安静细微 → 轻快灵动"}
                    </small>
                  </span>
                  <input
                    aria-label={label}
                    type="range"
                    min="0"
                    max="1"
                    step=".01"
                    value={draft.behavior[key]}
                    onChange={(e) =>
                      update({
                        behavior: { ...draft.behavior, [key]: +e.target.value },
                      })
                    }
                  />
                  <output>{Math.round(draft.behavior[key] * 100)}%</output>
                </label>
              ))}
              <div className="agent-subheading">
                <h4>专属声音</h4>
                <p>开启角色语音后使用；音色需语音供应商支持。</p>
              </div>
              <label className="field">
                合成音色
                <select
                  value={draft.voice.voice}
                  onChange={(e) =>
                    update({
                      voice: {
                        ...draft.voice,
                        voice: e.target.value as AgentProfile["voice"]["voice"],
                      },
                    })
                  }
                >
                  {Array.from(new Set([draft.voice.voice, ...speechVoices])).map(
                    (name) => (
                      <option key={name}>{name}</option>
                    ),
                  )}
                </select>
              </label>
              {(
                [
                  ["rate", "说话速度"],
                  ["pitch", "系统语音音调"],
                ] as const
              ).map(([key, label]) => (
                <label className="agent-range" key={key}>
                  <span>{label}</span>
                  <input
                    aria-label={label}
                    type="range"
                    min=".75"
                    max="1.25"
                    step=".01"
                    value={draft.voice[key]}
                    onChange={(e) =>
                      update({
                        voice: { ...draft.voice, [key]: +e.target.value },
                      })
                    }
                  />
                  <output>{draft.voice[key].toFixed(2)}</output>
                </label>
              ))}
            </div>
          ) : (
            <div className="agent-form">
              <div className="agent-toggle">
                <span>
                  <strong>保留独立会话</strong>
                  <small>
                    本机保留最近100条记录；关闭后新对话不写入历史，旧记录可单独清空。
                  </small>
                </span>
                <input
                  aria-label="保留独立会话"
                  type="checkbox"
                  checked={draft.remember}
                  onChange={(e) => update({ remember: e.target.checked })}
                />
              </div>
              <label className="agent-range">
                <span>
                  上下文条数
                  <small>从此角色的历史中取用，影响每次模型的输入长度</small>
                </span>
                <input
                  aria-label="上下文条数"
                  type="range"
                  min="4"
                  max="20"
                  step="1"
                  value={draft.context_messages}
                  onChange={(e) =>
                    update({ context_messages: +e.target.value })
                  }
                />
                <output>{draft.context_messages}</output>
              </label>
              <label className="agent-toggle">
                <span>
                  <strong>自动整理长期记忆</strong>
                  <small>
                    保存后生效，按新对话生成摘要；使用当前角色的模型。
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={draft.auto_summary}
                  onChange={(e) => update({ auto_summary: e.target.checked })}
                />
              </label>
              <AgentMemory key={selected} agentId={selected} />
              {field(
                "memory_notes",
                "专属记忆",
                "手动保存希望角色记住的偏好和约定；随此角色的对话发送给所选模型。",
                4000,
                6,
              )}
              <section className="agent-model-source">
                <label className="field">
                  聊天模型来源
                  <select
                    value={
                      draft.model
                        ? JSON.stringify([
                            draft.model_scope || "platform",
                            draft.model.provider,
                            draft.model.model,
                          ])
                        : draft.model_scope || "platform"
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "platform" || value === "character")
                        update({ model_scope: value, model: null });
                      else {
                        const [scope, provider, model] = JSON.parse(value);
                        update({
                          model_scope: scope,
                          model: { provider, model },
                        });
                      }
                    }}
                  >
                    <option value="platform">
                      平台共享 · 跟随平台文本路由
                    </option>
                    <option value="character">
                      角色专属 · 跟随本角色文本路由
                    </option>
                    {draft.model &&
                      !(
                        draft.model_scope === "character"
                          ? ownAvailable
                          : available
                      ).some((item) => pair(item) === pair(draft.model!)) && (
                        <option
                          value={JSON.stringify([
                            draft.model_scope || "platform",
                            draft.model.provider,
                            draft.model.model,
                          ])}
                        >
                          当前选择不可用 · {draft.model.model}
                        </option>
                      )}
                    <optgroup label="指定平台共享模型">
                      {available.map((item) => (
                        <option
                          key={pair(item)}
                          value={JSON.stringify([
                            "platform",
                            item.provider,
                            item.model,
                          ])}
                        >
                          {item.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="指定角色专属模型">
                      {ownAvailable.map((item) => (
                        <option
                          key={pair(item)}
                          value={JSON.stringify([
                            "character",
                            item.provider,
                            item.model,
                          ])}
                        >
                          {item.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <small>
                    当前已生效：
                    {routes[selected]?.source === "character"
                      ? "角色专属"
                      : routes[selected]?.source === "platform"
                        ? "平台指定模型"
                        : "平台默认路由"}{" "}
                    · {routes[selected]?.model || "尚未配置"}
                    。切换来源需保存角色设定。
                  </small>
                </label>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setSection("models")}
                >
                  添加 / 管理此角色的模型
                </button>
                {ownModelsError && (
                  <p className="settings-feedback error">{ownModelsError}</p>
                )}
                <p className="memory-explainer">
                  平台模型由设置中的「平台模型」统一管理。角色模型有自己的供应商、密钥和能力路由；专属文本模型不可用时明确报错。角色专属语音未配置时可沿用平台语音路由。
                </p>
              </section>
              <div className="agent-toggle">
                <span>
                  <strong>允许操作资源库</strong>
                  <small>按真实目录选择音乐、场景与角色</small>
                </span>
                <input
                  aria-label="允许操作资源库"
                  type="checkbox"
                  checked={draft.allow_resources}
                  onChange={(e) =>
                    update({ allow_resources: e.target.checked })
                  }
                />
              </div>
              <label className="agent-toggle">
                <div>
                  <strong>允许使用已启用的插件</strong>
                  <p>通过明确聊天指令调用；插件的系统权限在插件中心管理。</p>
                </div>
                <input
                  type="checkbox"
                  aria-label="允许使用插件"
                  checked={draft.allow_plugins}
                  onChange={(e) => update({ allow_plugins: e.target.checked })}
                />
              </label>
              <div className="agent-memory-actions">
                <div>
                  <strong>会话管理</strong>
                  <p>
                    清除此角色全部聊天原文与自动摘要，保留人设和手写的专属记忆。
                  </p>
                </div>
                <button
                  className="danger-button"
                  onClick={() => setConfirmClear(true)}
                >
                  <Trash2 size={13} />
                  清空会话
                </button>
              </div>
              {confirmClear && (
                <div className="agent-clear-confirm">
                  <p>
                    确定清空「{profile?.name || draft.name}」的全部会话记录？
                  </p>
                  <div>
                    <button
                      className="secondary"
                      disabled={clearing}
                      onClick={() => setConfirmClear(false)}
                    >
                      取消
                    </button>
                    <button
                      className="danger-button"
                      disabled={clearing}
                      onClick={() => void clear()}
                    >
                      {clearing ? (
                        <LoaderCircle className="spin" size={13} />
                      ) : (
                        <Trash2 size={13} />
                      )}
                      确定清空
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="agent-editor-footer">
            <button
              className="text-button"
              disabled={saving}
              onClick={() => void reset()}
            >
              <RotateCcw size={12} />
              初始设定
            </button>
            <div>
              <button
                className="secondary"
                disabled={dirty || saving || !onActivate}
                onClick={() => onActivate?.(selected)}
              >
                <MessageCircle size={13} />和 TA 聊聊
                <ChevronRight size={12} />
              </button>
              <button
                className="primary"
                disabled={
                  !dirty ||
                  saving ||
                  !draft.name.trim() ||
                  !draft.greeting.trim()
                }
                onClick={() => void save()}
              >
                {saving ? (
                  <LoaderCircle className="spin" size={13} />
                ) : (
                  <Save size={13} />
                )}
                保存设定
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
