import { useState } from "react";
import PlaybackSettings from './PlaybackSettings';
import { DEFAULT_RESOURCE_LIMIT_MB, MAX_RESOURCE_LIMIT_MB, normalizeResourceLimit, validResourceLimit } from "@/shared/preferences/resourceLimits";
import { AudioLines, Check, Focus, Moon, Sun, Waves } from "lucide-react";
import { themes, themeVariables } from "@/shared/preferences/themes";
import { usePreferences } from "@/shared/preferences/preferences";
import { stopCharacterSpeech } from "@/features/chat/speech";
export default function GeneralSettings() {
  const p = usePreferences();
  const [resourceLimit, setResourceLimit] = useState(String(normalizeResourceLimit(p.resourceLimitMB)));
  const validLimit = resourceLimit.trim() !== "" && validResourceLimit(Number(resourceLimit));
  return (
    <div className="general-settings">
      <PlaybackSettings />
      <section className="preference-card"><label className="agent-toggle"><span><strong>听歌时偶尔聊感想</strong><small>按角色性格随机分享简短联想；可能调用聊天与语音模型。不会打断读书或正在说的话。</small></span><input type="checkbox" checked={p.musicComments} onChange={e => p.set({musicComments:e.target.checked})}/></label></section>
      <section className="preference-card">
        <div className="preference-heading">
          <Sun size={18} />
          <div>
            <h4>外观主题</h4>
            <p>低饱和配色，清晰的信息层级。</p>
          </div>
          <span>自动保存</span>
        </div>
        <div className="theme-options">
          {themes.map((t) => (
            <button
              key={t.id}
              className={p.theme === t.id ? "selected" : ""}
              onClick={() => p.set({ theme: t.id })}
              aria-pressed={p.theme === t.id}
            >
              <span
                className="theme-preview"
                style={themeVariables(t)}
                aria-hidden="true"
              >
                <span className="preview-topbar">
                  <b />
                  <b />
                  <b />
                </span>
                <span className="preview-rail">
                  <b />
                  <b />
                  <b />
                </span>
                <span className="preview-stage">
                  <b />
                </span>
                <span className="preview-conversation">
                  <b />
                  <b />
                  <b />
                </span>
              </span>
              <strong>
                <span>
                  {t.light ? <Sun size={13} /> : <Moon size={13} />}
                  {t.name}
                </span>
                {p.theme === t.id && <Check size={13} />}
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
      <section className="preference-card">
        <div className="preference-heading">
          <div>
            <h4>文件资源</h4>
            <p>单个文件的导入和替换上限，适用于角色、场景、图片、音视频、书籍和歌词。</p>
          </div>
          <span>自动保存</span>
        </div>
        <div className="preference-row">
          <div>
            <label htmlFor="resource-limit-mb">文件大小上限（MB）</label>
            <p id="resource-limit-help">1–{MAX_RESOURCE_LIMIT_MB} MB，默认 {DEFAULT_RESOURCE_LIMIT_MB} MB；仅保存在当前浏览器。</p>
          </div>
          <input id="resource-limit-mb" type="number" min={1} max={MAX_RESOURCE_LIMIT_MB} step={1} value={resourceLimit} aria-invalid={!validLimit} aria-describedby="resource-limit-help resource-limit-error" className="resource-limit-input" onChange={event => {
            const value = event.target.value;
            setResourceLimit(value);
            if (value.trim() && validResourceLimit(Number(value))) p.set({resourceLimitMB:Number(value)});
          }}/>
        </div>
        {!validLimit && <p id="resource-limit-error" role="alert">请输入 1–{MAX_RESOURCE_LIMIT_MB} 的整数；当前仍使用 {normalizeResourceLimit(p.resourceLimitMB)} MB。</p>}
        <p className="settings-footnote">Live2D 解压后资源上限为 150 MB；模型调试的视频预览上限为 50 MB，图片／音频为 8 MB。</p>
      </section>
      <p className="settings-footnote">
        外观与交互偏好保存在此浏览器，立即生效。
      </p>
    </div>
  );
}
