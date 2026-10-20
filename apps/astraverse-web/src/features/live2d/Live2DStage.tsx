import { useCharacterCapabilities } from "@/shared/state/characterCapabilities";
import { useLive2DControl } from "@/features/live2d/live2dControl";
import { useEffect, useRef, useState } from "react";
import { Application, Container, Ticker } from "pixi.js";
import type { Live2DModel } from "pixi-live2d-display/lib/cubism4";
import { loadCubismCore, saveCubismCore } from "@/features/live2d/cubismRuntime";
import { openLive2DPackage } from "@/features/live2d/live2dPackage";
import { useWorld } from "@/shared/state/workspaceStore";
import { usePreferences, useReducedMotion } from "@/shared/preferences/preferences";
import { usePerformance } from "@/features/stage/performance";
import { speechMotion } from "@/features/chat/speech";
import { musicMotion } from "@/features/music/musicMotion";

type Core = {
  getParameterIndex(id: string): number;
  getParameterCount(): number;
  getParameterMinimumValue(index: number): number;
  getParameterMaximumValue(index: number): number;
  getParameterValueByIndex(index: number): number;
  getParameterDefaultValue(index: number): number;
  setParameterValueByIndex(index: number, value: number): void;
};
export default function Live2DStage({ url, active }: { url: string; active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [fullscreenZoom, setFullscreenZoom] = useState(1.35);
  const fitRef = useRef<(() => void) | null>(null);
  const displayZoom = fullscreen ? fullscreenZoom : zoom;
  const zoomRef = useRef(displayZoom);
  zoomRef.current = displayZoom;
  useEffect(() => {
    const update = () => setFullscreen(!!document.fullscreenElement?.contains(host.current));
    document.addEventListener("fullscreenchange", update);
    update();
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  useEffect(() => { fitRef.current?.(); }, [displayZoom]);
  const [phase, setPhase] = useState("准备加载");
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [aiStatus, setAIStatus] = useState("等待 Agent 指令");
  const [motions, setMotions] = useState<string[]>([]);
  const [expressions, setExpressions] = useState<string[]>([]);
  const modelRef = useRef<Live2DModel | null>(null);
  const reduced = useReducedMotion();
  const flags = useRef({ active, reduced });
  flags.current = { active, reduced };
  useEffect(() => {
    let disposed = false;
    let app: Application | undefined;
    let model: Live2DModel | undefined;
    let observer: ResizeObserver | undefined;
    let disposePackage: (() => void) | undefined;
    const modelKey = crypto.randomUUID();
    useLive2DControl.setState({ capabilities: null });
    setAIStatus("正在识别模型能力");
    let parameterIds = ["ParamAngleX", "ParamAngleY", "ParamAngleZ", "ParamBodyAngleX", "ParamBodyAngleY", "ParamBodyAngleZ", "ParamEyeLOpen", "ParamEyeROpen", "ParamEyeBallX", "ParamEyeBallY", "ParamMouthForm", "ParamMouthOpenY", "ParamBrowLY", "ParamBrowRY", "ParamCheek", "ParamBreath"];
    const disposeModel = () => {
      const current = model;
      model = undefined;
      if (!current) return;
      try {
        if (current.internalModel) current.destroy({ texture: true, baseTexture: true });
        else {
          // This adapter's destroy() assumes internalModel already exists.
          // Cancel pending XHRs via its destroy event before disposing the container.
          current.emit("destroy");
          current.autoUpdate = false;
          Container.prototype.destroy.call(current, { children: true });
        }
      } catch (error) { console.warn("Live2D 清理加载实例失败", error); }
    };
    const target = host.current!;
    setReady(false); setError(""); setMotions([]); setExpressions([]);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const progress = (label: string) => {
      setPhase(label); clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (disposed) return;
        disposed = true; app?.stop();
        if (!app) { disposeModel(); disposePackage?.(); disposePackage = undefined; }
        setError(`${label}超时。请检查 Core、模型引用文件及模型版本，然后重试。`);
      }, 45000);
    };
    void (async () => {
      progress("加载 Cubism Core");
      await loadCubismCore();
      if (disposed) return;
      progress("加载 Live2D 渲染模块");
      const { Live2DModel, Cubism4ModelSettings, config } = await import("pixi-live2d-display/lib/cubism4");
      // Also cover direct model3.json imports: motion audio must never bypass our player.
      config.sound = false;
      Live2DModel.registerTicker(Ticker);
      if (disposed) return;
      let source: object | string = url;
      if (url.endsWith("#live2d")) {
        progress("解包模型与贴图");
        const response = await fetch(url);
        if (!response.ok) throw new Error("模型包读取失败");
        const pack = await openLive2DPackage(await response.blob());
        disposePackage = pack.dispose;
        if (pack.settings.FileReferences.DisplayInfo) {
          try {
            const info = await (await fetch(pack.settings.FileReferences.DisplayInfo)).json();
            if (Array.isArray(info.Parameters)) parameterIds = [...new Set([...parameterIds, ...info.Parameters.flatMap((item: { Id?: unknown }) => typeof item.Id === "string" ? [item.Id] : [])])].slice(0, 64);
          } catch { /* Standard parameters still work without display metadata. */ }
        }
        // Object settings need a base URL even when every asset is an absolute blob URL.
        const settings = new Cubism4ModelSettings({
          ...pack.settings,
          url: new URL("/live2d.model3.json", location.href).href,
        });
        // Legacy url.resolve corrupts blob:http:// into blob:http//.
        // Pack assets are already absolute object URLs; keep them byte-for-byte.
        settings.resolveURL = (path: string) => path.startsWith("blob:")
          ? path
          : new URL(path, settings.url).href;
        source = settings;
      }
      if (disposed) { disposePackage?.(); return; }
      progress("创建模型、加载纹理和动作");
      // `from` waits for optional physics/pose too. Render at `ready` instead,
      // and retain the loading instance so cancellation can abort its requests.
      model = await new Promise<Live2DModel>((resolve, reject) => {
        let essentialsReady = false;
        const pending = Live2DModel.fromSync(source, {
          autoUpdate: false,
          autoInteract: false,
          onError: error => {
            if (!essentialsReady) reject(error);
            else console.warn("Live2D 可选资源加载失败", error);
          },
        });
        model = pending;
        pending.once("modelLoaded", () => { if (!disposed) progress("骨架已就绪，等待贴图"); });
        pending.once("textureLoaded", () => { if (!disposed) progress("贴图已就绪，准备角色"); });
        pending.once("ready", () => { essentialsReady = true; resolve(pending); });
      });
      if (disposed) { disposeModel(); disposePackage?.(); return; }
      modelRef.current = model;
      app = new Application({ transparent: true, antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
      const render = app.renderer.render.bind(app.renderer);
      app.renderer.render = (...args: Parameters<typeof render>) => {
        try { render(...args); }
        catch (reason) {
          app?.stop();
          setReady(false);
          setError(`渲染失败：${reason instanceof Error ? reason.message : String(reason)}`);
        }
      };
      target.appendChild(app.view as HTMLCanvasElement);
      app.stage.addChild(model);
      model.anchor.set(0.5, 1);
      const originalWidth = model.internalModel.width, originalHeight = model.internalModel.height;
      if (!(originalWidth > 0 && originalHeight > 0)) throw new Error("模型画布尺寸无效，无法显示");
      const fit = () => {
        if (!app || !model) return;
        const width = target.clientWidth, height = target.clientHeight;
        if (width < 1 || height < 1) return;
        app.renderer.resize(width, height);
        const baseScale = Math.min(width * 0.82 / originalWidth, height * 0.92 / originalHeight);
        const scale = baseScale * zoomRef.current;
        model.scale.set(scale);
        // Keep the top of the model visible when zooming; crop the lower body first.
        const top = height * 0.97 - originalHeight * baseScale;
        model.position.set(width / 2, top + originalHeight * scale);
      };
      fitRef.current = fit;
      observer = new ResizeObserver(fit); observer.observe(target); fit();
      const core = model.internalModel.coreModel as unknown as Core;
      const indices = new Map<string, number>();
      const parameter = (id: string, value: number, weight = 1) => {
        let index = indices.get(id);
        if (index === undefined) { index = core.getParameterIndex(id); indices.set(id, index); }
        if (index < 0 || index >= core.getParameterCount()) return;
        const clamped = Math.max(core.getParameterMinimumValue(index), Math.min(core.getParameterMaximumValue(index), value));
        core.setParameterValueByIndex(index, core.getParameterValueByIndex(index) * (1 - weight) + clamped * weight);
      };
      const groups = Object.keys(model.internalModel.motionManager.definitions);
      setMotions(groups);
      const definitions = model.internalModel.motionManager.expressionManager?.definitions || [];
      const expressionNames = definitions.map((item, i) => (item as { Name?: string }).Name || String(i));
      setExpressions(expressionNames);
      const emotionPatterns = { happy: /happy|smile|笑|喜/i, sad: /sad|cry|悲|泣/i, surprised: /surpris|shock|惊/i, relaxed: /relax|calm|柔/i };
      useCharacterCapabilities.setState({ current: { url, canWalk: false, canPosture: false, expressions: ["neutral", ...((Object.keys(emotionPatterns) as (keyof typeof emotionPatterns)[]).filter(emotion => expressionNames.some(name => emotionPatterns[emotion].test(name))))] } });
      const supported = parameterIds.filter(id => {
        const index = core.getParameterIndex(id);
        return index >= 0 && index < core.getParameterCount();
      });
      useLive2DControl.setState({ capabilities: { model_key: modelKey, modelUrl: url, motions: groups.slice(0,64), expressions: expressionNames.slice(0,64), parameters: supported } });
      setAIStatus(`Agent 可控制 ${supported.length} 个参数 · ${groups.length} 个动作组`);
      let lastAIStart = -1, hadControl = false, hadAIExpression = false;
      let nativeUntil = 0, nativeBlend = 0, rhythmBlend = 0, lastFrame = performance.now();
      const directedMotion = (group: string, priority: number, duration = 6) => {
        nativeUntil = performance.now() + duration * 1000;
        return model!.motion(group, undefined, priority);
      };
      let time = 0, beat = 0, lastAction = "", lastExpression = "", lastDanceMotion = -20;
      const pointer = { x: 0, y: 0 };
      const move = (event: PointerEvent) => {
        const box = target.getBoundingClientRect();
        pointer.x = (event.clientX - box.left) / box.width * 2 - 1;
        pointer.y = (event.clientY - box.top) / box.height * 2 - 1;
      };
      target.onpointermove = move;
      target.onpointerleave = () => { pointer.x = 0; pointer.y = 0; };
      model.internalModel.on("beforeModelUpdate", () => {
        const s = useWorld.getState(), p = usePerformance.getState(), prefs = usePreferences.getState();
        const moving = !flags.current.reduced;
        const automatic = performance.now() >= p.manualUntil;
        const age = (performance.now() - p.started) / 1000;
        const cue = (automatic || p.source === "manual-preview") && prefs.autoExpression && p.phase === "reply" && p.cue && age < p.cue.duration + 2 ? p.cue : null;
        const control = cue?.live2d?.model_key === modelKey ? cue.live2d : undefined;
        if (!control && hadControl) {
          hadControl = false;
          setAIStatus("Agent 自然待机 · 等待下一次交流");
          if (hadAIExpression) {
            model!.internalModel.motionManager.expressionManager?.resetExpression();
            lastExpression = "";
            hadAIExpression = false;
          }
        }
        if (control) hadControl = true;
        if (control && p.started !== lastAIStart) {
          lastAIStart = p.started;
          const labels: string[] = [];
          if (control.motion && groups.includes(control.motion) && moving) {
            labels.push(control.motion);
            void directedMotion(control.motion, 3, cue!.duration).catch(() => setAIStatus("Agent 动作文件加载失败"));
          }
          if (control.expression && expressionNames.includes(control.expression)) {
            hadAIExpression = true;
            labels.push(control.expression);
            void model!.expression(expressionNames.indexOf(control.expression)).catch(() => setAIStatus("Agent 表情文件加载失败"));
          }
          if (control.blink && control.blink !== "none") labels.push("眨眼");
          if (control.look && control.look !== "user" && control.look !== "none") labels.push("视线回应");
          if (control.parameters.length) labels.push(`${control.parameters.length} 个参数`);
          setAIStatus(labels.length ? `Agent 正在表现：${labels.join(" · ")}` : "Agent 自然回应中");
        }
        const emotion = cue?.emotion || s.expression;
        const intensity = cue?.intensity ?? s.expressionIntensity;
        const now = performance.now(), dt = Math.min(0.1, (now - lastFrame) / 1000);
        lastFrame = now;
        // Authored performances own the body; procedural idle/music fades underneath.
        nativeBlend += ((now < nativeUntil ? 1 : 0) - nativeBlend) * (1 - Math.exp(-dt * 12));
        const bodyWeight = 1 - nativeBlend;
        const dancing = moving && s.action === "dance";
        const rhythmTarget = dancing ? Math.sin(beat * Math.PI) * (prefs.danceStrength ?? 1) : moving && prefs.musicMotion && musicMotion.playing ? Math.sin(musicMotion.phase / 2) * musicMotion.energy * prefs.motionStrength : 0;
        rhythmBlend += (rhythmTarget - rhythmBlend) * (1 - Math.exp(-dt * 7));
        const rhythm = rhythmBlend;
        if (moving) {
          parameter("ParamAngleX", s.pose.headYaw + (s.gazeTracking ? pointer.x * 18 : 0), 0.8 * bodyWeight);
          parameter("ParamAngleY", -s.pose.headPitch - (s.gazeTracking ? pointer.y * 12 : 0) + (cue?.gesture === "nod" ? Math.sin(age * 6) * 6 : 0), 0.8 * bodyWeight);
          parameter("ParamAngleZ", rhythm * 8 + (emotion === "curious" ? 9 * intensity : 0), 0.65 * bodyWeight);
          parameter("ParamBodyAngleZ", s.pose.bodyLean + rhythm * 7, 0.65 * bodyWeight);
          parameter("ParamBodyAngleX", rhythm * 9, 0.65 * bodyWeight);
          parameter("ParamEyeBallX", s.gazeTracking ? pointer.x * 0.7 : 0);
          parameter("ParamEyeBallY", s.gazeTracking ? -pointer.y * 0.6 : 0);
          if (s.naturalMotion) parameter("ParamBreath", (Math.sin(time * 1.7) + 1) / 2 * s.breath, 0.7);
        }
        const winkAge = p.wink ? (performance.now() - p.wink.started) / 1000 : 9;
        if (winkAge < 0.65) parameter(p.wink?.side === "left" ? "ParamEyeLOpen" : "ParamEyeROpen", 1 - Math.sin(Math.PI * winkAge / 0.65));
        parameter("ParamMouthOpenY", s.speaking ? speechMotion.measured ? speechMotion.energy : Math.abs(Math.sin(time * 12)) * 0.4 : 0, 0.9);
        parameter("ParamMouthForm", emotion === "happy" ? intensity : emotion === "sad" ? -intensity : dancing ? 0.35 : 0, 0.8);
        if (emotion === "sad") { parameter("ParamBrowLY", -intensity * 0.7, 0.8); parameter("ParamBrowRY", -intensity * 0.7, 0.8); }
        if (emotion === "surprised" || emotion === "curious") { parameter("ParamBrowLY", intensity * 0.7, 0.8); parameter("ParamBrowRY", intensity * 0.7, 0.8); }
        if (lastAction !== s.action && !control?.motion) {
          lastAction = s.action;
          const pattern = s.action === "dance" ? /dance|舞/i : s.action === "wave" ? /wave|greet|tapbody|tap_body/i : /idle/i;
          const group = groups.find(name => pattern.test(name));
          if (group && moving && s.action !== "idle") void directedMotion(group, 3).catch(() => {});
        }
        if (dancing && !control?.motion && time - lastDanceMotion > 10) {
          const group = groups.find(name => /dance|舞/i.test(name));
          if (group) void directedMotion(group, 2, 9).catch(() => {});
          lastDanceMotion = time;
        }
        if (lastExpression !== emotion && !control?.expression) {
          lastExpression = emotion;
          const patterns: Record<string, RegExp> = { happy: /happy|smile|笑|喜/i, sad: /sad|cry|悲|泣/i, surprised: /surpris|shock|惊/i, relaxed: /relax|calm|柔/i };
          const index = definitions.findIndex(item => patterns[emotion]?.test((item as { Name?: string }).Name || ""));
          if (index >= 0) void model!.expression(index).catch(() => {});
          else model!.internalModel.motionManager.expressionManager?.resetExpression();
        }
        if (control) {
          const envelope = Math.min(1, age / 0.4) * Math.max(0, Math.min(1, (cue!.duration + 2 - age) / 1.5));
          const look = control.look;
          if (look && look !== "user" && look !== "none") {
            parameter("ParamEyeBallX", look === "left" ? -0.7 : look === "right" ? 0.7 : 0, envelope);
            parameter("ParamEyeBallY", look === "up" ? 0.6 : look === "down" ? -0.6 : 0, envelope);
          }
          for (const item of control.parameters) {
            if (!supported.includes(item.id) || (s.speaking && item.id === "ParamMouthOpenY")) continue;
            if (!moving && !/^Param(Eye|Mouth|Brow|Cheek)/.test(item.id)) continue;
            const index = core.getParameterIndex(item.id), base = core.getParameterDefaultValue(index);
            const limit = item.value >= 0 ? core.getParameterMaximumValue(index) : core.getParameterMinimumValue(index);
            parameter(item.id, base + Math.abs(item.value) * (limit - base), envelope * 0.8);
          }
          if (control.blink && control.blink !== "none" && age < 0.8) {
            const open = 1 - Math.sin(Math.PI * age / 0.8);
            if (control.blink !== "right") parameter("ParamEyeLOpen", open);
            if (control.blink !== "left") parameter("ParamEyeROpen", open);
          }
        }
      });
      app.ticker.add(() => {
        if (!flags.current.active || !model) return;
        const dt = Math.min(app!.ticker.deltaMS, 50);
        time += dt / 1000;
        beat += dt / 1000 * (musicMotion.measured && musicMotion.playing ? musicMotion.bpm : 92) / 60;
        model.update(flags.current.reduced ? 0 : dt);
      });
      clearTimeout(timeout);
      setPhase("模型已加载");
      setReady(true);
    })().catch(reason => {
      clearTimeout(timeout);
      if (!app) { disposeModel(); disposePackage?.(); disposePackage = undefined; }
      if (!disposed) setError(reason instanceof Error ? reason.message : "Live2D 加载失败");
    });
    return () => {
      disposed = true; clearTimeout(timeout); modelRef.current = null;
      if (useLive2DControl.getState().capabilities?.model_key === modelKey) useLive2DControl.setState({ capabilities: null });
      if (useCharacterCapabilities.getState().current?.url === url) useCharacterCapabilities.setState({ current: null });
      fitRef.current = null;
      observer?.disconnect(); target.onpointermove = null; target.onpointerleave = null;
      app?.destroy(true, { children: true, texture: true, baseTexture: true });
      if (!app) disposeModel();
      else model = undefined;
      disposePackage?.();
    };
  }, [url, revision]);
  return <div className="live2d-stage">
    <div ref={host} className="live2d-canvas" />
    {(!ready || error) && <div className="live2d-status"><strong>{error || `${phase}…`}</strong>
      {error && <><small>失败阶段：{phase}</small><p>从官方 Cubism SDK 的 Core 文件夹获取运行库。导入的是 JavaScript，请仅使用官方文件。</p><a href="https://www.live2d.com/en/sdk/download/web/" target="_blank" rel="noreferrer">下载官方 SDK</a><label className="live2d-import">导入 Cubism Core<input type="file" accept=".js" onChange={event => {
        const file = event.target.files?.[0]; if (!file) return;
        void saveCubismCore(file).then(() => setRevision(value => value + 1)).catch(reason => setError(String(reason.message)));
      }} /></label><button onClick={() => setRevision(value => value + 1)}>重试加载</button></>}
    </div>}
    {ready && <label className="live2d-zoom">人物大小
      <input aria-label="Live2D 人物大小" type="range" min="0.75" max="2" step="0.05" value={displayZoom}
        onChange={event => (fullscreen ? setFullscreenZoom : setZoom)(Number(event.target.value))} />
      <output>{Math.round(displayZoom * 100)}%</output>
    </label>}
    {ready && <details className="live2d-actions"><summary aria-label="展开角色动作面板">角色动作</summary><p role="status">{aiStatus}</p><p>{motions.some(name => /dance|舞/i.test(name)) ? "已检测到舞蹈动作组" : "模型未提供舞蹈动作组，音乐采用参数律动"}</p>
      <div>{motions.map(name => <button key={name} onClick={() => { void modelRef.current?.motion(name, undefined, 3).catch(() => setError("动作加载失败，请检查模型包")); }}>{name}</button>)}</div>
      <div>{expressions.map((name, index) => <button key={index} onClick={() => { void modelRef.current?.expression(index).catch(() => setError("表情加载失败")); }}>{name}</button>)}</div>
    </details>}
  </div>;
}
