// Real-composition coverage: the vision tool boots through the actual Loader
// from a cordis.yml, so config defaults, schema registration, and load-time
// misconfiguration all run the shipping loader path (packages/AGENTS.md policy).
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ToolVision from '@deepseek-ai/dsh-tool-vision'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/**
 * Boot a cordis.yml carrying the given tool-vision config block.
 * @param configLines - YAML lines nested under the tool's `config:` key.
 * @returns the booted context.
 */
async function boot(configLines: readonly string[] = []): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-vision-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    "- name: '@deepseek-ai/dsh-tool-vision'",
    ...configLines.length > 0 ? ['  config:', ...configLines] : [],
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-tool-vision', ToolVision],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  return ctx
}

describe('tool-vision real Loader composition through cordis.yml', () => {
  it('mounts with schema defaults and registers the vision tool', async () => {
    const ctx = await boot()
    const schema = ctx.tools.schemas().find(s => s.name === 'vision')
    expect(schema).toBeDefined()
    const params = schema!.parameters as { properties?: Record<string, unknown>; required?: string[] }
    expect(Object.keys(params.properties ?? {})).toEqual(['image', 'prompt', 'json_mode', 'model'])
    expect(params.required).toContain('image')
  })

  it.each([
    { label: 'is not a number', configLines: ['    timeoutMs: "fast"'], failure: /timeoutMs/ },
    { label: 'is negative', configLines: ['    timeoutMs: -1'], failure: /timeoutMs/ },
  ])('fails loading when timeoutMs $label', async ({ configLines, failure }) => {
    // Misconfiguration fails at load: the entry's apply rejects and boot never
    // reaches a running tool.
    await expect(boot(configLines)).rejects.toThrow(failure)
  })
})
