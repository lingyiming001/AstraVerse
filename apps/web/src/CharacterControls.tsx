import { useRef, useState } from "react";
import { Activity, Eye, RotateCcw, Smile, Sparkles } from "lucide-react";
import { neutralPose, useWorld, type Expression, type Pose } from "./store";
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
export async function characterCommand(
  tool: string,
  args: Record<string, unknown>,
) {
  const response = await fetch("/api/tools/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, arguments: args }),
  });
  if (!response.ok) throw new Error("同步失败，当前修改仅在本地生效");
}
export default function CharacterControls() {
  const s = useWorld();
  const [status, setStatus] = useState("操作会实时显示在舞台中");
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  function sync(tool: string, args: Record<string, unknown>) {
    if (timers.current[tool]) clearTimeout(timers.current[tool]);
    timers.current[tool] = setTimeout(() => {
      void characterCommand(tool, args)
        .then(() => setStatus("已同步到角色控制服务"))
        .catch(() => setStatus("离线调整中 · 后端连接后可同步"));
    }, 180);
  }
  function expression(id: Expression, intensity = s.expressionIntensity) {
    s.set({ expression: id, expressionIntensity: intensity });
    sync("character.emote", { emotion: id, intensity });
  }
  function pose(value: Pose) {
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
      {s.modelUrl && (
        <div className="settings-alert">
          当前导入的是静态
          GLB。以下面部与关节控制适用于内置原创角色；导入模型仅支持整体转向与位移。
        </div>
      )}
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
        {joints.map((j) => (
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
      <div className="character-sync">
        <i />
        {status}
        <span>程序化角色控制 · 非写实人体模拟</span>
      </div>
    </div>
  );
}
