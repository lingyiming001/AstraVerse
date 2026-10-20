import { characterCommand } from "./controlCommands";
import { interactFurniture } from "@/features/scenes/interactFurniture";
import { useCharacterCapabilities } from "@/shared/state/characterCapabilities";
import { isLive2D, saveCubismCore } from "@/features/live2d/cubismRuntime";
import { useEffect, useRef, useState } from "react";
import { Activity, Eye, RotateCcw, Smile, Sparkles } from "lucide-react";
import { usePreferences } from "@/shared/preferences/preferences";
import { pauseAutomaticPerformance, respond, usePerformance } from "@/features/stage/performance";
import { neutralPose, useWorld, type Expression, type Pose } from "@/shared/state/workspaceStore";
const expressions: { id: Expression; name: string; face: string }[] = [
  { id: "neutral", name: "自然", face: "◡" },
  { id: "happy", name: "开心", face: "☺" },
  { id: "curious", name: "好奇", face: "⌕" },
  { id: "sad", name: "低落", face: "⌢" },
  { id: "surprised", name: "惊讶", face: "○" },
  { id: "relaxed", name: "放松", face: "⌣" },
];
const joints: { id: keyof Pose; name: string; min: number; max: number }[] = [
  { id: "headYaw", name: "头部左右", min: -60, max: 60 },
  { id: "headPitch", name: "头部俯仰", min: -35, max: 35 },
  { id: "leftArm", name: "左肩抬起", min: -120, max: 120 },
  { id: "rightArm", name: "右肩抬起", min: -120, max: 120 },
  { id: "leftElbow", name: "左肘弯曲", min: 0, max: 140 },
  { id: "rightElbow", name: "右肘弯曲", min: 0, max: 140 },
  { id: "leftLeg", name: "左腿摆动", min: -40, max: 40 },
  { id: "rightLeg", name: "右腿摆动", min: -40, max: 40 },
  { id: "bodyLean", name: "身体倾斜", min: -20, max: 20 },
];
export default function CharacterControls() {
  const s = useWorld();
  const canPosture = useCharacterCapabilities(s => s.current?.canPosture ?? false);
  const live2d = isLive2D(s.modelUrl);
  const preferences = usePreferences();
  const [status, setStatus] = useState("操作会实时显示在舞台中");
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(()=>()=>{Object.values(timers.current).forEach(clearTimeout);timers.current={};},[s.actorId]);
  function sync(tool: string, args: Record<string, unknown>) {
    if (timers.current[tool]) clearTimeout(timers.current[tool]);
    const actorId=s.actorId;
    timers.current[tool] = setTimeout(() => {
      void characterCommand(tool, args, actorId)
        .then(() => setStatus("已同步到角色控制服务"))
        .catch(() => setStatus("离线调整中 · 后端连接后可同步"));
    }, 180);
  }
  function expression(id: Expression, intensity = s.expressionIntensity) {
    pauseAutomaticPerformance();
    s.set({ expression: id, expressionIntensity: intensity });
    sync("character.emote", { emotion: id, intensity });
  }
  function pose(value: Pose) {
    pauseAutomaticPerformance();
    s.set({ pose: value, action: "idle" });
    sync("character.pose", { ...value });
  }
  function presence(
    value: Partial<{
      naturalMotion: boolean;
      gazeTracking: boolean;
      breath: number;
    }>,
  ) {
    const config = {
      naturalMotion: s.naturalMotion,
      gazeTracking: s.gazeTracking,
      breath: s.breath,
      ...value,
    };
    s.set(config);
    sync("character.presence", config);
  }
  return (
    <div className="character-controls">
      <div className="settings-intro">
        <div>
          <span className="settings-eyebrow">CHARACTER PRESENCE</span>
          <h3>让每个细微动作，都有温度。</h3>
          <p>表情、姿态与自然律动，即刻呈现在舞台。</p>
        </div>
        <span className="settings-icon">
          <Sparkles size={22} />
        </span>
      </div>
      <div className="settings-alert">
        <strong>Live2D / Cubism</strong><p>在角色库导入 ZIP（含一个 .model3.json、moc3、贴图和动作）。现有 VRM 保持 3D 渲染。Live2D 的动作和表情取决于模型制作。</p>
        <a href="https://www.live2d.com/en/sdk/download/web/" target="_blank" rel="noreferrer">下载官方 SDK</a>
        <label className="live2d-import">导入官方 Core<input type="file" accept=".js" onChange={event => {
          const file = event.target.files?.[0]; if (!file) return;
          void saveCubismCore(file).then(() => setStatus("Core 已保存，请刷新页面或在舞台重试加载")).catch(error => setStatus(error.message));
        }} /></label>
        <small>仅导入官方 live2dcubismcore.min.js；使用前请阅读官网协议。</small>
      </div>
      {s.modelUrl && (
        <div className="settings-alert">
          {live2d ? "Live2D 支持标准头部、身体倾斜和面部参数；手臂、舞蹈和其他表情请使用舞台中的模型动作列表，具体效果取决于模型绑定。" : "VRM 角色支持骨骼、眨眼、表情与语音口型；具体表情取决于模型预设。静态 GLB 支持整体转向与位移。"}
        </div>
      )}
      <div className="pose-presets">
        <button onClick={() => {
          const action = s.action === "dance" ? "idle" : "dance";
          s.set({ action, pose: { ...neutralPose }, rotation: 0 });
          void characterCommand("character.animate", { animation: action }).catch(() => setStatus("离线舞蹈 · 当前舞台仍可播放"));
        }}>{s.action === "dance" ? "结束舞蹈" : "开始全身舞蹈"}</button>
      </div>
      <div className="pose-presets">
        {([{id:"sit",label:"坐下"},{id:"crouch",label:"蹲下"},{id:"sleep",label:"睡觉"},{id:"idle",label:"站起来"}] as const).map(item => <button key={item.id} disabled={!canPosture} onClick={() => {
          if ((item.id === "sit" || item.id === "sleep") && interactFurniture(item.id)) return;
          pauseAutomaticPerformance();
          preferences.set({ framing: "full" });
          s.set({action:item.id,pose:{...neutralPose},walking:false,walkTarget:null});
          void characterCommand("character.animate",{animation:item.id}).catch(() => setStatus("离线姿态 · 当前舞台仍可显示"));
        }}>{item.label}</button>)}
      </div>
      <label className="joint-slider">
        <span>舞蹈表现幅度</span>
        <input aria-label="舞蹈表现幅度" type="range" min="0.4" max="1.25" step="0.01" value={preferences.danceStrength ?? 1}
          onChange={e => preferences.set({ danceStrength: +e.target.value })} />
        <output>{Math.round((preferences.danceStrength ?? 1) * 100)}%</output>
      </label>
      <div className="control-section-title">
        <Smile size={16} />
        <h4>情绪与表情</h4>
        <span>{Math.round(s.expressionIntensity * 100)}% 强度</span>
      </div>
      <div className="expression-grid">
        {expressions.map((e) => (
          <button
            key={e.id}
            className={s.expression === e.id ? "selected" : ""}
            aria-pressed={s.expression === e.id}
            onClick={() => expression(e.id)}
          >
            <span>{e.face}</span>
            {e.name}
          </button>
        ))}
      </div>
      <div className="pose-presets">
        {(["left", "right"] as const).map(side => <button key={side} onClick={() => usePerformance.setState({ wink: { side, started: performance.now() } })}>{side === "left" ? "眨左眼" : "眨右眼"}</button>)}
        {([{ label: "点头回应", gesture: "nod" }, { label: "好奇歪头", gesture: "tilt" }, { label: "张开双手", gesture: "open" }, { label: "温柔抚心", gesture: "heart" }] as const).map(item => <button key={item.gesture} onClick={() => {
          s.set({ action: "idle", pose: { ...neutralPose } });
          usePerformance.setState({ manualUntil: 0 });
          respond({ emotion: item.gesture === "tilt" ? "curious" : "happy", intensity: 0.55, gesture: item.gesture, energy: 0.65, duration: 4 }, "manual-preview");
        }}>{item.label}</button>)}
      </div>
      <label className="joint-slider">
        <span>表情强度</span>
        <input
          aria-label="表情强度"
          type="range"
          min="0"
          max="1"
          step=".01"
          value={s.expressionIntensity}
          onChange={(e) => expression(s.expression, +e.target.value)}
        />
        <output>{Math.round(s.expressionIntensity * 100)}%</output>
      </label>
      <div className="control-section-title">
        <Activity size={16} />
        <h4>肢体姿态</h4>
        <button onClick={() => pose({ ...neutralPose })}>
          <RotateCcw size={12} />
          重置姿态
        </button>
      </div>
      <div className="pose-presets">
        {[
          { name: "自然站姿", pose: neutralPose },
          {
            name: "伸展双臂",
            pose: { ...neutralPose, leftArm: 85, rightArm: 85, headPitch: -8 },
          },
          {
            name: "害羞招呼",
            pose: {
              ...neutralPose,
              rightArm: 65,
              rightElbow: 100,
              headYaw: -15,
              bodyLean: 5,
            },
          },
          {
            name: "思考片刻",
            pose: {
              ...neutralPose,
              leftArm: 15,
              rightArm: 25,
              rightElbow: 125,
              headPitch: 8,
              headYaw: 15,
            },
          },
        ].map((p) => (
          <button key={p.name} onClick={() => pose({ ...p.pose })}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="joint-grid">
        {joints.filter(j => !live2d || ["headYaw", "headPitch", "bodyLean"].includes(j.id)).map((j) => (
          <label className="joint-slider" key={j.id}>
            <span>{j.name}</span>
            <input
              aria-label={j.name}
              type="range"
              min={j.min}
              max={j.max}
              value={s.pose[j.id]}
              onChange={(e) => pose({ ...s.pose, [j.id]: +e.target.value })}
            />
            <output>{s.pose[j.id]}°</output>
          </label>
        ))}
      </div>
      <label className="joint-slider">
        <span>整体朝向</span>
        <input
          aria-label="整体朝向"
          type="range"
          min="-180"
          max="180"
          value={s.rotation}
          onChange={(e) => {
            s.set({ rotation: +e.target.value });
            sync("character.rotate", { degrees: +e.target.value });
          }}
        />
        <output>{s.rotation}°</output>
      </label>
      <div className="control-section-title">
        <Eye size={16} />
        <h4>自然表现</h4>
        <span>有呼吸，也有回应</span>
      </div>
      <div className="presence-toggles">
        <label>
          <span>
            <strong>自然律动</strong>
            <small>呼吸起伏、眨眼与轻微重心变化</small>
          </span>
          <input
            aria-label="自然律动"
            type="checkbox"
            checked={s.naturalMotion}
            onChange={(e) => presence({ naturalMotion: e.target.checked })}
          />
        </label>
        <label>
          <span>
            <strong>视线跟随</strong>
            <small>目光轻柔跟随舞台内的指针</small>
          </span>
          <input
            aria-label="视线跟随"
            type="checkbox"
            checked={s.gazeTracking}
            onChange={(e) => presence({ gazeTracking: e.target.checked })}
          />
        </label>
      </div>
      <label className="joint-slider">
        <span>呼吸幅度</span>
        <input
          aria-label="呼吸幅度"
          type="range"
          min="0"
          max="1"
          step=".01"
          value={s.breath}
          onChange={(e) => presence({ breath: +e.target.value })}
        />
        <output>{Math.round(s.breath * 100)}%</output>
      </label>
      <div className="control-section-title">
        <Sparkles size={16} />
        <h4>互动与音乐</h4>
        <span>手动控制优先</span>
      </div>
      <div className="presence-toggles">
        <label>
          <span>
            <strong>对话情绪响应</strong>
            <small>根据上下文轻柔调整表情、点头与手势</small>
          </span>
          <input
            aria-label="对话情绪响应"
            type="checkbox"
            checked={preferences.autoExpression}
            onChange={(e) =>
              preferences.set({ autoExpression: e.target.checked })
            }
          />
        </label>
        <label>
          <span>
            <strong>跟随音乐律动</strong>
            <small>分析实际音频强弱，让舞姿随旋律舒展</small>
          </span>
          <input
            aria-label="跟随音乐律动"
            type="checkbox"
            checked={preferences.musicMotion}
            onChange={(e) => preferences.set({ musicMotion: e.target.checked })}
          />
        </label>
      </div>
      <label className="joint-slider">
        <span>自动动作幅度</span>
        <input
          aria-label="自动动作幅度"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={preferences.motionStrength}
          onChange={(e) => preferences.set({ motionStrength: +e.target.value })}
        />
        <output>{Math.round(preferences.motionStrength * 100)}%</output>
      </label>
      <div className="character-sync">
        <i />
        {status}
        <span>VRM 骨骼驱动 · 表情取决于模型预设</span>
      </div>
    </div>
  );
}
