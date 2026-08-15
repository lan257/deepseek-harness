// Unit tests for the vision tool plugin body. Spawn is mocked; every branch of
// src/index.ts must be exercised (per-file 100% coverage gate). The registry
// dispatches asynchronously, so tests wait for the body to spawn the child
// before emitting its events.
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { spawn } from 'node:child_process'

import * as tool from '../src/index.ts'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

const spawnMock = vi.mocked(spawn)

/** A minimal fake ChildProcess: EventEmitter with stdout/stderr pipes and kill. */
function fakeChild(): EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: ReturnType<typeof vi.fn> } {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: ReturnType<typeof vi.fn>
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

/** Emit stdout/stderr data and then a close event on a fake child. */
function emitOutcome(
  child: ReturnType<typeof fakeChild>,
  over: { code?: number | null; signalCode?: NodeJS.Signals | null; stdout?: string; stderr?: string } = {},
): void {
  if (over.stdout !== undefined) child.stdout.emit('data', Buffer.from(over.stdout, 'utf8'))
  if (over.stderr !== undefined) child.stderr.emit('data', Buffer.from(over.stderr, 'utf8'))
  child.emit('close', over.code !== undefined ? over.code : 0, over.signalCode !== undefined ? over.signalCode : null)
}

const DEFAULT_CONFIG = {
  pythonPath: 'python',
  scriptPath: '',
  timeoutMs: 180_000,
  defaultModel: 'mimo-v2.5',
}

const SUCCESS_OUTCOME = {
  ok: true,
  text: 'iQOO Neo9 Pro 23mm f/1.88 1/120s ISO2783 2026.08.05 21:53 河南省 郑州市',
  model: 'mimo-v2.5',
  config: 'opencode-go(cc-switch.db)',
  switched: true,
  attempts: [{ config: 'opencode-go(auth.json)', ok: false, error: 'HTTP 401' }],
  usage: { inputTokens: 1343, outputTokens: 941 },
  elapsedMs: 12_375,
}

async function setup(config: Partial<typeof DEFAULT_CONFIG> = {}): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(tool, { ...DEFAULT_CONFIG, ...config })
  return ctx
}

let callCounter = 0
function callVision(ctx: Context, args: unknown, signal: AbortSignal) {
  return ctx.tools.execute({
    signal,
    callId: CallId(`call-${++callCounter}`),
    name: 'vision',
    arguments: args,
  })
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(b => b.type === 'text').map(b => b.text).join('')
}

/** Wait until the tool body spawned the mocked child (listeners are attached by then). */
async function waitForSpawn(): Promise<ReturnType<typeof fakeChild>> {
  await vi.waitFor(() => { expect(spawnMock).toHaveBeenCalled() })
  return spawnMock.mock.results[0]!.value as ReturnType<typeof fakeChild>
}

beforeEach(() => {
  spawnMock.mockReset()
  // Every spawn call returns a fresh fake child; tests grab the instance via
  // waitForSpawn to emit its events.
  spawnMock.mockImplementation(() => fakeChild() as never)
})

describe('dsh-tool-vision', () => {
  it('registers a `vision` tool whose schema requires an image', async () => {
    const ctx = await setup()
    const schema = ctx.tools.schemas().find(s => s.name === 'vision')
    expect(schema).toBeDefined()
    const params = schema!.parameters as { properties?: Record<string, unknown>; required?: string[] }
    expect(Object.keys(params.properties ?? {}).sort()).toEqual(['image', 'json_mode', 'model', 'prompt'])
    expect(params.required).toContain('image')
  })

  it('runs the bundled script and returns the parsed canonical outcome', async () => {
    const ctx = await setup()
    const promise = callVision(ctx, { image: 'C:\\shots\\1.png', prompt: '提取报错' }, new AbortController().signal)
    const child = await waitForSpawn()
    emitOutcome(child, { stdout: JSON.stringify(SUCCESS_OUTCOME) })
    const result = await promise

    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected vision success')
    expect(result.value).toEqual({
      text: SUCCESS_OUTCOME.text,
      model: 'mimo-v2.5',
      config: 'opencode-go(cc-switch.db)',
      switched: true,
      attempts: [{ config: 'opencode-go(auth.json)', ok: false, error: 'HTTP 401' }],
      usage: { inputTokens: 1343, outputTokens: 941 },
      elapsedMs: 12_375,
    })
    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [python, scriptArgs] = spawnMock.mock.calls[0]!
    expect(python).toBe('python')
    expect(scriptArgs[0]).toMatch(/scripts[\\/]vision\.py$/)
    expect(scriptArgs.slice(1)).toEqual([
      'C:\\shots\\1.png', '提取报错', '--model', 'mimo-v2.5', '--json-out', '--timeout', '180',
    ])
    expect(text(result)).toContain('iQOO Neo9 Pro')
    expect(text(result)).toContain('config=opencode-go(cc-switch.db)')
    expect(text(result)).toContain('（已切换）')
  })

  it('passes --json when json_mode is requested and honors a model override', async () => {
    const ctx = await setup()
    const promise = callVision(
      ctx,
      { image: 'x.png', model: 'mimo-v2.5-pro', json_mode: true },
      new AbortController().signal,
    )
    const child = await waitForSpawn()
    emitOutcome(child, { stdout: JSON.stringify({ ...SUCCESS_OUTCOME, text: '[]' }) })
    const result = await promise
    expect(result.isError).toBe(false)
    const [, scriptArgs] = spawnMock.mock.calls[0]!
    expect(scriptArgs).toContain('mimo-v2.5-pro')
    expect(scriptArgs).toContain('--json')
  })

  it('uses the default model and no prompt when both are omitted', async () => {
    const ctx = await setup()
    const promise = callVision(ctx, { image: 'x.png' }, new AbortController().signal)
    const child = await waitForSpawn()
    emitOutcome(child, { stdout: JSON.stringify({ ...SUCCESS_OUTCOME, switched: false }) })
    const result = await promise
    expect(result.isError).toBe(false)
    const [, scriptArgs] = spawnMock.mock.calls[0]!
    expect(scriptArgs[0]).toMatch(/scripts[\\/]vision\.py$/)
    expect(scriptArgs.slice(1)).toEqual(['x.png', '--model', 'mimo-v2.5', '--json-out', '--timeout', '180'])
    expect(text(result)).not.toContain('（已切换）')
  })

  it('rejects an empty or whitespace-only image without spawning', async () => {
    const ctx = await setup()
    const result = await callVision(ctx, { image: '   ' }, new AbortController().signal)
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('不能为空')
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('surfaces a spawn error (interpreter missing) as an isError result', async () => {
    const ctx = await setup()
    const promise = callVision(ctx, { image: 'x.png' }, new AbortController().signal)
    const child = await waitForSpawn()
    child.emit('error', new Error('spawn python ENOENT'))
    const result = await promise
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('ENOENT')
  })

  it.each([
    { code: 2, signalCode: null as NodeJS.Signals | null, stderr: 'traceback line', fragment: '退出码 2' },
    { code: null, signalCode: 'SIGKILL' as NodeJS.Signals, stderr: 'traceback line', fragment: '退出码 SIGKILL' },
    { code: null, signalCode: null as NodeJS.Signals | null, stderr: 'traceback line', fragment: '退出码 unknown' },
  ])('reports a non-zero exit ($code/$signalCode) as an isError result', async ({ code, signalCode, stderr, fragment }) => {
    const ctx = await setup()
    const promise = callVision(ctx, { image: 'x.png' }, new AbortController().signal)
    const child = await waitForSpawn()
    emitOutcome(child, { code, signalCode, stderr })
    const result = await promise
    expect(result.isError).toBe(true)
    expect(text(result)).toContain(fragment)
    expect(text(result)).toContain('traceback line')
  })

  it.each([
    { stdout: 'not json at all', fragment: '非 JSON' },
    { stdout: JSON.stringify(42), fragment: '不是 JSON 对象' },
    { stdout: JSON.stringify({ ok: 'yes', text: 'x' }), fragment: '缺少 ok/text' },
    { stdout: JSON.stringify({ ok: true, text: 7 }), fragment: '缺少 ok/text' },
  ])('rejects malformed script output ($fragment)', async ({ stdout, fragment }) => {
    const ctx = await setup()
    const promise = callVision(ctx, { image: 'x.png' }, new AbortController().signal)
    const child = await waitForSpawn()
    emitOutcome(child, { stdout })
    const result = await promise
    expect(result.isError).toBe(true)
    expect(text(result)).toContain(fragment)
  })

  it.each([
    { error: 'HTTP 500: upstream down', fragment: 'HTTP 500' },
    { error: undefined, fragment: '模型调用失败' },
  ])('rejects a well-formed ok:false outcome with the script error', async ({ error, fragment }) => {
    const ctx = await setup()
    const promise = callVision(ctx, { image: 'x.png' }, new AbortController().signal)
    const child = await waitForSpawn()
    emitOutcome(child, { stdout: JSON.stringify({ ...SUCCESS_OUTCOME, ok: false, error }) })
    const result = await promise
    expect(result.isError).toBe(true)
    expect(text(result)).toContain(fragment)
  })

  it('coerces malformed optional outcome fields to safe defaults', async () => {
    const ctx = await setup()
    const promise = callVision(ctx, { image: 'x.png' }, new AbortController().signal)
    const child = await waitForSpawn()
    emitOutcome(child, { stdout: JSON.stringify({
      ok: true,
      text: 'hello',
      model: 7,
      config: null,
      switched: 'yes',
      attempts: ['junk', null, { config: 1 }, { config: 'a', ok: 'b' }, { config: 'a', ok: true, error: 1 }, { config: 'a', ok: false, error: 'x' }],
      usage: null,
      elapsedMs: 'fast',
    }) })
    const result = await promise
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected success')
    expect(result.value).toEqual({
      text: 'hello',
      model: 'mimo-v2.5',
      config: '',
      switched: false,
      attempts: [{ config: 'a', ok: false, error: 'x' }],
      usage: { inputTokens: 0, outputTokens: 0 },
      elapsedMs: 0,
    })
  })

  it('falls back to an empty attempts list when the script omits or mangles it', async () => {
    const ctx = await setup()
    const promise = callVision(ctx, { image: 'x.png' }, new AbortController().signal)
    const child = await waitForSpawn()
    emitOutcome(child, { stdout: JSON.stringify({ ...SUCCESS_OUTCOME, attempts: 'nope', usage: 'nope' }) })
    const result = await promise
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected success')
    const value = result.value as { attempts: unknown[]; usage: { inputTokens: number; outputTokens: number } }
    expect(value.attempts).toEqual([])
    expect(value.usage).toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  it('rejects with a timeout message and kills the child when the script hangs', async () => {
    const ctx = await setup({ timeoutMs: 50 })
    const promise = callVision(ctx, { image: 'x.png' }, new AbortController().signal)
    const child = await waitForSpawn()
    const result = await promise
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('超时')
    expect(child.kill).toHaveBeenCalled()
  })

  it('rejects a pre-aborted call with an abort error before the body runs', async () => {
    const ctx = await setup()
    const controller = new AbortController()
    controller.abort()
    const result = await callVision(ctx, { image: 'x.png' }, controller.signal)
    expect(result.isError).toBe(true)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('kills the child and rejects when the caller aborts mid-run', async () => {
    const ctx = await setup()
    const controller = new AbortController()
    const promise = callVision(ctx, { image: 'x.png' }, controller.signal)
    const child = await waitForSpawn()
    controller.abort()
    const result = await promise
    expect(result.isError).toBe(true)
    expect(child.kill).toHaveBeenCalled()
  })

  it('ignores a late abort after the call already completed', async () => {
    const ctx = await setup()
    const controller = new AbortController()
    const promise = callVision(ctx, { image: 'x.png' }, controller.signal)
    const child = await waitForSpawn()
    emitOutcome(child, { stdout: JSON.stringify(SUCCESS_OUTCOME) })
    const result = await promise
    expect(result.isError).toBe(false)
    controller.abort() // The once-listener fires; the settled guard no-ops.
    expect(result.isError).toBe(false)
  })

  it('normalizes blank or non-positive config to the shipped defaults', async () => {
    const ctx = await setup({ pythonPath: '   ', scriptPath: '  ', defaultModel: '  ' })
    const promise = callVision(ctx, { image: 'x.png' }, new AbortController().signal)
    const child = await waitForSpawn()
    emitOutcome(child, { stdout: JSON.stringify(SUCCESS_OUTCOME) })
    const result = await promise
    expect(result.isError).toBe(false)
    const [python, scriptArgs] = spawnMock.mock.calls[0]!
    expect(python).toBe('python')
    expect(scriptArgs[0]).toMatch(/scripts[\\/]vision\.py$/)
    expect(scriptArgs).toContain('--timeout')
    expect(scriptArgs).toContain('180')
    expect(scriptArgs).toContain('mimo-v2.5')
  })

  it('uses a custom script path when configured', async () => {
    const ctx = await setup({ scriptPath: 'D:\\tools\\vision.py' })
    const promise = callVision(ctx, { image: 'x.png' }, new AbortController().signal)
    const child = await waitForSpawn()
    emitOutcome(child, { stdout: JSON.stringify(SUCCESS_OUTCOME) })
    const result = await promise
    expect(result.isError).toBe(false)
    expect(spawnMock.mock.calls[0]![1][0]).toBe('D:\\tools\\vision.py')
  })

  it('presents the call with a stable title and the image inputs as raw input', async () => {
    const ctx = await setup()
    const def = ctx.tools.get('vision')!
    expect(def.presentCall?.({ image: 'a.png', prompt: '看什么', model: 'mimo-v2.5' })).toEqual({
      card: 'generic',
      title: 'vision 识图',
      kind: 'other',
      rawInput: { image: 'a.png', prompt: '看什么', model: 'mimo-v2.5' },
    })
    // Optional args omitted: the presenter falls back to empty strings.
    expect(def.presentCall?.({ image: 'b.png' })).toEqual({
      card: 'generic',
      title: 'vision 识图',
      kind: 'other',
      rawInput: { image: 'b.png', prompt: '', model: '' },
    })
  })

  it('unregisters the tool when its contributing fiber is disposed (HMR-safety)', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const fiber = await ctx.plugin(tool, { ...DEFAULT_CONFIG })
    expect(ctx.tools.schemas().some(s => s.name === 'vision')).toBe(true)
    await fiber.dispose()
    expect(ctx.tools.schemas().some(s => s.name === 'vision')).toBe(false)
  })

  it('has the namespace-plugin export shape (no stray default) so the Loader keeps name/inject/apply', () => {
    expect('default' in tool).toBe(false)
    expect(tool.name).toBe('tool-vision')
    expect(tool.inject).toEqual(['tools'])

    const loader = Object.create(Loader.prototype) as Loader
    const unwrapped = loader.unwrapExports(tool) as Record<string, unknown>
    expect(unwrapped).toBe(tool)
    expect(unwrapped.name).toBe('tool-vision')
    expect(unwrapped.inject).toEqual(['tools'])
    expect(typeof unwrapped.apply).toBe('function')
  })
})
