/** Read-only projection of the current Cordis Loader plugin entries. */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { Context, FiberState } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import type {
  PluginEntryId,
  PluginFiberPhase,
  PluginInventoryEntry,
  PluginInventorySnapshot,
} from './types.ts'
import { LocalSkillService } from './skills.ts'

export type * from './types.ts'
export { LocalSkillService } from './skills.ts'
export type * from './skills.ts'

/** Brand an existing Loader-tree entry id at the owning boundary. */
function pluginEntryId(value: string): PluginEntryId {
  return value as PluginEntryId
}

/** Strip a Loader specifier to its package root (scope + name), or null for `cordis:` builtins. */
function packageRootOf(specifier: string): string | null {
  if (specifier.startsWith('cordis:')) return null
  const segments = specifier.split('/')
  if (specifier.startsWith('@')) {
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : null
  }
  return segments[0] ?? null
}

/**
 * Build a per-package-root description resolver anchored at the config tree.
 * The returned function caches the resolved description (including the
 * negative verdict) per package root and never expires: package.json content
 * changes take effect on restart, matching the Loader's own plugin-set model.
 * @param baseUrl - the config tree's baseUrl (file URL of the cordis.yml directory).
 * @returns a function mapping a Loader specifier to its package description.
 */
export function createDescriptionResolver(baseUrl: string): (specifier: string) => string | undefined {
  const require = createRequire(baseUrl)
  const cache = new Map<string, string | undefined>()
  return (specifier) => {
    const root = packageRootOf(specifier)
    if (root === null) return undefined
    const cached = cache.get(root)
    if (cached !== undefined) return cached
    let description: string | undefined
    try {
      const pkgPath = require.resolve(`${root}/package.json`)
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { description?: unknown }
      if (typeof pkg.description === 'string') {
        const trimmed = pkg.description.trim()
        if (trimmed.length > 0) description = trimmed
      }
    } catch {
      // Unresolvable package root (builtin or subpath without a resolvable
      // package.json): the entry simply has no description.
    }
    cache.set(root, description)
    return description
  }
}

/** Runtime mirror: FiberState is a cross-package const enum. */
const FIBER_STATE = {
  PENDING: 0 as FiberState.PENDING,
  LOADING: 1 as FiberState.LOADING,
  ACTIVE: 2 as FiberState.ACTIVE,
  FAILED: 3 as FiberState.FAILED,
  DISPOSED: 4 as FiberState.DISPOSED,
  UNLOADING: 5 as FiberState.UNLOADING,
} as const

/** Complete public projection of Cordis Fiber states. */
const FIBER_PHASE = {
  [FIBER_STATE.PENDING]: 'pending',
  [FIBER_STATE.LOADING]: 'loading',
  [FIBER_STATE.ACTIVE]: 'active',
  [FIBER_STATE.FAILED]: 'failed',
  [FIBER_STATE.DISPOSED]: null,
  [FIBER_STATE.UNLOADING]: 'unloading',
} as const satisfies Record<FiberState, PluginFiberPhase>

/** Remote-only service exposing the Loader's current non-group entry state and local skills. */
export class PluginInventoryGateway extends TypertRemoteService {
  static inject = ['loader']

  /** Module specifier of the MCP client bridge; its rows describe their server. */
  private static readonly MCP_CLIENT = '@deepseek-ai/dsh-mcp-client'

  private readonly describe: (specifier: string) => string | undefined
  private readonly skills = new LocalSkillService()

  constructor(ctx: Context) {
    super(ctx, 'pluginInventory')
    // Resolution anchor is the config tree; without one (a bare in-memory
    // Context) entries carry no description rather than failing the snapshot.
    this.describe = ctx.baseUrl === undefined
      ? () => undefined
      : createDescriptionResolver(ctx.baseUrl)
  }

  /** Chinese per-server description for an MCP client row so distinct servers stay distinct. */
  private mcpDescription(entry: { options: { config?: unknown; id: string } }): string {
    const config = entry.options.config as { serverName?: unknown } | undefined
    const serverName = typeof config?.serverName === 'string' && config.serverName.length > 0
      ? config.serverName
      : entry.options.id
    return `连接 MCP 服务器 ${serverName}`
  }

  /**
   * Read the Loader directly on every call and append local skills. Cordis's
   * internal plugin/status events already maintain Entry.fiber and
   * Fiber.state, so a second cache would only add another lifecycle truth to
   * keep synchronized; skill rows are re-discovered per call too.
   * @returns Current non-group Loader entries in Loader order, then local
   * skills sorted by name.
   */
  @Remote('list')
  async list(): Promise<PluginInventorySnapshot> {
    const entries: PluginInventoryEntry[] = []
    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.group) continue
      const description = entry.options.name === PluginInventoryGateway.MCP_CLIENT
        ? this.mcpDescription(entry)
        : this.describe(entry.options.name)
      entries.push({
        entryId: pluginEntryId(entry.id),
        moduleName: entry.options.name,
        kind: 'plugin',
        ...(description !== undefined ? { description } : {}),
        enabled: !entry.disabled,
        fiberPhase: entry.fiber === undefined ? null : FIBER_PHASE[entry.fiber.state],
      })
    }
    for (const skill of await this.skills.list()) {
      entries.push({
        entryId: skillEntryId(skill.name),
        moduleName: `skill:${skill.name}`,
        kind: 'skill',
        description: skill.description,
        enabled: skill.enabled,
        fiberPhase: null,
        path: skill.path,
      })
    }
    return { entries }
  }

  /**
   * Enable or disable one inventory row at runtime. Plugin rows are Loader
   * entries (disposed when disabling, re-applied when enabling, persisted
   * through the owning tree); skill rows are local skills whose entry file is
   * renamed between its enabled and disabled variants.
   * @param entryId - exact row id from the inventory snapshot (`skill:<name>` for skills).
   * @param enabled - target enablement; `false` stops the entry.
   * @throws when the entry cannot be resolved or the transition fails; the
   * Loader rolls the entry's options and Fiber back on failure.
   */
  @Remote('setEnabled')
  async setEnabled(entryId: PluginEntryId, enabled: boolean): Promise<void> {
    if (entryId.startsWith('skill:')) {
      await this.skills.setEnabled(entryId.slice('skill:'.length), enabled)
      return
    }
    await this.ctx.loader.update(entryId, { disabled: !enabled })
  }
}

/** Brand a `skill:<name>` row id at the owning boundary. */
function skillEntryId(name: string): PluginEntryId {
  return `skill:${name}` as PluginEntryId
}

export default PluginInventoryGateway
