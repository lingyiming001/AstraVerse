# Computer Use 与扩展接口

创作空间点击“电脑操作”。当前提供 macOS 14+ 主显示器适配器，工具通过原有插件目录与 MCP 的 `plugins.list / plugins.call` 发现和调用；不新增根目录命令转发。

## 安装与启用

```bash
bash deploy/setup.sh
bash deploy/setup-computer.sh  # macOS，需要 Xcode Command Line Tools
bash deploy/start-local.sh
```

`setup-computer.sh` 使用系统 Swift 编译 `deploy/computer-bridge.swift`，产物放在忽略的 `.local/bin/`。未安装桥接器或在其他系统运行时，状态接口给出原因，不伪造已执行。

在 macOS 系统设置 → 隐私与安全性中检查屏幕录制、辅助功能权限；授权对象由系统识别桥接器及其宿主进程，变更后可能需要重启后端。界面只读取授权状态，不会修改系统隐私设置。

点击“启用本次电脑操作（15分钟）”启用扩展并创建临时会话。会话令牌只保存在界面内存；刷新后可用“立即停止”撤销旧会话再启用。每个进程最多一个会话，过期或重启后失效。关闭面板、离开创作空间、禁用扩展也会撤销会话。

## 手动与角色建议

- “查看屏幕”仅显示主屏幕快照，不上传给模型。点击快照选择归一化坐标，再点击执行才发送鼠标事件。
- 支持左/右点击、双击、Unicode文字、单键/组合键、纵向滚动及HTTP(S)网页打开。界面提供常用操作，完整参数见插件工具目录。
- 鼠标键盘操作默认延后3秒，供用户切换到目标应用；停止会话会取消等待中的步骤，已发出的事件不会撤回。
- 填写目标并点击“查看屏幕并生成建议”，会发送当前主屏幕的一张压缩图片给当前角色的图片理解路由，可能产生推理费用。角色必须允许插件，且具备可用图片理解路由。
- 建议只包含一个经校验的操作，显示目的及参数，不自动执行。点击执行后才调用桥接器；建议60秒内有效且只能执行一次。可刷新屏幕确认结果，再生成下一步。

本轮没有持续录屏、后台自主循环、任意shell或代码执行工具。电脑操作只接受本机连接；外部MCP客户端调用操作工具也需要有效会话令牌，可在面板“接入本机工具客户端”中复制本次临时令牌。不要把本地单用户API暴露到公网。

## 扩展机制

`modules/computer/service.py` 提供 `DesktopAdapter` 协议：`call(action, arguments) -> dict`。当前 `MacOSAdapter` 通过JSON标准输入/输出调用固定原生桥接器；后续平台可替换此适配器，复用会话、参数校验、建议预览和插件/MCP接口。

工具定义与Pydantic参数模式统一登记到插件 `CATALOG / SCHEMAS`。`computer.status / screenshot / click / type / key / scroll / open_url / history` 受扩展开关约束；除只读status外，均需要临时令牌。`history` 仅返回工具名、时间和完成状态，不记录截图、输入正文或令牌。

原生鼠标键盘使用 [Apple CGEvent](https://developer.apple.com/documentation/coregraphics/cgevent)，截图使用 ScreenCaptureKit；浏览器页面中的文字被作为待观察内容，不作为模型的新指令。

## 验证边界

本轮原生桥接编译与系统授权状态读取已实测。自动化使用模拟桌面验证会话启停、截图预览、手动动作、建议预览/执行、退出撤销；没有向真实桌面发送鼠标键盘事件或付费调用模型。
