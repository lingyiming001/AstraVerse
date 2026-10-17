import { AudioLines, Focus, Moon, Sun, Waves } from "lucide-react";
import { usePreferences } from "./preferences";
import { stopCharacterSpeech } from "./speech";
export default function GeneralSettings() {
  const p = usePreferences();
  return (
    <div className="general-settings">
      <div className="settings-intro">
        <div>
          <span className="settings-eyebrow">MAKE YOURSELF AT HOME</span>
          <h3>适合你的，才是最好的状态。</h3>
          <p>调整空间的样子，也调整与伙伴相处的节奏。</p>
        </div>
      </div>
      <section className="preference-card">
        <div className="preference-heading">
          <Sun size={18} />
          <div>
            <h4>外观主题</h4>
            <p>清晰、柔和，长时间相处也舒适。</p>
          </div>
          <span>自动保存</span>
        </div>
        <div className="theme-options">
          {[
            { id: "dark", name: "深空", desc: "静谧的石墨与星光", icon: Moon },
            {
              id: "light",
              name: "晨雾",
              desc: "柔和的白色创作空间",
              icon: Sun,
            },
          ].map((t) => (
            <button
              key={t.id}
              className={p.theme === t.id ? "selected" : ""}
              onClick={() => p.set({ theme: t.id as "dark" | "light" })}
              aria-pressed={p.theme === t.id}
            >
              <span className={`theme-preview ${t.id}`}>
                <i />
                <i />
                <i />
              </span>
              <strong>
                <t.icon size={14} />
                {t.name}
              </strong>
              <small>{t.desc}</small>
            </button>
          ))}
        </div>
      </section>
      <section className="preference-card">
        <div className="preference-row">
          <span className="preference-symbol">
            <Focus size={19} />
          </span>
          <div>
            <h4>沉浸模式</h4>
            <p>收起推荐内容，将空间留给角色和对话。</p>
          </div>
          <input
            type="checkbox"
            aria-label="沉浸模式"
            checked={p.focusMode}
            onChange={(e) => p.set({ focusMode: e.target.checked })}
          />
        </div>
        <div className="preference-row">
          <span className="preference-symbol">
            <AudioLines size={19} />
          </span>
          <div>
            <h4>角色语音</h4>
            <p>优先使用语音模型；未配置时使用系统声音。</p>
          </div>
          <input
            type="checkbox"
            aria-label="角色语音"
            checked={p.voice}
            onChange={(e) => {
              p.set({ voice: e.target.checked });
              if (!e.target.checked) stopCharacterSpeech();
            }}
          />
        </div>
        <div className="preference-row">
          <span className="preference-symbol">
            <Waves size={19} />
          </span>
          <div>
            <h4>动态效果</h4>
            <p>减弱模式会减少自主律动、眨眼与舞台动效。</p>
          </div>
          <select
            aria-label="动态效果"
            value={p.motion}
            onChange={(e) =>
              p.set({ motion: e.target.value as typeof p.motion })
            }
          >
            <option value="auto">跟随系统</option>
            <option value="full">完整动态</option>
            <option value="reduced">减弱动态</option>
          </select>
        </div>
      </section>
      <p className="settings-footnote">
        外观与交互偏好保存在此浏览器，立即生效。
      </p>
    </div>
  );
}
