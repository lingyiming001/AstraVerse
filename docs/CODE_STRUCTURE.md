# 代码组织与依赖边界

项目采用单仓库双应用。前端为独立 npm 应用 `astraverse-web`，后端为可构建 wheel 的 Python distribution `astraverse`。不为每个业务目录创建独立发布包；只有需要独立版本、独立部署和独立使用的代码才拆为独立包。

## 前端：apps/astraverse-web

```text
src/
  main.tsx                 # 唯一浏览器入口
  app/                     # 应用组合、页面布局与全局样式
    settings/              # 跨功能设置页面的组合
  features/
    agents/                # 角色设定、会话、长期记忆
    chat/                  # 输入框与语音回复
    models/                # 模型配置面板、契约、媒体编码
    library/               # 资源目录、IndexedDB、书籍预览
    stage/                 # Three.js舞台、VRM、动作与表现
    live2d/                # Cubism适配、模型解包与参数控制
    computer/              # 电脑操作会话、屏幕预览与操作建议
    watch/                 # 视频播放、网页陪看与手动取帧
    music/                 # 播放所有权、音乐分析与律动
    live/                  # 直播配置、弹幕与API适配
    plugins/               # 本地插件设置
    mcp/                   # MCP工具与接入界面
    settings/              # 通用偏好与帮助
  shared/
    api/                   # 通用HTTP响应处理
    state/                 # 多功能共同使用的工作空间状态
    preferences/           # 用户偏好与主题
    styles/                # 共享组件样式
    types/                 # 第三方运行时类型声明
scripts/check-boundaries.mjs
```

- 依赖方向：`app → features → shared`，`app` 也可直接使用 `shared`。
- `shared` 不得导入业务功能或应用层；功能不得导入应用层。
- 功能间协作可明确导入对应模块；跨功能页面组合放在 `app`。
- `@/` 映射到 `src/`，TS和Vite使用同一映射；业务内部可用相对导入。
- `models/contracts.ts` 仅声明数据契约；`media.ts` 负责浏览器媒体编码；`ModelSettingsPanel` 不导入 Agent 或应用设置页。
- 不创建聚合所有组件的 barrel，避免隐式循环依赖及无关模块加载。
- 在前端目录执行 `npm run check` 和 `npm run build` 均先执行边界及别名解析检查。

## 后端：apps/astraverse

```text
pyproject.toml             # 包元数据、运行依赖、dev可选依赖和包发现
requirements.lock.txt      # 已锁定的开发/测试环境依赖
src/astraverse/
  api/application.py       # FastAPI组装、生命周期、工作空间与聊天入口
  core/paths.py            # 项目根、环境配置和数据路径
  modules/
    models/schemas.py      # 模型契约与纯校验，不依赖路由或存储
    models/router.py       # 模型配置、能力路由和供应商推理
    models/adapters/       # 按模型选择的协议适配器（含百炼Qwen3-TTS）
    agents/profiles.py     # 角色设定、会话持久化和模型来源
    agents/memory.py       # 摘要、检索和长期记忆任务
    resources/selection.py # 真实资源目录与受约束选择
    performance/schemas.py # 表现协议、白名单校验与兼容解析
    computer/service.py    # 桌面适配协议、临时会话与建议校验
    plugins/router.py      # 内置插件目录、权限校验与执行
    live/service.py        # 直播通道、连接、队列与生命周期
  integrations/mcp/          # 官方MCP SDK HTTP与stdio接入适配
tests/                    # HTTP、WebSocket、模型路由、结构边界测试
```

- 统一使用 `astraverse.*` 包限定导入，不使用顶层 `import main`，不向 `sys.path` 手动追加业务目录。
- `core` 不依赖 `api/modules/integrations`；基础契约无需导入应用就可使用。`__init__.py` 不执行服务初始化。
- API组合业务与集成模块；MCP通过传入的回调接入应用，不导入API应用对象。
- 运行依赖在 `[project.dependencies]` 声明；`pytest` 仅在 `[project.optional-dependencies].dev` 声明。锁文件固定验证环境版本；Docker按锁文件约束只安装项目运行依赖。
- 数据不进入源码包。源码默认使用根目录 `.local/`；安装后的发行包默认使用工作目录 `.local/`。部署可显式设置 `ASTRAVERSE_PROJECT_ROOT`、`ASTRAVERSE_DATA_DIR`。

部署脚本全部放在 `deploy/`。前端 `package.json` 和 `package-lock.json` 仅负责前端依赖；后端使用 `pyproject.toml` 和 `requirements.lock.txt`。不设置根 npm 工作区或跨语言命令转发。

```bash
# 仓库根目录：安装应用依赖、构建部署、服务状态
bash deploy/setup.sh
bash deploy/start-local.sh
python3 deploy/local.py status
# 各应用独立验证
apps/astraverse/.venv/bin/python -m pytest -c apps/astraverse/pyproject.toml apps/astraverse/tests -q
npm --prefix apps/astraverse-web run build
```

`requirements.lock.txt` 更新须与 pyproject 声明和受支持 Python 版本一起验证。可用 `pip wheel --no-deps apps/astraverse` 构建标准发行包。现有聊天/模型服务内部仍有较大的模块，后续可按具体改动继续分离存储与业务服务；当前目录分包不代表已经完成所有服务层解耦。
