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
        <summary>如何配置角色自己的 Agent？</summary>
        <p>
          在「设置 → 角色
          Agent」选择角色，编辑背景、性格、说话方式、相处方式和问候语。表达与表现可调节动作气质、表情丰富度和语音参数；记忆与能力可选择专属文本模型、维护专属记忆或清空此角色的会话。保存后，下一次交流使用新设定。每位角色的会话独立保存在本机，完整历史保留在数据库，主聊天显示最近100条；模型上下文取最近4至20条，并结合长期摘要和相关原话。记忆与能力中可开启自动摘要、核对原话、查看更早记录或清空。手写记忆仍可单独维护，直播不使用私人记忆。
        </p>
      </details>
      <details className="settings-detail">
        <summary>模型连接失败怎么办？</summary>
        <p>
          确认供应商 Base URL、API Key 和模型 ID
          已保存；先测试连接，再给对应能力选择路由。能力标签必须与供应商实际支持一致。主聊天使用文本路由，语音使用语音合成路由。
        </p>
      </details>
      <details className="settings-detail">
        <summary>如何让表情与音乐动作更自然？</summary>
        <p>
          在角色表现控制中开启「对话情绪响应」和「跟随音乐律动」，再调整自动动作幅度。聊天会携带最近
          10
          条对话，由当前文本模型返回表情和小幅手势；兼容模型未提供有效情绪时使用本地辅助。音乐动作依据当前音频的强弱与节奏估计；舒缓音乐偏轻柔摇曳，节奏感较强时增加动作。手动调整会暂时优先，减弱动态模式会停止自动动作。
        </p>
      </details>
      <details className="settings-detail">
        <summary>导入的模型为什么不能调节表情？</summary>
        <p>
          三位伙伴均使用公开模型库中的 VRM 角色，来源和授权可在资源库查看。导入
          VRM 0.x / 1.0
          后也可控制关节、眨眼和口型，效果取决于模型包含的表情。静态 GLB
          支持整体转向与位移。
        </p>
      </details>
      <details className="settings-detail">
        <summary>资源与密钥保存在哪里？</summary>
        <p>
          角色、场景、音乐、图片、视频与歌词保存在当前浏览器的本地资源库，刷新后可用；清除站点数据会删除这些文件。外观偏好和项目配置保存在浏览器；角色
          Agent 设定和会话保存在本机 .local/agents.json 与
          .local/agent-memory.sqlite3；模型配置和密钥保存在本机后端的
          .local/models.json，密钥不回显。使用多模态实验室时，点击运行才会把输入发送给所选供应商。
        </p>
      </details>
      <details className="settings-detail">
        <summary>当前版本的能力边界</summary>
        <p>
          视频理解采用关键帧采样。实时语音输入、歌声合成、Live2D、物理寻路、账号系统和完整场景编辑器仍待实现。VRM
          角色具备日系卡通材质与自然动作，尚非写实数字人。完整计划见
          docs/ARCHITECTURE.md。
        </p>
      </details>
    </div>
  );
}
