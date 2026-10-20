# Qwen3-TTS（百炼 API）

平台和角色专属模型库均可配置多个 TTS/ASR。每个模型单独声明能力及 TTS 协议；新增 Qwen3 不替换文本、ASR、图片、视频等路由。

## 配置

1. 打开「设置 → 平台模型」，点击「配置 Qwen3-TTS」。已存在的百炼供应商优先复用；不存在时新增北京地域供应商，填写该地域的 API Key。
2. 预设添加 `qwen3-tts-flash`，能力 `speech`，协议「百炼 Qwen3-TTS」，默认音色 `Cherry`、语言 `Auto`，并选择该层的语音路由。点击保存后生效。
3. 角色使用平台模型时继承该路由；需要独立凭据或声音时在角色模型库执行同样配置。已有角色专属语音路由优先于平台配置。
4. 聊天开启「语音回复」，也可在多模态实验室选择语音合成并输入短文本测试。测试和自动朗读会产生供应商费用。

北京使用 `https://dashscope.aliyuncs.com/compatible-mode/v1`；新加坡使用 `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`。适配器根据官方地域主机调用原生 `/api/v1/services/aigc/multimodal-generation/generation`，供应商相同的文本模型仍走原有兼容接口。不同地域密钥不能混用。

## 音色与边界

- 模型默认音色和语言保存在模型配置中。角色或实验室显式选择 `Cherry`、`Serena` 等音色时覆盖默认；原有 OpenAI 音色名（nova/alloy 等）在 Qwen 协议下回到模型默认音色，避免已有角色配置不兼容。
- 普通 OpenAI 兼容 TTS 仍使用 `/audio/speech`；ASR 仍使用 `/audio/transcriptions`。不同供应商可分别加入 speech/transcription 路由。
- 当前接入非流式基础合成，单次最多600字符；超过限制在请求上游前报错，不截断或自动发起多次计费请求。未接入实时WebSocket、音色克隆或本地Qwen权重。
- 合成结果由后端下载并返回 WAV，并按实际字节修正流式占位长度头，避免播放器时长异常；密钥及签名下载地址不发给浏览器。下载仅允许百炼结果OSS主机，强制HTTPS，不附带API Key；文件限制32MiB。失败不会自动重试或改用另一个计费模型。
- 保留原 speech 备用目标时，只保存配置，不代表语音生成会自动重试；这与原有生成请求策略一致。

接口与模型参数依据：[阿里云 Qwen-TTS API](https://www.alibabacloud.com/help/zh/model-studio/qwen-tts-api)。
