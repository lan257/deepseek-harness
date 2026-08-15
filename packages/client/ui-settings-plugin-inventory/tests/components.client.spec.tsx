// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginInventorySettingsTab } from '../src/client/PluginInventorySettingsTab.tsx'
import type {
  PluginInventorySettingsTabInjected,
  PluginInventorySettingsTabProps,
} from '../src/client/PluginInventorySettingsTab.tsx'
import { en, type PluginInventoryLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

type Snapshot = Awaited<ReturnType<PluginInventorySettingsTabInjected['list']>>
const t = ((key: PluginInventoryLocaleKey): string => en[key]) as PluginInventorySettingsTabProps['t']

function props(
  list: PluginInventorySettingsTabInjected['list'],
  setEnabled: PluginInventorySettingsTabInjected['setEnabled'] = vi.fn(async () => {}),
): PluginInventorySettingsTabProps {
  return {
    t,
    list,
    setEnabled,
  } as PluginInventorySettingsTabProps
}

const SNAPSHOT = {
  entries: [
    {
      entryId: '8a1b2c3d',
      moduleName: '@deepseek-ai/cordis-plugin-hmr',
      kind: 'plugin',
      // Covered by the built-in catalog: the catalog's Chinese text wins over
      // this Host package.json description.
      description: 'Hot module replacement for web client plugins',
      enabled: true,
      fiberPhase: 'active',
    },
    {
      entryId: 'session',
      moduleName: '@deepseek-ai/dsh-session',
      kind: 'plugin',
      description: 'Event-sourced session log and in-memory store',
      enabled: true,
      fiberPhase: 'active',
    },
    { entryId: 'pending', moduleName: 'cordis:pending-name', kind: 'plugin', enabled: true, fiberPhase: 'pending' },
    {
      entryId: 'loading',
      moduleName: '@fixture/loading-name',
      kind: 'plugin',
      description: 'A fixture plugin that loads slowly',
      enabled: true,
      fiberPhase: 'loading',
    },
    { entryId: 'failed', moduleName: '@fixture/failed-name', kind: 'plugin', enabled: true, fiberPhase: 'failed' },
    { entryId: 'unloading', moduleName: '@fixture/unloading-name', kind: 'plugin', enabled: true, fiberPhase: 'unloading' },
    { entryId: 'unobserved', moduleName: '@fixture/unobserved-name', kind: 'plugin', enabled: true, fiberPhase: null },
    {
      entryId: 'disabled-entry',
      moduleName: '@deepseek-ai/dsh-host-directory-picker-native',
      kind: 'plugin',
      description: 'Native OS directory picker',
      enabled: false,
      fiberPhase: null,
    },
  ],
} as unknown as Snapshot

const CATEGORY_SNAPSHOT = {
  entries: [
    { entryId: 't1', moduleName: '@deepseek-ai/dsh-tool-fs', kind: 'plugin', enabled: true, fiberPhase: 'active' },
    { entryId: 's1', moduleName: '@deepseek-ai/dsh-skill', kind: 'plugin', enabled: true, fiberPhase: 'active' },
    { entryId: 'u1', moduleName: '@deepseek-ai/dsh-client-ui-theme', kind: 'plugin', enabled: true, fiberPhase: 'active' },
    { entryId: 'i1', moduleName: '@deepseek-ai/dsh-session', kind: 'plugin', enabled: true, fiberPhase: 'active' },
  ],
} as unknown as Snapshot

const SKILL_SNAPSHOT = {
  entries: [
    { entryId: 'p1', moduleName: '@deepseek-ai/dsh-session', kind: 'plugin', enabled: true, fiberPhase: 'active' },
    {
      entryId: 'skill:alpha',
      moduleName: 'skill:alpha',
      kind: 'skill',
      description: 'Alpha skill 描述',
      enabled: true,
      fiberPhase: null,
      path: 'C:\\home\\skills\\alpha\\SKILL.md',
    },
    {
      entryId: 'skill:beta',
      moduleName: 'skill:beta',
      kind: 'skill',
      description: 'Beta skill',
      enabled: false,
      fiberPhase: null,
      path: 'C:\\home\\skills\\beta\\SKILL.md.disabled',
    },
  ],
} as unknown as Snapshot

const MCP_SNAPSHOT = {
  entries: [
    {
      entryId: 'include:mcp-chrome-devtools',
      moduleName: '@deepseek-ai/dsh-mcp-client',
      kind: 'plugin',
      // Host per-server fallback; the row-level catalog entry overrides it.
      description: '连接 MCP 服务器 chrome-devtools',
      enabled: true,
      fiberPhase: 'active',
    },
    {
      entryId: 'include:mcp-postgres',
      moduleName: '@deepseek-ai/dsh-mcp-client',
      kind: 'plugin',
      description: '连接 MCP 服务器 postgres',
      enabled: true,
      fiberPhase: 'active',
    },
    {
      entryId: 'include:mcp-other',
      moduleName: '@deepseek-ai/dsh-mcp-client',
      kind: 'plugin',
      description: '连接 MCP 服务器 other',
      enabled: true,
      fiberPhase: 'active',
    },
  ],
} as unknown as Snapshot

describe('PluginInventorySettingsTab', () => {
  it('renders runtime status only for enabled plugins', async () => {
    const deferred = Promise.withResolvers<Snapshot>()
    const list = vi.fn(() => deferred.promise)
    const view = render(<PluginInventorySettingsTab {...props(list)} />)
    expect(screen.getByText(en.loading)).toBeTruthy()

    await act(async () => { deferred.resolve(SNAPSHOT) })
    expect(list).toHaveBeenCalledOnce()
    expect(screen.getByRole('searchbox', { name: en.search })).toBeTruthy()
    expect(screen.getByRole('heading', { name: en.catalog })).toBeTruthy()
    // Two catalog entries are infrastructure (hmr + session); the six unlisted
    // fixtures fall back to the "other" category (keyword fallback can't tell).
    const infraChip = screen.getByRole('button', { name: /Infrastructure\s*2/ })
    const otherChip = screen.getByRole('button', { name: /Other\s*6/ })
    expect(screen.getByRole('group', { name: en.categories })).toBeTruthy()
    expect(infraChip.getAttribute('aria-pressed')).toBe('false')
    expect(otherChip.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(infraChip)
    expect(infraChip.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)

    // Multi-select unions categories back to the full list.
    fireEvent.click(otherChip)
    expect(screen.getAllByRole('listitem')).toHaveLength(8)
    fireEvent.click(infraChip)
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    fireEvent.click(otherChip)
    expect(infraChip.getAttribute('aria-pressed')).toBe('false')
    expect(otherChip.getAttribute('aria-pressed')).toBe('false')
    expect(view.container.querySelector('[data-plugin-count]')?.textContent).toBe('8')
    expect(screen.getAllByRole('listitem')).toHaveLength(8)
    expect(screen.getAllByText(en.enabledTag)).toHaveLength(7)
    expect(screen.getByText(en.disabledTag)).toBeTruthy()
    for (const value of [
      // Catalog entries win over the Host package.json description.
      'Cordis 热模块替换插件：开发期热更新模块',
      '事件溯源会话日志和内存存储',
      // Unlisted module names fall back to the Host description.
      'A fixture plugin that loads slowly',
      'Native OS directory picker',
    ]) {
      const description = screen.getByText(value)
      expect(description).toBeTruthy()
      // Hovering a clamped description surfaces the full text.
      expect(description.getAttribute('title')).toBe(value)
    }
    // Two entries are active (hmr + session), the rest have one of each phase.
    expect(screen.getAllByRole('img', { name: 'Mounted' })).toHaveLength(2)
    for (const value of [
      'Waiting for dependencies',
      'Loading',
      'Mount failed',
      'Unloading',
      'Not mounted',
    ]) {
      expect(screen.getByRole('img', { name: value })).toBeTruthy()
    }
    const active = screen.getByRole('button', { name: 'hmr, Mounted, Enabled' })
    expect(active.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(active)
    expect(active.getAttribute('aria-expanded')).toBe('true')
    expect(view.container.querySelector('[data-loader-entry]')?.textContent).toBe('8a1b2c3d')
    expect(screen.getByText(en.configuration)).toBeTruthy()
    expect(screen.getByText(en.cordis)).toBeTruthy()
    fireEvent.click(active)
    expect(view.container.querySelector('[data-loader-entry]')).toBeNull()

    fireEvent.click(active)
    fireEvent.change(screen.getByRole('searchbox', { name: en.search }), {
      target: { value: 'disabled-entry' },
    })
    expect(view.container.querySelector('[data-loader-entry]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'directory-picker-native, Disabled' }))
    expect(screen.getAllByText(en.disabledTag)).toHaveLength(2)
    expect(screen.queryByText(en.cordis)).toBeNull()
    expect(screen.queryByText(en.unobserved)).toBeNull()
  })

  it('filters by module name or Loader entry id', async () => {
    render(<PluginInventorySettingsTab {...props(async () => SNAPSHOT)} />)
    const search = await screen.findByRole('searchbox', { name: en.search })

    fireEvent.change(search, { target: { value: 'disabled-entry' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('directory-picker-native')).toBeTruthy()

    fireEvent.change(search, { target: { value: 'cordis-plugin-hmr' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('hmr')).toBeTruthy()

    fireEvent.change(search, { target: { value: 'not-a-plugin' } })
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText(en.emptySearch)).toBeTruthy()
  })

  it('shows package descriptions and searches by their text', async () => {
    render(<PluginInventorySettingsTab {...props(async () => SNAPSHOT)} />)
    const search = await screen.findByRole('searchbox', { name: en.search })

    expect(screen.getByText('Cordis 热模块替换插件：开发期热更新模块')).toBeTruthy()
    fireEvent.change(search, { target: { value: 'directory picker' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('directory-picker-native')).toBeTruthy()

    fireEvent.change(search, { target: { value: 'loads slowly' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('loading-name')).toBeTruthy()

    fireEvent.change(search, { target: { value: '会话日志' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    // moduleShortName strips the `dsh-` prefix, so the title is "session".
    expect(screen.getByText('session')).toBeTruthy()

    fireEvent.change(search, { target: { value: '热模块' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('hmr')).toBeTruthy()

    fireEvent.change(search, { target: { value: 'not in any description' } })
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText(en.emptySearch)).toBeTruthy()
  })

  it('filters by functional category chips and combines with search', async () => {
    render(<PluginInventorySettingsTab {...props(async () => CATEGORY_SNAPSHOT)} />)
    const search = await screen.findByRole('searchbox', { name: en.search })

    // Only categories present in the snapshot render; MCP has no plugin here.
    expect(screen.queryByRole('button', { name: /^MCP/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Tools\s*1/ })).toBeTruthy()
    // Built-in skill plugins (dsh-skill) use the "Skill plugins" chip.
    expect(screen.getByRole('button', { name: /Skill plugins\s*1/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /UI\s*1/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Infrastructure\s*1/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Tools\s*1/ }))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('tool-fs')).toBeTruthy()

    // Multi-select unions categories.
    fireEvent.click(screen.getByRole('button', { name: /UI\s*1/ }))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('ui-theme')).toBeTruthy()

    // Deselecting a category narrows the union back.
    fireEvent.click(screen.getByRole('button', { name: /Tools\s*1/ }))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('ui-theme')).toBeTruthy()

    // Search combines with the category selection.
    fireEvent.change(search, { target: { value: '主题' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('ui-theme')).toBeTruthy()
    fireEvent.change(search, { target: { value: '文件工具' } })
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)

    // Clearing the last chip and the query shows everything again.
    fireEvent.click(screen.getByRole('button', { name: /UI\s*1/ }))
    fireEvent.change(search, { target: { value: '' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })

  it('renders local skills as rows with enablement and file source', async () => {
    render(<PluginInventorySettingsTab {...props(async () => SKILL_SNAPSHOT)} />)
    expect(await screen.findByText('Alpha skill 描述')).toBeTruthy()
    // Skill rows use the frontmatter name as their title (no `skill:` prefix).
    expect(screen.getByText('alpha')).toBeTruthy()
    // Only the plugin row carries a fiber dot; skills have no fiber.
    expect(screen.getAllByRole('img', { name: 'Mounted' })).toHaveLength(1)
    // Both skills land in the skill category chip.
    expect(screen.getByRole('button', { name: /Skills\s*2/ })).toBeTruthy()

    // Expanding a skill shows the file path instead of configuration/Cordis status.
    fireEvent.click(screen.getByRole('button', { name: 'alpha, Enabled' }))
    expect(screen.getByText('C:\\home\\skills\\alpha\\SKILL.md')).toBeTruthy()
    expect(screen.queryByText(en.configuration)).toBeNull()
    expect(screen.queryByText(en.cordis)).toBeNull()
    expect(screen.getByRole('button', { name: 'alpha Disable' })).toBeTruthy()

    // Filtering by the skill category keeps only skill rows.
    fireEvent.click(screen.getByRole('button', { name: /Skills\s*2/ }))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByText('session')).toBeNull()
  })

  it('renders distinct MCP rows with row-level titles and functional descriptions', async () => {
    render(<PluginInventorySettingsTab {...props(async () => MCP_SNAPSHOT)} />)
    expect(await screen.findByText('chrome-devtools')).toBeTruthy()
    // Row-level catalog entries give each MCP server its own title and description.
    expect(screen.getByText('MCP 服务器：Chrome DevTools 浏览器自动化——页面操作、元素调试、截图与性能分析')).toBeTruthy()
    expect(screen.getByText('MCP 服务器：PostgreSQL 数据库查询、表结构操作与 SQL 执行')).toBeTruthy()
    // Uncatalogued MCP rows fall back to the Host per-server description.
    expect(screen.getByText('连接 MCP 服务器 other')).toBeTruthy()
    // All three land in the MCP category chip.
    expect(screen.getByRole('button', { name: /MCP\s*3/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /MCP\s*3/ }))
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('shows a generic failure and retries into the empty state', async () => {
    const list = vi.fn<PluginInventorySettingsTabInjected['list']>()
      .mockRejectedValueOnce(new Error('private transport detail'))
      .mockResolvedValueOnce({ entries: [] })
    render(<PluginInventorySettingsTab {...props(list)} />)

    expect((await screen.findByRole('alert')).textContent).toBe(en.error)
    expect(screen.queryByText('private transport detail')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
    expect(await screen.findByText(en.empty)).toBeTruthy()
  })

  it('toggles enablement from the expanded card and refreshes the snapshot on success', async () => {
    const list = vi.fn(async () => SNAPSHOT)
    const setEnabled = vi.fn(async () => {})
    render(<PluginInventorySettingsTab {...props(list, setEnabled)} />)

    const card = await screen.findByRole('button', { name: 'hmr, Mounted, Enabled' })
    fireEvent.click(card)
    const disable = screen.getByRole('button', { name: 'hmr Disable' })
    fireEvent.click(disable)
    await waitFor(() => { expect(setEnabled).toHaveBeenCalledWith('8a1b2c3d', false) })
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(2) })
  })

  it('shows the applying state while a toggle is in flight and surfaces failures', async () => {
    const list = vi.fn(async () => SNAPSHOT)
    const deferred = Promise.withResolvers<undefined>()
    const setEnabled = vi.fn(() => deferred.promise)
    render(<PluginInventorySettingsTab {...props(list, setEnabled)} />)

    const card = await screen.findByRole('button', { name: 'directory-picker-native, Disabled' })
    fireEvent.click(card)
    const enable = screen.getByRole('button', { name: 'directory-picker-native Enable' })
    fireEvent.click(enable)
    expect(setEnabled).toHaveBeenCalledWith('disabled-entry', true)
    expect(screen.getByText(en.applying)).toBeTruthy()
    expect(enable.hasAttribute('disabled')).toBe(true)

    await act(async () => { deferred.reject(new Error('loader refused')) })
    expect((await screen.findByRole('alert')).textContent).toBe('loader refused')
    expect(screen.queryByText(en.applying)).toBeNull()
    expect(enable.hasAttribute('disabled')).toBe(false)
  })

  it('contains a synchronous Remote failure and ignores a result after unmount', async () => {
    const syncFailure = vi.fn(() => { throw new Error('namespace unavailable') }) as PluginInventorySettingsTabInjected['list']
    const failed = render(<PluginInventorySettingsTab {...props(syncFailure)} />)
    expect((await screen.findByRole('alert')).textContent).toBe(en.error)
    failed.unmount()

    const deferred = Promise.withResolvers<Snapshot>()
    const pending = render(<PluginInventorySettingsTab {...props(() => deferred.promise)} />)
    pending.unmount()
    await act(async () => { deferred.resolve(SNAPSHOT) })

    const deferredFailure = Promise.withResolvers<Snapshot>()
    const pendingFailure = render(<PluginInventorySettingsTab {...props(() => deferredFailure.promise)} />)
    pendingFailure.unmount()
    await act(async () => { deferredFailure.reject(new Error('late failure')) })
  })
})
