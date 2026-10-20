import { isLive2D } from "@/features/live2d/cubismRuntime";
import Live2DSetup from "@/features/live2d/Live2DSetup";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Pencil,
  RefreshCw,
  ArrowUpRight,
  Check,
  Clock3,
  FileMusic,
  FolderOpen,
  Globe2,
  ImageIcon,
  Music2,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
  Video,
  X,
} from "lucide-react";
import BookPreview from "@/features/library/BookPreview";
import type { Resource, ResourceKind } from "@/features/library/resources";
const labels: Record<ResourceKind, string> = {
  music: "音乐",
  scene: "场景",
  character: "角色",
  image: "图片",
  video: "视频",
  lyrics: "歌词",
  book: "书籍",
};
const icons = {
  music: Music2,
  scene: Globe2,
  character: Users,
  image: ImageIcon,
  video: Video,
  lyrics: FileMusic,
  book: BookOpen,
};
const kinds: ResourceKind[] = [
  "character",
  "scene",
  "music",
  "image",
  "video",
  "lyrics",
  "book",
];
interface Props {
  page: string;
  revealId?: string | null;
  resources: Resource[];
  activeIds: string[];
  playing: boolean;
  onUse: (r: Resource) => void;
  onRemove: (r: Resource) => Promise<boolean>;
  onEdit: (
    r: Resource,
    patch: { name: string; description: string },
  ) => Promise<boolean>;
  onReplace: (r: Resource) => void;
  onUpload: (kind: ResourceKind) => void;
  onStudio: () => void;
  onPause: () => void;
  onLyrics: () => void;
}
export default function ResourcePage({
  page,
  revealId,
  resources,
  activeIds,
  playing,
  onUse,
  onRemove,
  onEdit,
  onReplace,
  onUpload,
  onStudio,
  onPause,
  onLyrics,
}: Props) {
  const category =
    page === "虚拟角色"
      ? "character"
      : page === "场景世界"
        ? "scene"
        : page === "音乐与舞蹈"
          ? "music"
          : page === "书籍库"
            ? "book"
            : null;
  const [editing, setEditing] = useState<Resource | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [deleting, setDeleting] = useState<Resource | null>(null);
  const [mutating, setMutating] = useState(false);
  const [operationError, setOperationError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ResourceKind | "all">("all");
  const [source, setSource] = useState("all");
  const [characterType, setCharacterType] = useState<"3d" | "live2d">("live2d");
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    if (revealId) {
      setExpanded(revealId);
      setFilter("all");
      setQuery("");
      setSource("all");
      const revealed = resources.find(resource => resource.id === revealId);
      if (revealed?.kind === "character") setCharacterType(isLive2D(revealed.url) ? "live2d" : "3d");
    }
  }, [revealId]);
  const kind = category || filter;
  const shown = resources.filter(
    (r) =>
      (kind === "all" || r.kind === kind) &&
      (source === "all" || r.source === source) &&
      (kind !== "character" || (isLive2D(r.url) ? "live2d" : "3d") === characterType) &&
      `${r.name} ${r.description} ${r.filename || ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <main className="resource-page">
      <div className="resource-page-heading">
        <div>
          <span className="eyebrow">YOUR CREATIVE COLLECTION</span>
          <h1>
            {page}
            <span>
              {resources.filter((r) => !category || r.kind === category).length}
            </span>
          </h1>
          <p>
            {category === "character"
              ? "选择一位伙伴，让新的故事从此开始。支持 VRM、GLB 与 Live2D ZIP 模型包。"
              : category === "scene"
                ? "收藏喜欢的风景，随时出发。"
                : category === "music"
                  ? "把喜欢的旋律带进空间，也可以让伙伴为你选歌。"
                  : category === "book"
                    ? "收藏你的书籍。支持TXT、Markdown、PDF与EPUB；文本和PDF可在此预览。"
                    : "角色、场景、音乐、书籍、图片、视频与歌词，统一收藏，随时取用。"}
          </p>
        </div>
        <button className="secondary" onClick={onStudio}>
          <ArrowLeft size={15} />
          回到舞台
        </button>
      </div>
      {(category === "character" || (!category && (filter === "all" || filter === "character"))) && <Live2DSetup resources={resources} onUpload={() => onUpload("character")} onUse={onUse} />}
      <section className="collection-panel">
        <div className="collection-toolbar">
          <div className="collection-tabs">
            {!category ? (
              (["all", ...kinds] as const).map((k) => (
                <button
                  key={k}
                  className={filter === k ? "active" : ""}
                  aria-pressed={filter === k}
                  onClick={() => {
                    setFilter(k);
                    setExpanded(null);
                  }}
                >
                  {k === "all" ? "全部资源" : labels[k]}
                  <span className="resource-tab-count">
                    {
                      resources.filter((r) => k === "all" || r.kind === k)
                        .length
                    }
                  </span>
                </button>
              ))
            ) : (
              <strong>{labels[category]}列表</strong>
            )}
          </div>
          <div className="collection-actions">
            <label className="collection-search">
              <Search size={15} />
              <input
                aria-label="搜索资源"
                placeholder="搜索资源名称或描述"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="资源来源"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="all">全部来源</option>
              <option value="builtin">内置资源</option>
              <option value="upload">我的导入</option>
            </select>
            {category && (
              <button className="primary" onClick={() => onUpload(category)}>
                <Plus size={15} />
                导入{labels[category]}
              </button>
            )}
          </div>
        </div>
        {kind === "character" && <div className="character-type-tabs" role="group" aria-label="角色类型">
          {(["3d", "live2d"] as const).map(type => <button key={type} className={characterType === type ? "selected" : ""} aria-pressed={characterType === type} onClick={() => setCharacterType(type)}>
            {type === "3d" ? "3D 角色" : "Live2D 角色"}<span>{resources.filter(resource => resource.kind === "character" && (isLive2D(resource.url) ? "live2d" : "3d") === type).length}</span>
          </button>)}
          <small>{characterType === "3d" ? "VRM / GLB · 立体骨骼与全身动作" : "Cubism · 二维表情与模型动作，需要官方 Core"}</small>
        </div>}
        {!category && (
          <div className="collection-imports">
            <span>导入到资源库</span>
            {kinds.map((k) => (
              <button key={k} onClick={() => onUpload(k)}>
                <Upload size={13} />
                {labels[k]}
              </button>
            ))}
          </div>
        )}
        <div className="collection-list-header">
          <span>资源名称</span>
          <span>类型与来源</span>
          <span>状态</span>
          <span>操作</span>
        </div>
        {editing && (
          <section className="resource-edit-card">
            <h3>编辑资源</h3>
            <label className="field">
              名称
              <input
                maxLength={editing.kind === "character" ? 40 : 180}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </label>
            <label className="field">
              描述
              <textarea
                rows={3}
                maxLength={300}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </label>
            <p>修改名称与描述不会改变原文件。角色改名也会同步到角色 Agent。</p>
            <div>
              <button disabled={mutating} onClick={() => setEditing(null)}>
                取消
              </button>
              <button
                className="primary"
                disabled={mutating || !editName.trim()}
                onClick={async () => {
                  setMutating(true);
                  try {
                    if (
                      await onEdit(editing, {
                        name: editName.trim(),
                        description: editDescription.trim(),
                      })
                    )
                      setEditing(null);
                    else setOperationError("保存失败，请重试");
                  } finally {
                    setMutating(false);
                  }
                }}
              >
                保存修改
              </button>
            </div>
          </section>
        )}
        {deleting && (
          <section className="resource-edit-card" role="alert">
            <h3>删除「{deleting.name}」？</h3>
            <p>
              {deleting.source === "builtin"
                ? "从当前浏览器资源库移除内置资源，刷新后不会重新出现。"
                : "删除此浏览器中保存的资源文件。"}
              {deleting.kind === "character"
                ? "角色 Agent 配置与聊天档案保留。"
                : ""}
            </p>
            <button disabled={mutating} onClick={() => setDeleting(null)}>
              取消
            </button>
            <button
              className="danger-button"
              disabled={mutating}
              onClick={async () => {
                setMutating(true);
                try {
                  if (await onRemove(deleting)) {
                    setDeleting(null);
                    if (editing?.id === deleting.id) setEditing(null);
                  } else setOperationError("删除失败，请重试");
                } finally {
                  setMutating(false);
                }
              }}
            >
              确认删除
            </button>
          </section>
        )}
        {operationError && (
          <p role="alert" className="settings-feedback error">
            {operationError}
          </p>
        )}
        <div className="collection-list">
          {shown.map((r) => {
            const Icon = icons[r.kind];
            const active = activeIds.includes(r.id);
            const preview =
              r.kind === "image" || r.kind === "video" || r.kind === "book";
            return (
              <article
                className={`collection-row ${active ? "is-active" : ""}`}
                key={r.id}
              >
                <div className="collection-name">
                  <span className={`collection-thumbnail ${r.kind}`}>
                    {r.thumbnail || (r.kind === "image" && r.url) ? (
                      <img
                        src={r.thumbnail || r.url}
                        alt={r.name}
                        loading="lazy"
                      />
                    ) : (
                      <Icon size={23} />
                    )}
                  </span>
                  <div>
                    <h3>{r.name}</h3>
                    <p>{r.description}</p>
                    {r.license && (
                      <div className="model-source">
                        <span>{r.license}</span>
                        <span>{r.author}</span>
                        {r.sourceUrl && (
                          <a
                            href={r.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            模型来源 <ArrowUpRight size={10} />
                          </a>
                        )}
                      </div>
                    )}
                    {r.duration !== undefined && (
                      <small>
                        <Clock3 size={10} />
                        {Math.floor(r.duration / 60)}:
                        {String(Math.floor(r.duration % 60)).padStart(2, "0")}
                      </small>
                    )}
                  </div>
                </div>
                <div className="collection-meta">
                  <span>{r.kind === "character" ? isLive2D(r.url) ? "Live2D" : "3D · VRM / GLB" : labels[r.kind]}</span>
                  <small>
                    {r.source === "builtin"
                      ? "AstraVerse 内置"
                      : r.persistent === false
                        ? "会话导入"
                        : "本地资源库"}
                  </small>
                </div>
                <div className="collection-state">
                  {active ? (
                    <span>
                      <i />
                      {r.kind === "music"
                        ? playing
                          ? "正在播放"
                          : "已选中"
                        : "正在使用"}
                    </span>
                  ) : (
                    <small>可用</small>
                  )}
                </div>
                <div className="collection-row-actions">
                  <button
                    className={
                      active && r.kind !== "music" ? "secondary" : "primary"
                    }
                    onClick={() =>
                      preview
                        ? setExpanded(expanded === r.id ? null : r.id)
                        : active && r.kind === "music" && playing
                          ? onPause()
                          : onUse(r)
                    }
                  >
                    {preview ? (
                      expanded === r.id ? (
                        <X size={13} />
                      ) : (
                        <ArrowUpRight size={13} />
                      )
                    ) : r.kind === "music" ? (
                      active && playing ? (
                        <Pause size={13} />
                      ) : (
                        <Play size={13} />
                      )
                    ) : active ? (
                      <Check size={13} />
                    ) : (
                      <ArrowUpRight size={13} />
                    )}
                    {preview
                      ? expanded === r.id
                        ? "收起"
                        : r.kind === "book"
                          ? "阅读"
                          : "预览"
                      : r.kind === "music"
                        ? active && playing
                          ? "暂停"
                          : "播放"
                        : r.kind === "scene"
                          ? "进入场景"
                          : r.kind === "lyrics"
                            ? "应用歌词"
                            : "使用角色"}
                  </button>
                  <button
                    aria-label={`编辑${r.name}`}
                    title="编辑资源信息"
                    onClick={() => {
                      setEditing(r);
                      setEditName(r.name);
                      setEditDescription(r.description);
                      setOperationError("");
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    aria-label={`替换${r.name}的文件`}
                    title="替换源文件，保留资源ID"
                    onClick={() => onReplace(r)}
                  >
                    <RefreshCw size={14} />
                  </button>
                  {
                    <button
                      className="collection-delete"
                      aria-label={`删除${r.name}`}
                      title="从本地资源库删除"
                      onClick={() => {
                        setDeleting(r);
                        setOperationError("");
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  }
                </div>
                {preview && expanded === r.id && (
                  <div className="collection-preview">
                    {r.kind === "book" ? (
                      <BookPreview resource={r} />
                    ) : r.kind === "image" ? (
                      <img src={r.url} alt={r.name} />
                    ) : (
                      <button onClick={() => onUse(r)}>在创作空间陪看</button>
                    )}
                    <p>{r.name} · 仅在当前浏览器预览</p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
        {!shown.length && (
          <div className="collection-empty">
            <FolderOpen size={34} />
            <h3>{query ? "没有找到匹配资源" : "还没有这类资源"}</h3>
            <p>
              {query
                ? "换个关键词试试，或清除来源筛选。"
                : "导入喜欢的资源，收藏到你的空间。"}
            </p>
            {kind !== "all" && (
              <button className="secondary" onClick={() => onUpload(kind)}>
                导入{labels[kind]}
              </button>
            )}
          </div>
        )}
        <div className="collection-footer">
          <span>
            显示 {shown.length} / {resources.length} 项 ·
            导入文件保存在此浏览器，清除站点数据会删除
          </span>
          {category === "music" && (
            <button onClick={onLyrics}>
              导入 LRC 歌词 <Upload size={12} />
            </button>
          )}
        </div>
      </section>
      <div className="collection-chat-tip">
        <span>✧</span>
        <div>
          <strong>让伙伴帮你选择</strong>
          <p>说“放一首歌”“换个场景”或“换个角色”，伙伴会列出资源供你选择。</p>
        </div>
        <button onClick={onStudio}>
          去聊聊 <ArrowUpRight size={14} />
        </button>
      </div>
    </main>
  );
}
