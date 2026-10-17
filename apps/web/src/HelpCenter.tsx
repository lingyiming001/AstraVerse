import {
  BookOpen,
  Keyboard,
  MessageCircle,
  Music2,
  SlidersHorizontal,
} from "lucide-react";
const guides = [
  {
    icon: MessageCircle,
    title: "和伙伴聊一聊",
    text: "在右侧输入消息，按 Enter 发送。配置文本路由后使用你的模型；未配置时会明确标注本地规则助手。开启语音可以听见回复。",
  },
  {
    icon: SlidersHorizontal,
    title: "调节表情与动作",
    text: "点击舞台的角色控制按钮，在侧边面板中选择情绪、姿态或调节关节。你也可以试着说「笑一个」「抬起左手」「跳一支舞」。",
  },
  {
    icon: Music2,
    title: "让音乐进入空间",
    text: "在音乐与舞蹈中上传音频或 LRC 歌词。底部播放器支持暂停、切歌、进度和循环。请使用自己拥有使用权的资源。",
  },
];
export default function HelpCenter() {
  return (
    <div className="help-center">
      <div className="settings-intro">
        <div>
          <span className="settings-eyebrow">A LITTLE GUIDANCE</span>
          <h3>第一次相遇，也能轻松开始。</h3>
          <p>从一次对话，到一场属于你们的演出。</p>
        </div>
        <BookOpen size={25} />
      </div>
      <div className="help-guides">
        {guides.map((g) => (
          <article key={g.title}>
            <span>
              <g.icon size={19} />
            </span>
            <div>
              <h4>{g.title}</h4>
              <p>{g.text}</p>
            </div>
          </article>
        ))}
      </div>
      <section className="preference-card">
        <div className="preference-heading">
          <Keyboard size={18} />
          <h4>空间操作</h4>
        </div>
        <div className="shortcut-list">
          {[
            ["拖动舞台", "旋转镜头"],
            ["滚轮 / 双指缩放", "调整远近"],
            ["W A S D / 方向键", "移动角色"],
            ["Space", "跳跃"],
            ["Enter", "发送消息"],
            ["Esc", "关闭面板"],
          ].map(([key, label]) => (
            <div key={key}>
              <span>{label}</span>
              <kbd>{key}</kbd>
            </div>
          ))}
        </div>
      </section>
      <details className="settings-detail">
        <summary>模型连接失败怎么办？</summary>
        <p>
          确认供应商 Base URL、API Key 和模型 ID
          已保存；先测试连接，再给对应能力选择路由。能力标签必须与供应商实际支持一致。主聊天使用文本路由，语音使用语音合成路由。
        </p>
      </details>
      <details className="settings-detail">
        <summary>导入的模型为什么不能调节表情？</summary>
        <p>
          面部与关节控制目前适用于内置原创角色。导入的静态 GLB
          支持预览、整体转向与位移，尚未适配通用骨骼和面部 blendshape。
        </p>
      </details>
      <details className="settings-detail">
        <summary>资源与密钥保存在哪里？</summary>
        <p>
          上传的角色、地图与音乐仅供当前浏览器会话使用。外观偏好和项目配置保存在浏览器；模型配置和密钥保存在本机后端的
          .local/models.json，密钥不回显。使用多模态实验室时，点击运行才会把输入发送给所选供应商。
        </p>
      </details>
      <details className="settings-detail">
        <summary>当前版本的能力边界</summary>
        <p>
          视频理解采用关键帧采样。实时语音输入、歌声合成、VRM/Live2D、物理寻路、账号系统和完整场景编辑器仍待实现。角色使用程序化自然表现，尚非写实数字人。完整计划见
          docs/ARCHITECTURE.md。
        </p>
      </details>
    </div>
  );
}
