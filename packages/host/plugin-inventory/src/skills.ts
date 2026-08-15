/** Local skill discovery and enablement for the plugin inventory surface. */

import { readdir, readFile, rename, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'

/** One discovered local skill. */
export interface LocalSkill {
  /** Skill name from the SKILL.md frontmatter. */
  readonly name: string
  /** Skill description from the frontmatter. */
  readonly description: string
  /** Absolute path of the skill entry file (SKILL.md or the .md / .disabled variant). */
  readonly path: string
  /** True when the enabled variant exists (SKILL.md or <name>.md). */
  readonly enabled: boolean
}

const ENABLED_SUFFIX = 'SKILL.md'
const DISABLED_SUFFIX = 'SKILL.md.disabled'
const ENABLED_FILE_SUFFIX = '.md'
const DISABLED_FILE_SUFFIX = '.md.disabled'

/** Whether a skill name is safe to use as an entry identity. */
function isSafeSkillName(name: string): boolean {
  return name.length > 0 && !/[\\/:<>"|?\s]/.test(name)
}

/** Resolve the user skill roots, highest precedence first. */
export function skillRoots(dshHome: string, agentsHome: string): string[] {
  return [join(dshHome, 'skills'), join(agentsHome, 'skills')]
}

/** Parse `name` and `description` from a skill file's YAML frontmatter. */
function parseSkillSummary(raw: string): { name: string; description: string } | undefined {
  const firstLineEnd = raw.indexOf('\n')
  if (firstLineEnd < 0) return undefined
  if (raw.slice(0, firstLineEnd).replace(/\r$/, '') !== '---') return undefined
  let start = firstLineEnd + 1
  let closing = -1
  while (start <= raw.length) {
    const nextNewline = raw.indexOf('\n', start)
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline
    if (raw.slice(start, lineEnd).replace(/\r$/, '') === '---') {
      closing = start
      break
    }
    if (nextNewline < 0) return undefined
    start = nextNewline + 1
  }
  if (closing < 0) return undefined
  let data: unknown
  try {
    data = parseYaml(raw.slice(firstLineEnd + 1, closing))
  } catch {
    return undefined
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined
  const record = data as Record<string, unknown>
  const name = record.name
  const description = record.description
  if (typeof name !== 'string' || !isSafeSkillName(name)) return undefined
  if (typeof description !== 'string' || description.length === 0) return undefined
  return { name, description }
}

/** Read a skill summary from a file, tolerating absence and malformed frontmatter. */
async function readSkillSummary(path: string): Promise<{ name: string; description: string } | undefined> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return undefined
  }
  return parseSkillSummary(raw)
}

/** Skill identity within one root: the directory name for bundle skills, or the file basename. */
interface SkillLocator {
  readonly kind: 'directory' | 'file'
  /** The enabled/disabled entry file path (SKILL.md / <name>.md or their .disabled variant). */
  readonly file: string
}

/** Locate the enabled or disabled variant of a skill by name inside one root. */
async function locateSkill(root: string, name: string): Promise<SkillLocator | undefined> {
  const directory = join(root, name)
  if (await exists(join(directory, ENABLED_SUFFIX))) return { kind: 'directory', file: join(directory, ENABLED_SUFFIX) }
  if (await exists(join(directory, DISABLED_SUFFIX))) return { kind: 'directory', file: join(directory, DISABLED_SUFFIX) }
  const file = join(root, `${name}${ENABLED_FILE_SUFFIX}`)
  if (await exists(file)) return { kind: 'file', file }
  const disabledFile = join(root, `${name}${DISABLED_FILE_SUFFIX}`)
  if (await exists(disabledFile)) return { kind: 'file', file: disabledFile }
  return undefined
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Enumerate local skills from the user roots in precedence order and control
 * their enablement by renaming the entry file between its enabled variant
 * (SKILL.md / <name>.md) and its disabled variant (SKILL.md.disabled /
 * <name>.md.disabled). Renaming keeps the skill invisible to every filesystem
 * skill provider without touching discovery logic, and stays reversible.
 */
export class LocalSkillService {
  /**
   * Build the service.
   * @param dshHome - the DeepSeek Harness home (defaults to `$DSH_HOME` or `~/.dsh`).
   * @param agentsHome - the shared agent home (defaults to `$DSH_AGENTS_HOME` or `~/.agents`).
   */
  constructor(
    private readonly dshHome: string = process.env.DSH_HOME ?? join(homedir(), '.dsh'),
    private readonly agentsHome: string = process.env.DSH_AGENTS_HOME ?? join(homedir(), '.agents'),
  ) {}

  /**
   * List every local skill across the user roots, sorted by name. A skill is
   * the first (highest-precedence) root's entry for its name; each root skips
   * the `.system` directory on the harness-home root, mirroring the filesystem
   * provider's discovery rules.
   * @returns discovered skills; malformed or unreadable entries are omitted.
   */
  async list(): Promise<LocalSkill[]> {
    const byName = new Map<string, LocalSkill>()
    const roots = skillRoots(this.dshHome, this.agentsHome)
    for (const root of roots) {
      let entries
      try {
        entries = await readdir(root, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        const name = entry.name
        if (name === '.system' || byName.has(name)) continue
        if (entry.isDirectory()) {
          const enabled = join(root, name, ENABLED_SUFFIX)
          const disabled = join(root, name, DISABLED_SUFFIX)
          const file = (await exists(enabled)) ? enabled : (await exists(disabled)) ? disabled : undefined
          if (file === undefined) continue
          const summary = await readSkillSummary(file)
          if (summary === undefined) continue
          byName.set(summary.name, {
            name: summary.name,
            description: summary.description,
            path: file,
            enabled: file === enabled,
          })
        } else if (entry.isFile() && name.endsWith(ENABLED_FILE_SUFFIX)) {
          const summary = await readSkillSummary(join(root, name))
          if (summary === undefined) continue
          byName.set(summary.name, {
            name: summary.name,
            description: summary.description,
            path: join(root, name),
            enabled: true,
          })
        } else if (entry.isFile() && name.endsWith(DISABLED_FILE_SUFFIX)) {
          const summary = await readSkillSummary(join(root, name))
          if (summary === undefined) continue
          byName.set(summary.name, {
            name: summary.name,
            description: summary.description,
            path: join(root, name),
            enabled: false,
          })
        }
      }
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  /**
   * Enable or disable one local skill by renaming its entry file.
   * @param name - the skill name from the inventory.
   * @param enabled - target enablement; `false` renames SKILL.md → SKILL.md.disabled.
   * @throws when no skill of that name exists in any user root.
   */
  async setEnabled(name: string, enabled: boolean): Promise<void> {
    for (const root of skillRoots(this.dshHome, this.agentsHome)) {
      const locator = await locateSkill(root, name)
      if (locator === undefined) continue
      // The disabled variant always carries the `.disabled` suffix on the
      // enabled file name; already being in the target state is a no-op.
      const disabled = locator.file.endsWith('.disabled')
      if (disabled !== !enabled) {
        await rename(locator.file, enabled ? locator.file.slice(0, -'.disabled'.length) : `${locator.file}.disabled`)
      }
      return
    }
    throw new Error(`pluginInventory: no local skill named ${JSON.stringify(name)}`)
  }
}
