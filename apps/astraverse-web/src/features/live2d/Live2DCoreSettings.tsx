import { useEffect, useState } from "react";
import { inspectCubismCore, saveCubismCore } from "./cubismRuntime";

export default function Live2DCoreSettings({ hasSamples }: { hasSamples: boolean }) {
  const [core, setCore] = useState("checking");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void inspectCubismCore().then(value => { if (!cancelled) setCore(value); });
    return () => { cancelled = true; };
  }, []);
  const status = core === "checking" ? "正在检查 Core" : core === "loaded" ? "Core 已加载" : core === "stored" ? "Core 已保存" : core === "server" ? "Core 已部署" : "尚未安装 Core";
  return <details className="character-core-settings">
    <summary>Live2D 运行环境 · {status}</summary>
    <div>
      <p>{core === "missing" ? "运行 Live2D 需要官方 Cubism Core。" : "Core 与模型分开管理。"}仅在需要安装或更换官方 Core 时导入 JavaScript 文件；导入模型请使用上方“导入模型”按钮。</p>
      <label className="character-core-import">{saving ? "正在保存…" : "更换 Core 文件"}<input type="file" accept=".js" disabled={saving} aria-label="更换 Live2D Core 文件" onChange={event => {
        const file = event.target.files?.[0]; if (!file) return;
        setSaving(true); setNotice("");
        void saveCubismCore(file).then(() => { setCore("stored"); setNotice("Core 已保存。选择 Live2D 角色后会加载并验证；更换已加载的 Core 请刷新页面。"); })
          .catch(error => setNotice(error.message)).finally(() => setSaving(false));
        event.target.value = "";
      }} /></label>
      <a href="https://www.live2d.com/en/sdk/download/web/" target="_blank" rel="noreferrer">下载官方 SDK ↗</a>
      {hasSamples && <p>This content uses sample data owned and copyrighted by Live2D Inc. <a href="https://www.live2d.com/en/download/sample-data/" target="_blank" rel="noreferrer">样例条款</a></p>}
      {notice && <p role="status">{notice}</p>}
    </div>
  </details>;
}
