import SettingsGroup from "./SettingsGroup";
import "./agentSettings.css";
import InspirationPanel from "./InspirationPanel";
import AgentTeamEditor from "./AgentTeamEditor";
import type { Resource } from "@/features/library/resources";
import { speechVoices } from "@/features/models/speechOptions";
import { useEffect, useId, useState } from "react";
import {
  Check,
  ChevronRight,
  LoaderCircle,
  MessageCircle,
  RotateCcw,
  Save,
  ShieldCheck,
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
import LiveProgramEditor from "@/features/live/LiveProgramEditor";
import AgentKnowledge from "./AgentKnowledge";
import AgentMemory from "@/features/agents/AgentMemory";
import { readResponse } from "@/shared/api/http";
import type { ModelSettings } from "@/features/models/contracts";
import CharacterModels from "@/features/models/ModelSettingsPanel";
interface Props {
  resources?: Resource[];
  initialSection?: string;
  activeId: string;
  options: AgentOption[];
  models: ModelSettings;
  onActivate?: (id: string) => void;
}
const moreSections = [
  { id: "behavior", title: "声音与表现", hint: "音色、语速、回答长度与动作" },
  { id: "memory", title: "记忆与资料", hint: "记住什么，以及可查阅的资料" },
  { id: "models", title: "模型设置", hint: "默认跟随全局，需要时单独指定" },
  { id: "tools", title: "能力与自动行为", hint: "资源、插件、动作与弹幕管理" },
];
const movementNames = {
  soft: "柔和倾听",
  graceful: "从容优雅",
  lively: "明朗灵动",
};
export default function AgentSettings({
  resources = [],
  initialSection = "persona",
  activeId,
  options,
  models,
  onActivate,
}: Props) {
  const [selected, setSelected] = useState(activeId);
  const [ownModels, setOwnModels] = useState<ModelSettings | null>(null);
  const [ownModelsError, setOwnModelsError] = useState("");
  const [section, setSection] = useState(initialSection);
  useEffect(() => { setSection(initialSection); }, [initialSection]);
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
    if (section !== "models") return;
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
  }, [selected, section]);
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
  async function save(chat = false) {
    if (!draft || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveAgent(draft);
      setDrafts((p) => ({ ...p, [saved.profile.id]: saved.profile }));
      setNotice("角色设置已保存。");
      if (chat) onActivate?.(saved.profile.id);
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
      | "strengths"
      | "preferences"
      | "habits"
      | "live_style"
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
      <div className="agent-picker">
        <label htmlFor={`${prefix}-character`}>
          正在配置的角色
          <select
            id={`${prefix}-character`}
            value={selected}
            disabled={saving}
            onChange={(event) => setSelected(event.target.value)}
          >
            {options.map((item) => (
              <option value={item.id} key={item.id}>
                {profiles[item.id]?.name || item.name}
                {item.id === activeId ? " · 当前舞台" : ""}
                {drafts[item.id] && JSON.stringify(drafts[item.id]) !== JSON.stringify(profiles[item.id]) ? " · 未保存" : ""}
              </option>
            ))}
          </select>
        </label>
        <span>
          <ShieldCheck size={13} />
          独立保存
          {draft && !loading && <span className={`agent-save-state ${dirty ? "is-dirty" : ""}`} role="status">{dirty ? "有未保存的修改" : "已保存"}</span>}
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
          <nav className="agent-sections" aria-label="角色设置分类">
            {[
              { id: "persona", label: "基本设置" },
              { id: "live", label: "直播设置" },
              { id: "more", label: "更多设置" },
            ].map((item) => (
              <button
                key={item.id}
                disabled={saving}
                aria-current={(section === "persona" || section === "live" ? section : "more") === item.id ? "page" : undefined}
                className={(section === "persona" || section === "live" ? section : "more") === item.id ? "active" : ""}
                onClick={() => setSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          {moreSections.some(item => item.id === section) && <div className="agent-settings-breadcrumb"><button disabled={saving} onClick={() => setSection("more")}>‹ 更多设置</button><span>/</span><strong>{moreSections.find(item => item.id === section)?.title}</strong></div>}
          <fieldset className="agent-editor-fields" aria-label="角色设置内容" disabled={saving}>
          {section === "live" ? (
            <LiveProgramEditor key={selected} agentId={selected} dirty={dirty} value={draft.live_program} onChange={(live_program) => update({ live_program })} liveStyle={draft.live_style} onLiveStyleChange={live_style => update({ live_style })} />
          ) : section === "models" ? (
            <div className="agent-form">
              <section className="agent-model-source">
                <label className="field">
                  聊天使用的模型
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
                      跟随全局配置（推荐）
                    </option>
                    <option value="character">
                      使用此角色的独立配置
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
                    。切换来源需保存角色设定。角色设定、已保存的记忆与说话节奏会继续沿用。
                  </small>
                </label>

                {ownModelsError && (
                  <p className="settings-feedback error">{ownModelsError}</p>
                )}
                <p className="memory-explainer">
                  通常跟随全局配置即可。需要单独的供应商或密钥时，再展开下方独立模型设置。
                </p>
              </section>
              <SettingsGroup key={`models-${selected}`} title="配置此角色的独立模型" hint="进阶选项：供应商、密钥与能力路由">
                <p className="memory-explainer">模型和密钥在此单独保存。添加后在上方选择独立配置，再保存角色设置。</p>
                <div className="agent-private-models"><CharacterModels key={selected} scopeAgentId={selected} initialTab="providers" /></div>
              </SettingsGroup>
            </div>
          ) : section === "persona" ? (
            <div className="agent-form">
              <p className="agent-section-guide">常用设置只需看这四项，保留当前内容也可以直接开始聊天。</p>
              <div className="agent-field-pair">
                {field("name", "名字", "在舞台和对话中使用", 40)}
                {field("identity", "一句话介绍", "例如：温柔幽默的杂谈主播", 120)}
              </div>
              {field("personality", "性格", "例如：热情、有分寸，会认真听人说话，也有自己的主见", 500, 3)}
              {field("speaking_style", "说话方式", "例如：自然口语，简短具体，少套话，偶尔开个轻松的玩笑", 800, 3)}
              <div className="agent-defaults-summary">
                <button type="button" onClick={() => setSection("models")}><span>聊天模型<strong>{routes[selected]?.model || "尚未配置"}</strong></span><ChevronRight size={14} /></button>
                <button type="button" onClick={() => setSection("behavior")}><span>声音<strong>{draft.voice.voice} · {draft.voice.rate.toFixed(2)}倍速</strong></span><ChevronRight size={14} /></button>
                <button type="button" onClick={() => setSection("memory")}><span>聊天记忆<strong>{draft.remember ? "已开启" : "已关闭"}</strong></span><ChevronRight size={14} /></button>
              </div>
              <SettingsGroup key={`persona-${selected}`} title="更多人设细节" hint="选填：背景、喜好、问候与相处约定">
                {field("greeting", "初次问候", "第一次打开聊天时显示的开场白", 600, 2)}
                {field("background", "角色背景", "世界观、经历与关注的事物", 1800, 4)}
                {field("relationship", "相处方式", "例如：有分寸的朋友、创作搭档", 600, 2)}
                {field("strengths", "擅长的话题", "描述擅长讨论的领域；实际工具由能力设置决定", 1000, 2)}
                {field("preferences", "喜好与主见", "喜欢、不喜欢，以及坚持的观点", 800, 2)}
                {field("habits", "表达小习惯", "可选的口语习惯，不必重复填写说话方式", 800, 2)}
                {field("boundaries", "相处约定", "希望遵循的行为边界", 600, 2)}
              </SettingsGroup>
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
            <SettingsGroup title="表情与动作细节" hint="可选：动作气质、表情丰富度与活跃度">              <label className="field">
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
</SettingsGroup></div>

          ) : section === "memory" ? (
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
<SettingsGroup title="历史引用条数" hint="保持当前值即可">              <label className="agent-range">
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
              </label></SettingsGroup>
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
              <SettingsGroup key={`knowledge-${selected}`} title="补充角色资料" hint={`${draft.knowledge.length}份资料，可分别决定是否用于直播`}> <AgentKnowledge resources={resources} key={`knowledge-${selected}`} entries={draft.knowledge} onChange={(knowledge) => update({ knowledge })} /> </SettingsGroup>
              <SettingsGroup key={`archive-${selected}`} title="查看长期记忆与历史" hint="已整理的内容和原始对话"><AgentMemory key={selected} agentId={selected} /></SettingsGroup>
              {field(
                "memory_notes",
                "专属记忆",
                "手动保存希望角色记住的偏好和约定；随此角色的对话发送给所选模型。",
                4000,
                6,
              )}

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
          ) : section === "tools" ? (
            <div className="agent-form">
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

              <SettingsGroup key={`team-${selected}`} title="自动动作、选歌与弹幕管理" hint="可选功能，展开后独立开启"><AgentTeamEditor value={draft.team} onChange={(team) => update({ team })} /></SettingsGroup>
              <SettingsGroup key={`inspiration-${selected}`} title="自动积累灵感" hint={draft.inspiration.enabled ? "已开启，可查看整理结果" : "未开启，需要时再配置"}><InspirationPanel key={selected} agentId={selected} value={draft.inspiration} dirty={dirty} onChange={(inspiration) => update({ inspiration })} /></SettingsGroup>
            </div>

          ) : (
            <div className="agent-more-settings">
              <p className="agent-section-guide">平时保持默认即可。需要调整某一项时，再进入对应设置。</p>
              {moreSections.map(item => <button type="button" className="agent-more-card" key={item.id} onClick={() => setSection(item.id)}><span><strong>{item.title}</strong><small>{item.hint}</small></span><ChevronRight size={16} /></button>)}
            </div>
          )}
          </fieldset>
          {(!draft.name.trim() || !draft.greeting.trim()) && <p className="settings-feedback error" role="status">名字和初次问候不能为空。初次问候在「基本设置 → 更多人设细节」中。</p>}
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
                disabled={saving || !onActivate || !draft.name.trim() || !draft.greeting.trim()}
                onClick={() => dirty ? void save(true) : onActivate?.(selected)}
              >
                <MessageCircle size={13} />{dirty ? "保存并试聊" : "去聊天"}
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
                保存设置
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
