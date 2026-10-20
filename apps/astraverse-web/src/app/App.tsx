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
import { builtinLive2DCharacters } from "@/features/live2d/live2dCatalog";
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
import { speakCharacter, stopCharacterSpeech, useSpeech } from "@/features/chat/speech";
import CharacterControls from "@/features/stage/CharacterControls";
import { analyseMusic, analyseMusicElement } from "@/features/music/musicMotion";
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
  { name: "创作空间", icon: LayoutDashboard },
  { name: "虚拟角色", icon: Users },
  { name: "场景世界", icon: Globe2 },
  { name: "音乐与舞蹈", icon: Music2 },
  { name: "书籍库", icon: BookOpen },
  { name: "资源库", icon: FolderOpen },
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
const defaultTracks: Track[] = [
  {
    id: "music-starlight",
    name: "Starlight Reverie",
    artist: "AstraVerse Originals · 氛围纯音乐",
    duration: 164,
  },
  {
    id: "music-between",
    name: "Between the Stars",
    artist: "AstraVerse Originals · 氛围纯音乐",
    duration: 192,
  },
  {
    id: "music-moonlit",
    name: "Moonlit Letters",
    artist: "AstraVerse Originals · 氛围纯音乐",
    duration: 148,
  },
];
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
  const [modal, setModal] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(false);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const catalog = useLibraryCatalog();
  const [allTracks, setTracks] = useState(defaultTracks);
  const [trackIndex, setTrack] = useState(0);
  const visibleTracks = allTracks
    .filter((t) => !catalog.hidden.includes(t.id))
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
  const setVoice = (v: boolean) => preferences.set({ voice: v });
  const [assets, setAssets] = useState<Resource[]>([]);
  const customCharacter = state.modelUrl
    ? [...assets, ...builtinLive2DCharacters].find((r) => r.kind === "character" && r.url === state.modelUrl)
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
  const musicUnavailable = useCallback(() => {
    set({ playing: false });
    toast("另一个 AstraVerse 页面正在播放音乐，请先在该页面暂停");
  }, [set]);
  const ownsMusic = useMusicOwnership(playing, musicUnavailable);
  const synth = useRef<AudioContext | null>(null);
  const synthGain = useRef<GainNode | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const uploadKind = useRef("music");
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
    ...builtinLive2DCharacters.map(resource => ({ ...resource, name: agents.profiles[resource.id]?.name || resource.name })),
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
  function command(tool: string, args: Record<string, unknown> = {}) {
    if (socket.current?.readyState === 1)
      socket.current.send(
        JSON.stringify({ type: "command", tool, arguments: args, client_id:useWorld.getState().clientId, actor_id:tool.startsWith("character.") ? activeAgentRef.current : undefined }),
      );
  }
  function playback(value: boolean) {
    if (value && !visibleTracks.length) {
      toast("音乐库为空，请先添加音乐");
      return;
    }
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
      if (index < 0) return false;
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
          if (
            item?.kind === "reply" &&
            item.agent_id === activeAgentRef.current &&
            !useAgents.getState().busy[item.agent_id]
          ) {
            respond(item.performance, "live");
            if (item.voice && usePreferences.getState().voice) speak(item.text);
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
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);
  useEffect(() => {
    if (!ownsMusic || !libraryLoaded || !visibleTracks.length || activeTrack.url) return;
    const timer = setInterval(
      () =>
        setProgress((p) => {
          const next = p + 0.25;
          if (next >= tracks[track].duration) {
            if (loop) return 0;
            set({ playing: false });
            return 0;
          }
          return next;
        }),
      250,
    );
    return () => clearInterval(timer);
  }, [ownsMusic, libraryLoaded, activeTrack.id, activeTrack.url, activeTrack.duration, loop, set]);
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
    if (ownsMusic && libraryLoaded && activeTrack.url) {
      void element.play().catch(() => {
        // Source switches abort pending play promises; they are not failures.
        if (cancelled) return;
        set({ playing: false });
        toast("音频播放失败，请重新导入文件");
      });
    } else element.pause();
    return () => {
      cancelled = true;
      element.pause();
    };
  }, [ownsMusic, libraryLoaded, activeTrack.id, activeTrack.url, set]);
  useEffect(() => {
    if (!ownsMusic || !libraryLoaded || !visibleTracks.length || activeTrack.url) return;
    const ctx = new AudioContext();
    synth.current = ctx;
    const gain = ctx.createGain();
    synthGain.current = gain;
    gain.gain.value = (volume / 100) * 0.055;
    gain.connect(ctx.destination);
    const stopAnalysis = analyseMusic(gain, ctx);
    let disposed = false;
    void ctx.resume().catch(() => {
      if (disposed) return;
      set({ playing: false });
      toast("请点击播放以启用声音");
    });
    const frequencies =
      track === 0
        ? [130.81, 196, 261.63, 329.63]
        : track === 1
          ? [146.83, 220, 293.66, 369.99]
          : [110, 164.81, 220, 277.18];
    const oscillators: OscillatorNode[] = [];
    frequencies.forEach((f, i) => {
      const oscillator = ctx.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = f;
      const env = ctx.createGain();
      env.gain.value = 0;
      env.gain.linearRampToValueAtTime(0.4 / (i + 1), ctx.currentTime + 2);
      oscillator.connect(env);
      env.connect(gain);
      oscillator.start();
      oscillators.push(oscillator);
    });
    return () => {
      disposed = true;
      stopAnalysis();
      gain.disconnect();
      oscillators.forEach(oscillator => { oscillator.stop(); oscillator.disconnect(); });
      void ctx.close();
      if (synth.current === ctx) {
        synth.current = null;
        synthGain.current = null;
      }
    };
  }, [ownsMusic, libraryLoaded, activeTrack.id, activeTrack.url]);
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
  useEffect(() => {
    if (synth.current && synthGain.current)
      synthGain.current.gain.setTargetAtTime(
        (volume / 100) * 0.055,
        synth.current.currentTime,
        0.1,
      );
  }, [volume]);
  const [computerOpen,setComputerOpen] = useState(false);
  const watchOpen = useWatch(s => s.open);
  const postureCapability = useCharacterCapabilities(s => s.current?.canPosture ?? false);
  const animate = (a: Action) => {
    if (isRestAction(a) && !characterCapabilities()?.canPosture) { toast("当前模型不支持此动作，请选择具有完整人形骨骼的 VRM 角色"); return; }
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
  };
  async function send(text = input, selectionId?: string, viewing?: ViewingContext) {
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
    // Explicit short stage commands execute even if chat inference is unavailable.
    const danceIntent = /^(请|可以|能不能|你|帮我|给我|再|来|一下|一段|一支|个|吧|呀|啊|！|!|。|\s)*(跳舞|跳个舞|跳支舞|跳一支舞|跳一段舞|dance)(一下|一段|吧|呀|啊|！|!|。|\s)*$/i.test(text.trim());
    const restIntent = /^(?:请|你|能不能|可以)?(?:坐下|蹲下|躺下睡觉|睡觉|站起来|起床|醒来)(?:一下|吧|了|。|！|!)?$/.test(text);
    if (restIntent && !/坐下|睡觉/.test(text)) animate(/蹲下/.test(text) ? "crouch" : "idle");
    else if (danceIntent) animate("dance");
    else if (/^(停止|停下|别|不要)(跳舞|舞蹈)(了|吧|！|!|。|\s)*$/.test(text.trim())) animate("idle");
    stopHumming();
    const interactionSnapshot = {sceneUrl:useWorld.getState().sceneUrl,modelUrl:activeModelUrl(),revision:useWorld.getState().interactionRevision,primaryBusy:useWorld.getState().walkMode || !!useWorld.getState().furniture || ["dance","jump"].includes(useWorld.getState().action)};
    const interactionTargets = availableInteractions();
    const epoch = useAgents.getState().epochs[agentId] || 0;
    setInput("");
    setMessages((p) => [...p, { role: "user", text }]);
    setBusy(true);
    stopCharacterSpeech();
    stopHumming();
    beginTurn();
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          scene_interactions: interactionTargets.map(({id,kind,label})=>({id,kind,label})),
          character_capabilities: availableAbilities(),
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
          current_music_id: tracks[track]?.id,
          current_scene_id: resources.find(
            (r) =>
              r.kind === "scene" &&
              (state.sceneUrl ? r.url === state.sceneUrl : r.preset === world),
          )?.id,
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
            })),
          pending: pendingSelection
            ? { kind: pendingSelection.kind, ids: pendingSelection.ids }
            : null,
          selection_id: selectionId,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(
          typeof err.detail === "string"
            ? err.detail
            : JSON.stringify(err.detail || "对话服务暂时不可用"),
        );
      }
      const data = await r.json();
      if ((useAgents.getState().epochs[agentId] || 0) !== epoch) return;
      const isCurrent = activeAgentRef.current === agentId;
      const canApply = isCurrent && activeModelUrl() === interactionSnapshot.modelUrl && useWorld.getState().sceneUrl === interactionSnapshot.sceneUrl && useWorld.getState().interactionRevision === interactionSnapshot.revision;
      if (canApply) respond(data.performance, data.performance_source);
      let applied = true;
      let replyCharacter = c.name;
      const resourceAction = data.resource_action as ResourceAction | undefined;
      if (resourceAction && !canApply)
        data.reply = "你已切换角色，这次资源操作已取消。回来后可以重新选择。";
      if (canApply && resourceAction?.type === "resource.use") {
        const resource = currentResources.current.find(
          (r) =>
            r.id === resourceAction.resource_id &&
            r.kind === resourceAction.kind,
        );
        applied = !!resource && currentResourceUse.current(resource);
        if (
          applied &&
          data.action === "dance" &&
          resource &&
          ["music", "scene"].includes(resource.kind)
        )
          animate("dance");

        if (!applied) data.reply = "这项资源已经不在当前列表里了，请重新选择。";
      } else if (canApply && resourceAction?.type === "music.pause") {
        playback(false);
        animate("idle");
      } else if (canApply && resourceAction?.type === "music.resume") {
        playback(true);
        animate("wave");
      }
      const abilityPlan = data.character_ability;
      if (abilityPlan) {
        const priorityAllows = !interactionSnapshot.primaryBusy || data.interaction_origin === "explicit" || ["headphones_on","headphones_off"].includes(abilityPlan);
        const executed = canApply && priorityAllows && !resourceAction && await applyCharacterAbility(abilityPlan);
        if (!executed) data.reply = "能力没有执行：角色或指令已变化，或当前模型/场景/浏览器不支持。";
        else data.reply += "\n（能力已执行）";
      }
      const stagePlan = data.stage_interaction;
      if (stagePlan) {
        const currentSceneId = currentResources.current.find(r=>r.kind === "scene" && r.url===useWorld.getState().sceneUrl)?.id;
        const executed = canApply && (!interactionSnapshot.primaryBusy || data.interaction_origin === "explicit") && !abilityPlan && !resourceAction && stagePlan.scene_id === currentSceneId && executeStageInteraction(stagePlan,interactionSnapshot);
        if (!executed) data.reply = "动作没有执行：角色或场景已切换，或家具/人形动作能力不可用。请重新发出指令。";
        else data.reply += `\n（已执行：${stagePlan.kind === "sleep" ? "床上躺睡" : stagePlan.kind === "study" ? "桌前学习" : "椅上坐下"}）`;
      }
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
      if (canApply && !useWorld.getState().walkMode && !useWorld.getState().singing && !useWorld.getState().furniture && data.action && !resourceAction && !stagePlan && !abilityPlan) animate(data.action);
      if (canApply && data.pose && !resourceAction && !stagePlan && !abilityPlan) {
        set({ pose: { ...useWorld.getState().pose, ...data.pose } });
        command("character.pose", data.pose);
      }
      if (canApply && data.expression && !resourceAction) {
        set({ expression: data.expression });
        command("character.emote", {
          emotion: data.expression,
          intensity: 0.8,
        });
      }
      if (
        canApply &&
        !useWorld.getState().singing &&
        activeAgentRef.current === agentId &&
        usePreferences.getState().voice
      ) {
        speak(data.reply, `${agentId}-${messages.length + 1}`);
      }
    } catch (error) {
      if ((useAgents.getState().epochs[agentId] || 0) !== epoch) return;
      if (activeAgentRef.current === agentId) endTurn();
      setMessages((p) => [
        ...p,
        {
          role: "assistant",
          mode: "error",
          text: online
            ? `对话请求失败：${error instanceof Error ? error.message : "未知错误"}。请检查后端模型配置后重试。`
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
  function upload(kind: string) {
    replacing.current = null;
    uploadKind.current = kind;
    if (file.current) {
      file.current.accept =
        kind === "book"
          ? ".txt,.md,.pdf,.epub"
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
  async function imported(f: File | undefined) {
    if (!f) return;
    const limitMB = normalizeResourceLimit(usePreferences.getState().resourceLimitMB);
    if (f.size > resourceLimitBytes(limitMB)) {
      toast(`文件不能超过 ${limitMB} MB，可在设置 → 外观与体验中调整`);
      return;
    }
    const kind = uploadKind.current;
    const previous = replacing.current;
    if (kind === "book" && !/\.(txt|md|pdf|epub)$/i.test(f.name)) {
      toast("书籍支持TXT、Markdown、PDF或EPUB");
      return;
    }
    if (kind === "lyrics" && !parseLyrics(await f.text()).length) {
      toast("未找到有效 LRC 时间戳");
      return;
    }
    if (
      (kind === "character" || kind === "scene") &&
      !(kind === "character" ? /\.(vrm|glb|zip)$/i : /\.glb$/i).test(f.name)
    ) {
      toast(
        kind === "character"
          ? "请选择 VRM、GLB 或 Live2D ZIP 模型包"
          : "请选择单文件 GLB 场景",
      );
      return;
    }
    if (
      (kind === "music" && !f.type.startsWith("audio/")) ||
      (kind === "video" && !f.type.startsWith("video/")) ||
      (kind === "image" &&
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
          f.type,
        ))
    ) {
      toast("请选择受支持的媒体文件");
      return;
    }
    const live2d = kind === "character" && /\.zip$/i.test(f.name);
    if (live2d) {
      try { const pack = await openLive2DPackage(f); pack.dispose(); }
      catch (error) { toast(error instanceof Error ? error.message : "Live2D 模型包无效"); return; }
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
    if (previous) {
      if (!persistent) {
        URL.revokeObjectURL(url.split("#")[0]);
        toast("替换文件保存失败，原资源保留");
        return;
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
      toast("源文件已替换，资源ID保留");
      return;
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
    toast(
      persistent
        ? "资源已保存到本地资源库"
        : "资源已导入，但本地存储不可用，仅本次会话可用",
    );
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
      className={`app companion-layout theme-${theme.id} ${light ? "light" : ""} ${preferences.focusMode ? "focus-mode" : ""}`}
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
            我的宇宙<small>个人工作空间</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {navigation.map((n) => (
            <button
              className={nav === n.name ? "active" : ""}
              key={n.name}
              onClick={() => {
                navigate(n.name);
              }}
            >
              <n.icon size={18} />
              {n.name}
            </button>
          ))}
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
            我的宇宙 <ChevronRight size={13} />
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
          <section className="page-heading">
            <div className="eyebrow">A LITTLE SPACE, JUST FOR YOU</div>
            <div className="heading-row">
              <div>
                <h1>
                  和{c.name}，共度此刻。<span> ✧</span>
                </h1>
                <p>一个安静的角落，留给你和喜欢的伙伴。</p>
              </div>
              <div className="heading-tools">
                <button className="secondary" title="视频陪看" onClick={() => useWatch.setState({open:true})}><Video size={15}/>视频陪看</button>
                <button className="secondary" title="电脑操作" onClick={() => setComputerOpen(true)}><Monitor size={15}/>电脑操作</button>
                <button
                  className={`secondary focus-button ${preferences.focusMode ? "selected" : ""}`}
                  onClick={() =>
                    preferences.set({ focusMode: !preferences.focusMode })
                  }
                  aria-pressed={preferences.focusMode}
                >
                  <Focus size={15} />
                  {preferences.focusMode ? "退出沉浸" : "沉浸模式"}
                </button>
                <button className="primary" onClick={save}>
                  <Check size={15} />
                  保存空间
                </button>
              </div>
            </div>
          </section>
          <ComputerPanel open={computerOpen} active={nav === "创作空间"} agentId={agentId} onClose={() => setComputerOpen(false)} />
          <div className={`studio-grid${watchOpen ? " watching" : ""}`} ref={stage}>
            <WatchPanel active={nav === "创作空间"} busy={busy || !!historyLoading || !state.characterVisible} onPauseMusic={() => playback(false)} onDiscuss={(text,view) => void send(text,undefined,view)} />
            <section className="stage-panel">
              <div className="stage-top">
                <div className="stage-title">
                  <span className="live-dot" />
                  {c.name}{" "}
                  <span className="tag">
                    {action === "dance" ? "舞蹈 · 全身取景" : "陪伴中"}
                  </span>
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
                    <Stage active={nav === "创作空间"} />
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
              <div className="stage-action-dock" aria-label="角色休息动作">
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
                {([{id:"sit",label:"坐下"},{id:"crouch",label:"蹲下"},{id:"sleep",label:"睡觉"}] as const).map(item => <button key={item.id} disabled={!postureCapability} title={!postureCapability ? "需要完整人形骨骼的 VRM 角色" : undefined} aria-pressed={action === item.id} onClick={() => (item.id === "sit" || item.id === "sleep") && availableInteractions().some(target=>target.kind===item.id) ? interactFurniture(item.id) : animate(item.id)}>{item.label}</button>)}
                {([{kind:"sleep",label:"上床睡觉"},{kind:"study",label:"坐下学习"},{kind:"sit",label:"坐到椅子"}] as const).map(item => <button key={item.kind} disabled={!postureCapability || !availableInteractions().some(target=>target.kind===item.kind)} title="也可以点击场景中的床或书桌；床铺需卧室；书桌需卧室或教室；椅子也支持公园长椅" aria-pressed={state.furniture?.kind === item.kind} onClick={() => interactFurniture(item.kind)}>{item.label}</button>)}
                <CharacterAbilities active={nav === "创作空间"}/>
                <button disabled={!isRestAction(action)} onClick={() => animate("idle")}>站起来</button>
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
            <aside className="chat-panel">
              <div className="panel-tabs">
                {["对话", "角色"].map((t) => (
                  <button
                    className={tab === t ? "selected" : ""}
                    key={t}
                    onClick={() => setTab(t)}
                  >
                    {t === "对话" ? (
                      <MessageCircle size={15} />
                    ) : (
                      <Users size={15} />
                    )}{" "}
                    {t}
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
                      {c.name} <span>{c.en}</span>
                    </strong>
                    <p>{c.tag}</p>
                    <span className="companion-status">
                      <i />
                      <PresenceStatus />
                    </span>
                  </div>
                  <div className="chat-messages">
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
                          <span className="message-avatar">✧</span>
                        )}
                        <div>
                          {m.role === "assistant" && (
                            <small>
                              {m.characterName || c.name}
                              {m.mode === "llm"
                                ? ` · ${m.model || "大语言模型"}`
                                : m.mode === "resource-agent"
                                  ? " · 资源控制"
                                  : m.mode === "local-rules"
                                    ? " · 本地规则助手"
                                    : ""}
                            </small>
                          )}
                          <p>{m.text}</p>
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
                    {busy && (
                      <div className="thinking">
                        <LoaderCircle size={14} />
                        正在想一想…
                      </div>
                    )}
                    <div ref={bottom} />
                  </div>
                  <div className="chat-compose">
                    <LiveChatPanel
                      agentId={agentId}
                      agentName={c.name}
                      onSettings={() => setModal("直播平台")}
                    />
                    <div className="suggestions">
                      <button onClick={() => void send("给我跳一支舞吧")}>
                        跳一支舞 ♡
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
                      <span>✧</span>{" "}
                      <button
                        type="button"
                        className={`chat-model-status ${chatRoute.mode === "llm" ? "model-ready" : ""}`}
                        onClick={() => setModal("角色 Agent")}
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
                <div className="character-detail">
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
                      onClick={() => setModal("角色 Agent")}
                    >
                      <Sparkles size={14} />
                      配置角色 Agent
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
              upload(r.kind);
              replacing.current = r;
            }}
            onUpload={upload}
            onStudio={() => navigate("创作空间")}
            onPause={() => playback(false)}
            onLyrics={() => upload("lyrics")}
          />
        )}
        <div className="music-player">
          <div className="track-info">
            <div className={`album ${playing ? "spinning" : ""}`}>
              <AudioLines size={24} />
            </div>
            <div>
              <strong>{tracks[track].name}</strong>
              <small>{currentLyric || tracks[track].artist}</small>
            </div>
            <button
              className={liked ? "accent" : ""}
              title="收藏歌曲"
              onClick={() => setLiked(!liked)}
            >
              <Heart size={16} fill={liked ? "currentColor" : "none"} />
            </button>
          </div>
          <div className="playback">
            <div className="playback-buttons">
              <button
                title="随机播放"
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
                title="上一首"
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
                title={playing ? "暂停" : "播放"}
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
                title="下一首"
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
                title="循环播放"
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
                value={progress}
                onChange={(e) => {
                  setProgress(+e.target.value);
                  if (audio.current)
                    audio.current.currentTime = +e.target.value;
                }}
              />
              <span>{time(tracks[track].duration)}</span>
            </div>
          </div>
          <div className="player-extra">
            <Volume2 size={16} />
            <input
              aria-label="音量"
              type="range"
              value={volume}
              onChange={(e) => set({ volume: +e.target.value })}
            />
            <span />
            <button title="播放列表" onClick={() => navigate("音乐与舞蹈")}>
              <Music2 size={17} />
            </button>
            <span className="quality">本地音源</span>
          </div>
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
        onChange={(e) => {
          void imported(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
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
            className={`modal ${modal === "AI 模型与语音" || modal === "设置" || modal === "角色 Agent" || modal === "直播平台" ? "settings-modal" : ""}`}
            role="dialog"
            aria-modal={modal !== "角色表现控制"}
            aria-label={modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">ASTRAVERSE STUDIO</span>
                <h2>{modal}</h2>
              </div>
              <button aria-label="关闭" onClick={() => setModal(null)}>
                <X size={20} />
              </button>
            </div>
            {modal === "AI 模型与语音" ||
            modal === "设置" ||
            modal === "角色 Agent" ||
            modal === "直播平台" ? (
              <SettingsCenter
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
