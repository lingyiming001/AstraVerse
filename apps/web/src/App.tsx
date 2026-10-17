import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
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
  Mic,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  Repeat2,
  RotateCcw,
  Search,
  Send,
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
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import { characters, useWorld, type Action, type World } from "./store";
import SettingsCenter from "./SettingsCenter";
import ResourcePage from "./ResourcePage";
import {
  readLocalResources,
  saveLocalResource,
  deleteLocalResource,
} from "./localResources";
import {
  pageFromHash,
  pageRoutes,
  type Resource,
  type ResourceChoice,
  type PendingSelection,
  type ResourceAction,
  type ResourceKind,
} from "./resources";
import { usePreferences } from "./preferences";
import { speakCharacter, stopCharacterSpeech } from "./speech";
import CharacterControls from "./CharacterControls";
import "./settings.css";
const Stage = lazy(() => import("./Stage"));
class RenderBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="render-error">
        3D 资源无法渲染。请刷新页面并尝试其他 GLB 文件。
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
type Message = {
  role: "user" | "assistant";
  text: string;
  mode?: string;
  model?: string;
  provider?: string;
  choices?: ResourceChoice[];
  choiceToken?: string;
  characterName?: string;
};
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
  const baseCharacter = characters[character];
  const [nav, setNav] = useState(pageFromHash);
  const [pendingSelection, setPendingSelection] =
    useState<PendingSelection | null>(null);
  const [tab, setTab] = useState("对话");
  const [modal, setModal] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(false);
  const [chatRoute, setChatRoute] = useState<{
    mode: string;
    provider?: string;
    model?: string;
  }>({ mode: "loading" });
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      text: "嗨，我是星澜 ✧\n今天也想和你一起，发现这个世界的小小美好。想聊聊天，还是听一段旋律？",
      characterName: "星澜",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tracks, setTracks] = useState(defaultTracks);
  const [track, setTrack] = useState(0);
  const [progress, setProgress] = useState(0);
  const [loop, setLoop] = useState(false);
  const [liked, setLiked] = useState(false);
  const [query, setQuery] = useState("");
  const preferences = usePreferences();
  const light = preferences.theme === "light";
  const voice = preferences.voice;
  const setLight = (v: boolean) =>
    preferences.set({ theme: v ? "light" : "dark" });
  const setVoice = (v: boolean) => preferences.set({ voice: v });
  const [assets, setAssets] = useState<Resource[]>([]);
  const customCharacter = state.modelUrl
    ? assets.find((r) => r.kind === "character" && r.url === state.modelUrl)
    : undefined;
  const c = customCharacter
    ? {
        ...baseCharacter,
        name: customCharacter.name,
        en: "CUSTOM",
        tag: "你的原创伙伴",
      }
    : baseCharacter;
  const [lyrics, setLyrics] = useState<{ at: number; text: string }[]>([]);
  const audio = useRef<HTMLAudioElement | null>(null);
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
  const resources: Resource[] = [
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
      name: ch.name,
      description: ch.tag,
      source: "builtin" as const,
      characterIndex: index,
    })),
    ...worlds.map((w) => ({
      id: `scene-${w.id}`,
      kind: "scene" as const,
      name: w.name,
      description: w.label,
      source: "builtin" as const,
      preset: w.id as World,
    })),
    ...assets.filter((a) => a.kind !== "music"),
  ];
  function command(tool: string, args: Record<string, unknown> = {}) {
    if (socket.current?.readyState === 1)
      socket.current.send(
        JSON.stringify({ type: "command", tool, arguments: args }),
      );
  }
  function playback(value: boolean) {
    set({ playing: value });
    command(value ? "music.play" : "music.pause");
  }
  function useResource(resource: Resource, returnToStage = false) {
    if (resource.kind === "music") {
      const index = tracks.findIndex((t) => t.id === resource.id);
      if (index < 0) return false;
      setTrack(index);
      setProgress(0);
      if (index === track && audio.current) audio.current.currentTime = 0;
      playback(true);
    } else if (resource.kind === "scene") {
      set({
        sceneUrl: resource.url || null,
        ...(resource.preset ? { world: resource.preset } : {}),
      });
      if (resource.preset) command("scene.load", { scene: resource.preset });
    } else
      set({
        character: resource.characterIndex ?? character,
        modelUrl: resource.url || null,
      });
    set({ expression: "happy", expressionIntensity: 0.8 });
    command("character.emote", { emotion: "happy", intensity: 0.8 });
    animate("wave");
    if (returnToStage && resource.kind === "character")
      setMessages((p) => [
        ...p,
        {
          role: "assistant",
          text: `你好，我是${resource.name}。接下来，一起看看这个世界吧。`,
          mode: "resource-agent",
          characterName: resource.name,
        },
      ]);
    if (returnToStage) navigate("创作空间");
    return true;
  }
  async function removeResource(resource: Resource) {
    if (resource.source !== "upload") return;
    if (resource.persistent !== false) {
      try {
        await deleteLocalResource(resource.id);
      } catch {
        toast("本地资源删除失败，请重试");
        return;
      }
    }
    if (resource.kind === "music") {
      const index = tracks.findIndex((t) => t.id === resource.id);
      if (index === track) playback(false);
      const next = tracks.filter((t) => t.id !== resource.id);
      setTracks(next);
      setTrack(
        index < track
          ? track - 1
          : index === track
            ? Math.min(track, next.length - 1)
            : track,
      );
      if (index === track) setProgress(0);
    } else if (resource.kind === "scene" && state.sceneUrl === resource.url)
      set({ sceneUrl: null });
    else if (resource.kind === "character" && state.modelUrl === resource.url)
      set({ modelUrl: null });
    setAssets((p) => p.filter((a) => a.id !== resource.id));
    if (resource.url) URL.revokeObjectURL(resource.url);
    toast("已从本地资源库移除");
  }
  const activeResourceIds = [
    tracks[track].id,
    state.modelUrl
      ? resources.find(
          (r) => r.kind === "character" && r.url === state.modelUrl,
        )?.id
      : `character-${character}`,
    state.sceneUrl
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
              ["music", "scene", "character"].includes(r.kind),
          )
          .map(({ blob, ...r }) => {
            const url = URL.createObjectURL(blob);
            urls.push(url);
            return { ...r, url, persistent: true } as Resource;
          });
        setAssets((previous) => [
          ...previous,
          ...restored.filter((r) => !previous.some((p) => p.id === r.id)),
        ]);
        setTracks((previous) => [
          ...previous,
          ...restored
            .filter(
              (r) => r.kind === "music" && !previous.some((p) => p.id === r.id),
            )
            .map((r) => ({
              id: r.id,
              name: r.name,
              artist: "本地资源库",
              duration: r.duration || 180,
              url: r.url,
              persistent: true,
            })),
        ]);
      })
      .catch(() => {
        if (!cancelled)
          toast("浏览器本地资源库不可用，本次导入将仅保存在会话中");
      });
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);
  function speak(text: string) {
    void speakCharacter(text).catch(() =>
      toast("角色语音播放失败，请检查语音路由或浏览器播放权限"),
    );
  }
  useEffect(() => {
    let disposed = false;
    const refresh = () => {
      void fetch("/api/health")
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then((data) => {
          if (!disposed) setChatRoute(data);
        })
        .catch(() => {
          if (!disposed) setChatRoute({ mode: "offline" });
        });
    };
    refresh();
    window.addEventListener("astraverse:model-settings-saved", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true;
      window.removeEventListener("astraverse:model-settings-saved", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [modal, online]);
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
          const patch = Array.isArray(event.fields)
            ? Object.fromEntries(
                event.fields
                  .filter(
                    (key: string) =>
                      key !== "set" && Object.hasOwn(event.data, key),
                  )
                  .map((key: string) => [key, event.data[key]]),
              )
            : event.data;
          set(patch);
        }
        if (event.type === "speak" && "speechSynthesis" in window) {
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
    if (!playing || tracks[track].url) return;
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
  }, [playing, track, tracks, loop, set]);
  useEffect(() => {
    if (!audio.current) return;
    audio.current.volume = volume / 100;
    audio.current.loop = loop;
    if (playing)
      audio.current.play().catch(() => {
        set({ playing: false });
        toast("音频播放失败，请重新导入文件");
      });
    else audio.current.pause();
  }, [playing, volume, loop, track, set]);
  useEffect(() => {
    if (!playing || tracks[track].url) return;
    const ctx = new AudioContext();
    synth.current = ctx;
    const gain = ctx.createGain();
    synthGain.current = gain;
    gain.gain.value = (volume / 100) * 0.055;
    gain.connect(ctx.destination);
    const frequencies =
      track === 0
        ? [130.81, 196, 261.63, 329.63]
        : track === 1
          ? [146.83, 220, 293.66, 369.99]
          : [110, 164.81, 220, 277.18];
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
    });
    return () => {
      void ctx.close();
      synth.current = null;
      synthGain.current = null;
    };
  }, [playing, track, tracks]);
  useEffect(() => {
    if (synth.current && synthGain.current)
      synthGain.current.gain.setTargetAtTime(
        (volume / 100) * 0.055,
        synth.current.currentTime,
        0.1,
      );
  }, [volume]);
  const animate = (a: Action) => {
    set({ action: a });
    if (socket.current?.readyState === 1)
      socket.current.send(
        JSON.stringify({
          type: "command",
          tool: "character.animate",
          arguments: { animation: a },
        }),
      );
  };
  async function send(text = input, selectionId?: string) {
    if (!text.trim() || busy) return;
    setInput("");
    setMessages((p) => [...p, { role: "user", text }]);
    setBusy(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          character: c.name,
          resources: resources
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
      let applied = true;
      let replyCharacter = c.name;
      const resourceAction = data.resource_action as ResourceAction | undefined;
      if (resourceAction?.type === "resource.use") {
        const resource = resources.find(
          (r) =>
            r.id === resourceAction.resource_id &&
            r.kind === resourceAction.kind,
        );
        applied = !!resource && useResource(resource);
        if (resource?.kind === "character") replyCharacter = resource.name;
        if (!applied) data.reply = "这项资源已经不在当前列表里了，请重新选择。";
      } else if (resourceAction?.type === "music.pause") {
        playback(false);
        animate("idle");
      } else if (resourceAction?.type === "music.resume") {
        playback(true);
        animate("wave");
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
      if (data.mode !== "resource-agent")
        setChatRoute({
          mode: data.mode,
          model: data.model,
          provider: data.provider,
        });
      if (data.action && !resourceAction) animate(data.action);
      if (data.expression && !resourceAction) {
        set({ expression: data.expression });
        command("character.emote", {
          emotion: data.expression,
          intensity: 0.8,
        });
      }
      if (voice && "speechSynthesis" in window) {
        speak(data.reply);
      }
    } catch (error) {
      setMessages((p) => [
        ...p,
        {
          role: "assistant",
          text: online
            ? `对话请求失败：${error instanceof Error ? error.message : "未知错误"}。请检查后端模型配置后重试。`
            : "当前处于本地离线模式。你仍然可以切换场景、播放音乐，或使用下方快捷动作。启动 Python 后端后即可连接对话服务。",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }
  function upload(kind: string) {
    uploadKind.current = kind;
    if (file.current) {
      file.current.accept =
        kind === "music" ? "audio/*" : kind === "lyrics" ? ".lrc" : ".glb";
      file.current.click();
    }
  }
  async function imported(f: File | undefined) {
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) {
      toast("文件不能超过 50 MB");
      return;
    }
    const kind = uploadKind.current;
    if (kind === "lyrics") {
      const content = await f.text();
      const parsed = content.split("\n").flatMap((line) => {
        const m = line.match(/\[(\d+):(\d+(?:\.\d+)?)\](.+)/);
        return m ? [{ at: Number(m[1]) * 60 + Number(m[2]), text: m[3] }] : [];
      });
      if (!parsed.length) {
        toast("未找到有效 LRC 时间戳");
        return;
      }
      setLyrics(parsed.sort((a, b) => a.at - b.at));
      toast("同步歌词已导入");
      return;
    }
    if (kind !== "music" && !f.name.toLowerCase().endsWith(".glb")) {
      toast("MVP 支持单文件 GLB；GLTF/VRM 将在后续适配");
      return;
    }
    if (kind === "music" && !f.type.startsWith("audio/")) {
      toast("请选择有效的音频文件");
      return;
    }
    const url = URL.createObjectURL(f);
    const id = `upload-${crypto.randomUUID()}`;
    let persistent = true;
    const resource: Resource = {
      id,
      name: f.name.replace(/\.[^.]+$/, ""),
      kind: kind as ResourceKind,
      url,
      source: "upload",
      description: "本地资源库",
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
      setTrack(tracks.length);
      setProgress(0);
    } else set(kind === "character" ? { modelUrl: url } : { sceneUrl: url });
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
      className={`app ${light ? "light" : ""} ${preferences.focusMode ? "focus-mode" : ""}`}
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
          <div className="inspiration">
            <span>✧ 让灵感，自由生长</span>
            <p>
              你的下一段奇遇
              <br />
              从这里开始。
            </p>
            <button
              onClick={() => {
                setWorldRandom();
                toast("已为你开启一段新的奇遇");
              }}
            >
              探索新世界 <ArrowRight size={14} />
            </button>
            <div className="orbit-decoration">✧</div>
          </div>
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
            <button aria-label="切换主题" onClick={() => setLight(!light)}>
              <Sun size={17} />
            </button>
            <div className="tiny-avatar">Y</div>
          </div>
        </header>
        <main hidden={nav !== "创作空间"}>
          <section className="page-heading">
            <div className="eyebrow">YOUR PERSONAL UNIVERSE</div>
            <div className="heading-row">
              <div>
                <h1>
                  和{c.name}，共度此刻。<span> ✧</span>
                </h1>
                <p>聊聊今天，听一段旋律，让时间慢一点。</p>
              </div>
              <div className="heading-tools">
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
          <div className="studio-grid">
            <section className="stage-panel" ref={stage}>
              <div className="stage-top">
                <div className="stage-title">
                  <span className="live-dot" />
                  互动空间 <span className="tag">LIVE 3D</span>
                </div>
                <button
                  className="glass-button"
                  onClick={() => navigate("场景世界")}
                >
                  <Globe2 size={14} />
                  {worlds.find((w) => w.id === world)?.name}
                  <ChevronDown size={12} />
                </button>
              </div>
              <div className="canvas-wrap">
                <RenderBoundary>
                  <Suspense
                    fallback={<div className="loading">正在展开你的宇宙…</div>}
                  >
                    <Stage active={nav === "创作空间"} />
                  </Suspense>
                </RenderBoundary>
              </div>
              <div className="stage-caption">
                <span>THE SPACE BETWEEN THE STARS</span>
                <strong>
                  {world === "lunar"
                    ? "在星光里，听见彼此。"
                    : world === "aurora"
                      ? "沿着极光，遇见新的自己。"
                      : "把今天，留在温柔的晚霞里。"}
                </strong>
              </div>
              <div className="stage-side">
                <button
                  title="恢复角色位置"
                  onClick={() => set({ position: [0, 0, 0], action: "idle" })}
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
                      void document.exitFullscreen();
                    else void stage.current?.requestFullscreen();
                  }}
                >
                  <Expand size={16} />
                </button>
              </div>
              <div className="character-badge">
                <span className="mini-portrait" style={{ background: c.color }}>
                  ✦
                </span>
                <div>
                  {c.name}
                  <span> {c.en}</span>
                  <small>
                    <i />
                    陪伴模式 ·{" "}
                    {action === "idle"
                      ? "待机中"
                      : action === "dance"
                        ? "舞蹈中"
                        : action === "wave"
                          ? "挥手中"
                          : "跳跃中"}
                  </small>
                </div>
                <button
                  aria-label="切换角色"
                  onClick={() => navigate("虚拟角色")}
                >
                  <ChevronDown size={14} />
                </button>
              </div>
              <div className="stage-action-dock">
                <button onClick={() => animate("wave")}>
                  <Heart size={14} />
                  打个招呼
                </button>
                <button
                  onClick={() => {
                    set({ expression: "happy" });
                    void fetch("/api/tools/execute", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        tool: "character.emote",
                        arguments: { emotion: "happy", intensity: 0.8 },
                      }),
                    }).catch(() => {});
                  }}
                >
                  <Sparkles size={14} />
                  笑一个
                </button>
                <button onClick={() => setModal("角色表现控制")}>
                  <SlidersHorizontal size={14} />
                  角色控制
                </button>
              </div>
              <div className="stage-hint">
                拖动旋转视角 <span>·</span> 滚轮缩放 <span>·</span> WASD 移动
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
                      ✧
                    </div>
                    <strong>
                      {c.name} <span>{c.en}</span>
                    </strong>
                    <p>{c.tag}</p>
                    <span className="companion-status">
                      <i />
                      在线，随时陪伴你
                    </span>
                  </div>
                  <div className="chat-messages">
                    <div className="chat-date">今天 · 一段新的旅程</div>
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
                          {!!m.choices?.length && (
                            <div className="chat-resource-choices">
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
                    <div className="suggestions">
                      <button onClick={() => void send("给我跳一支舞吧")}>
                        跳一支舞 ♡
                      </button>
                      <button onClick={() => void send("今天的你心情怎么样？")}>
                        聊聊今天
                      </button>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void send();
                      }}
                    >
                      <input
                        aria-label="聊天消息"
                        placeholder={`和${c.name}说点什么…`}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                      />
                      <button
                        title="角色语音开关"
                        type="button"
                        className={voice ? "accent" : ""}
                        onClick={() => {
                          setVoice(!voice);
                          if (voice) stopCharacterSpeech();
                          toast(
                            voice
                              ? "语音播报已关闭"
                              : "已开启角色语音：优先使用语音模型路由",
                          );
                        }}
                      >
                        <Mic size={16} />
                      </button>
                      <button
                        className="send"
                        aria-label="发送消息"
                        disabled={busy || !input.trim()}
                      >
                        <Send size={15} />
                      </button>
                    </form>
                    <p>
                      <span>✧</span>{" "}
                      <button
                        type="button"
                        className={`chat-model-status ${chatRoute.mode === "llm" ? "model-ready" : ""}`}
                        onClick={() => setModal("AI 模型与语音")}
                        title={chatRoute.provider || "配置角色聊天模型"}
                      >
                        {!online
                          ? "后端未连接"
                          : chatRoute.mode === "llm"
                            ? `聊天模型：${chatRoute.model}`
                            : chatRoute.mode === "unavailable"
                              ? "聊天供应商已停用 · 查看设置"
                              : chatRoute.mode === "loading"
                                ? "正在读取聊天模型…"
                                : "本地规则助手 · 配置聊天模型"}
                      </button>{" "}
                      <span className="keyboard">↵ 发送</span>
                    </p>
                  </div>
                </>
              ) : (
                <div className="character-detail">
                  <div className="character-orb">✧</div>
                  <h2>{c.name}</h2>
                  <p>{c.desc}</p>
                  <button
                    className="secondary"
                    onClick={() => setModal("角色表现控制")}
                  >
                    <SlidersHorizontal size={14} />
                    表情与肢体控制
                  </button>
                  <label>角色性格</label>
                  <div className="pills">
                    <span>温柔</span>
                    <span>好奇</span>
                    <span>富有想象力</span>
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
                    导入 GLB 角色
                  </button>
                </div>
              )}
            </aside>
          </div>
          <section className="quick-actions">
            <div>
              <span className="section-kicker">一点灵感，无限可能</span>
              <h2>此刻，想做些什么？</h2>
            </div>
            <div className="action-buttons">
              {[
                {
                  icon: MessageCircle,
                  name: "聊聊天",
                  sub: "分享此刻的心情",
                  click: () => {
                    setTab("对话");
                    document
                      .querySelector<HTMLInputElement>(".chat-compose input")
                      ?.focus();
                  },
                },
                {
                  icon: Music2,
                  name: "听一首歌",
                  sub: "让旋律填满空间",
                  click: () => playback(!playing),
                },
                {
                  icon: Sparkles,
                  name: "来支舞吧",
                  sub: "跟随节奏，自由表达",
                  click: () => animate(action === "dance" ? "idle" : "dance"),
                },
                {
                  icon: Compass,
                  name: "探索世界",
                  sub: "下一站，未知的惊喜",
                  click: () => navigate("场景世界"),
                },
              ].map((a) => (
                <button key={a.name} onClick={a.click}>
                  <span className="action-icon">
                    <a.icon size={21} />
                  </span>
                  <span>
                    <strong>{a.name}</strong>
                    <small>{a.sub}</small>
                  </span>
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
          </section>
          <section className="world-section">
            <div className="section-title">
              <h2>
                为你推荐的世界 <span>FIND YOUR NEXT ESCAPE</span>
              </h2>
              <button onClick={() => navigate("场景世界")}>
                探索全部 <ArrowRight size={14} />
              </button>
            </div>
            <div className="world-cards">
              {worlds.map((w, i) => (
                <button
                  className={`world-card ${w.class} ${world === w.id ? "current" : ""}`}
                  key={w.id}
                  onClick={() => {
                    set({ world: w.id as World });
                    toast(`已进入${w.name}`);
                  }}
                >
                  <div className="landscape">
                    <div className="landscape-sun" />
                    <div className="mountain back" />
                    <div className="mountain front" />
                    <div className="landscape-grid" />
                    <span className="world-type">
                      <Box size={11} />
                      3D WORLD
                    </span>
                    <span className="world-card-action">
                      {world === w.id ? (
                        <Check size={15} />
                      ) : (
                        <ArrowRight size={15} />
                      )}
                    </span>
                    <div className="scene-art">
                      {i === 0 ? "☾" : i === 1 ? "✧" : "◒"}
                    </div>
                  </div>
                  <div className="world-info">
                    <div>
                      <h3>{w.name}</h3>
                      <p>{w.label}</p>
                    </div>
                    <span>{i === 0 ? "精选" : i === 1 ? "治愈" : "氛围"}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
          <footer>
            <span>
              <Sparkles size={12} /> 每一个宇宙，都始于你的想象。
            </span>
            <span>AstraVerse · A space to be you.</span>
          </footer>
        </main>
        {nav !== "创作空间" && (
          <ResourcePage
            key={nav}
            page={nav}
            resources={resources}
            activeIds={activeResourceIds}
            playing={playing}
            onUse={(r) => useResource(r, r.kind !== "music")}
            onRemove={removeResource}
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
          {tracks[track].url && (
            <audio
              key={tracks[track].url}
              ref={audio}
              src={tracks[track].url}
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                setTracks((p) =>
                  p.map((t, i) => (i === track ? { ...t, duration: d } : t)),
                );
              }}
              onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
              onEnded={() => {
                if (!loop) set({ playing: false });
              }}
            />
          )}
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
            className={`modal ${modal === "AI 模型与语音" || modal === "设置" ? "settings-modal" : ""}`}
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
            {modal === "AI 模型与语音" || modal === "设置" ? (
              <SettingsCenter
                initialTab={modal === "AI 模型与语音" ? "providers" : "general"}
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
