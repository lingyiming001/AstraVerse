import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Clock3,
  FolderOpen,
  Globe2,
  Music2,
  Pause,
  Play,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import type { Resource, ResourceKind } from "./resources";
const labels: Record<ResourceKind, string> = {
  music: "音乐",
  scene: "场景",
  character: "角色",
};
const icons = { music: Music2, scene: Globe2, character: Users };
interface Props {
  page: string;
  resources: Resource[];
  activeIds: string[];
  playing: boolean;
  onUse: (r: Resource) => void;
  onRemove: (r: Resource) => void;
  onUpload: (kind: ResourceKind) => void;
  onStudio: () => void;
  onPause: () => void;
  onLyrics: () => void;
}
export default function ResourcePage({
  page,
  resources,
  activeIds,
  playing,
  onUse,
  onRemove,
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
          : null;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ResourceKind | "all">("all");
  const kind = category || filter;
  const items = resources.filter(
    (r) =>
      (kind === "all" || r.kind === kind) &&
      `${r.name} ${r.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const [source, setSource] = useState("all");
  const shown = items.filter((r) => source === "all" || r.source === source);
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
              ? "选择一位伙伴，让新的故事从此开始。"
              : category === "scene"
                ? "收藏喜欢的风景，随时出发。"
                : category === "music"
                  ? "把喜欢的旋律带进空间，也可以让伙伴为你选歌。"
                  : "角色、世界与旋律，都在你的收藏里。"}
          </p>
        </div>
        <button className="secondary" onClick={onStudio}>
          <ArrowLeft size={15} />
          回到舞台
        </button>
      </div>
      <div className="collection-summary">
        {(["character", "scene", "music"] as ResourceKind[]).map((k) => {
          const Icon = icons[k];
          return (
            <button
              key={k}
              className={kind === k ? "selected" : ""}
              onClick={() => {
                if (!category) setFilter(k);
              }}
              disabled={!!category}
            >
              <Icon size={20} />
              <div>
                <strong>{resources.filter((r) => r.kind === k).length}</strong>
                <small>{labels[k]}资源</small>
              </div>
              <span>
                {k === "music" ? "聆听" : k === "scene" ? "探索" : "陪伴"}
              </span>
            </button>
          );
        })}
      </div>
      <section className="collection-panel">
        <div className="collection-toolbar">
          <div className="collection-tabs">
            {!category &&
              (["all", "character", "scene", "music"] as const).map((k) => (
                <button
                  key={k}
                  className={filter === k ? "active" : ""}
                  onClick={() => setFilter(k)}
                >
                  {k === "all" ? "全部资源" : labels[k]}
                </button>
              ))}
            {category && <strong>{labels[category]}列表</strong>}
          </div>
          <div className="collection-actions">
            <label className="collection-search">
              <Search size={15} />
              <input
                aria-label="搜索资源"
                placeholder="搜索名称或描述"
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
        {!category && (
          <div className="collection-imports">
            {(["character", "scene", "music"] as ResourceKind[]).map((k) => (
              <button key={k} onClick={() => onUpload(k)}>
                <Upload size={13} />
                导入{labels[k]}
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
        <div className="collection-list">
          {shown.map((r) => {
            const Icon = icons[r.kind];
            const active = activeIds.includes(r.id);
            return (
              <article
                className={`collection-row ${active ? "is-active" : ""}`}
                key={r.id}
              >
                <div className="collection-name">
                  <span className={`collection-thumbnail ${r.kind}`}>
                    <Icon size={23} />
                  </span>
                  <div>
                    <h3>{r.name}</h3>
                    <p>{r.description}</p>
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
                  <span>{labels[r.kind]}</span>
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
                      active && r.kind === "music" && playing
                        ? onPause()
                        : onUse(r)
                    }
                  >
                    {r.kind === "music" ? (
                      active && playing ? (
                        <Pause size={13} />
                      ) : (
                        <Play size={13} />
                      )
                    ) : active ? (
                      <Check size={13} />
                    ) : (
                      <ArrowUpRight size={13} />
                    )}{" "}
                    {r.kind === "music"
                      ? active && playing
                        ? "暂停"
                        : "播放"
                      : r.kind === "scene"
                        ? "进入场景"
                        : "使用角色"}
                  </button>
                  {r.source === "upload" && (
                    <button
                      className="collection-delete"
                      aria-label={`删除${r.name}`}
                      title="从本地资源库删除"
                      onClick={() => onRemove(r)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
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
                : "导入自己的资源后，就可以在这里选择，也能让伙伴通过对话调用。"}
            </p>
          </div>
        )}
        <div className="collection-footer">
          <span>
            显示 {shown.length} 项资源 ·
            上传资源保存在此浏览器本地，清除站点数据会删除
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
          <p>
            {category === "character"
              ? "回到舞台说“换个角色”，伙伴会列出可用选择。"
              : category === "scene"
                ? "回到舞台说“换个场景”，或者直接说出场景名字。"
                : "回到舞台说“放一首歌”，伙伴会先询问你想听哪首，再播放并配合动作。"}
          </p>
        </div>
        <button onClick={onStudio}>
          去聊聊 <ArrowUpRight size={14} />
        </button>
      </div>
    </main>
  );
}
