# 本地容器交付

在根目录执行 `docker compose -f deploy/compose.yaml up --build`，打开 http://127.0.0.1:5173。
这是开发容器，尚未通过此环境的 Docker 实测，不是生产发布方案。端口仅绑定 loopback。
生产化需先补认证、工作空间隔离、上传存储和控制权限，然后用前端静态产物 + TLS 反向代理部署，代理 `/api` 与 WebSocket。
LLM 环境变量通过受控 secrets 注入 api 容器；不要把密钥写入镜像或前端构建变量。

## 本机构建版预览（v0.3）

前端编译后通过 `npm start` 在 http://127.0.0.1:5174 提供构建产物，REST 与 WebSocket 都代理到本机 8000 后端。

```bash
# 终端 1：后端（已运行时不必重复启动）
.venv/bin/uvicorn main:app --app-dir apps/api --host 127.0.0.1 --port 8000
# 终端 2：构建并运行前端
./deploy/start-local.sh
```

5174 必须空闲，脚本不会擅自停止其他进程。该入口是本机构建版预览，不是公网生产服务器；前端后续改动需要重新 build 并重启预览。开发热更新仍用 `npm run dev`。本轮按用户分工只编译和更新本地预览，功能与视觉测试由用户进行。
