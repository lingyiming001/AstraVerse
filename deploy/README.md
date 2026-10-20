# 本地容器交付

在根目录执行 `docker compose -f deploy/compose.yaml up --build`，打开 http://127.0.0.1:5173。
这是开发容器，尚未通过此环境的 Docker 实测，不是生产发布方案。端口仅绑定 loopback。后端使用独立命名卷 `astraverse-data` 保存 `/app/data`；容器数据不会自动读取宿主机 `.local/`，不要将删除卷作为常规更新步骤。
生产化需先补认证、工作空间隔离、上传存储和控制权限，然后用前端静态产物 + TLS 反向代理部署，代理 `/api` 与 WebSocket。
LLM 环境变量通过受控 secrets 注入 api 容器；不要把密钥写入镜像或前端构建变量。

## 本机部署与进程管理

在仓库根目录运行 `bash deploy/start-local.sh`：构建 React 前端，并重启受管理的 Python API 和前端静态预览服务。前端 http://127.0.0.1:5174，后端 http://127.0.0.1:8000，前端代理 REST 和 WebSocket 到后端。

```bash
bash deploy/setup.sh          # 首次安装或依赖变更后执行
bash deploy/start-local.sh    # 构建并部署两端
python3 deploy/local.py status # PID 与 HTTP 就绪状态
python3 deploy/local.py stop   # 停止两端
python3 deploy/local.py start  # 启动现有构建，不重新编译
```

所有部署入口均在本目录。`setup.sh` 将 npm 依赖安装到 `apps/astraverse-web/node_modules/`，Python 环境安装到 `apps/astraverse/.venv/`；各应用独立维护依赖清单与锁文件，根目录不需要 `package.json`。两个 Shell 入口都按脚本位置解析路径，可从任意工作目录调用。`local.py` 仅依赖系统 Python 标准库，查询与停止服务无需激活虚拟环境。

服务以独立进程运行；日志及 PID 位于 `.local/run/`。管理器只停止记录中且命令匹配本项目的进程，端口被其他进程占用时明确报错。首次部署如有旧的手动服务，先停止旧服务。此管理方式用于 macOS/Linux 本机，不设置开机自启；Vite preview 仍是本机预览服务。

保留 `.local/` 中的模型配置、密钥、聊天数据库和插件数据。后端 `paths.py` 统一数据目录，默认仓库根目录 `.local/`，可用 `ASTRAVERSE_DATA_DIR` 指向其他绝对路径；既有 `ASTRAVERSE_CONFIG`、`ASTRAVERSE_AGENT_DIR` 覆盖项继续有效。

模型资源位于 `apps/astraverse-web/public/models/`，授权与 NOTICE 文件随部署保留。保持 5174 地址不变可继续访问原浏览器 IndexedDB 资源。源码改动后重新运行 `bash deploy/start-local.sh`。

## 角色 Agent、HTTP MCP 与本地插件

当前 API 使用 FastAPI lifespan 同时启动官方 SDK MCP session manager。原 API 启动命令保持不变：

```sh
apps/astraverse/.venv/bin/python -m uvicorn astraverse.api.application:app --app-dir apps/astraverse/src --host 127.0.0.1 --port 8000
```

前端构建后运行 `npm --prefix apps/astraverse-web start`，访问 `http://127.0.0.1:5174/`。MCP 客户端直连 `http://127.0.0.1:8000/mcp/`，不经过 Vite；stdio 仍可独立运行。设置页可复制带当前项目绝对路径的 stdio 配置。角色、插件配置及会话放在被 Git 忽略的 `.local/`，部署更新请保留该目录；不要覆盖已有模型密钥文件。新增插件仅注册白名单代码，不提供远程安装或任意 shell 执行。两端都限定 loopback；当前不提供公网认证。

## 直播弹幕

直播服务与API同进程，无新增依赖。保留 `.local/live.json`（包含Twitch/桥接令牌，0600，勿提交）；运行队列和开关不恢复，重启后在聊天框手动启动。Twitch需授权账号，其他平台需外部授权采集器。JSONL适配器在 `deploy/live-bridge.py`，用项目虚拟环境运行；它只转发采集结果，并可输出待发回复，不抓取平台也不自动向平台发言。完整格式和限制见README“直播平台与角色弹幕互动”。

## 长期记忆更新

数据库在首次记忆访问时自动补建 `agent_memories` / `agent_memory_facts` 及兼容字段，保留旧会话与模型配置。旧版本已按100条上限裁剪掉的记录无法恢复；更新后的新记录不再自动裁剪。保留 `.local/agent-memory.sqlite3`，不要把数据库作为构建产物覆盖。自动摘要后台任务使用当前角色模型，可能有模型费用；服务退出取消在途任务，下次新对话或手动整理可继续处理未归纳原文。部署检查只调用GET读取接口，不触发摘要。

## 2026-10-19 前端与场景更新

新增居中跟随与自适应取景、舞蹈全身镜头、16拍编舞、自然语言场景别名；API的chat新增可选current_scene_id，用于避免随机切换到当前场景。舞蹈工具会清空旧关节姿态并重置身体转向。前端语音开关/多行输入卡片一并交付，无新增依赖或模型请求；更新时需要重新构建前端并重启API。用户负责功能和视觉测试，部署检查仅构建/语法/服务就绪。

## 平台与角色模型作用域

本轮没有新依赖。更新API和前端后，旧Agent自动按platform作用域解释；不迁移、不改写既有模型密钥。新增角色供应商时创建 `.local/agent-models/<id>.json`（0600），部署保留整个 `.local`。作用域采用请求级ContextVar，复用模型API但不修改共享CONFIG_PATH；角色私有配置不存在时返回空库，不读取平台环境变量作为角色私有模型。聊天/摘要/直播显式传有效Settings，语音按agent_id解析能力。

## 资源CRUD与书籍库

前端新增libraryCatalog.ts（目录元数据覆写/内置资源移除标记）、BookPreview.tsx（本地文本/PDF预览、EPUB下载），沿用现有IndexedDB resources存储，不需要数据版本升级。API资源kind新增book，更新前端后同步重启API，避免书籍目录导致旧后端校验失败。目录和文件保存在浏览器，不删除服务器打包模型。部署检查不执行用户的删除/编辑/文件导入功能测试。

## Live2D / Cubism Core
AstraVerse includes a separate Live2D rendering adapter (PixiJS + pixi-live2d-display), not a conversion of VRM characters. Core is separately licensed. The current local workspace has the official Core installed; the binary is excluded from Git, so a fresh checkout still needs the installation described below. Download the official Cubism SDK for Web after reviewing its terms: https://www.live2d.com/en/sdk/download/web/ . For local use import `Core/live2dcubismcore.min.js` through Character Controls or the Live2D stage error panel; it is stored in a separate IndexedDB database on this browser. Alternatively place the officially obtained file at `apps/astraverse-web/public/vendor/live2d/live2dcubismcore.min.js` before building. A changed Core needs a page reload. Only import the official file: it executes JavaScript.

Import a self-contained ZIP (default maximum 50 MB, configurable from 1–2048 MB under Settings → Appearance & Experience → File Resources) through the character library. It must contain exactly one `.model3.json`, its `.moc3`, textures, and referenced physics/pose/expressions/motion files. Cubism 3/4 model exports are the adapter target; newer export features need model-specific verification. The ZIP persists in the existing local resource DB, with stable resource/Agent IDs. Extracted URLs are session-only and cleaned on model disposal. Motion-embedded Sound is disabled so songs/TTS remain owned by AstraVerse. Model-specific motion/expression names are listed on stage. Without authored dance motion the app provides parameter-based rhythm only. VRM assets continue through Three.js.

Before publishing AI/chatbot content, review the applicable official SDK release license: https://www.live2d.com/en/sdk/license/ . Model asset licenses are separate; no sample character is redistributed by this integration. No Core or real Live2D asset rendering was verified in this change; the user handles functional/visual tests.

### Bundled CC0 Live2D character
Arch-chan is bundled locally at `/models/live2d/arch-chan/arch-chan.zip`, from https://github.com/Speykious/arch-chan (original creator RavioliMavioli), pinned ed43dcf7e88d56f79d2e42fecb084bf6923f44e0, CC0-1.0. Keep the adjacent LICENSE and NOTICE files. Runtime references and MOC3/PNG headers were checked; the model includes physics and an expression but no authored dance motions. Core is still separate. This replaces the earlier state where no Live2D character assets were bundled.

### Local Core installation completed (2026-10-19)
With user authorization, official Cubism 5.2 hosting Core was downloaded from `https://cubism.live2d.com/sdk-web/core/05/live2dcubismcore.min.js` into the public runtime path and the running preview dist. SHA256: `25ae938cb4fe282ce189b357bcc97e603d1e1f7ec78bf04150d401c23cdc792f` (207155 bytes). Original copyright/license header is intact; see `public/vendor/live2d/core-provenance.json`. The binary is locally ignored by Git. JavaScript syntax and HTTP/content hash were checked; real model rendering remains user acceptance testing.

### 2026-10-19 音乐与角色调度更新
前端构建后由现有5174预览服务提供。请刷新所有已打开的旧页面，停止旧版本音频。新版本使用同源Web Locks限制一个页面播放音乐，第二页面会提示先暂停；旧浏览器使用BroadcastChannel退让。音乐库恢复完成前不播放默认合成音，Live2D动作音轨禁用，角色语音保留。原生动作执行期间程序身体律动淡出，再平滑恢复。

## 包结构与启动入口

后端为 `src/astraverse` 标准包，入口 `astraverse.api.application:app`；执行 `bash deploy/setup.sh` 安装锁定环境与可编辑包。开发和本机管理器显式使用 `--app-dir apps/astraverse/src`，Docker安装标准发行包后按包名启动。前端按 `app/features/shared` 组织，构建自动检查依赖边界；说明见 `docs/CODE_STRUCTURE.md`。

## 视频陪看

本轮无需新增依赖或数据库迁移，使用 `bash deploy/start-local.sh` 同时更新两端。视频不上传服务端；本地文件临时地址在浏览器中使用，B站走官方外链播放器，跨站画面通过用户选择的标签页共享。视觉讨论走当前角色的图片理解路由，配置沿用 `.local/`；详见 `docs/VIDEO_WATCH.md`。

## 本机电脑操作桥接器

可选执行 `bash deploy/setup-computer.sh`，在macOS 14+用系统Swift编译原生桥接器到 `.local/bin/`。升级Swift源后重新执行此脚本；普通前端部署不重复编译桥接器。重启后端后，在创作空间启用本次会话；系统权限状态在界面显示。Linux开发容器不提供宿主机桌面控制。详见 `docs/COMPUTER_USE.md`。
