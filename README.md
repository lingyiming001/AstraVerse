# AstraVerse ✧

原创 AI 虚拟伙伴与 3D 创作空间。React 19 / TypeScript / React Three Fiber + Python FastAPI + 官方 MCP Python SDK。当前交付是**本地单用户 MVP**，并非提示词中全部商业化能力。

## v0.3 界面与自然表现

主界面扩大舞台与对话，新增沉浸模式、招呼/微笑快捷操作；MCP 和帮助中心统一位于设置。设置分为偏好、智能与模型、连接与支持，外观/语音/动效自动保存在浏览器。角色增加眼白、虹膜、瞳孔、鼻耳、手指与头发细节，自主眨眼采用不等间隔，支持眼神停留、轻微目光游移、头发滞后和实际模型语音能量驱动的近似口型。仍是原创程序化角色，并非写实数字人或音素级口型。

当前本机构建版入口：http://127.0.0.1:5174；重新构建并运行使用 `./deploy/start-local.sh`。不公开发布，后端仍为本地单用户 API。

## 本地启动

需要 Node.js 22.12+、Python 3.12+。仓库提交 npm 锁文件，使用 npm workspace 保持安装简单；后续团队可迁移 pnpm workspace。

```bash
npm ci
python3 -m venv .venv
.venv/bin/pip install -r apps/api/requirements.lock.txt
```

两个终端分别运行：

```bash
.venv/bin/uvicorn main:app --app-dir apps/api --host 127.0.0.1 --port 8000
```

```bash
npm run dev
```

打开 http://127.0.0.1:5173。接口文档 http://127.0.0.1:8000/docs。

```bash
npm run build
cd apps/api && ../../.venv/bin/python -m pytest tests -q
```

## 已实现

- 深色响应式创作空间；设置中提供独立浅色主题。
- Three.js 实时舞台、星空粒子、环形平台、轨道镜头、三套光色预设。
- 原创程序化伙伴、三个配色人设、待机/挥手/舞蹈/跳跃，WASD 移动和边界约束。
- 单文件 GLB 角色与场景本地预览（50 MB 限制）。无授权角色或音源依赖。
- 三段 Web Audio 原创合成和弦、音频上传、切歌、播放/暂停、进度、循环、LRC 同步。
- 文字聊天、本地规则助手明确标识；设置中可保存多供应商与七类能力路由，后端可接 OpenAI 兼容端点。
- 角色 TTS 开关：优先使用配置的语音模型，否则使用浏览器系统声音；含近似口型。
- 浏览器 localStorage 保存/恢复项目配置，JSON 导出；上传资源仅本次会话有效。
- FastAPI 校验、工具发现、WebSocket 指令广播/重连/快照恢复、官方 MCP stdio 适配。

官方 MCP 端到端自检：启动 API 后执行 `.venv/bin/python scripts/smoke_mcp.py`。

## 模型配置与路由（v0.2）

打开「设置」→ 添加供应商 → 保存 → 发现或添加模型并声明能力 → 设置能力路由 → 保存。修改立即生效。支持文本、图片理解/生成、语音合成、音频转写、视频关键帧理解及兼容异步视频生成；实验室提供真实调用和结果预览。

模型配置页已优化为顶部供应商切换和模型卡片。聊天模型支持「保存并测试 / 测试对话」，返回真实回复、耗时和失败原因；供应商模型列表连接与实际推理验证分开显示。

舞台右侧「角色表现控制」可调整 6 种表情、9 个关节、整体朝向、呼吸/眨眼与视线跟随，支持 REST/WS/MCP 同步。

详见 [模型与角色使用说明](docs/MODELS_AND_PRESENCE.md)。密钥保存在被 Git 忽略的 `.local/models.json`（明文、权限 0600），不回显到浏览器。

### 可选环境变量兼容配置

复制 `apps/api/.env.example` 为 `apps/api/.env`，填写 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL` 后重启后端。密钥仅由服务器读取，不提交 Git。当前聊天为单轮请求，不具备长期记忆或流式输出。保存的设置优先于环境变量；删除本地配置文件后可恢复环境变量模式。

## MCP 接入

在支持 MCP stdio 的客户端中添加以下配置，将 `/absolute/path/AstraVerse` 替换为本项目绝对路径，并先启动 API 和浏览器：

```json
{
  "mcpServers": {
    "astraverse": {
      "command": "/absolute/path/AstraVerse/.venv/bin/python",
      "args": ["/absolute/path/AstraVerse/packages/mcp/server.py"],
      "env": {"ASTRAVERSE_API": "http://127.0.0.1:8000"}
    }
  }
}
```

17 个具名工具均可发现。移动、动画、跳跃、舞蹈、播报、预设场景、音乐、状态查询已接入。表情、9 关节姿态、整体旋转与自然表现均支持内置角色；歌声合成、导航、远程镜头明确返回 501，未伪造成功。`dispatched` 仅表示 API 广播完成，尚无浏览器执行 ACK。音频播放需浏览器先发生用户手势。

## 已知边界

当前共享单工作空间内存状态，重启会重置，不能公开部署为多用户服务。浏览器常规操作以本地状态为主，动作工具走 API；完整双向状态版本合并待实现。GLB 为静态预览，未处理导入模型的骨骼重定向、VRM、Live2D、物理碰撞、自动寻路、歌声合成、实时语音输入与实时语音、账号、数据库、云文件、版本管理与完整编辑器。GLTF 外部资源未支持。恶意/复杂 GLB 的 GPU 资源消耗仍需沙箱与预算限制。字体联网失败会回退系统字体。

完整产品方案、协议、数据模型、分阶段验收与授权说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。容器开发运行见 [deploy/README.md](deploy/README.md)。
