import RagPanel from "@/features/rag/RagPanel";
import { isLive2D } from "@/features/live2d/cubismRuntime";
import Live2DCoreSettings from "@/features/live2d/Live2DCoreSettings";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import ActionMenu from "@/shared/ui/ActionMenu";
import PanelDialog from "@/shared/ui/PanelDialog";
import { filterResourceList, type ResourceSort } from "./resourceList";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
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
import { useWorld } from '@/shared/state/workspaceStore';
import ResourceAccess from "@/features/library/ResourceAccess";
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
            : page === "视频库" ? "video" : null;
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
  const [sort, setSort] = useState<ResourceSort>("default");
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const handledReveal = useRef<string | null>(null);
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
  const shown = useMemo(() => filterResourceList(resources, { kind, source, query, characterType, sort }), [resources, kind, source, query, characterType, sort]);
  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const displayed = shown.slice((safePage - 1) * pageSize, safePage * pageSize);
  const matchingIds = shown.map(r => r.id).join("|");
  const filtered = !!query.trim() || source !== "all" || (!category && filter !== "all");
  useEffect(() => { setCurrentPage(1); }, [query, source, filter, characterType, sort, pageSize]);
  useEffect(() => { setCurrentPage(page => Math.min(page, totalPages)); }, [totalPages]);
  useEffect(() => {
    if (!revealId) { handledReveal.current = null; return; }
    if (handledReveal.current === revealId) return;
    const index = shown.findIndex(r => r.id === revealId);
    if (index >= 0) { setCurrentPage(Math.floor(index / pageSize) + 1); handledReveal.current = revealId; }
  }, [revealId, matchingIds, pageSize]);
  function clearFilters() { setQuery(""); setSource("all"); setFilter("all"); }
  return (
    <main className="resource-page">
      <div className="resource-page-heading">
        <div>
          <h1>
            {page}
            <span>
              {resources.filter((r) => !category || r.kind === category).length}
            </span>
          </h1>
          <p>
            {category === "character"
              ? "管理角色模型，选择在舞台上使用的伙伴。"
              : category === "scene"
                ? "管理场景资源，快速切换舞台环境。"
                : category === "music"
                  ? "管理音乐与歌词，控制舞台播放。"
                  : category === "book"
                    ? "管理电子书，继续阅读或查看已导入的原文。"
                    : category === "video" ? "管理本地视频，展开查看或送到创作空间陪看。" : "集中管理角色、场景与素材，供聊天、阅读和直播使用。"}
          </p>
        </div>
        <div className="resource-heading-actions">
          <button className="secondary" onClick={onStudio}><ArrowLeft size={15} />返回舞台</button>
          {category ? <button className="primary" onClick={() => onUpload(category)}><Plus size={15} />{category === "character" ? "导入模型" : `导入${labels[category]}`}</button> :
            <ActionMenu label="选择导入的资源类型" text="导入资源" icon={<Plus size={15} />} items={kinds.map(k => ({ label: `导入${k === "character" ? "模型" : labels[k]}`, icon: <Upload size={14} />, onSelect: () => onUpload(k) }))} />}
        </div>
      </div>
      {(!category || category === "book") && <RagPanel resources={resources} />}
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
            <select aria-label="资源排序" value={sort} onChange={e => setSort(e.target.value as ResourceSort)}><option value="default">默认排序</option><option value="name-asc">名称 A–Z</option><option value="name-desc">名称 Z–A</option></select>
            {filtered && <button className="resource-clear-filters" onClick={clearFilters}>清除筛选</button>}
          </div>
        </div>
        {kind === "character" && <div className="character-type-tabs" role="group" aria-label="角色类型">
          {(["3d", "live2d"] as const).map(type => <button key={type} className={characterType === type ? "selected" : ""} aria-pressed={characterType === type} onClick={() => setCharacterType(type)}>
            {type === "3d" ? "3D 角色" : "Live2D 角色"}<span>{resources.filter(resource => resource.kind === "character" && (isLive2D(resource.url) ? "live2d" : "3d") === type).length}</span>
          </button>)}
          <small>{characterType === "3d" ? "VRM / GLB · 立体骨骼与全身动作" : "Live2D ZIP · 二维表情与模型动作"}</small>
        </div>}
        {kind === "character" && <details className="resource-help"><summary>模型导入说明与 Live2D 运行环境</summary><div className="character-import-info">
          <span>统一导入 VRM、GLB 或 Live2D ZIP；ZIP 需包含 model3.json、moc3 与贴图。导入后会显示在对应类型中。</span>
          {characterType === "live2d" && <Live2DCoreSettings hasSamples={resources.some(resource => resource.id === "live2d-mao-pro" || resource.id === "live2d-shizuku")} />}
        </div></details>}
        {editing && (
          <PanelDialog title={`编辑资源 · ${editing.name}`} onClose={() => setEditing(null)} busy={mutating}>
            <ResourceAccess key={editing.id} id={editing.id} />
            <label className="field">
              名称
              <input
                data-dialog-focus
                disabled={mutating}
                maxLength={editing.kind === "character" ? 40 : 180}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </label>
            <label className="field">
              描述
              <textarea
                rows={3}
                disabled={mutating}
                maxLength={300}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </label>
            <p className="product-dialog-note">修改名称和描述会保留原文件，角色名称同步到角色设置。</p>
            {operationError && <p role="alert" className="settings-feedback error">{operationError}</p>}
            <div className="product-dialog-actions">
              <button className="secondary" disabled={mutating} onClick={() => setEditing(null)}>
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
                  } catch (error) {
                    setOperationError(error instanceof Error ? error.message : "保存失败，请重试");
                  } finally {
                    setMutating(false);
                  }
                }}
              >
                保存修改
              </button>
            </div>
          </PanelDialog>
        )}
        {deleting && (
          <PanelDialog title={`删除「${deleting.name}」？`} danger busy={mutating} onClose={() => setDeleting(null)}>
            <p>
              {deleting.source === "builtin"
                ? "从当前浏览器资源库移除内置资源，刷新后不会重新出现。"
                : "删除此浏览器中保存的资源文件。"}
              {deleting.kind === "character"
                ? "角色设置与聊天记录会保留。"
                : ""}
              {deleting.kind === "book" ? "本机保存的书籍全文和所有角色的阅读位置也会删除。" : ""}
            </p>
            {operationError && <p role="alert" className="settings-feedback error">{operationError}</p>}
            <div className="product-dialog-actions">
            <button className="secondary" data-dialog-focus disabled={mutating} onClick={() => setDeleting(null)}>
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
                } catch (error) {
                  setOperationError(error instanceof Error ? error.message : "删除失败，请重试");
                } finally {
                  setMutating(false);
                }
              }}
            >
              确认删除
            </button>
            </div>
          </PanelDialog>
        )}
        {operationError && !editing && !deleting && (
          <p role="alert" className="settings-feedback error">
            {operationError}
          </p>
        )}
        <div className="resource-results-heading"><span>{filtered ? `筛选结果 ${shown.length} 项` : `全部 ${shown.length} 项`}</span><small>名称 · 类型 · 来源 · 状态</small></div>
        <div className="resource-table-scroll" role="region" aria-label={`${page}列表，可横向滚动`} tabIndex={0}>
          <table className="resource-table">
            <caption className="product-sr-only">{page}资源列表，共{shown.length}项</caption>
            <colgroup><col className="resource-name-col" /><col className="resource-type-col" /><col className="resource-source-col" /><col className="resource-status-col" /><col className="resource-actions-col" /></colgroup>
            <thead><tr><th scope="col">资源名称</th><th scope="col">类型</th><th scope="col">来源</th><th scope="col">状态</th><th scope="col" className="resource-actions-heading">操作</th></tr></thead>
            <tbody>{displayed.map(r => {
              const Icon = icons[r.kind];
              const active = activeIds.includes(r.id);
              const preview = ["image", "video", "book"].includes(r.kind);
              const verb = preview ? expanded === r.id ? "收起" : r.kind === "book" ? "阅读" : "预览" : r.kind === "music" ? active && playing ? "暂停" : "播放" : r.kind === "scene" ? "进入场景" : r.kind === "lyrics" ? "应用歌词" : active ? "使用中" : "使用角色";
              return <Fragment key={r.id}>
                <tr className={active ? "is-active" : undefined}>
                  <td><div className="resource-cell-name">
                    <span className={`resource-cell-thumb ${r.kind}`}>{r.thumbnail || (r.kind === "image" && r.url) ? <img src={r.thumbnail || r.url} alt="" loading="lazy" /> : <Icon size={21} />}</span>
                    <div><h3 title={r.name}>{r.name}</h3><p title={r.description}>{r.description || "暂无描述"}</p>
                      {r.license && <div className="model-source"><span>{r.license}</span>{r.author && <span>{r.author}</span>}{r.sourceUrl && <a href={r.sourceUrl} target="_blank" rel="noreferrer">模型来源 <ArrowUpRight size={11} /></a>}</div>}
                      {r.duration !== undefined && <small className="resource-duration"><Clock3 size={11} />{Math.floor(r.duration / 60)}:{String(Math.floor(r.duration % 60)).padStart(2, "0")}</small>}
                    </div>
                  </div></td>
                  <td><span className="resource-kind-label">{r.kind === "character" ? isLive2D(r.url) ? "Live2D" : "3D 模型" : labels[r.kind]}</span></td>
                  <td><span className="resource-source-label">{r.source === "builtin" ? "内置" : r.persistent === false ? "当前会话" : "我的导入"}</span></td>
                  <td><span className={`resource-status-label${active ? " is-active" : ""}`}>{active && <i />}{active ? r.kind === "music" ? playing ? "播放中" : "已选中" : "使用中" : "可用"}</span></td>
                  <td><div className="resource-row-actions">
                    <button className={`resource-use-button${active ? " is-active" : ""}`} aria-label={`${verb}${r.name}`} onClick={() => preview ? setExpanded(expanded === r.id ? null : r.id) : active && r.kind === "music" && playing ? onPause() : onUse(r)}>
                      {preview ? expanded === r.id ? <X size={14} /> : <ArrowUpRight size={14} /> : r.kind === "music" ? active && playing ? <Pause size={14} /> : <Play size={14} /> : active ? <Check size={14} /> : <ArrowUpRight size={14} />}{verb}
                    </button>
                    <ActionMenu label={`更多操作：${r.name}`} items={[
                      { label: "在新窗口打开", icon: <ArrowUpRight size={14} />, onSelect: () => {
                        const query = new URLSearchParams({view:'reader',book:r.id,file:r.url || '',title:r.name,filename:r.filename || r.name,kind:r.kind,agent:useWorld.getState().actorId,preset:r.preset || '',characterIndex:String(r.characterIndex ?? '')});
                        window.open(`/?${query}`, '_blank', 'popup,width=1100,height=850,noopener,noreferrer');
                      } },
                      { label: "编辑信息与权限", icon: <Pencil size={14} />, onSelect: () => { setEditing(r); setEditName(r.name); setEditDescription(r.description); setOperationError(""); setDeleting(null); } },
                      { label: "替换源文件", icon: <RefreshCw size={14} />, onSelect: () => onReplace(r) },
                      { label: "删除资源", icon: <Trash2 size={14} />, danger: true, onSelect: () => { setDeleting(r); setOperationError(""); setEditing(null); } },
                    ]} />
                  </div></td>
                </tr>
                {preview && expanded === r.id && <tr className="resource-preview-row"><td colSpan={5}><div className="collection-preview">
                  {r.kind === "book" ? <BookPreview resource={r} /> : r.kind === "image" ? <img src={r.url} alt={r.name} /> : <button className="secondary" onClick={() => onUse(r)}>在创作空间陪看</button>}
                  <p>{r.name} · 本地预览</p>
                </div></td></tr>}
              </Fragment>;
            })}
            {!shown.length && <tr><td colSpan={5}><div className="collection-empty"><FolderOpen size={32} /><h3>{filtered ? "没有找到匹配资源" : "这里还没有资源"}</h3><p>{filtered ? "试试其他关键词，或清除筛选条件。" : "导入一个文件，开始整理你的创作素材。"}</p>
              {filtered ? <button className="secondary" onClick={clearFilters}>清除筛选</button> : kind !== "all" && <button className="primary" onClick={() => onUpload(kind)}><Plus size={14} />{kind === "character" ? "导入模型" : `导入${labels[kind]}`}</button>}
            </div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="resource-pagination">
          <span role="status">{shown.length ? `显示 ${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, shown.length)}，共 ${shown.length} 项` : "0 项资源"}</span>
          <div><label>每页<select aria-label="每页显示数量" value={pageSize} onChange={e => setPageSize(Number(e.target.value))}><option value={20}>20 项</option><option value={50}>50 项</option><option value={100}>100 项</option></select></label>
            <button aria-label="上一页" disabled={safePage === 1} onClick={() => setCurrentPage(safePage - 1)}><ChevronLeft size={16} /></button><span aria-label="当前页">{safePage} / {totalPages}</span><button aria-label="下一页" disabled={safePage === totalPages} onClick={() => setCurrentPage(safePage + 1)}><ChevronRight size={16} /></button>
          </div>
        </div>
      </section>
      <div className="resource-page-footnote"><span>导入文件保存在当前浏览器，书籍全文与阅读进度另存本机服务。</span>{category === "music" && <button onClick={onLyrics}>导入 LRC 歌词 <Upload size={12} /></button>}<button onClick={onStudio}>在舞台使用资源 <ArrowUpRight size={12} /></button></div>
    </main>
  );
}
