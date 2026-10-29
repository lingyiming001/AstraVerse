import SourcePanel from "@/features/rag/SourcePanel";
import { useMusicComments } from '@/features/music/useMusicComments';
import { friendlyError } from "@/shared/api/http";
import { indexFile, syncMissing } from "@/features/rag/ragApi";
import { acknowledgeOperation, waitForPlayback, type ExecutionStatus, type Operation } from "@/features/agents/actionExecution";
import { duplicateResource, availableFilename, type ConflictChoice } from "@/features/library/importConflicts";
import ReadingTextPanel from "@/features/library/ReadingTextPanel";
import { musicPauseIntent, pauseMusic } from "@/features/music/musicControl";
import PanelDialog from "@/shared/ui/PanelDialog";
import { importBatch, type ImportOutcome } from "@/features/library/batchImport";
import type { CSSProperties } from "react";
import { bookExcerpt } from "@/features/library/bookExcerpt";
import { importWholeBook, readableBook, readingRequest, selectBook, updateReader, useBookReading, type Reading } from "@/features/library/bookReading";
import { useBookReader } from "@/features/library/useBookReader";
import { parseReadingCommand } from "@/features/library/readingCommand";
import { useStageDisclosure } from "@/shared/ui/useStageDisclosure";
import ReplyPending from "@/features/chat/ReplyPending";
import { usePerformance } from "@/features/stage/performance";
import CharacterAbilities from "@/features/stage/AbilityPanel";
import { availableAbilities, applyCharacterAbility } from "@/features/stage/characterAbilities";
import { stopHumming } from "@/features/stage/humming";
import { normalizeResourceLimit, resourceLimitBytes } from "@/shared/preferences/resourceLimits";
import { interactFurniture, availableInteractions, executeStageInteraction } from "@/features/scenes/interactFurniture";
import ComputerPanel from "@/features/computer/ComputerPanel";
import WatchPanel from "@/features/watch/WatchPanel";
import { useWatch, type ViewingContext } from "@/features/watch/watchStore";
import { isRestAction } from "@/features/stage/restPose";
import { activeModelUrl, characterCapabilities, useCharacterCapabilities } from "@/shared/state/characterCapabilities";
import { builtinScene, builtinScenes } from "@/features/scenes/sceneCatalog";
import { inputProblem } from "@/shared/contentPolicy";
import { useMusicOwnership } from "@/features/music/musicPlayback";
import { useLive2DControl } from "@/features/live2d/live2dControl";
import { builtinLive2DCharacters, optionalLive2DCharacters } from "@/features/live2d/live2dCatalog";
import { isLive2D } from "@/features/live2d/cubismRuntime";
import { openLive2DPackage } from "@/features/live2d/live2dPackage";
import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Compass,
  Expand,
  Focus,
  FolderOpen,
  Globe2,
  Heart,
  LayoutDashboard,
  LoaderCircle,
  MessageCircle,
  MoreHorizontal,
  Music2,
  Monitor,
  Video,
  Pause,
  Play,
  Plus,
  Radio,
  Repeat2,
  RotateCcw,
  Search,
  Settings2,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Upload,
  Users,
  Volume2,
  BookOpen,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import {
  characters,
  useWorld,
  neutralPose,
  type Action,
  type World,
} from "@/shared/state/workspaceStore";
import SettingsCenter from "@/app/settings/SettingsCenter";
import ChatComposer from "@/features/chat/ChatComposer";
import LiveChatPanel from "@/features/live/LiveChatPanel";
import {
  useAgents,
  fetchAgents,
  fetchAgent,
  saveAgent,
  fetchAgentThread,
  updateThread,
  setAgentBusy,
  setAgentPending,
  setAgentRoute,
  type AgentMessage,
} from "@/features/agents/agentApi";
import { setAgentTemperament } from "@/features/stage/performance";
import ResourcePage from "@/features/library/ResourcePage";
import {
  useLibraryCatalog,
  hideResource,
  patchResource,
} from "@/features/library/libraryCatalog";
import {
  readLocalResources,
  saveLocalResource,
  deleteLocalResource,
  updateLocalResource,
} from "@/features/library/localResources";
import {
  pageFromHash,
  pageRoutes,
  type Resource,
  type ResourceChoice,
  type PendingSelection,
  type ResourceAction,
  type ResourceKind,
} from "@/features/library/resources";
import { themes, getTheme, themeVariables, type ThemeId } from "@/shared/preferences/themes";
import { usePreferences, useReducedMotion } from "@/shared/preferences/preferences";
import { speakCharacter, stopCharacterSpeech, stopBookSpeech, stopLiveSpeech, useSpeech, enqueueLiveSpeech } from "@/features/chat/speech";
import { useLivePlayback } from "@/features/live/useLivePlayback";
import CharacterControls from "@/features/stage/CharacterControls";
import { analyseMusicElement } from "@/features/music/musicMotion";
import {
  beginTurn,
  endTurn,
  respond,
  setListening,
  pauseAutomaticPerformance,
} from "@/features/stage/performance";
import PresenceStatus from "@/features/stage/PresenceStatus";
import "@/shared/styles/settings.css";
const Stage = lazy(() => import("@/features/stage/Stage"));
type RenderBoundaryProps = { children: ReactNode; resetKey: string; onRetry: () => Promise<void> };
class RenderBoundary extends Component<
  RenderBoundaryProps,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(previous: RenderBoundaryProps) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({failed:false});
  }
  render() {
    return this.state.failed ? (
      <div className="render-error" role="alert">
        <strong>舞台渲染中断</strong>
        <span>可以重新加载舞台，或从资源库切换角色、场景。</span>
        <button className="secondary" onClick={async () => { await this.props.onRetry(); this.setState({failed:false}); }}>重新加载舞台</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
const navigation = [
  { name: "创作空间", icon: LayoutDashboard, group: "工作台" },
  { name: "虚拟角色", icon: Users, group: "资源管理" },
  { name: "场景世界", icon: Globe2, group: "资源管理" },
  { name: "音乐与舞蹈", icon: Music2, group: "资源管理" },
  { name: "书籍库", icon: BookOpen, group: "资源管理" },
  { name: "视频库", icon: Video, group: "资源管理" },
  { name: "资源库", icon: FolderOpen, group: "资源管理" },
];
const worlds = [
  {
    id: "lunar",
    name: "月境回廊",
    en: "LUNAR SANCTUARY",
    label: "宁静 · 星空 · 自由探索",
    class: "moon",
  },
  {
    id: "aurora",
    name: "极光之森",
    en: "AURORA FOREST",
    label: "自然 · 极光 · 灵感漫游",
    class: "forest",
  },
  {
    id: "sunset",
    name: "日落天台",
    en: "SUNSET ROOFTOP",
    label: "城市 · 黄昏 · 轻松时刻",
    class: "sunset",
  },
];
type Message = AgentMessage;
type Track = {
  persistent?: boolean;
  id: string;
  name: string;
  artist: string;
  duration: number;
  url?: string;
};
const defaultTracks: Track[] = [];
function time(t: number) {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}
export default function App() {
  const state = useWorld();
  const { character, world, action, playing, volume, set } = state;
  const baseCharacter = characters[character] || characters[0];
  const agents = useAgents();
  const [nav, setNav] = useState(pageFromHash);
  const [tab, setTab] = useState("对话");
  const [showReadingText, setShowReadingText] = useState(false);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);
  const [agentSettingsSection, setAgentSettingsSection] = useState("persona");
  const [modal, setModal] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(false);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const catalog = useLibraryCatalog();
  const [allTracks, setTracks] = useState(defaultTracks);
  const [trackIndex, setTrack] = useState(0);
  const visibleTracks = allTracks
    .filter((t) => !!t.url && !catalog.hidden.includes(t.id))
    .map((t) => ({
      ...t,
      name: catalog.patches[t.id]?.name || t.name,
      artist: catalog.patches[t.id]?.description ?? t.artist,
    }));
  const tracks = visibleTracks.length
    ? visibleTracks
    : [
        {
          id: "empty-library",
          name: "暂无音乐",
          artist: "请到音乐库添加歌曲",
          duration: 0,
          url: undefined,
          persistent: false,
        },
      ];
  const track = Math.max(0, Math.min(trackIndex, tracks.length - 1));
  const activeTrack = tracks[track];
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const replacing = useRef<Resource | null>(null);
  const [progress, setProgress] = useState(0);
  const [loop, setLoop] = useState(false);
  const [liked, setLiked] = useState(false);
  const [query, setQuery] = useState("");
  const preferences = usePreferences();
  const reducedMotion = useReducedMotion();
  const theme = getTheme(preferences.theme);
  const light = theme.light;
  const voice = preferences.voice;
  const speech = useSpeech();
  useLivePlayback();
  const setVoice = (v: boolean) => preferences.set({ voice: v });
  const [assets, setAssets] = useState<Resource[]>([]);
  const [installedLive2D, setInstalledLive2D] = useState<Resource[]>([]);
  const live2DCharacters = [...builtinLive2DCharacters, ...installedLive2D];
  useEffect(() => {
    let cancelled = false;
    void Promise.all(optionalLive2DCharacters.map(async resource => {
      try {
        const response = await fetch(resource.url!.split("#")[0], { method: "HEAD" });
        return response.ok && response.headers.get("content-type") !== "text/html" ? resource : null;
      } catch { return null; }
    })).then(found => {
      if (cancelled) return;
      const installed = found.filter((item): item is Resource => !!item);
      setInstalledLive2D(installed);
      try {
        const selected = localStorage.getItem("astraverse-selected-character");
        const restored = installed.find(item => item.id === selected);
        if (restored && !useLibraryCatalog.getState().hidden.includes(restored.id)) set({ modelUrl: restored.url || null, characterVisible: true, position: [0,0,0] });
      } catch { /* Browser storage is optional. */ }
    });
    return () => { cancelled = true; };
  }, []);
  const customCharacter = state.modelUrl
    ? [...assets, ...live2DCharacters].find((r) => r.kind === "character" && r.url === state.modelUrl)
    : undefined;
  const characterView = customCharacter
    ? {
        ...baseCharacter,
        name: customCharacter.name,
        en: "CUSTOM",
        tag: isLive2D(customCharacter.url) ? "Live2D 互动伙伴" : "你的原创伙伴",
      }
    : baseCharacter;
  const agentId = customCharacter?.id || `character-${character}`;
  useBookReader(agentId);
  const agent = agents.profiles[agentId];
  const c = {
    ...characterView,
    name: state.characterVisible
      ? agent?.name || characterView.name
      : "未选择角色",
    tag: agent?.identity || characterView.tag,
  };
  const activeAgentRef = useRef(agentId);
  activeAgentRef.current = agentId;
  const busy = !!agents.busy[agentId];
  const historyLoading =
    agents.historyLoading[agentId] ||
    (agents.threads[agentId] === undefined && !agents.historyErrors[agentId]);
  const input = inputs[agentId] || "";
  const setInput = (value: string) =>
    setInputs((previous) => ({ ...previous, [agentId]: value }));
  const setBusy = (value: boolean) => setAgentBusy(agentId, value);
  const pendingSelection = agents.pending[agentId] || null;
  const setPendingSelection = (value: PendingSelection | null) =>
    setAgentPending(agentId, value);
  const chatRoute = agents.routes[agentId] || { mode: "loading" };
  const setChatRoute = (value: {
    mode: string;
    provider?: string;
    model?: string;
  }) => setAgentRoute(agentId, value);
  const conversation = agents.threads[agentId];
  const messages = useMemo<Message[]>(
    () => [
      {
        role: "assistant",
        text: agent?.greeting || `你好，我是${c.name}。今天想聊些什么？`,
        characterName: c.name,
      },
      ...(conversation || []),
    ],
    [conversation, agent?.greeting, c.name],
  );
  const setMessages = (
    update: Message[] | ((previous: Message[]) => Message[]),
  ) => updateThread(agentId, update);
  useEffect(() => {
    void fetchAgents().catch(() => {});
  }, []);
  useEffect(() => {
    useWorld.getState().set({actorId:agentId});
    stopCharacterSpeech();
    stopHumming();
    usePerformance.setState({cue:null,wink:null,manualUntil:0});
    endTurn();
    if (useAgents.getState().busy[agentId]) beginTurn();
    if (useAgents.getState().threads[agentId] === undefined)
      void fetchAgentThread(agentId).catch(() => {});
  }, [agentId]);
  useEffect(() => {
    setAgentTemperament(agent?.behavior);
  }, [agentId, agent?.behavior]);
  const [lyrics, setLyrics] = useState<{ at: number; text: string }[]>([]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const musicRevision = useRef(0);
  const musicAutoBlocked = useRef(false);
  const musicUnavailable = useCallback(() => {
    set({ playing: false });
    toast("另一个 AstraVerse 页面正在播放音乐，请先在该页面暂停");
  }, [set]);
  const ownsMusic = useMusicOwnership(playing, musicUnavailable);
  useMusicComments({enabled:ownsMusic && preferences.musicComments,agentId,trackId:activeTrack.id,title:activeTrack.name,description:activeTrack.artist || '',audio,onComment:text => {
    setMessages(p => [...p,{role:'assistant',text,mode:'music-comment',characterName:c.name}]);
    if (usePreferences.getState().voice) enqueueLiveSpeech({text,voice:agent?.voice,key:`music-comment:${agentId}`,agentId});
  }});
  const socket = useRef<WebSocket | null>(null);
  const resourceRecency = useRef<Record<string, string[]>>({});
  const moreActionsPanel = useStageDisclosure();
  const bottom = useRef<HTMLDivElement>(null);
  const followConversation = useRef(true);
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  function goToLatest(behavior: ScrollBehavior = "instant") {
    const node = bottom.current?.parentElement;
    node?.scrollTo({ top: node.scrollHeight, behavior });
  }
  const file = useRef<HTMLInputElement>(null);
  const uploadKind = useRef("music");
  const importLock = useRef(false);
  const conflictApplyRef = useRef(false);
  const conflictResolver = useRef<((choice: ConflictChoice) => void) | null>(null);
  const [importConflict, setImportConflict] = useState<{ filename: string; existing: Resource } | null>(null);
  const [applyConflictAll, setApplyConflictAll] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importReport, setImportReport] = useState<{ total: number; outcomes: ImportOutcome[] } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  function navigate(page: string) {
    if (!pageRoutes[page]) return;
    setNav(page);
    setModal(null);
    if (location.hash.slice(1) !== pageRoutes[page])
      location.hash = pageRoutes[page];
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  useEffect(() => {
    const changed = () => {
      setNav(pageFromHash());
      setModal(null);
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  const baseResources: Resource[] = [
    ...tracks.map((t) => ({
      id: t.id,
      kind: "music" as const,
      name: t.name,
      description: t.artist,
      source: t.url ? ("upload" as const) : ("builtin" as const),
      url: t.url,
      duration: t.duration,
      persistent: t.persistent,
    })),
    ...characters.map((ch, index) => ({
      id: `character-${index}`,
      kind: "character" as const,
      name: agents.profiles[`character-${index}`]?.name || ch.name,
      description: `${ch.tag} · ${ch.modelName}`,
      thumbnail: ch.thumbnail,
      author: ch.author,
      license: ch.license,
      sourceUrl: ch.sourceUrl,
      source: "builtin" as const,
      characterIndex: index,
    })),
    ...live2DCharacters.map(resource => ({ ...resource, name: agents.profiles[resource.id]?.name || resource.name })),
    ...builtinScenes,
    ...worlds.map((w) => ({
      id: `scene-${w.id}`,
      kind: "scene" as const,
      name: w.name,
      description: w.label,
      source: "builtin" as const,
      preset: w.id as World,
    })),
    ...assets
      .filter((a) => a.kind !== "music")
      .map((r) =>
        r.kind === "character" && agents.profiles[r.id]
          ? { ...r, name: agents.profiles[r.id].name }
          : r,
      ),
  ];
  const resources: Resource[] = Array.from(
    new Map(
      baseResources
        .filter((r) => r.id !== "empty-library")
        .map((r) => [r.id, r]),
    ).values(),
  )
    .filter((r) => !catalog.hidden.includes(r.id))
    .map((r) => ({ ...r, ...catalog.patches[r.id] }));
  const currentResources = useRef<Resource[]>([]);
  currentResources.current = resources;
  const resourceCatalogKey = JSON.stringify(resources.map(({id,kind,name,description,url})=>({id,kind,name,description,url})));
  useEffect(() => {
    let active=true;
    const source=JSON.parse(resourceCatalogKey) as Resource[];
    void Promise.all(source.slice(0,200).map(async r=>({id:r.id,kind:r.kind,name:r.name.slice(0,180),description:r.description.slice(0,300),excerpt:r.kind==="book"?await bookExcerpt(r).catch(()=>""):""}))).then(items=>{
      if(active) return fetch("/api/library/catalog",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({resources:items})});
    }).catch(()=>{});
    return ()=>{active=false;};
  },[resourceCatalogKey]);
  function command(tool: string, args: Record<string, unknown> = {}) {
    if (socket.current?.readyState === 1)
      socket.current.send(
        JSON.stringify({ type: "command", tool, arguments: args, client_id:useWorld.getState().clientId, actor_id:tool.startsWith("character.") ? activeAgentRef.current : undefined }),
      );
  }
  function playback(value: boolean) {
    musicRevision.current++;
    musicAutoBlocked.current = !value;
    if (!value) {
      const paused = pauseMusic(audio.current, playing => set({ playing }));
      command("music.pause");
      return paused;
    }
    if (value && !visibleTracks.length) {
      toast("音乐库为空，请先添加音乐");
      return;
    }
    if (value && !activeTrack.url) { toast("没有可播放的音频文件"); return; }
    set({ playing: value });
    command(value ? "music.play" : "music.pause");
  }
  const [revealedResource, setRevealedResource] = useState<string | null>(null);
  function useResource(resource: Resource, returnToStage = false) {
    if (resource.kind === "lyrics") {
      if (resource.url)
        void fetch(resource.url)
          .then((r) => r.text())
          .then((text) => {
            const parsed = parseLyrics(text);
            if (!parsed.length) {
              toast("未找到有效 LRC 时间戳");
              return;
            }
            setLyrics(parsed);
            toast(`已应用歌词：${resource.name}`);
          })
          .catch(() => toast("歌词读取失败，请重新导入"));
      return true;
    }
    if (resource.kind === "video") {
      useWatch.setState({open:true,resource});
      playback(false);
      navigate("创作空间");
      return true;
    }
    if (
      resource.kind === "image" ||
      resource.kind === "book"
    ) {
      setRevealedResource(resource.id);
      navigate("资源库");
      return true;
    }
    if (resource.kind === "music") {
      const index = tracks.findIndex((t) => t.id === resource.id);
      if (index < 0 || !tracks[index].url) return false;
      setTrack(index);
      setProgress(0);
      if (index === track && audio.current) audio.current.currentTime = 0;
      playback(true);
    } else if (resource.kind === "scene") {
      preferences.set({ framing: "world" });
      set({
        sceneVisible: true,
        sceneUrl: resource.url || null,
        position: [0,0,0],
        walkTarget: null,
        walking: false,
        ...(resource.preset ? { world: resource.preset } : {}),
      });
      if (resource.preset) command("scene.load", { scene: resource.preset });
    } else {
      try { localStorage.setItem("astraverse-selected-character", resource.id); } catch { /* Optional selection persistence. */ }
      preferences.set({ framing: "portrait" });
      set({
        walkTarget: null,
        walking: false,
        walkMode: false,
        characterVisible: true,
        character: resource.characterIndex ?? character,
        modelUrl: resource.url || null,
        position: [0, 0, 0],
        rotation: 0,
      });
    }
    set({ expression: "happy", expressionIntensity: 0.8 });
    command("character.emote", { emotion: "happy", intensity: 0.8 });
    if (!(resource.kind === "scene" && useWorld.getState().action === "dance"))
      animate("wave");
    if (returnToStage) navigate("创作空间");
    return true;
  }
  const currentResourceUse = useRef(useResource);
  currentResourceUse.current = useResource;
  async function editResource(
    resource: Resource,
    patch: { name: string; description: string },
  ): Promise<boolean> {
    try {
      if (resource.kind === "character") {
        if (patch.name.length > 40) throw new Error("角色名称最多40字");
        const details = await fetchAgent(resource.id, resource.name);
        await saveAgent({ ...details.profile, name: patch.name });
      }
      if (resource.source === "upload" && resource.persistent !== false)
        await updateLocalResource(resource.id, patch);
      patchResource(
        resource.id,
        resource.kind === "character"
          ? { description: patch.description }
          : patch,
      );
      setAssets((p) =>
        p.map((r) => (r.id === resource.id ? { ...r, ...patch } : r)),
      );
      setTracks((p) =>
        p.map((t) =>
          t.id === resource.id
            ? { ...t, name: patch.name, artist: patch.description }
            : t,
        ),
      );
      toast("资源信息已保存");
      return true;
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存失败");
      return false;
    }
  }
  async function removeResource(resource: Resource): Promise<boolean> {
    try {
      if (resource.kind === "book") {
        const response = await fetch(`/api/library/books/${encodeURIComponent(resource.id)}`, { method: "DELETE" });
        if (!response.ok) throw new Error("书籍删除失败");
        if (useBookReading.getState().readers[agentId]?.reading?.book_id === resource.id) stopBookSpeech(agentId);
      }
      if (resource.source === "upload" && resource.persistent !== false)
        await deleteLocalResource(resource.id);
      hideResource(resource.id);
    } catch {
      toast("删除失败，本地存储不可用，请重试");
      return false;
    }
    if (resource.kind === "music") {
      const index = tracks.findIndex((t) => t.id === resource.id);
      if (index === track) {
        playback(false);
        setProgress(0);
      }
      setTrack(
        index < track
          ? Math.max(0, track - 1)
          : Math.min(track, Math.max(0, visibleTracks.length - 2)),
      );
    }
    if (
      resource.kind === "character" &&
      ((state.modelUrl === resource.url && !!resource.url) ||
        (!state.modelUrl && resource.characterIndex === character))
    ) {
      const next = resources.find(
        (r) => r.kind === "character" && r.id !== resource.id,
      );
      stopCharacterSpeech();
      if (next) useResource(next);
      else set({ characterVisible: false, modelUrl: null, action: "idle" });
    }
    if (
      resource.kind === "scene" &&
      ((state.sceneUrl === resource.url && !!resource.url) ||
        (!state.sceneUrl && resource.preset === world))
    ) {
      const next = resources.find(
        (r) => r.kind === "scene" && r.id !== resource.id,
      );
      if (next) useResource(next);
      else {
        set({ sceneVisible: false, sceneUrl: null });
        preferences.set({ framing: "portrait" });
      }
    }
    setAssets((p) => p.filter((r) => r.id !== resource.id));
    if (resource.url?.startsWith("blob:")) URL.revokeObjectURL(resource.url.split("#")[0]);
    toast("已从当前资源库删除");
    return true;
  }
  useEffect(() => { if (libraryLoaded) void syncMissing(resources).catch(() => {}); }, [libraryLoaded, assets]);
  useEffect(() => {
    if (!libraryLoaded) return;
    if (!visibleTracks.length && playing) playback(false);
    const availableCharacters = resources.filter((r) => r.kind === "character");
    const current = state.modelUrl
      ? availableCharacters.find((r) => r.url === state.modelUrl)
      : availableCharacters.find((r) => r.characterIndex === character);
    if (!current) {
      if (availableCharacters[0]) useResource(availableCharacters[0]);
      else if (state.characterVisible)
        set({ characterVisible: false, modelUrl: null, action: "idle" });
    }
    const availableScenes = resources.filter((r) => r.kind === "scene");
    const currentScene = state.sceneUrl
      ? availableScenes.find((r) => r.url === state.sceneUrl)
      : availableScenes.find((r) => r.preset === world);
    if (!currentScene) {
      if (availableScenes[0]) useResource(availableScenes[0]);
      else if (state.sceneVisible) {
        set({ sceneVisible: false, sceneUrl: null });
        preferences.set({ framing: "portrait" });
      }
    }
  }, [
    libraryLoaded,
    playing,
    catalog.hidden,
    assets,
    state.modelUrl,
    state.sceneUrl,
    character,
    world,
  ]);
  const activeResourceIds = [
    ...(visibleTracks.length ? [tracks[track].id] : []),
    !state.characterVisible
      ? undefined
      : state.modelUrl
        ? resources.find(
            (r) => r.kind === "character" && r.url === state.modelUrl,
          )?.id
        : `character-${character}`,
    !state.sceneVisible
      ? undefined
      : state.sceneUrl
        ? resources.find((r) => r.kind === "scene" && r.url === state.sceneUrl)
            ?.id
        : `scene-${world}`,
  ].filter((id): id is string => !!id);
  const toast = (s: string) => {
    setNotice(s);
    window.setTimeout(() => setNotice(""), 3500);
  };
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    void readLocalResources()
      .then((stored) => {
        if (cancelled) return;
        const restored = stored
          .filter(
            (r) =>
              r.blob instanceof Blob &&
              [
                "music",
                "scene",
                "character",
                "image",
                "video",
                "lyrics",
                "book",
              ].includes(r.kind),
          )
          .map(({ blob, ...r }) => {
            const url = URL.createObjectURL(blob) + (r.kind === "character" && /\.zip$/i.test(r.filename || "") ? "#live2d" : "");
            urls.push(url);
            return { ...r, url, persistent: true } as Resource;
          });
        setAssets((previous) => [
          ...previous,
          ...restored.filter((r) => !previous.some((p) => p.id === r.id)),
        ]);
        try {
          const selected = localStorage.getItem("astraverse-selected-character");
          const chosen = [...restored, ...builtinLive2DCharacters].find(resource => resource.id === selected && resource.kind === "character" && !useLibraryCatalog.getState().hidden.includes(resource.id));
          if (chosen) set({ modelUrl: chosen.url, characterVisible: true, position: [0, 0, 0] });
        } catch { /* Browser storage may be unavailable. */ }
        setTracks((previous) => {
          const restoredTracks = restored
            .filter((r) => r.kind === "music")
            .map((r) => ({
              id: r.id,
              name: r.name,
              artist: r.description || "本地资源库",
              duration: r.duration || 180,
              url: r.url,
              persistent: true,
            }));
          return [
            ...previous.map(
              (t) => restoredTracks.find((r) => r.id === t.id) || t,
            ),
            ...restoredTracks.filter(
              (r) => !previous.some((t) => t.id === r.id),
            ),
          ];
        });
      })
      .catch(() => {
        if (!cancelled)
          toast("浏览器本地资源库不可用，本次导入将仅保存在会话中");
      })
      .finally(() => {
        if (!cancelled) setLibraryLoaded(true);
      });
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url.split("#")[0]));
    };
  }, []);
  function speak(text: string, key?: string) {
    void speakCharacter(
      text,
      useAgents.getState().profiles[activeAgentRef.current]?.voice,
      key,
      activeAgentRef.current,
    ).catch(() => toast("角色语音播放失败，请检查语音路由或浏览器播放权限"));
  }
  useEffect(() => {
    let disposed = false;
    const refresh = () => {
      void fetchAgent(agentId, characterView.name)
        .then((details) => {
          if (!disposed) setAgentRoute(agentId, details.status);
        })
        .catch(() => {
          if (!disposed) setAgentRoute(agentId, { mode: "offline" });
        });
    };
    refresh();
    window.addEventListener("astraverse:model-settings-saved", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("astraverse:agent-saved", refresh);
    return () => {
      disposed = true;
      window.removeEventListener("astraverse:model-settings-saved", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("astraverse:agent-saved", refresh);
    };
  }, [modal, online, agentId, characterView.name]);
  useEffect(() => {
    let stop = false;
    let retry: ReturnType<typeof setTimeout>;
    function connect() {
      const ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`,
      );
      socket.current = ws;
      ws.onopen = () => setOnline(true);
      ws.onmessage = (e) => {
        const event = JSON.parse(e.data);
        if (event.type === "state") {
          let patch = Array.isArray(event.fields)
            ? Object.fromEntries(
                event.fields
                  .filter(
                    (key: string) =>
                      key !== "set" && Object.hasOwn(event.data, key),
                  )
                  .map((key: string) => [key, event.data[key]]),
              )
            : event.data;
          if ((event.actor_id && event.actor_id !== activeAgentRef.current) || event.client_id === useWorld.getState().clientId) patch = Object.fromEntries(Object.entries(patch).filter(([key]) => !["pose","expression","expressionIntensity","rotation","action","position","speaking","naturalMotion","gazeTracking","breath"].includes(key)));
          if (Object.keys(patch).some(key => ["pose","expression","rotation","action"].includes(key))) pauseAutomaticPerformance();
          if (Object.hasOwn(patch,"action")) Object.assign(patch,{walkMode:false,walking:false,running:false,singing:false});
          set(patch);
        }
        if (
          event.type === "agent_turn" &&
          typeof event.agent_id === "string" &&
          !useAgents.getState().busy[event.agent_id]
        ) {
          void fetchAgentThread(event.agent_id).catch(() => {});
        }
        if (event.type === "live_event") {
          const item = event.event;
          window.dispatchEvent(
            new CustomEvent("astraverse:danmaku", { detail: item }),
          );
          if (item?.kind === "resource" && item.agent_id === activeAgentRef.current) {
            const action=item.resource_action;
            const resource=currentResources.current.find(r=>r.id===action?.resource_id && r.kind===action?.kind && ["music","book"].includes(r.kind));
            if(resource?.kind === "music" && !musicAutoBlocked.current) currentResourceUse.current(resource);
            // Book excerpts are spoken in the reply; keep the public stage visible.
            if(resource?.kind === "book") void importWholeBook(resource).then(() => selectBook(item.agent_id, resource.id, true)).then(() => toast(`从已保存位置阅读：${resource.name}`)).catch(error => toast(error instanceof Error ? error.message : "书籍读取失败"));
          }
          if (item?.kind === "control" || (item?.kind === "routine" && ["rest", "ended"].includes(item.routine?.reason))) stopLiveSpeech(item.channel_id);
          if (item?.kind === "control" && item.reading_agent_id === activeAgentRef.current) stopBookSpeech(item.reading_agent_id);
          if (
            item?.kind === "reply" &&
            item.agent_id === activeAgentRef.current &&
            !useAgents.getState().busy[item.agent_id]
          ) {
            if (item.voice && usePreferences.getState().voice) enqueueLiveSpeech({ text: item.text, voice: useAgents.getState().profiles[item.agent_id]?.voice, key: `${item.proactive ? "live-idle" : "live"}:${item.channel_id}`, agentId: item.agent_id, onStart: () => respond(item.performance, "live"), onError: () => toast("角色语音播放失败，请检查语音路由或浏览器播放权限") });
            else respond(item.performance, "live");
          }
        }
        if (event.type === "speak" && (!event.actor_id || event.actor_id === activeAgentRef.current)) {
          speak(event.text);
        }
      };
      ws.onclose = () => {
        setOnline(false);
        if (!stop) retry = setTimeout(connect, 4000);
      };
      ws.onerror = () => ws.close();
    }
    retry = setTimeout(connect, 0);
    return () => {
      stop = true;
      clearTimeout(retry);
      socket.current?.close();
    };
  }, [set]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    document.body.style.overflow = modal ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [modal]);
  useEffect(() => {
    if (action !== "jump" && action !== "wave") return;
    const timer = setTimeout(
      () => set({ action: "idle" }),
      action === "jump" ? 1100 : 3200,
    );
    return () => clearTimeout(timer);
  }, [action, set]);
  useEffect(() => {
    if (followConversation.current) goToLatest();
  }, [messages, busy, tab]);
  useEffect(() => {
    followConversation.current = true;
    setAwayFromLatest(false);
    goToLatest();
  }, [agentId, tab]);
  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    element.volume = volume / 100;
    element.loop = loop;
  }, [volume, loop]);
  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    let cancelled = false;
    if (ownsMusic && useWorld.getState().playing && libraryLoaded && activeTrack.url) {
      void element.play().catch(() => {
        // Source switches abort pending play promises; they are not failures.
        if (cancelled) return;
        set({ playing: false });
        toast("音频播放失败，请检查音源或浏览器播放权限");
        setMessages(p => [...p, { role: "assistant", text: "音乐没有播放成功，请检查资料库中的音频文件或浏览器播放权限后重试。" }]);
      });
    } else element.pause();
    return () => {
      cancelled = true;
      element.pause();
    };
  }, [ownsMusic, libraryLoaded, activeTrack.id, activeTrack.url, set]);
  useEffect(() => {
    if (
      !ownsMusic ||
      !libraryLoaded ||
      !visibleTracks.length ||
      !tracks[track].url ||
      !audio.current
    )
      return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    void analyseMusicElement(audio.current)
      .then((cleanup) => {
        if (cancelled) cleanup();
        else stop = cleanup;
      })
      .catch(() => {
        /* Normal media playback remains available without analysis. */
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [ownsMusic, libraryLoaded, activeTrack.id, activeTrack.url]);
  useEffect(() => {
    setListening(input.trim().length > 0 && !busy);
  }, [input.trim().length > 0, busy]);
  useEffect(
    () => () => {
      endTurn();
    },
    [],
  );
  const [computerOpen,setComputerOpen] = useState(false);
  const watchOpen = useWatch(s => s.open);
  const postureCapability = useCharacterCapabilities(s => s.current?.canPosture ?? false);
  const animate = (a: Action) => {
    if (isRestAction(a) && !characterCapabilities()?.canPosture) { toast("当前模型不支持此动作，请选择具有完整人形骨骼的 VRM 角色"); return false; }
    if (isRestAction(a)) { pauseAutomaticPerformance(); preferences.set({ framing: "full" }); }

    if (useWorld.getState().furniture) set({action:"idle"});
    set({
      action: a,
      ...(isRestAction(a) || a === "idle" ? { walking: false, walkTarget: null, pose: { ...neutralPose } } : {}),
      ...(a === "dance" ? { pose: { ...neutralPose }, rotation: 0 } : {}),
    });
    if (socket.current?.readyState === 1)
      socket.current.send(
        JSON.stringify({
          type: "command",
          actor_id: activeAgentRef.current,
          client_id: useWorld.getState().clientId,
          tool: "character.animate",
          arguments: { animation: a },
        }),
      );
    return true;
  };
  async function send(text = input, selectionId?: string, viewing?: ViewingContext) {
    if (!selectionId && musicPauseIntent(text)) {
      const paused = playback(false);
      setInput("");
      setMessages(p => [...p, { role: "user", text: text.trim() }, { role: "assistant", text: paused ? "音乐已暂停，保留当前播放位置。你再次要求播放后才会继续。" : "暂停没有成功，请点击播放器的暂停按钮重试。" }]);
      return;
    }
    const requestedMusicRevision = musicRevision.current;
    if (!state.characterVisible) {
      toast("请先添加并选择角色");
      return;
    }
    if (
      !text.trim() ||
      busy ||
      useAgents.getState().busy[agentId] ||
      historyLoading
    )
      return;
    const problem = inputProblem(text);
    if (problem) { toast(problem); return; }
    text = text.trim();
    const interactionSnapshot = {sceneUrl:useWorld.getState().sceneUrl,modelUrl:activeModelUrl(),revision:useWorld.getState().interactionRevision,primaryBusy:useWorld.getState().walkMode || !!useWorld.getState().furniture || ["dance","jump"].includes(useWorld.getState().action)};
    const interactionTargets = availableInteractions();
    const epoch = useAgents.getState().epochs[agentId] || 0;
    followConversation.current = true;
    setAwayFromLatest(false);
    setInput("");
    setMessages((p) => [...p, { role: "user", text }]);
    setBusy(true);
    if (!useBookReading.getState().readers[agentId]?.reading?.active) stopCharacterSpeech();
    beginTurn();
    let operationInFlight: Operation | undefined;
    try {
      const readingCommand = parseReadingCommand(text, resources.filter(readableBook).map(b => b.name.replace(/\.(txt|md|epub)$/i, "")));
      if (readingCommand) {
        const { reading: current } = await readingRequest<{ reading: Reading | null }>(agentId);
        if (activeAgentRef.current !== agentId || (useAgents.getState().epochs[agentId] || 0) !== epoch) return;
        updateReader(agentId, { reading: current });
        let reply = "";
        if (readingCommand.action === "pause") {
          if (current) { stopBookSpeech(agentId); await selectBook(agentId, current.book_id, false); }
          reply = current ? "已暂停阅读，记住当前位置了。" : "现在没有正在朗读的书。";
        } else {
          const books = resources.filter(readableBook);
          const matches = readingCommand.title ? books.filter(book => book.name.replace(/\.(txt|md|epub)$/i, "") === readingCommand.title || book.name === readingCommand.title) : [];
          const book = matches.length === 1 ? matches[0] : !readingCommand.title && current ? books.find(b => b.id === current.book_id) : !readingCommand.title && books.length === 1 ? books[0] : undefined;
          if (!book) reply = readingCommand.title ? `资料库中没有找到唯一匹配的《${readingCommand.title}》，请确认书名，或在书籍列表点击朗读。` : "请告诉我要读哪本书，例如：读《红楼梦》。也可以在资料库的书籍列表中选择。";
          else {
            stopBookSpeech(agentId);
            await importWholeBook(book);
            if (activeAgentRef.current !== agentId || (useAgents.getState().epochs[agentId] || 0) !== epoch) return;
            if (readingCommand.toEnd !== undefined) usePreferences.getState().set({ bookReadToEnd: readingCommand.toEnd });
            usePreferences.getState().set({ voice: true });
            const selectedReading = await selectBook(agentId, book.id, true, { from_body: readingCommand.fromBody, page: readingCommand.page, chapter: readingCommand.chapter, page_delta: readingCommand.page_delta, restart: readingCommand.restart });
            reply = `开始从${readingCommand.fromBody ? "正文起点" : "保存的位置"}读《${book.name}》。${usePreferences.getState().bookReadToEnd ? "会持续读到全书结束，随时可以叫我暂停。" : "读完当前一段就停。"}`;
            if (readingCommand.page) reply = `已跳到《${book.name}》第${readingCommand.page}阅读页开始朗读（每页500字，不对应纸质书页码）。`;
            if (readingCommand.chapter) reply = `已定位到《${book.name}》的「${selectedReading.chapter}」开始朗读。`;
            if (readingCommand.page_delta) reply = `已跳到第${Math.floor(selectedReading.offset / 500) + 1}阅读页开始朗读（每页500字）。`;
            if (readingCommand.restart) reply = `已回到《${book.name}》开头重新朗读。`;
          }
        }
        if (activeAgentRef.current !== agentId || (useAgents.getState().epochs[agentId] || 0) !== epoch) return;
        endTurn();
        setMessages(p => [...p, { role: "assistant", text: reply }]);
        return;
      }
      const bookCandidates = agent?.allow_resources && (agent.team.resource_initiative || /书|阅读|读/.test(text)) ? resources.filter((r) => r.kind === "book") : [];
      const mentionedBooks = bookCandidates.filter((r) => text.includes(r.name));
      const excerpts = new Map(await Promise.all([...mentionedBooks, ...bookCandidates.filter((r) => !mentionedBooks.includes(r))].slice(0, 4).map(async (book) => [book.id, await bookExcerpt(book).catch(() => "")] as const)));
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          scene_interactions: interactionTargets.map(({id,kind,label})=>({id,kind,label})),
          character_capabilities: availableAbilities(),
          can_posture: postureCapability,
          current_activity: useWorld.getState().singing ? "sing" : useWorld.getState().walkMode ? useWorld.getState().movementMode : useWorld.getState().action,
          viewing: viewing || useWatch.getState().context || undefined,
          character: c.name.slice(0, 40),
          agent_id: agentId,
          live2d: (() => {
            const cap = useLive2DControl.getState().capabilities;
            if (!cap || cap.modelUrl !== useWorld.getState().modelUrl) return undefined;
            const { modelUrl: _url, ...data } = cap;
            return data;
          })(),
          current_music_id: activeTrack.url ? activeTrack.id : undefined,
          music_playing: !!audio.current && !audio.current.paused && !audio.current.ended,
          current_scene_id: resources.find(
            (r) =>
              r.kind === "scene" &&
              (state.sceneUrl ? r.url === state.sceneUrl : r.preset === world),
          )?.id,
          recent_resource_ids: resourceRecency.current[agentId] || [],
          resources: resources
            .filter((r) =>
              [
                "character",
                "scene",
                "music",
                "image",
                "video",
                "lyrics",
                "book",
              ].includes(r.kind),
            )
            .slice(0, 200)
            .map(({ id, kind, name, description }) => ({
              id,
              kind,
              name: name.slice(0, 180),
              description: description.slice(0, 300),
              excerpt: excerpts.get(id) || "",
            })),
          pending: pendingSelection
            ? { kind: pendingSelection.kind, ids: pendingSelection.ids }
            : null,
          selection_id: selectionId,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(friendlyError(err.detail || err, r.status));
      }
      const data = await r.json();
      operationInFlight = data.operation;
      if ((useAgents.getState().epochs[agentId] || 0) !== epoch) return;
      const isCurrent = activeAgentRef.current === agentId;
      const canApply = isCurrent && activeModelUrl() === interactionSnapshot.modelUrl && useWorld.getState().sceneUrl === interactionSnapshot.sceneUrl && useWorld.getState().interactionRevision === interactionSnapshot.revision;
      let executionStatus: ExecutionStatus = "accepted";
      let executionNote = "浏览器已接收操作，尚未确认完成";
      const sameActor = () => activeAgentRef.current === agentId && (useAgents.getState().epochs[agentId] || 0) === epoch;
      const unchanged = () => sameActor() && activeModelUrl() === interactionSnapshot.modelUrl && useWorld.getState().sceneUrl === interactionSnapshot.sceneUrl && useWorld.getState().interactionRevision === interactionSnapshot.revision;
      let applied = true;
      let replyCharacter = c.name;
      let resourceAction = data.resource_action as ResourceAction | undefined;
      if (resourceAction && musicRevision.current !== requestedMusicRevision && (resourceAction.type.startsWith("music.") || (resourceAction.type === "resource.use" && resourceAction.kind === "music"))) {
        resourceAction = undefined;
        executionStatus = "cancelled"; executionNote = "手动音乐操作使较早计划失效";
        data.reply = "你已手动调整播放器，本次较早的音乐操作已取消。";
      }
      if (data.operation && !canApply) {
        executionStatus = "cancelled"; executionNote = "角色、场景或手动姿态已变化";
        data.reply = "当前角色或场景已变化，这次较早的操作已取消。";
      }
      if (canApply && resourceAction?.type === "resource.use") {
        const resource = currentResources.current.find(
          (r) =>
            r.id === resourceAction.resource_id &&
            r.kind === resourceAction.kind,
        );
        if (resource?.kind === "book" && /读|阅读|朗读/.test(text)) {
          await importWholeBook(resource);
          if (!unchanged()) { applied = false; executionStatus = "cancelled"; }
          else {
            stopBookSpeech(agentId);
            usePreferences.getState().set({ voice: true });
            await selectBook(agentId, resource.id, true);
            applied = sameActor();
            if (!applied) { await selectBook(agentId, resource.id, false); executionStatus = "cancelled"; }
            else { data.reply = `正在从保存位置准备朗读《${resource.name}》。`; executionNote = "阅读器已接受任务，正文播放完成后才推进书签"; }
          }
        } else applied = !!resource && currentResourceUse.current(resource);
        if (applied && resource && resource.kind !== "music" && !(resource.kind === "book" && /读|阅读|朗读/.test(text))) {
          data.reply = resource.kind === "scene" ? `正在加载场景「${resource.name}」。` : resource.kind === "character" ? `正在切换到「${resource.name}」。` : resource.kind === "lyrics" ? `正在读取并应用「${resource.name}」的歌词。` : `正在打开「${resource.name}」的预览。`;
          executionNote = "已提交资源加载请求，尚未取得渲染或加载完成回执";
        }
        if (applied && resource?.kind === "music" && resource.url) {
          const playRevision = musicRevision.current;
          executionStatus = await waitForPlayback(audio.current, resource.url, () => sameActor() && musicRevision.current === playRevision);
          applied = executionStatus === "confirmed";
          data.reply = applied ? `正在播放《${resource.name}》。` : executionStatus === "cancelled" ? "播放器已被手动调整，较早的点歌请求已取消。" : "音乐没有开始播放，请检查音源或浏览器播放权限。";
          executionNote = applied ? "浏览器已确认目标音源开始播放" : data.reply;
          if (applied && data.follow_up_action === "dance") {
            if (unchanged() && animate("dance")) { executionNote += "；随后已应用舞蹈动作"; data.reply += "开始跟着音乐跳舞。"; }
            else { executionNote += "；身体状态已变化，后续舞蹈取消"; data.reply += "当前身体状态已变化，这次没有启动舞蹈。"; }
          }
        }

        if (applied && resource) resourceRecency.current[agentId] = [...(resourceRecency.current[agentId] || []), resource.id].slice(-12);
        if (!applied && resource?.kind !== "music") {
          if (executionStatus !== "cancelled") executionStatus = "failed";
          data.reply = executionStatus === "cancelled" ? "角色或场景已变化，资源操作已取消。" : "这项资源没有执行成功，请重新选择。";
          executionNote = data.reply;
        }
      } else if (canApply && resourceAction?.type === "music.pause") {
        const paused = playback(false);
        data.reply = paused ? "音乐已暂停，保留当前播放位置。" : "暂停没有成功，请点击播放器的暂停按钮重试。";
        executionStatus = paused ? "confirmed" : "failed"; executionNote = data.reply;
      } else if (canApply && resourceAction?.type === "music.resume") {
        if (!visibleTracks.length || !activeTrack.url) data.reply = "音乐库中没有可播放的音乐，请先在资料库添加真实音频。";
        else {
          playback(true);
          const playRevision = musicRevision.current;
          executionStatus = await waitForPlayback(audio.current, activeTrack.url, () => sameActor() && musicRevision.current === playRevision);
          data.reply = executionStatus === "confirmed" ? `已继续播放《${activeTrack.name}》。` : "音乐未能继续播放，请检查播放器状态。";
        }
        if (!visibleTracks.length || !activeTrack.url) executionStatus = "failed";
        executionNote = data.reply;
      }
      const abilityPlan = resourceAction ? undefined : data.character_ability;
      if (abilityPlan) {
        const priorityAllows = !interactionSnapshot.primaryBusy || data.interaction_origin === "explicit" || ["headphones_on","headphones_off"].includes(abilityPlan);
        const executed = canApply && priorityAllows && !resourceAction && await applyCharacterAbility(abilityPlan);
        if (!executed) data.reply = "能力没有执行：角色或指令已变化，或当前模型/场景/浏览器不支持。";
        else data.reply += "\n（能力已执行）";
        executionStatus = executed ? "confirmed" : canApply ? "failed" : "cancelled"; executionNote = data.reply;
      }
      const stagePlan = resourceAction || abilityPlan ? undefined : data.stage_interaction;
      if (stagePlan) {
        const currentSceneId = currentResources.current.find(r=>r.kind === "scene" && r.url===useWorld.getState().sceneUrl)?.id;
        const executed = canApply && (!interactionSnapshot.primaryBusy || data.interaction_origin === "explicit") && !abilityPlan && !resourceAction && stagePlan.scene_id === currentSceneId && executeStageInteraction(stagePlan,interactionSnapshot);
        if (!executed) data.reply = "动作没有执行：角色或场景已切换，或家具/人形动作能力不可用。请重新发出指令。";
        else data.reply += `\n（已执行：${stagePlan.kind === "sleep" ? "床上躺睡" : stagePlan.kind === "study" ? "桌前学习" : "椅上坐下"}）`;
        executionStatus = executed ? "confirmed" : canApply ? "failed" : "cancelled"; executionNote = data.reply;
      }
      if (canApply && !resourceAction && !stagePlan && !abilityPlan && executionStatus !== "cancelled") {
        if (data.action) { executionStatus = animate(data.action) ? "confirmed" : "failed"; executionNote = executionStatus === "confirmed" ? "浏览器已应用身体动作" : "当前模型不支持该动作"; if (executionStatus === "failed") data.reply = "当前模型不支持这个身体动作，本次没有执行。"; }
        if (data.pose) { set({ pose: { ...useWorld.getState().pose, ...data.pose } }); command("character.pose", data.pose); executionStatus = "confirmed"; executionNote = "浏览器已应用姿态参数"; }
      }
      if (data.operation) {
        const synced = await acknowledgeOperation(agentId, data.operation, executionStatus, executionNote, data.reply);
        if (!synced && sameActor()) toast("执行结果未同步，后续以播放器和舞台当前状态为准");
      }
      operationInFlight = undefined;
      if (!sameActor()) return;
      const pendingToken = data.pending ? crypto.randomUUID() : undefined;
      if (data.mode === "resource-agent")
        setPendingSelection(
          data.pending ? { ...data.pending, token: pendingToken } : null,
        );
      setMessages((p) => [
        ...p,
        {
          role: "assistant",
          text: data.reply,
          sources: data.sources,
          mode: data.mode,
          model: data.model,
          provider: data.provider,
          choices: data.choices,
          choiceToken: pendingToken,
          characterName: replyCharacter,
        },
      ]);
      if (data.mode !== "resource-agent" && data.mode !== "plugin")
        setChatRoute({
          mode: data.mode,
          model: data.model,
          provider: data.provider,
        });
      if (unchanged() && data.expression && !resourceAction && performance.now() >= usePerformance.getState().manualUntil) {
        set({ expression: data.expression });
        command("character.emote", {
          emotion: data.expression,
          intensity: 0.8,
        });
      }
      if (canApply && !useWorld.getState().singing && sameActor() && usePreferences.getState().voice) {
        const callbacks = { onStart: () => { if (sameActor()) respond(data.performance, data.performance_source); }, onEnd: () => { if (sameActor()) endTurn(); }, onError: () => { if (sameActor()) endTurn(); }, onCancel: () => { if (sameActor()) endTurn(); } };
        if (useBookReading.getState().readers[agentId]?.reading?.active) {
          endTurn();
          enqueueLiveSpeech({ text: data.reply, key: `chat:${agentId}:${crypto.randomUUID()}`, agentId, voice: agent?.voice, ...callbacks });
        } else void speakCharacter(data.reply, agent?.voice, `${agentId}-${messages.length + 1}`, agentId, callbacks).catch(() => toast("角色语音播放失败，请检查语音配置"));
      } else if (canApply) respond(data.performance, data.performance_source);
      else if (sameActor()) endTurn();
    } catch (error) {
      if (operationInFlight) await acknowledgeOperation(agentId, operationInFlight, "failed", error instanceof Error ? error.message : "执行失败", "本次操作未完成，请检查资源或服务状态后重试。");
      if ((useAgents.getState().epochs[agentId] || 0) !== epoch) return;
      if (activeAgentRef.current === agentId) endTurn();
      setMessages((p) => [
        ...p,
        {
          role: "assistant",
          mode: "error",
          text: online
            ? friendlyError(error instanceof Error ? error.message : error)
            : "当前处于本地离线模式。你仍然可以切换场景、播放音乐，或使用下方快捷动作。启动 Python 后端后即可连接对话服务。",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }
  function parseLyrics(content: string) {
    return content
      .split("\n")
      .flatMap((line) => {
        const text = line.replace(/\[[^\]]+\]/g, "").trim();
        return Array.from(line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)).map(
          (m) => ({ at: Number(m[1]) * 60 + Number(m[2]), text }),
        );
      })
      .sort((a, b) => a.at - b.at);
  }
  function upload(kind: string, replacement: Resource | null = null) {
    if (importLock.current) { toast("正在导入文件，请稍候"); return; }
    replacing.current = replacement;
    uploadKind.current = kind;
    if (file.current) {
      file.current.multiple = !replacement;
      file.current.accept =
        kind === "book"
          ? ".txt,.md,.pdf,.epub,.docx,.srt,.vtt"
          : kind === "music"
            ? "audio/*"
            : kind === "lyrics"
              ? ".lrc"
              : kind === "character"
                ? ".vrm,.glb,.zip"
                : kind === "image"
                  ? "image/png,image/jpeg,image/webp,image/gif"
                  : kind === "video"
                    ? "video/*"
                    : ".glb";
      file.current.click();
    }
  }
  async function imported(f: File, kind: string, previous: Resource | null, report: (message: string) => void, onSaved: (resource: Resource) => void): Promise<boolean> {
    const limitMB = normalizeResourceLimit(usePreferences.getState().resourceLimitMB);
    if (f.size > resourceLimitBytes(limitMB)) {
      report(`文件不能超过 ${limitMB} MB，可在设置 → 外观与体验中调整`);
      return false;
    }
    if (kind === "book" && !/\.(txt|md|pdf|epub|docx|srt|vtt)$/i.test(f.name)) {
      report("资料支持TXT、Markdown、PDF、EPUB、DOCX和SRT/VTT字幕");
      return false;
    }
    if (kind === "lyrics" && !parseLyrics(await f.text()).length) {
      report("未找到有效 LRC 时间戳");
      return false;
    }
    if (
      (kind === "character" || kind === "scene") &&
      !(kind === "character" ? /\.(vrm|glb|zip)$/i : /\.glb$/i).test(f.name)
    ) {
      report(
        kind === "character"
          ? "请选择 VRM、GLB 或 Live2D ZIP 模型包"
          : "请选择单文件 GLB 场景",
      );
      return false;
    }
    if (
      (kind === "music" && !f.type.startsWith("audio/")) ||
      (kind === "video" && !f.type.startsWith("video/")) ||
      (kind === "image" &&
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
          f.type,
        ))
    ) {
      report("请选择受支持的媒体文件");
      return false;
    }
    const live2d = kind === "character" && /\.zip$/i.test(f.name);
    if (live2d) {
      try { const pack = await openLive2DPackage(f); pack.dispose(); }
      catch (error) { report(error instanceof Error ? error.message : "Live2D 模型包无效"); return false; }
    }
    const url = URL.createObjectURL(f) + (live2d ? "#live2d" : "");
    const id = previous?.id || `upload-${crypto.randomUUID()}`;
    let persistent = true;
    const resource: Resource = {
      id,
      name: previous?.name || f.name.replace(/\.[^.]+$/, ""),
      kind: kind as ResourceKind,
      url,
      source: "upload",
      description: previous?.description || "本地资源库",
      filename: f.name,
      persistent: true,
    };
    try {
      await saveLocalResource(resource, f);
    } catch {
      persistent = false;
      resource.persistent = false;
      resource.description = "仅当前会话可用";
    }
    if (kind === "book" && readableBook(resource) && (!previous || persistent)) {
      try { await importWholeBook(resource); }
      catch (error) { report(`文件已保留，整本朗读暂不可用：${error instanceof Error ? error.message : "导入失败"}`); }
    }
    if (kind === "book" && !readableBook(resource) && (!previous || persistent)) {
      try { await indexFile(resource); } catch (error) { report(`文件已保留，检索暂不可用：${error instanceof Error ? error.message : "索引失败"}`); }
    }
    if (previous) {
      if (!persistent) {
        URL.revokeObjectURL(url.split("#")[0]);
        report("替换文件保存失败，原资源保留");
        return false;
      }
      setAssets((p) => [...p.filter((r) => r.id !== id), resource]);
      if (kind === "music")
        setTracks((p) =>
          p.map((t) =>
            t.id === id
              ? {
                  ...t,
                  url,
                  name: resource.name,
                  artist: resource.description,
                  duration: 180,
                }
              : t,
          ),
        );
      if (kind === "music") {
        playback(false);
        setProgress(0);
      }
      if (kind === "character" && activeResourceIds.includes(id))
        set({ modelUrl: url, characterVisible: true, position: [0, 0, 0] });
      if (kind === "scene" && activeResourceIds.includes(id))
        set({ sceneUrl: url, sceneVisible: true });
      if (previous.url?.startsWith("blob:") && previous.url !== url)
        URL.revokeObjectURL(previous.url.split("#")[0]);
      replacing.current = null;
      onSaved(resource);
      report("源文件已替换，资源ID保留");
      return true;
    }
    if (kind === "music") {
      playback(false);
      setTracks((p) => [
        ...p,
        {
          id,
          name: f.name.replace(/\.[^.]+$/, ""),
          artist: persistent ? "本地资源库" : "本地上传 · 仅当前会话",
          persistent,
          duration: 180,
          url,
        },
      ]);
      setTrack(visibleTracks.length);
      setProgress(0);
    } else if (kind === "character" || kind === "scene") {
      if (kind === "character") { try { localStorage.setItem("astraverse-selected-character", id); } catch { /* Optional. */ } }
      preferences.set({ framing: kind === "character" ? "portrait" : "world" });
      set(
        kind === "character"
          ? { modelUrl: url, characterVisible: true, position: [0, 0, 0] }
          : { sceneUrl: url, sceneVisible: true },
      );
    }
    if (kind === "lyrics") setLyrics(parseLyrics(await f.text()));
    setAssets((p) => [...p, resource]);
    onSaved(resource);
    if (kind === "character") setRevealedResource(id);
    report(
      persistent
        ? "资源已保存到本地资源库"
        : "资源已导入，但本地存储不可用，仅本次会话可用",
    );
    return true;
  }
  async function importedFiles(files: File[]) {
    if (!files.length || importLock.current) return;
    const kind = uploadKind.current;
    const previous = replacing.current;
    const selected = previous ? files.slice(0, 1) : files;
    importLock.current = true;
    setImportBusy(true);
    setImportReport({ total: selected.length, outcomes: [] });
    setApplyConflictAll(false);
    conflictApplyRef.current = false;
    let policy: ConflictChoice | undefined;
    let batchCatalog = [...currentResources.current];
    try {
      const outcomes = await importBatch(selected, async (f, report) => {
        let target = previous;
        const duplicate = !previous && duplicateResource(f.name, kind, batchCatalog);
        if (duplicate) {
          const choice = policy || await new Promise<ConflictChoice>(resolve => {
            conflictResolver.current = choice => {
              if (conflictApplyRef.current) policy = choice;
              setImportConflict(null);
              resolve(choice);
            };
            setImportConflict({ filename: f.name, existing: duplicate });
          });
          if (choice === "skip") { report("已保留原文件，跳过本次导入"); return "skipped"; }
          if (choice === "replace") target = duplicate;
          else {
            const filename = availableFilename(f.name, kind, batchCatalog);
            f = new File([f], filename, { type: f.type, lastModified: f.lastModified });
            report(`两个都保留，新文件命名为：${filename}`);
          }
        }
        return imported(f, kind, target, report, resource => {
          batchCatalog = [...batchCatalog.filter(r => r.id !== resource.id), resource];
        });
      }, outcomes => {
        setImportReport({ total: selected.length, outcomes });
      });
      const successes = outcomes.filter(o => o.ok).length;
      toast(selected.length > 1 ? `已导入 ${successes} / ${selected.length} 个文件` : outcomes[0].messages.join("；") || "导入完成");
    } finally {
      conflictResolver.current = null;
      setImportConflict(null);
      replacing.current = null;
      importLock.current = false;
      setImportBusy(false);
    }
  }
  function save() {
    const config = {
      version: 1,
      character,
      world,
      volume,
      position: state.position,
    };
    localStorage.setItem("astraverse-project", JSON.stringify(config));
    toast("工作空间已保存到此浏览器");
  }
  function exportProject() {
    const blob = new Blob(
      [
        JSON.stringify(
          { version: 1, character, world, volume, position: state.position },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = "astraverse-project.json";
    a.click();
    URL.revokeObjectURL(u);
  }
  function load() {
    try {
      const v = JSON.parse(
        localStorage.getItem("astraverse-project") || "null",
      );
      if (
        v &&
        Number.isInteger(v.character) &&
        v.character >= 0 &&
        v.character < 3 &&
        worlds.some((w) => w.id === v.world) &&
        Number.isFinite(v.volume) &&
        Array.isArray(v.position) &&
        v.position.length === 3 &&
        v.position.every(
          (n: unknown) =>
            typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 3,
        )
      ) {
        set({
          character: v.character,
          world: v.world,
          volume: Math.max(0, Math.min(100, v.volume)),
          position: v.position,
        });
        toast("已恢复上次保存的工作空间");
      } else toast("尚无保存的工作空间");
    } catch {
      toast("保存内容损坏，无法恢复");
    }
  }
  const currentLyric = lyrics.filter((l) => l.at <= progress).at(-1)?.text;
  return (
    <div
      className={`app companion-layout product-ui ${visibleTracks.length ? "has-music-player" : ""} ${nav === "创作空间" ? "studio-workspace" : ""} theme-${theme.id} ${light ? "light" : ""} ${preferences.focusMode ? "focus-mode" : ""}`}
      style={themeVariables(theme)}
    >
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("创作空间");
          }}
        >
          <span className="brand-icon">
            <Sparkles size={23} />
          </span>
          Astra<span>Verse</span>
          <span className="beta">BETA</span>
        </a>
        <button className="workspace" onClick={() => setModal("工作空间")}>
          <span className="workspace-icon">A</span>
          <span>
            个人工作空间<small>AstraVerse Studio</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <nav aria-label="主导航">
          {["工作台", "资源管理"].map(group => <div className="shell-nav-group" key={group}>
            <span className="shell-nav-label">{group}</span>
            {navigation.filter(n => n.group === group).map(n => <button className={nav === n.name ? "active" : ""} key={n.name} title={n.name} aria-current={nav === n.name ? "page" : undefined} onClick={() => navigate(n.name)}><n.icon size={18} />{n.name}</button>)}
          </div>)}
        </nav>
        <div className="sidebar-bottom">
          <button className="bottom-link" onClick={() => setModal("设置")}>
            <Settings2 size={18} />
            设置
          </button>
          <div className="profile">
            <div className="avatar user">Y</div>
            <div>
              星际漫游者<small>Personal space</small>
            </div>
            <button aria-label="个人菜单" onClick={() => setModal("工作空间")}>
              <MoreHorizontal size={19} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header>
          <div className="breadcrumbs">
            工作空间 <ChevronRight size={13} />
            <span>{nav}</span>
          </div>
          <div className="header-actions">
            <span className={`connection ${online ? "connected" : ""}`}>
              <i />
              {online ? "服务已连接" : "本地体验模式"}
            </span>
            <label className="header-theme-picker">
              <Sun size={16} />
              <select
                aria-label="选择外观主题"
                value={theme.id}
                onChange={(event) =>
                  preferences.set({ theme: event.target.value as ThemeId })
                }
              >
                {themes.map((option) => (
                  <option value={option.id} key={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="tiny-avatar">Y</div>
          </div>
        </header>
        <main className="companion-page" hidden={nav !== "创作空间"}>
          <section className="page-heading studio-heading">
            <div className="heading-row">
              <div className="studio-heading-copy">
                <h1>直播工作台</h1>
                <p>预览角色、自然对话，准备你的下一场直播。</p>
              </div>
              <div className="heading-tools">
                <button className="secondary studio-music-entry" onClick={() => navigate("音乐与舞蹈")}><Music2 size={15}/>音乐</button>
                <button className="secondary preview-toggle" aria-pressed={!previewCollapsed} onClick={() => setPreviewCollapsed(!previewCollapsed)}>{previewCollapsed ? "显示角色" : "收起预览"}</button>
                <button className="primary" onClick={() => { setTab("直播"); document.querySelector(".companion-page .chat-panel")?.scrollIntoView({ behavior:"smooth", block:"nearest" }); }}><Radio size={15}/>直播模式</button>
                <details className="studio-tools">
                  <summary aria-label="更多工作台工具"><MoreHorizontal size={18}/></summary>
                  <div className="studio-tools-menu" onClick={(event) => { if ((event.target as HTMLElement).closest("button")) (event.currentTarget.parentElement as HTMLDetailsElement).open = false; }}>
                    <button onClick={() => { useWatch.setState({open:true}); }}><Video size={15}/>视频陪看</button>
                    <button onClick={() => setComputerOpen(true)}><Monitor size={15}/>电脑操作</button>
                    <button onClick={() => { setAgentSettingsSection("persona"); setModal("角色 Agent"); }}><Settings2 size={15}/>角色设定</button>
                    <button onClick={() => navigate("资源库")}><FolderOpen size={15}/>打开资源库</button>
                    <button aria-pressed={preferences.focusMode} onClick={() => preferences.set({focusMode:!preferences.focusMode})}><Focus size={15}/>{preferences.focusMode ? "退出沉浸" : "沉浸模式"}</button>
                    <button onClick={save}><Check size={15}/>保存空间</button>
                  </div>
                </details>
              </div>
            </div>
          </section>
          <ComputerPanel open={computerOpen} active={nav === "创作空间"} agentId={agentId} onClose={() => setComputerOpen(false)} />
          <div className={`studio-grid${watchOpen ? " watching" : ""}${previewCollapsed ? " preview-collapsed" : ""}`} ref={stage}>
            <WatchPanel active={nav === "创作空间"} busy={busy || !!historyLoading || !state.characterVisible} onPauseMusic={() => playback(false)} onDiscuss={(text,view) => void send(text,undefined,view)} />
            <section className={`stage-panel${isLive2D(state.modelUrl || "") ? " is-live2d" : ""}`}>
              <div className="stage-top">
                <div className="stage-title">
                  <span className="live-dot" />
                  <span className="preview-label">角色预览</span>
                  <button className="stage-character-picker" onClick={() => navigate("虚拟角色")} title="切换角色">{c.name}<ChevronDown size={12}/></button>
                </div>
                <div className="stage-view-switch" aria-label="角色展示方式">
                  {(["portrait", "full", "world"] as const).map((view) => (
                    <button
                      key={view}
                      className={preferences.framing === view ? "selected" : ""}
                      aria-pressed={preferences.framing === view}
                      onClick={() => preferences.set({ framing: view })}
                    >
                      {view === "portrait"
                        ? "人像"
                        : view === "full"
                          ? "全身"
                          : "场景"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="canvas-wrap">
                <RenderBoundary resetKey={JSON.stringify([state.modelUrl || character,state.sceneUrl || world,state.characterVisible,state.sceneVisible])} onRetry={async () => {
                  const {clearStageAssetCache} = await import("@/features/stage/stageRecovery");
                  clearStageAssetCache(state.sceneUrl);
                }}>
                  <Suspense
                    fallback={<div className="loading">正在展开你的宇宙…</div>}
                  >
                    <Stage active={nav === "创作空间"} onSceneSelect={scene => { useResource(scene); }} />
                  </Suspense>
                </RenderBoundary>
                {!state.characterVisible && (
                  <div className="empty-stage">
                    <Users size={30} />
                    <strong>还没有可用角色</strong>
                    <span>添加 VRM、GLB 或 Live2D ZIP 角色，开始新的陪伴。</span>
                    <button
                      className="primary"
                      onClick={() => upload("character")}
                    >
                      添加角色
                    </button>
                  </div>
                )}
              </div>
              <div className="stage-side">
                <button
                  title="居中并重置视角"
                  onClick={() => {
                    set({
                      position: [0, 0, 0],
                      rotation: 0,
                      action: "idle",
                      viewRevision: useWorld.getState().viewRevision + 1,
                    });
                    command("character.move", { x: 0, z: 0 });
                    command("character.rotate", { degrees: 0 });
                    command("character.animate", { animation: "idle" });
                  }}
                >
                  <RotateCcw size={16} />
                </button>
                <button
                  title="角色表现控制"
                  onClick={() => setModal("角色表现控制")}
                >
                  <SlidersHorizontal size={16} />
                </button>
                <button
                  title="全屏舞台"
                  onClick={() => {
                    if (document.fullscreenElement)
                      void document.exitFullscreen().catch(() => toast("暂时无法退出全屏，请按 Esc"));
                    else if (stage.current?.requestFullscreen) void stage.current.requestFullscreen().catch(() => toast("当前浏览器暂时无法进入全屏"));
                    else toast("当前浏览器不支持全屏舞台");
                  }}
                >
                  <Expand size={16} />
                </button>
              </div>
              <div className="character-badge">
                <span className="mini-portrait" style={{ background: c.color }}>
                  <img
                    src={customCharacter?.thumbnail || baseCharacter.thumbnail}
                    alt=""
                  />
                </span>
                <div>
                  {c.name}
                  <span> {c.en}</span>
                  <small>
                    <i />
                    陪伴模式 ·{" "}
                    {action === "idle"
                      ? playing &&
                        preferences.musicMotion &&
                        state.naturalMotion &&
                        !reducedMotion
                        ? "随音乐轻舞"
                        : "自然陪伴"
                      : action === "dance"
                        ? "舞蹈中"
                        : action === "wave"
                          ? "挥手中"
                          : state.furniture?.kind === "study" ? "桌前学习中" : action === "sit" ? "坐着休息" : action === "crouch" ? "蹲下中" : action === "sleep" ? "睡眠中" : "跳跃中"}
                  </small>
                </div>
                <button
                  aria-label="切换角色"
                  onClick={() => navigate("虚拟角色")}
                >
                  <ChevronDown size={14} />
                </button>
              </div>
              <div className="stage-action-dock" aria-label="角色动作">
                <button onClick={() => animate("wave")}>
                  <Heart size={14} />
                  打个招呼
                </button>
                <button
                  onClick={() => {
                    pauseAutomaticPerformance();
                    set({ expression: "happy" });
                    void fetch("/api/tools/execute", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        tool: "character.emote",
                        actor_id: activeAgentRef.current,
                        client_id: useWorld.getState().clientId,
                        arguments: { emotion: "happy", intensity: 0.8 },
                      }),
                    }).catch(() => {});
                  }}
                >
                  <Sparkles size={14} />
                  笑一个
                </button>
                <button
                  onClick={() => animate(action === "dance" ? "idle" : "dance")}
                  aria-pressed={action === "dance"}
                >
                  {action === "dance" ? (
                    <Pause size={14} />
                  ) : (
                    <Music2 size={14} />
                  )}
                  {action === "dance" ? "结束舞蹈" : "跳一支舞"}
                </button>
                <details ref={moreActionsPanel} className="stage-more-actions">
                  <summary>更多动作 <ChevronDown size={13} /></summary>
                  <div className="stage-more-menu">
                    <button type="button" className="stage-panel-close" aria-label="收起更多动作" onClick={() => { if (moreActionsPanel.current) moreActionsPanel.current.open = false; }}>收起 ×</button>
                    <strong>姿态</strong>
                    {([{id:"sit",label:"坐下"},{id:"crouch",label:"蹲下"},{id:"sleep",label:"睡觉"}] as const).map(item => <button key={item.id} disabled={!postureCapability} title={!postureCapability ? "需要完整人形骨骼的 VRM 角色" : undefined} aria-pressed={action === item.id} onClick={() => (item.id === "sit" || item.id === "sleep") && availableInteractions().some(target=>target.kind===item.id) ? interactFurniture(item.id) : animate(item.id)}>{item.label}</button>)}
                    <strong>场景互动</strong>
                    {([{kind:"sleep",label:"上床睡觉"},{kind:"study",label:"坐下学习"},{kind:"sit",label:"坐到椅子"}] as const).map(item => <button key={item.kind} disabled={!postureCapability || !availableInteractions().some(target=>target.kind===item.kind)} title="也可以点击场景中的床或书桌；床铺需卧室；书桌需卧室或教室；椅子也支持公园长椅" aria-pressed={state.furniture?.kind === item.kind} onClick={() => interactFurniture(item.kind)}>{item.label}</button>)}
                    <button disabled={!isRestAction(action)} onClick={() => animate("idle")}>站起来</button>
                  </div>
                </details>
                <CharacterAbilities active={nav === "创作空间"}/>
              </div>
              <div className="stage-hint">
                <span>{state.sceneVisible && builtinScene(state.sceneUrl)?.kind === "bedroom" ? "点击床休息 · 点击书桌学习" : state.sceneVisible && builtinScene(state.sceneUrl)?.kind === "school" ? "点击书桌学习 · 滚轮缩放" : state.sceneVisible && builtinScene(state.sceneUrl)?.kind === "park" ? "点击长椅坐下 · 滚轮缩放" : "拖动旋转 · 滚轮缩放"}</span>
                <button onClick={() => navigate("资源库")}>
                  <FolderOpen size={13} />
                  打开资源库
                  <ArrowRight size={12} />
                </button>
              </div>
            </section>
            <aside className={`chat-panel ${tab === "对话" ? "is-conversation" : "is-control"}`}>
              <div className="panel-tabs">
                {["对话", "直播", "角色"].map((t) => (
                  <button
                    className={tab === t ? "selected" : ""}
                    aria-pressed={tab === t}
                    key={t}
                    onClick={() => setTab(t)}
                  >
                    {t === "对话" ? (
                      <MessageCircle size={15} />
                    ) : t === "直播" ? <Radio size={15}/> : (
                      <Users size={15} />
                    )}{" "}
                    {t === "直播" ? "直播模式" : t}
                  </button>
                ))}
                <button
                  title="对话设置"
                  onClick={() => setModal("AI 模型与语音")}
                >
                  <MoreHorizontal size={19} />
                </button>
              </div>
              {tab === "对话" ? (
                <>
                  <div className="chat-character">
                    <div
                      className="character-orb"
                      style={{ "--accent": c.color } as React.CSSProperties}
                    >
                      <img
                        src={
                          customCharacter?.thumbnail || baseCharacter.thumbnail
                        }
                        alt=""
                      />
                    </div>
                    <strong>
                      {c.name}
                    </strong>
                    <p><PresenceStatus /></p>
                    <button className="chat-persona-link" onClick={() => { setAgentSettingsSection("persona"); setModal("角色 Agent"); }} aria-label="配置当前角色"><Settings2 size={15}/></button>
                  </div>
                  <div className="chat-messages" role="log" aria-label="与角色的对话" aria-live="polite" onScroll={(event) => {
                    const node = event.currentTarget;
                    const near = node.scrollHeight - node.scrollTop - node.clientHeight < 90;
                    followConversation.current = near;
                    setAwayFromLatest(!near);
                  }}>
                    <div className="chat-date">{c.name}的专属会话</div>
                    {historyLoading && (
                      <div className="agent-thread-notice">
                        <LoaderCircle className="spin" size={12} />
                        正在读取你们的对话…
                      </div>
                    )}
                    {agents.historyErrors[agentId] && (
                      <div className="agent-thread-notice">
                        <span>暂时无法读取会话</span>
                        <button
                          onClick={() =>
                            void fetchAgentThread(agentId).catch(() => {})
                          }
                        >
                          重新读取
                        </button>
                      </div>
                    )}
                    {messages.map((m, i) => (
                      <div className={`message ${m.role}`} key={i}>
                        {m.role === "assistant" && (
                          <span className="message-avatar"><img src={customCharacter?.thumbnail || baseCharacter.thumbnail} alt="" /></span>
                        )}
                        <div>
                          {m.role === "assistant" && (
                            <small>
                              {m.characterName || c.name}
                              {m.mode === "error" ? " · 回复失败" : m.mode === "local-rules" ? " · 本地回应" : ""}
                            </small>
                          )}
                          <p>{m.text}</p>
                          {m.role === "assistant" && <SourcePanel key={`${agentId}:${m.sources?.map(s => s.id).join(":")}`} sources={m.sources} agentId={agentId} />}
                          {m.role === "assistant" && m.mode !== "error" && (
                            <button
                              type="button"
                              className={`message-read ${speech.key === `${agentId}-${i}` && (speech.phase === "speaking" || speech.phase === "preparing") ? "is-playing" : ""}`}
                              onClick={() => {
                                const current =
                                  speech.key === `${agentId}-${i}` &&
                                  (speech.phase === "speaking" ||
                                    speech.phase === "preparing");
                                if (current) stopCharacterSpeech();
                                else speak(m.text, `${agentId}-${i}`);
                              }}
                              aria-label={
                                speech.key === `${agentId}-${i}` &&
                                speech.phase !== "idle"
                                  ? "停止朗读这条回复"
                                  : "朗读这条回复"
                              }
                            >
                              <Volume2 size={11} />
                              {speech.key === `${agentId}-${i}` &&
                              (speech.phase === "speaking" ||
                                speech.phase === "preparing")
                                ? "停止朗读"
                                : "朗读"}
                            </button>
                          )}
                          {!!m.choices?.length && (
                            <div className="chat-resource-choices">
                              {m.choiceToken === "history" && (
                                <small>
                                  历史选项已过期，可以重新请求资源列表。
                                </small>
                              )}
                              {m.choices.map((choice, index) => (
                                <button
                                  key={choice.id}
                                  disabled={
                                    busy ||
                                    m.choiceToken !== pendingSelection?.token
                                  }
                                  onClick={() =>
                                    void send(choice.name, choice.id)
                                  }
                                >
                                  <span>
                                    {String(index + 1).padStart(2, "0")}
                                  </span>
                                  <div>
                                    <strong>{choice.name}</strong>
                                    <small>{choice.description}</small>
                                  </div>
                                  <Play size={12} />
                                </button>
                              ))}
                              {m.choiceToken === pendingSelection?.token && (
                                <button
                                  className="cancel-resource-choice"
                                  disabled={busy}
                                  onClick={() => void send("取消")}
                                >
                                  暂时不选
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {busy && <ReplyPending key={agentId} name={c.name} />}
                    <div ref={bottom} />
                  </div>
                  <div className="chat-compose">
                    <ReadingTextPanel agentId={agentId} visible={showReadingText} onToggle={() => setShowReadingText(value => !value)} />
                    {awayFromLatest && <button className="conversation-latest" onClick={() => {
                      followConversation.current = true;
                      setAwayFromLatest(false);
                      goToLatest("smooth");
                    }}>回到最新消息 ↓</button>}
                    <div className="conversation-memory-link"><button onClick={() => { setAgentSettingsSection("memory"); setModal("角色 Agent"); }}>记忆与资料</button><span>Enter 发送 · Shift + Enter 换行</span></div>
                    <div className="suggestions">
                      <button onClick={() => void send("给我跳一支舞吧")}>
                        跳支舞
                      </button>
                      <button onClick={() => void send("今天的你心情怎么样？")}>
                        聊聊今天
                      </button>
                      <button onClick={() => void send("放一首歌")}>
                        放一首歌
                      </button>
                    </div>
                    <ChatComposer
                      value={input}
                      onChange={setInput}
                      onSend={() => void send()}
                      name={c.name}
                      busy={busy}
                      loading={!!historyLoading || !state.characterVisible}
                      voice={voice}
                      onVoiceToggle={() => {
                        const next = !usePreferences.getState().voice;
                        setVoice(next);
                        if (!next) stopCharacterSpeech();
                        toast(
                          next
                            ? "语音回复已开启：新回复会自动朗读"
                            : "语音回复已关闭",
                        );
                      }}
                    />
                    <p>
                      <button
                        type="button"
                        className={`chat-model-status ${chatRoute.mode === "llm" ? "model-ready" : ""}`}
                        onClick={() => { setAgentSettingsSection("persona"); setModal("角色 Agent"); }}
                        title={chatRoute.provider || "配置角色聊天模型"}
                      >
                        {!online
                          ? "后端未连接"
                          : chatRoute.mode === "llm"
                            ? `Agent · ${chatRoute.model}`
                            : chatRoute.mode === "unavailable"
                              ? "Agent 模型不可用 · 查看配置"
                              : chatRoute.mode === "loading"
                                ? "正在读取聊天模型…"
                                : "本地规则助手 · 配置聊天模型"}
                      </button>{" "}
                      <span className="keyboard">Enter 发送</span>
                    </p>
                  </div>
                </>
              ) : (
                tab === "直播" ? <div className="live-control-view">
                  <ReadingTextPanel agentId={agentId} visible={showReadingText} onToggle={() => setShowReadingText(value => !value)} />
                  <LiveChatPanel expanded agentId={agentId} agentName={c.name} onSettings={() => setModal("直播平台")} />
                  <button className="secondary live-program-link" onClick={() => navigate("书籍库")}><BookOpen size={14}/>从资料库选择书籍</button>
                  <button className="secondary live-program-link" onClick={() => { setAgentSettingsSection("live"); setModal("角色 Agent"); }}><Settings2 size={14}/>角色直播设置<ArrowRight size={14}/></button>
                </div> : <div className="character-detail">
                  <div className="character-orb">✧</div>
                  <h2>{c.name}</h2>
                  <p>{agent?.relationship || c.desc}</p>
                  <button
                    className="secondary"
                    onClick={() => setModal("角色表现控制")}
                  >
                    <SlidersHorizontal size={14} />
                    表情与肢体控制
                  </button>
                  <div className="character-agent-summary">
                    <small>专属 Agent</small>
                    <strong>{agent?.identity || c.tag}</strong>
                    <p>
                      {agent?.personality ||
                        "为这个角色配置独立的背景、性格和表达方式。"}
                    </p>
                    <button
                      className="primary"
                      onClick={() => { setAgentSettingsSection("persona"); setModal("角色 Agent"); }}
                    >
                      <Sparkles size={14} />
                      编辑角色设置
                    </button>
                    <span>
                      {agent?.remember === false ? "临时交流" : "独立会话记忆"}{" "}
                      ·{" "}
                      {chatRoute.source === "character"
                        ? "专属模型"
                        : chatRoute.source === "platform"
                          ? "平台指定模型"
                          : "跟随平台模型"}
                    </span>
                  </div>
                  <label>角色性格</label>
                  <div className="pills">
                    {(agent?.personality || c.tag)
                      .split(/[、，,；;]/)
                      .filter(Boolean)
                      .slice(0, 4)
                      .map((trait) => (
                        <span key={trait}>{trait.slice(0, 14)}</span>
                      ))}
                  </div>
                  <button
                    className="primary"
                    onClick={() => navigate("虚拟角色")}
                  >
                    切换虚拟伙伴 <ArrowRight size={14} />
                  </button>
                  <button
                    className="secondary"
                    onClick={() => upload("character")}
                  >
                    导入 VRM / Live2D 角色
                  </button>
                </div>
              )}
            </aside>
          </div>
        </main>
        {nav !== "创作空间" && (
          <ResourcePage
            key={nav}
            page={nav}
            revealId={revealedResource}
            resources={resources}
            activeIds={activeResourceIds}
            playing={playing}
            onUse={(r) => useResource(r, r.kind !== "music")}
            onRemove={removeResource}
            onEdit={editResource}
            onReplace={(r) => {
              upload(r.kind, r);
            }}
            onUpload={upload}
            onStudio={() => navigate("创作空间")}
            onPause={() => playback(false)}
            onLyrics={() => upload("lyrics")}
          />
        )}
        <div className={`music-player${visibleTracks.length ? "" : " is-empty"}`} role="region" aria-label="音乐播放器">
          <div className="track-info">
            <div className={`album ${playing ? "spinning" : ""}`}>
              <AudioLines size={24} />
            </div>
            <div className="track-copy">
              <strong title={visibleTracks.length ? tracks[track].name : undefined}>{visibleTracks.length ? tracks[track].name : "音乐播放器"}</strong>
              <small>{visibleTracks.length ? currentLyric || tracks[track].artist : "为聊天与直播添加背景音乐"}</small>
            </div>
            {!!visibleTracks.length && <button
              aria-label="收藏歌曲"
              aria-pressed={liked}
              className={liked ? "accent" : ""}
              title="收藏歌曲"
              onClick={() => setLiked(!liked)}
            >
              <Heart size={16} fill={liked ? "currentColor" : "none"} />
            </button>}
          </div>
          {!!visibleTracks.length && <div className="playback">
            <div className="playback-buttons">
              <button
                aria-label="随机播放" title="随机播放"
                onClick={() => {
                  setTrack(
                    (track + 1 + Math.floor(Math.random() * 2)) % tracks.length,
                  );
                  setProgress(0);
                }}
              >
                <Shuffle size={14} />
              </button>
              <button
                aria-label="上一首" title="上一首"
                disabled={!visibleTracks.length}
                onClick={() => {
                  setTrack((track - 1 + tracks.length) % tracks.length);
                  setProgress(0);
                }}
              >
                <SkipBack size={16} />
              </button>
              <button
                className="play-button"
                aria-label={playing ? "暂停" : "播放"} title={playing ? "暂停" : "播放"}
                disabled={!visibleTracks.length}
                onClick={() => playback(!playing)}
              >
                {playing ? (
                  <Pause size={17} fill="currentColor" />
                ) : (
                  <Play size={17} fill="currentColor" />
                )}
              </button>
              <button
                aria-label="下一首" title="下一首"
                disabled={!visibleTracks.length}
                onClick={() => {
                  setTrack((track + 1) % tracks.length);
                  setProgress(0);
                }}
              >
                <SkipForward size={16} />
              </button>
              <button
                className={loop ? "accent" : ""}
                aria-label="循环播放" title="循环播放" aria-pressed={loop}
                onClick={() => setLoop(!loop)}
              >
                <Repeat2 size={15} />
              </button>
            </div>
            <div className="progress">
              <span>{time(progress)}</span>
              <input
                aria-label="播放进度"
                type="range"
                min="0"
                max={tracks[track].duration}
                step=".1"
                style={{ "--range-fill": `${tracks[track].duration ? Math.min(100, progress / tracks[track].duration * 100) : 0}%` } as CSSProperties}
                value={progress}
                onChange={(e) => {
                  setProgress(+e.target.value);
                  if (audio.current)
                    audio.current.currentTime = +e.target.value;
                }}
              />
              <span>{time(tracks[track].duration)}</span>
            </div>
          </div>}
          {!!visibleTracks.length && <div className="player-extra">
            <Volume2 size={16} />
            <input
              aria-label="音量"
              type="range"
              style={{ "--range-fill": `${volume}%` } as CSSProperties}
              value={volume}
              onChange={(e) => set({ volume: +e.target.value })}
            />
            <span />
            <button aria-label="播放列表" title="播放列表" onClick={() => navigate("音乐与舞蹈")}>
              <Music2 size={17} />
            </button>
          </div>}
          {!visibleTracks.length && <button className="player-library-button" onClick={() => navigate("音乐与舞蹈")}><Music2 size={16} />选择音乐</button>}
          <audio
              preload="metadata"
              ref={audio}
              src={activeTrack.url}
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                setTracks((p) =>
                  p.map((t, i) =>
                    t.id === tracks[track].id ? { ...t, duration: d } : t,
                  ),
                );
              }}
              onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
              onEnded={() => {
                if (!loop) set({ playing: false });
              }}
            />
        </div>
      </div>
      <input
        className="hidden"
        ref={file}
        type="file"
        multiple
        disabled={importBusy}
        onChange={(e) => {
          void importedFiles(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
      {importReport && <PanelDialog title={importBusy ? `正在导入 ${importReport.outcomes.length} / ${importReport.total}` : "文件导入结果"} busy={importBusy} onClose={() => setImportReport(null)}>
        <div className="batch-import-status" role="status">已处理 {importReport.outcomes.length} / {importReport.total} · 成功 {importReport.outcomes.filter(o => o.ok).length} · 跳过 {importReport.outcomes.filter(o => o.skipped).length} · 失败 {importReport.outcomes.filter(o => !o.ok && !o.skipped).length}</div>
        {importConflict && <section className="import-conflict" aria-label="重复文件处理">
          <h3>文件已经存在</h3><p>资料库中已有同类文件“{importConflict.filename}”，请选择处理方式。</p>
          <p className="import-conflict-note">替换会保留资源设置和 ID。书籍正文发生变化时，阅读进度会重置。</p>
          <label><input type="checkbox" checked={applyConflictAll} onChange={e => { conflictApplyRef.current = e.target.checked; setApplyConflictAll(e.target.checked); }} />应用到本次所有重复文件</label>
          <div className="import-conflict-actions">{([['replace', '替换已有文件'], ['skip', '跳过'], ['keep', '两个都保留']] as const).map(([choice, label]) => <button className="secondary" key={choice} onClick={() => { const resolve = conflictResolver.current; conflictResolver.current = null; resolve?.(choice); }}>{label}</button>)}</div>
        </section>}
        <ul className="batch-import-results">{importReport.outcomes.map((outcome, i) => <li key={i}><strong>{outcome.name}</strong><span className={outcome.skipped ? "import-skipped" : outcome.ok ? "import-ok" : "import-failed"}>{outcome.skipped ? "已跳过" : outcome.ok ? "已导入" : "未导入"}</span><p>{outcome.messages.join("；")}</p></li>)}</ul>
        {!importBusy && <div className="product-dialog-actions"><button className="primary" data-dialog-focus onClick={() => setImportReport(null)}>完成</button></div>}
      </PanelDialog>}
      {notice && (
        <div role="status" className="toast">
          <Check size={16} />
          {notice}
        </div>
      )}
      {modal && (
        <div
          className={`modal-backdrop ${modal === "角色表现控制" ? "character-backdrop" : ""}`}
          onClick={() => setModal(null)}
        >
          <section
            className={`modal ${modal === "角色表现控制" ? "character-controls-modal" : ""} ${modal === "AI 模型与语音" || modal === "设置" || modal === "角色 Agent" || modal === "直播平台" ? "settings-modal" : ""}`}
            role="dialog"
            aria-modal={modal !== "角色表现控制"}
            aria-label={modal === "角色 Agent" ? "角色设置" : modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">ASTRAVERSE STUDIO</span>
                <h2>{modal === "角色 Agent" ? "角色设置" : modal}</h2>
              </div>
              <button aria-label="关闭" onClick={() => { setModal(null); setAgentSettingsSection("persona"); }}>
                <X size={20} />
              </button>
            </div>
            {modal === "AI 模型与语音" ||
            modal === "设置" ||
            modal === "角色 Agent" ||
            modal === "直播平台" ? (
              <SettingsCenter
                resources={resources}
                agentSection={agentSettingsSection}
                initialTab={
                  modal === "AI 模型与语音"
                    ? "providers"
                    : modal === "直播平台"
                      ? "live"
                      : modal === "角色 Agent"
                        ? "agents"
                        : "general"
                }
                agentId={agentId}
                onAgentActivate={(id) => {
                  const resource = resources.find(
                    (r) => r.id === id && r.kind === "character",
                  );
                  if (resource) useResource(resource, true);
                }}
                agentOptions={resources
                  .filter((r) => r.kind === "character")
                  .map((r) => ({
                    id: r.id,
                    name: r.name,
                    thumbnail: r.thumbnail,
                  }))}
              />
            ) : modal === "角色表现控制" ? (
              <CharacterControls />
            ) : (
              <>
                <div className="project-hero">
                  <Sparkles size={33} />
                  <h3>
                    {modal === "创建新项目"
                      ? "一段新故事，从这里开始。"
                      : "每一个灵感，都值得被保存。"}
                  </h3>
                  <p>在此浏览器中保存、恢复或导出角色与场景配置。</p>
                </div>
                <div className="control-row">
                  <button onClick={save}>
                    <Check size={15} />
                    保存工作空间
                  </button>
                  <button onClick={load}>
                    <RotateCcw size={15} />
                    恢复工作空间
                  </button>
                  <button onClick={exportProject}>
                    <ArrowDownToLine size={15} />
                    导出 JSON
                  </button>
                </div>
                {modal === "创建新项目" && (
                  <button
                    className="primary full"
                    onClick={() => {
                      set({
                        character: 0,
                        world: "lunar",
                        action: "idle",
                        position: [0, 0, 0],
                        sceneUrl: null,
                        modelUrl: null,
                        playing: false,
                      });
                      setModal(null);
                      toast("新的创作空间已准备好");
                    }}
                  >
                    <Plus size={15} />
                    新建空白空间
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
  function setWorldRandom() {
    set({
      world: worlds[
        (worlds.findIndex((w) => w.id === world) + 1) % worlds.length
      ].id as World,
    });
  }
}
