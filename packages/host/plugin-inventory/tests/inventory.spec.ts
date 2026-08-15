import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import PluginInventoryGateway, { createDescriptionResolver } from '../src/index.ts'
import type { PluginEntryId } from '../src/types.ts'

const contexts: Context[] = []
const homes: string[] = []
let previousDshHome: string | undefined

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(homes.splice(0).map(path => rm(path, { recursive: true, force: true })))
  if (previousDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousDshHome
  previousDshHome = undefined
})

const activePlugin: Plugin.Function = () => {}
const pendingPlugin: Plugin.Object = {
  inject: ['neverReady'],
  apply() {},
}

/** Harness with an isolated empty DSH_HOME so gateway skill discovery stays deterministic. */
async function harness(): Promise<{
  ctx: Context
  inventory: PluginInventoryGateway
  home: string
}> {
  const home = await mkdtemp(join(tmpdir(), 'plugin-inventory-home-'))
  homes.push(home)
  previousDshHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Loader)
  ctx.loader.builtins.active = activePlugin
  ctx.loader.builtins.pending = pendingPlugin
  ctx.loader.builtins['not-installed'] = activePlugin
  await ctx.plugin(PluginInventoryGateway)
  const inventory = ctx.get('pluginInventory') as PluginInventoryGateway
  return { ctx, inventory, home }
}

describe('PluginInventoryGateway', () => {
  it('publishes list and setEnabled under the pluginInventory namespace', async () => {
    const { inventory } = await harness()
    expect(inventory.typertRemote).toMatchObject({
      serviceKey: 'pluginInventory',
      namespace: 'pluginInventory',
    })
    expect(remoteMethods(inventory)).toEqual([
      { method: 'list', invocation: { kind: 'direct' } },
      { method: 'setEnabled', invocation: { kind: 'direct' } },
    ])
  })

  it('projects current non-group Loader entries without a second cache', async () => {
    const { ctx, inventory } = await harness()
    const activeId = await ctx.loader.create({ name: 'cordis:active' })
    const pendingId = await ctx.loader.create({ name: 'cordis:pending' })
    const disabledId = await ctx.loader.create({
      name: 'cordis:not-installed',
      disabled: true,
    })
    await ctx.loader.create({ name: 'cordis:active', group: true })

    const snapshot = await inventory.list()
    expect(snapshot.entries).toHaveLength(3)
    expect(snapshot.entries).toEqual(expect.arrayContaining([
      {
        entryId: activeId,
        moduleName: 'cordis:active',
        kind: 'plugin',
        description: undefined,
        enabled: true,
        fiberPhase: 'active',
      },
      {
        entryId: pendingId,
        moduleName: 'cordis:pending',
        kind: 'plugin',
        description: undefined,
        enabled: true,
        fiberPhase: 'pending',
      },
      {
        entryId: disabledId,
        moduleName: 'cordis:not-installed',
        kind: 'plugin',
        description: undefined,
        enabled: false,
        fiberPhase: null,
      },
    ]))

    await ctx.loader.update(activeId, { disabled: true })
    expect((await inventory.list()).entries.find(entry => entry.entryId === activeId)).toEqual({
      entryId: activeId,
      moduleName: 'cordis:active',
      kind: 'plugin',
      description: undefined,
      enabled: false,
      fiberPhase: null,
    })

    await ctx.loader.remove(pendingId)
    expect((await inventory.list()).entries.some(entry => entry.entryId === pendingId)).toBe(false)
  })

  it('enables and disables entries at runtime through setEnabled', async () => {
    const { ctx, inventory } = await harness()
    const activeId = (await ctx.loader.create({ name: 'cordis:active' })) as PluginEntryId
    const disabledId = (await ctx.loader.create({
      name: 'cordis:not-installed',
      disabled: true,
    })) as PluginEntryId

    await inventory.setEnabled(activeId, false)
    expect((await inventory.list()).entries.find(entry => entry.entryId === activeId)).toEqual({
      entryId: activeId,
      moduleName: 'cordis:active',
      kind: 'plugin',
      description: undefined,
      enabled: false,
      fiberPhase: null,
    })

    await inventory.setEnabled(disabledId, true)
    expect((await inventory.list()).entries.find(entry => entry.entryId === disabledId)).toEqual({
      entryId: disabledId,
      moduleName: 'cordis:not-installed',
      kind: 'plugin',
      description: undefined,
      enabled: true,
      fiberPhase: 'active',
    })
  })

  it('appends local skills as skill rows and toggles them through setEnabled', async () => {
    const { inventory, home } = await harness()
    const skillFile = join(home, 'skills', 'alpha', 'SKILL.md')
    await mkdir(join(home, 'skills', 'alpha'), { recursive: true })
    await writeFile(skillFile, '---\nname: alpha\ndescription: Alpha skill\n---\n')

    let snapshot = await inventory.list()
    const skillRow = snapshot.entries.find(entry => entry.moduleName === 'skill:alpha')
    expect(skillRow).toMatchObject({
      moduleName: 'skill:alpha',
      kind: 'skill',
      description: 'Alpha skill',
      enabled: true,
      fiberPhase: null,
      path: skillFile,
    })
    expect(skillRow?.entryId).toBe('skill:alpha')

    await inventory.setEnabled(skillRow!.entryId, false)
    snapshot = await inventory.list()
    expect(snapshot.entries.find(entry => entry.moduleName === 'skill:alpha')).toMatchObject({
      enabled: false,
      path: join(home, 'skills', 'alpha', 'SKILL.md.disabled'),
    })
  })

  it('describes each MCP client row by its configured server name', async () => {
    const { ctx, inventory } = await harness()
    await ctx.loader.create({
      name: '@deepseek-ai/dsh-mcp-client',
      disabled: true,
      config: { serverName: 'postgres' },
    })
    await ctx.loader.create({
      name: '@deepseek-ai/dsh-mcp-client',
      disabled: true,
      config: { serverName: 'xmind' },
    })

    const rows = (await inventory.list()).entries.filter(entry => entry.moduleName === '@deepseek-ai/dsh-mcp-client')
    expect(rows.map(row => row.description)).toEqual(['连接 MCP 服务器 postgres', '连接 MCP 服务器 xmind'])
  })

  it('rejects setEnabled for an unknown entry id', async () => {
    const { inventory } = await harness()
    await expect(inventory.setEnabled('missing' as never, true)).rejects.toThrow('cannot resolve entry missing')
  })
})

describe('createDescriptionResolver', () => {
  it('resolves package.json descriptions per package root with negative caching', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-inventory-'))
    try {
      const scope = join(root, 'node_modules', '@fixture')
      await mkdir(join(scope, 'tool'), { recursive: true })
      await mkdir(join(scope, 'muted'), { recursive: true })
      await writeFile(join(scope, 'tool', 'package.json'), JSON.stringify({
        name: '@fixture/tool',
        description: '  A fixture tool with a description.  ',
      }))
      await writeFile(join(scope, 'muted', 'package.json'), JSON.stringify({ name: '@fixture/muted' }))

      const describe = createDescriptionResolver(pathToFileURL(root).href + '/')
      expect(describe('@fixture/tool')).toBe('A fixture tool with a description.')
      // Subpath specifiers share their package root's description.
      expect(describe('@fixture/tool/extra')).toBe('A fixture tool with a description.')
      // Packages without a non-empty description resolve to none.
      expect(describe('@fixture/muted')).toBeUndefined()
      // Unresolvable roots and builtins never throw.
      expect(describe('@fixture/missing')).toBeUndefined()
      expect(describe('cordis:include')).toBeUndefined()
      expect(describe('plain-root')).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
