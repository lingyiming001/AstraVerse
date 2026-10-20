import { usePreferences } from "@/shared/preferences/preferences";
import { normalizeResourceLimit } from "@/shared/preferences/resourceLimits";
import { useEffect, useState } from "react";
import { inspectCubismCore, isLive2D, saveCubismCore } from "@/features/live2d/cubismRuntime";
import type { Resource } from "@/features/library/resources";
export default function Live2DSetup({ resources, onUpload, onUse }: {
  resources: Resource[]; onUpload: () => void; onUse: (resource: Resource) => void;
}) {
  const limitMB = usePreferences(s => normalizeResourceLimit(s.resourceLimitMB));
  const [core, setCore] = useState("checking");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const models = resources.filter(resource => resource.kind === "character" && isLive2D(resource.url));
  useEffect(() => {
    let cancelled = false;
    void inspectCubismCore().then(value => { if (!cancelled) setCore(value); });
    return () => { cancelled = true; };
  }, []);
  return <section className="live2d-setup" aria-label="Live2D 启用指南">
    <div><span className="settings-eyebrow">LIVE2D · CUBISM</span><h2>让二维角色来到你的舞台</h2>
      <p>3D 与 Live2D 角色已分开管理。已加入 CC0 授权的 Arch-chan 和 CC BY 4.0 的 Pink Sakura；首次使用 Live2D 仍需安装官方 Core。你也可以继续导入自己的模型。</p></div>
    <div className="live2d-setup-steps">
      <div><strong>01 · Cubism Core</strong><span>{core === "checking" ? "检查运行库…" : core === "loaded" ? "运行库已加载" : core === "stored" ? "已保存 Core 文件，尚未验证运行" : core === "server" ? "已部署 Core 文件，尚未验证运行" : "尚未安装运行库"}</span>
        <a href="https://www.live2d.com/en/sdk/download/web/" target="_blank" rel="noreferrer">前往官网下载 SDK</a>
        <label className="live2d-import">{saving ? "正在保存…" : "导入 Core 文件"}<input type="file" accept=".js" disabled={saving} onChange={event => {
          const file = event.target.files?.[0]; if (!file) return;
          setSaving(true); setNotice("");
          void saveCubismCore(file).then(() => { setCore("stored"); setNotice("Core 已保存。选择 Live2D 角色后会加载并验证；更换已加载的 Core 请刷新页面。"); })
            .catch(error => setNotice(error.message)).finally(() => setSaving(false));
          event.target.value = "";
        }} /></label><small>文件：Core/live2dcubismcore.min.js。请先阅读官方许可，仅导入官方 JavaScript 文件。</small></div>
      <div><strong>02 · Live2D 模型</strong><span>{models.length ? `可用 ${models.length} 个 Live2D 角色` : "还没有 Live2D 角色"}</span>
        <button className="secondary" onClick={onUpload}>导入 Live2D ZIP</button>
        <small>ZIP 内包含一个 .model3.json、.moc3、贴图及动作；导入上限 {limitMB} MB（可在设置 → 外观与体验调整），解压后资源最多 150 MB。只有运行库不会自动生成角色。</small>
        {models.map(model => <button className="secondary" key={model.id} onClick={() => onUse(model)}>进入舞台 · {model.name}</button>)}
      </div>
    </div>{notice && <p role="status">{notice}</p>}
  </section>;
}
