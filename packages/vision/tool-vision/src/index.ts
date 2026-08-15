/**
 * Model-facing image recognition tool. Each call runs the bundled
 * `scripts/vision.py` against a local image path, http(s) URL, or data URI
 * through opencode go's multimodal model (default `mimo-v2.5`); the script
 * reads the opencode API key from this agent's configuration (env, opencode
 * `auth.json`, cc-switch.db) and automatically switches key configuration on a
 * failed request. The canonical result carries the recognized text plus the
 * configuration actually used. Named exports preserve loader injection metadata.
 * @module @deepseek-ai/dsh-tool-vision
 */

import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'tool-vision'
export const inject = ['tools']

/** Deployment-facing configuration for the vision tool consumer. */
export interface Config {
  /** Python interpreter used to run the bundled vision script. */
  pythonPath: string
  /** Absolute script path override; empty uses the script bundled with this package. */
  scriptPath: string
  /** Per-request timeout in milliseconds, also passed to the script as its request timeout. */
  timeoutMs: number
  /** Model the script calls when the model argument is omitted. */
  defaultModel: string
}

/** Schemastery configuration for the vision tool consumer; every field defaults. */
export const Config: z<Config> = z.object({
  pythonPath: z.string().default('python'),
  scriptPath: z.string().default(''),
  timeoutMs: z.natural().min(1).default(180_000),
  defaultModel: z.string().default('mimo-v2.5'),
})

/** The Python script bundled with this package, resolved from the emitted or source tree. */
const BUNDLED_SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '../scripts/vision.py')

/** One failed configuration attempt reported by the script's `--json-out` output. */
interface VisionAttempt {
  config: string
  ok: boolean
  error: string
}

/** The canonical, script-declared vision result the tool returns. */
interface VisionOutcome {
  ok: boolean
  text: string
  model: string
  config: string
  switched: boolean
  attempts: VisionAttempt[]
  usage: { inputTokens: number; outputTokens: number }
  elapsedMs: number
  error: string | undefined
}

/** Raw captured stdout/stderr of the vision script process. */
interface RunOutcome {
  stdout: string
  stderr: string
}

/**
 * Run the vision script to completion. Resolves with its output on exit code 0,
 * rejects on a non-zero exit, a spawn error, a timeout, or caller cancellation.
 * @param pythonPath - interpreter to spawn.
 * @param args - script arguments, including image and prompt.
 * @param timeoutMs - wall-clock cap after which the child is killed.
 * @param signal - caller cancellation; an abort kills the child and rejects.
 * @returns the captured script output.
 */
function runPython(
  pythonPath: string,
  args: readonly string[],
  timeoutMs: number,
  signal: AbortSignal,
): Promise<RunOutcome> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(pythonPath, [...args], { signal })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let settled = false
    const finish = (settle: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      settle()
    }
    const timer = setTimeout(() => {
      finish(() => {
        child.kill()
        reject(new Error(`vision: 脚本超时（${timeoutMs}ms）`))
      })
    }, timeoutMs)
    signal.addEventListener('abort', () => {
      finish(() => {
        child.kill()
        reject(new Error('vision: 调用已取消'))
      })
    }, { once: true })
    child.stdout.on('data', (chunk: Buffer) => { stdoutChunks.push(chunk) })
    child.stderr.on('data', (chunk: Buffer) => { stderrChunks.push(chunk) })
    child.on('error', (error) => { finish(() => { reject(error) }) })
    child.on('close', (code, signalCode) => {
      finish(() => {
        const stdout = Buffer.concat(stdoutChunks).toString('utf8')
        const stderr = Buffer.concat(stderrChunks).toString('utf8')
        if (code === 0) {
          resolvePromise({ stdout, stderr })
        } else {
          reject(new Error(`vision: 脚本退出码 ${code ?? signalCode ?? 'unknown'}\n${stderr.trim()}`))
        }
      })
    })
  })
}

/**
 * Parse the script's `--json-out` object, coercing optional fields to safe
 * defaults. Throws on malformed output; a well-formed `ok: false` outcome is
 * returned as-is and rejected by the caller.
 * @param stdout - the script's stdout.
 * @returns the parsed outcome.
 */
function parseVisionOutcome(stdout: string): VisionOutcome {
  let data: unknown
  try {
    data = JSON.parse(stdout)
  } catch {
    throw new Error(`vision: 脚本输出非 JSON: ${stdout.slice(0, 500)}`)
  }
  if (typeof data !== 'object' || data === null) {
    throw new Error('vision: 脚本输出不是 JSON 对象')
  }
  const o = data as Record<string, unknown>
  if (typeof o.ok !== 'boolean' || typeof o.text !== 'string') {
    throw new Error('vision: 脚本输出缺少 ok/text 字段')
  }
  const usage = typeof o.usage === 'object' && o.usage !== null ? o.usage as Record<string, unknown> : {}
  const attempts = Array.isArray(o.attempts) ? o.attempts : []
  return {
    ok: o.ok,
    text: o.text,
    model: typeof o.model === 'string' ? o.model : '',
    config: typeof o.config === 'string' ? o.config : '',
    switched: o.switched === true,
    attempts: attempts.filter((a): a is VisionAttempt =>
      typeof a === 'object' && a !== null
      && typeof (a as Record<string, unknown>).config === 'string'
      && typeof (a as Record<string, unknown>).ok === 'boolean'
      && typeof (a as Record<string, unknown>).error === 'string'),
    usage: {
      inputTokens: typeof usage.inputTokens === 'number' ? usage.inputTokens : 0,
      outputTokens: typeof usage.outputTokens === 'number' ? usage.outputTokens : 0,
    },
    elapsedMs: typeof o.elapsedMs === 'number' ? o.elapsedMs : 0,
    error: typeof o.error === 'string' ? o.error : undefined,
  }
}

/** Model-facing tool description; stable text the model reads verbatim. */
const DESCRIPTION =
  '识图/OCR/看截图/UI 元素定位。输入本地图片路径、URL 或 dataURI，返回识别出的文字与画面描述；'
  + 'json_mode 时返回含像素坐标 bbox 的数组。当用户提供图片、截图、报错图、UI 图、设计稿，'
  + '或需要读取图中文字时调用本工具，并把具体想从图中获取的信息写进 prompt。'
  + '底层调用 opencode go 的 mimo-v2.5 多模态模型，请求失败时自动切换密钥配置重试。'
  + '注意：本工具只识别已存在的图片，不会主动截屏。'

/**
 * Register the `vision` tool on `ctx.tools`. The script is spawned per call,
 * so a call is canceled and the child killed when `exec.signal` aborts.
 * @param ctx - registrant context carrying the tool registry.
 * @param config - deployment configuration; every field has a default.
 */
export function apply(ctx: Context, config: Config): void {
  const pythonPath = config.pythonPath.trim() || 'python'
  const scriptPath = config.scriptPath.trim()
  const timeoutMs = config.timeoutMs
  const defaultModel = config.defaultModel.trim() || 'mimo-v2.5'
  const script = scriptPath || BUNDLED_SCRIPT
  ctx.tools.register(defineTool({
    name: 'vision',
    description: DESCRIPTION,
    parameters: {
      image: {
        type: 'string',
        required: true,
        description: '图片：本地绝对路径 / http(s):// URL / data: 数据 URI',
      },
      prompt: {
        type: 'string',
        description: '提示词：具体说明要从图中获取什么（默认：逐字识别文字 + 像素坐标 bbox + 一句话概要）',
      },
      json_mode: {
        type: 'boolean',
        description: 'true 时只输出 JSON 数组 [{text,bbox}]，供程序消费',
      },
      model: {
        type: 'string',
        description: '识图模型名（默认 mimo-v2.5）',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', required: true, description: '模型识别出的文字与画面描述' },
          model: { type: 'string', required: true, description: '实际使用的模型名' },
          config: { type: 'string', required: true, description: '实际使用的配置标签（通道 + 密钥来源）' },
          switched: { type: 'boolean', required: true, description: '请求过程中是否发生过配置切换' },
          attempts: {
            type: 'array',
            required: true,
            description: '失败配置尝试记录，成功那次不在此列',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                config: { type: 'string', required: true },
                ok: { type: 'boolean', required: true },
                error: { type: 'string', required: true },
              },
            },
          },
          usage: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              inputTokens: { type: 'integer', required: true },
              outputTokens: { type: 'integer', required: true },
            },
          },
          elapsedMs: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.text
          + `\n# ${value.model} | config=${value.config}${value.switched ? '（已切换）' : ''}`
          + ` | in=${value.usage.inputTokens} out=${value.usage.outputTokens} | ${value.elapsedMs}ms`,
      }],
    },
    async execute(args, exec) {
      const image = args.image.trim()
      if (image.length === 0) {
        throw new Error('vision: `image` 必须是本地路径 / URL / data URI 且不能为空')
      }
      const prompt = (args.prompt ?? '').trim()
      const model = (args.model ?? '').trim() || defaultModel
      const scriptArgs: string[] = [script, image]
      if (prompt.length > 0) scriptArgs.push(prompt)
      scriptArgs.push('--model', model, '--json-out', '--timeout', String(Math.ceil(timeoutMs / 1000)))
      if (args.json_mode === true) scriptArgs.push('--json')
      const { stdout } = await runPython(pythonPath, scriptArgs, timeoutMs, exec.signal)
      const outcome = parseVisionOutcome(stdout)
      if (!outcome.ok) {
        throw new Error(`vision: ${outcome.error ?? '模型调用失败'}`)
      }
      return {
        text: outcome.text,
        model: outcome.model || model,
        config: outcome.config,
        switched: outcome.switched,
        attempts: outcome.attempts,
        usage: outcome.usage,
        elapsedMs: outcome.elapsedMs,
      }
    },
    presentCall: args => ({
      card: 'generic',
      title: 'vision 识图',
      kind: 'other',
      rawInput: { image: args.image, prompt: args.prompt ?? '', model: args.model ?? '' },
    }),
  }))
}
