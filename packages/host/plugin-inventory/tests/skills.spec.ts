import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LocalSkillService } from '../src/skills.ts'

const DIRTY: string[] = []

async function makeHome(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'plugin-inventory-skills-'))
  DIRTY.push(root)
  return root
}

async function writeSkill(root: string, name: string, description: string, enabled = true): Promise<void> {
  const dir = join(root, 'skills', name)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, enabled ? 'SKILL.md' : 'SKILL.md.disabled'), [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    '---',
    '',
    `${name} body.`,
  ].join('\n'))
}

afterEach(async () => {
  await Promise.all(DIRTY.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('LocalSkillService', () => {
  it('discovers directory and flat skills with frontmatter summaries', async () => {
    const home = await makeHome()
    await writeSkill(home, 'alpha', 'Alpha skill')
    await writeSkill(home, 'beta', 'Beta skill', false)
    // Flat Markdown skill in the enabled and disabled variants.
    const root = join(home, 'skills')
    await writeFile(join(root, 'flat.md'), '---\nname: flat\ndescription: Flat skill\n---\n')
    await writeFile(join(root, 'muted.md.disabled'), '---\nname: muted\ndescription: Muted skill\n---\n')
    // Malformed entries are ignored.
    await writeFile(join(root, 'broken.md'), 'no frontmatter')
    await mkdir(join(root, 'no-entry'))

    const service = new LocalSkillService(home, join(home, 'agents'))
    const skills = await service.list()
    expect(skills.map(skill => skill.name)).toEqual(['alpha', 'beta', 'flat', 'muted'])
    expect(skills.find(skill => skill.name === 'alpha')).toMatchObject({ description: 'Alpha skill', enabled: true })
    expect(skills.find(skill => skill.name === 'beta')).toMatchObject({ description: 'Beta skill', enabled: false })
    expect(skills.find(skill => skill.name === 'flat')?.enabled).toBe(true)
    expect(skills.find(skill => skill.name === 'muted')?.enabled).toBe(false)
  })

  it('lets the harness-home root win over the agents-home root for duplicate names', async () => {
    const home = await makeHome()
    const agents = await makeHome()
    await writeSkill(home, 'same', 'Home wins')
    await writeSkill(agents, 'same', 'Agents loses')
    const skills = await new LocalSkillService(home, agents).list()
    expect(skills).toHaveLength(1)
    expect(skills[0]).toMatchObject({ name: 'same', description: 'Home wins' })
  })

  it('toggles a skill by renaming between SKILL.md and SKILL.md.disabled', async () => {
    const home = await makeHome()
    await writeSkill(home, 'alpha', 'Alpha skill')
    const service = new LocalSkillService(home, join(home, 'agents'))

    await service.setEnabled('alpha', false)
    expect((await service.list()).find(skill => skill.name === 'alpha')?.enabled).toBe(false)
    // Disabling again is a no-op.
    await service.setEnabled('alpha', false)
    expect((await service.list()).find(skill => skill.name === 'alpha')?.enabled).toBe(false)

    await service.setEnabled('alpha', true)
    expect((await service.list()).find(skill => skill.name === 'alpha')?.enabled).toBe(true)
  })

  it('toggles flat skills and rejects unknown names', async () => {
    const home = await makeHome()
    const root = join(home, 'skills')
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'flat.md'), '---\nname: flat\ndescription: Flat skill\n---\n')
    const service = new LocalSkillService(home, join(home, 'agents'))

    await service.setEnabled('flat', false)
    expect((await service.list()).find(skill => skill.name === 'flat')?.enabled).toBe(false)
    await service.setEnabled('flat', true)
    expect((await service.list()).find(skill => skill.name === 'flat')?.enabled).toBe(true)

    await expect(service.setEnabled('missing', true)).rejects.toThrow('no local skill named "missing"')
  })
})
