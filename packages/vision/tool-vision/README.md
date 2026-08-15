# @deepseek-ai/dsh-tool-vision

English | [中文](README.zh.md)

The model-facing `vision` tool: recognize an existing local image, http(s) URL, or data URI through opencode go's multimodal model (default `mimo-v2.5`), returning the recognized text and picture description.

## What it does

Registers one tool, `vision(image, prompt?, json_mode?, model?)`, on `ctx.tools`. Each call spawns the bundled `scripts/vision.py` with the image and prompt, the script calls `https://opencode.ai/zen/go/v1/chat/completions` (OpenAI channel) with the model, and the tool returns the recognized text plus the configuration actually used. The canonical result is `{ text, model, config, switched, attempts, usage, elapsedMs }`; the model-facing renderer appends a one-line usage summary.

The tool only recognizes images that already exist; it never takes screenshots. `json_mode: true` asks the model to emit a JSON array of `{text, bbox}` elements for UI automation.

## Configuration

Every `Config` field has a default; a composition may override any of them:

| Field | Default | Meaning |
|---|---|---|
| `pythonPath` | `python` | Interpreter that runs the bundled vision script. |
| `scriptPath` | bundled script | Absolute path to a vision script override (the bundled `scripts/vision.py` sits beside `lib/` in the published package). |
| `timeoutMs` | `180000` | Per-request timeout; also passed to the script as its request timeout. |
| `defaultModel` | `mimo-v2.5` | Model used when the `model` argument is omitted. |

## How the script resolves keys and fails over

The script reads the opencode API key from this agent's configuration, never hardcoding one, in priority order: the `OPENCODE_API_KEY` environment variable, the opencode authentication file `~/.local/share/opencode/auth.json` (the `opencode-go` entry first), and the cc-switch database `~/.cc-switch/cc-switch.db` (the OpenCode Go provider settings). `~/.dsh/vision.json` or a `--config` file can add `extraKeys` and a MiMo fallback key.

On a failed request (HTTP error, timeout, network error, empty response) the script moves to the next configuration in order: each candidate key against the opencode go OpenAI channel, then the MiMo native Anthropic channel (`https://token-plan-cn.xiaomimimo.com/anthropic`) when a MiMo key is present. A network-level failure retries the same configuration once through the `http://127.0.0.1:7890` proxy before moving on. The outcome reports `switched` and the per-attempt errors, so a fallback is visible in the tool result rather than silent. The Anthropic channel and the Responses channel cannot carry local images (the gateway rejects them or requires a public URL), so local images always go through the OpenAI channel's `image_url` + base64 data URI.

## Test image and reference answers

`test-images/识图测试.jpg` is the default verification image for the whole recognition chain (the same image the `vision` MCP server in `~/.claude/scripts/` uses). Run the bundled script directly to verify the chain without the tool:

```sh
python packages/vision/tool-vision/scripts/vision.py packages/vision/tool-vision/test-images/识图测试.jpg
```

Reference answers measured with `mimo-v2.5` (2026-08):

- Picture: a silver-grey chinchilla cat on a blue pad, mouth open toward the camera; wooden wall, pillow, and electronics in the background.
- Watermark text, verbatim: `iQOO Neo9 Pro`, `23mm f/1.88 1/120s ISO2783`, `2026.08.05 21:53 河南省 郑州市`.
- Key element pixel bboxes `[x,y,w,h]`: `iQOO Neo9 Pro` → `[10,900,280,40]`; yellow camera icon → `[320,900,40,40]`; `23mm f/1.88 1/120s ISO2783` → `[370,900,430,30]`; `2026.08.05 21:53 河南省 郑州市` → `[370,930,430,30]`.
- Cost: about 20 s and ≈$0.0007 per call.

A result that clearly diverges from these (scrambled OCR, all-zero bboxes, or an HTTP 400) indicates a broken recognition chain — check the key, the proxy, and the channel.

## Rendering

The call presents as a generic `vision 识图` card with the image inputs as raw input; the completed result shows the recognized text and the usage line. The tool writes no package-owned session event — `tool/call` and `tool/result` are the registry's ordinary outcome.

## Export shape

A function/namespace plugin: it exports `name` / `inject` / `Config` / `apply` and NO default. A stray `export default` would collapse the module via the Loader's `unwrapExports` and drop `inject` (see [docs/postmortem/0001](../../../docs/postmortem/0001-acp-default-export-drops-inject.md)).

## Model Experience

### Tool schema

#### What the model sees

The model sees the generated [`vision` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-vision).

#### Token effect

Fixed schema cost on every request where the tool is visible.

#### KV Cache effect

Prefix-stable while the definition and visibility are unchanged. Plugin lifecycle or scoped restrictions may invalidate reuse from this schema.

### Tool-call history and result

#### What the model sees

Each assistant tool call retains the image, prompt, and model in its arguments. Success returns the recognized text followed by a one-line summary `# <model> | config=<config>（已切换） | in=<n> out=<n> | <ms>ms` — the `（已切换）` marker appears only when the script fell back to another configuration. Stable failures include `Error: vision: \`image\` 必须是本地路径 / URL / data URI 且不能为空`, the script's reported error for a well-formed `ok: false` outcome, and the script-process errors (`退出码 <n>`, timeout, cancellation) when the child fails to run.

#### Token effect

Token growth scales with the recognized text the model returns; the arguments themselves are small and fixed-shape. Long OCR results stay in the call result until compaction.

#### KV Cache effect

Independent model request: the vision call is a separate process and HTTP request, so it adds nothing to the assistant request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

- **Requires a local Python interpreter and opencode go access** — the tool spawns `pythonPath` and needs a reachable opencode go endpoint with a valid key; without them every call fails with the script-process error.
- **Text-only model output** — the image never enters the assistant's context; only the model's textual description does, so fine-grained visual details the model does not mention are lost.
- **Single image per call** — multi-image comparison is out of scope; call the tool once per image.
- **JSON mode quality is model-dependent** — `json_mode` asks the model for `{text, bbox}` elements; the model decides the coordinates, so positions are approximate and can be wrong for cluttered images.
