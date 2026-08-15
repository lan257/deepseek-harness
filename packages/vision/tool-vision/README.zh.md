# @deepseek-ai/dsh-tool-vision

中文 | [English](README.md)

模型可见的 `vision` 工具：通过 opencode go 的多模态模型（默认 `mimo-v2.5`）识别已存在的本地图片、http(s) URL 或 data URI，返回识别出的文字与画面描述。

## What it does

在 `ctx.tools` 上注册一个工具 `vision(image, prompt?, json_mode?, model?)`。每次调用都会以图片和提示词为参数启动随包分发的 `scripts/vision.py`，脚本调用 `https://opencode.ai/zen/go/v1/chat/completions`（OpenAI 通道）请求模型，工具返回识别文本以及实际使用的配置。规范结果形如 `{ text, model, config, switched, attempts, usage, elapsedMs }`；面向模型的内容渲染器会追加一行用量摘要。

本工具只识别已存在的图片，不会主动截屏。`json_mode: true` 时要求模型输出 `{text, bbox}` 元素组成的 JSON 数组，供 UI 自动化消费。

## Configuration

`Config` 的每个字段都有默认值；组合配置可按需覆盖：

| 字段 | 默认值 | 含义 |
|---|---|---|
| `pythonPath` | `python` | 运行随包脚本的解释器。 |
| `scriptPath` | 随包脚本 | 自定义识图脚本的绝对路径（发布包中 `scripts/vision.py` 与 `lib/` 同级）。 |
| `timeoutMs` | `180000` | 单次请求超时；同时作为脚本的请求超时传入。 |
| `defaultModel` | `mimo-v2.5` | `model` 参数缺省时使用的模型。 |

## How the script resolves keys and fails over

脚本从本 agent 的配置读取 opencode API key，绝不硬编码，优先级依次为：环境变量 `OPENCODE_API_KEY`、opencode 认证文件 `~/.local/share/opencode/auth.json`（`opencode-go` 条目优先）、cc-switch 数据库 `~/.cc-switch/cc-switch.db`（OpenCode Go provider 配置）。`~/.dsh/vision.json` 或 `--config` 文件可追加 `extraKeys` 与 MiMo 备用密钥。

请求失败（HTTP 错误、超时、网络错误、空响应）时，脚本按顺序切换到下一个配置：先用每个候选密钥走 opencode go 的 OpenAI 通道，若存在 MiMo 密钥，再尝试 MiMo 原生 Anthropic 通道（`https://token-plan-cn.xiaomimimo.com/anthropic`）。网络层失败会先用 `http://127.0.0.1:7890` 代理对同一配置重试一次，然后才切换。结果中会报告 `switched` 与每次尝试的错误，回退对调用方可见而非静默。Anthropic 通道与 Responses 通道都无法承载本地图片（网关拒绝或要求公网 URL），因此本地图片一律走 OpenAI 通道的 `image_url` + base64 data URI。

## Test image and reference answers

`test-images/识图测试.jpg` 是验证整条识图链路的默认测试图片（与 `~/.claude/scripts/` 中 `vision` MCP 服务器使用的同一张）。可绕过工具直接运行随包脚本验证链路：

```sh
python packages/vision/tool-vision/scripts/vision.py packages/vision/tool-vision/test-images/识图测试.jpg
```

参考答案（`mimo-v2.5`，2026-08 实测）：

- 画面：一只银渐层小猫在蓝色垫子上，对着镜头张嘴；背景有木质墙面、枕头和电子设备。
- 底部水印文字（逐字）：`iQOO Neo9 Pro`、`23mm f/1.88 1/120s ISO2783`、`2026.08.05 21:53 河南省 郑州市`。
- 关键元素像素坐标（bbox `[x,y,w,h]`）：`iQOO Neo9 Pro` → `[10,900,280,40]`；黄色相机图标 → `[320,900,40,40]`；`23mm f/1.88 1/120s ISO2783` → `[370,900,430,30]`；`2026.08.05 21:53 河南省 郑州市` → `[370,930,430,30]`。
- 成本：约 20 秒，≈$0.0007/次。

若识别结果与上述明显不符（OCR 文字错乱、坐标全 0、HTTP 400），说明识图链路异常，请检查密钥、代理与通道。

## Rendering

调用以通用 `vision 识图` 卡片呈现，图片输入作为原始参数展示；完成后的结果展示识别文本与用量行。本工具不写入包自有的 session 事件——`tool/call` 与 `tool/result` 是注册表常规结果。

## Export shape

函数/命名空间插件：导出 `name` / `inject` / `Config` / `apply`，没有默认导出。误加 `export default` 会被 Loader 的 `unwrapExports` 折叠并丢掉 `inject`（见 [docs/postmortem/0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.md)）。

## Model Experience

### Tool schema

#### What the model sees

模型看到生成的 [`vision` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-vision)。

#### Token effect

工具可见的每个请求都有固定的 schema 开销。

#### KV Cache effect

定义与可见性不变时前缀稳定；插件生命周期或作用域限制可能使本 schema 的复用失效。

### Tool-call history and result

#### What the model sees

每次助手工具调用都会在参数中保留图片、提示词与模型。成功后返回识别文本与一行摘要 `# <model> | config=<config>（已切换） | in=<n> out=<n> | <ms>ms`——仅当脚本回退到其他配置时才出现 `（已切换）` 标记。稳定失败包括 `Error: vision: \`image\` 必须是本地路径 / URL / data URI 且不能为空`、脚本对 `ok: false` 结果上报的错误，以及脚本进程本身的错误（`退出码 <n>`、超时、取消）。

#### Token effect

token 增长与模型返回的识别文本量成正比；参数本身小巧且形状固定。长 OCR 结果在压缩前一直保留在调用结果中。

#### KV Cache effect

独立的模型请求：识图调用是独立的进程与 HTTP 请求，因此不增加助手请求前缀，也不使既有 KV-cache 条目失效。

## Known Limitations and Deferred Work

- **依赖本地 Python 解释器与 opencode go 可用性**——工具会启动 `pythonPath`，并需要可访问的 opencode go 端点与有效密钥；缺失时每次调用都会以脚本进程错误失败。
- **只回传文本**——图片本身从不进入助手上下文，只有模型的文字描述进入；模型未提到的细节会丢失。
- **每次调用单张图片**——多图对比不在范围内；每张图调用一次。
- **JSON 模式质量取决于模型**——`json_mode` 只是要求模型输出 `{text, bbox}` 元素；坐标由模型决定，是近似值，复杂图片上可能出错。
