import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable Loader-tree identity of one configured plugin entry. */
export type PluginEntryId = Branded<'PluginEntryId'>

/** Lifecycle state of an entry's root Fiber, or null when it has no live root Fiber. */
export type PluginFiberPhase =
  | 'pending'
  | 'loading'
  | 'active'
  | 'failed'
  | 'unloading'
  | null

/** One inventory row's kind: a Loader plugin entry or a discovered local skill. */
export type PluginEntryKind = 'plugin' | 'skill'

/** One non-group Loader entry exposed to trusted clients. */
export interface PluginInventoryEntry {
  readonly entryId: PluginEntryId
  /** Exact module specifier imported by the Loader entry, or `skill:<name>` for skill rows. */
  readonly moduleName: string
  /** Row kind: Loader plugin or local skill. */
  readonly kind: PluginEntryKind
  /**
   * The resolved plugin package's package.json description, or the skill's
   * SKILL.md frontmatter description; undefined when neither resolves.
   */
  readonly description?: string
  /** Effective enablement: Loader enablement for plugins, SKILL.md presence for skills. */
  readonly enabled: boolean
  /** Root Fiber phase for plugin rows; always null for skill rows. */
  readonly fiberPhase: PluginFiberPhase
  /** Absolute SKILL.md path for skill rows; absent for plugin rows. */
  readonly path?: string
}

/** Point-in-time inventory returned by the plugin inventory Remote. */
export interface PluginInventorySnapshot {
  readonly entries: readonly PluginInventoryEntry[]
}
