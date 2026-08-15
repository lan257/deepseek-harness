// @vitest-environment jsdom
// NotificationTab behavior, driven with realistic props: the empty state, the
// cross-session feed rendering (approvals actionable, settled jobs and agent
// errors as status rows), the one-shot answer verbs over the sessions
// service, and the visible-marks-read read state.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { NotificationItem, SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import { NotificationIcon, NotificationTab } from '../src/client/NotificationTab.tsx'
import type { SidebarTabComponentProps } from '../src/client/better-sidebar.ts'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const S1 = 'sess-a' as SessionId
const S2 = 'sess-b' as SessionId

const item = (over: Partial<NotificationItem> = {}): NotificationItem => ({
  id: 'job:bash-1',
  sessionId: S1,
  kind: 'job-settled',
  time: Date.now() - 60_000,
  detail: 'pnpm run build',
  status: 'completed',
  ...over,
})

const approvalItem = (over: Partial<NotificationItem> = {}): NotificationItem => ({
  id: 'approval:a:ap1',
  sessionId: S2,
  kind: 'approval',
  time: Date.now(),
  approval: {
    sessionId: S2,
    approvalId: 'ap1' as never,
    toolName: 'bash',
    reason: '写文件需要权限',
    key: 'a:ap1',
  },
  ...over,
})

/** Scripted tab props: locale + sessions list + the answer verb. */
function makeProps(over: {
  notifications?: readonly NotificationItem[]
  byId?: SessionListState['byId']
  respondApproval?: ReturnType<typeof vi.fn>
  active?: string
  visible?: boolean
} = {}) {
  const respondApproval = over.respondApproval ?? vi.fn(() => Promise.resolve({ accepted: true }))
  const list: SessionListState = {
    ids: [S1, S2],
    byId: over.byId ?? {
      [S1]: { id: S1, displayTitle: '会话 A', running: false, blank: false, updatedAt: 1 },
      [S2]: { id: S2, displayTitle: '会话 B', running: false, blank: false, updatedAt: 2 },
    },
    current: S1,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
    notifications: over.notifications ?? [],
  }
  const ctx = {
    locale: {
      subscribe: vi.fn(() => () => {}),
      getSnapshot: () => ({ active: over.active ?? 'zh' }),
    },
    sessions: {
      list: {
        subscribe: vi.fn(() => () => {}),
        getSnapshot: () => list,
      },
      respondApproval,
    },
  } as unknown as SidebarTabComponentProps['ctx']
  const tabProps = {
    ctx,
    store: undefined,
    scope: { sessionId: S1 },
    tab: { type: 'notifications', id: 'notifications', title: '消息' },
    visible: over.visible ?? true,
  } as SidebarTabComponentProps
  return { tabProps, respondApproval }
}

describe('NotificationTab', () => {
  it('renders the empty state with guidance when nothing waits', () => {
    render(<NotificationTab {...makeProps({ notifications: [] }).tabProps} />)
    expect(screen.getByText('暂无消息')).toBeTruthy()
    expect(screen.getByText(/其他会话的审批、任务结果与错误/)).toBeTruthy()
  })

  it('renders a live approval with its session, reason, and the two actions', () => {
    render(<NotificationTab {...makeProps({ notifications: [approvalItem()] }).tabProps} />)
    expect(screen.getByText('会话 B')).toBeTruthy()
    expect(screen.getByText('写文件需要权限')).toBeTruthy()
    expect(screen.getByRole('button', { name: '允许一次' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '拒绝' })).toBeTruthy()
  })

  it('renders a resolved approval as history without actions', () => {
    render(<NotificationTab {...makeProps({ notifications: [approvalItem({ resolved: true })] }).tabProps} />)
    expect(screen.getByText('已处理')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders settled jobs with outcome badges and the job label', () => {
    render(<NotificationTab {...makeProps({ notifications: [
      item({ status: 'completed', detail: 'pnpm run build' }),
      item({ id: 'job:bash-2', status: 'failed', detail: 'npm test' }),
      item({ id: 'job:bash-3', status: 'killed', detail: 'pnpm dev' }),
    ] }).tabProps} />)
    expect(screen.getByText('任务完成')).toBeTruthy()
    expect(screen.getByText('任务失败')).toBeTruthy()
    expect(screen.getByText('任务中断')).toBeTruthy()
    expect(screen.getByText('pnpm run build')).toBeTruthy()
  })

  it('renders an agent error with the message', () => {
    render(<NotificationTab {...makeProps({ notifications: [
      { ...item({ id: 'error:1', kind: 'agent-error', detail: 'transport failed' }), status: undefined as never },
    ] }).tabProps} />)
    expect(screen.getByText('会话出错')).toBeTruthy()
    expect(screen.getByText('transport failed')).toBeTruthy()
  })

  it('answers Allow once through the sessions service and latches the row', () => {
    const { tabProps, respondApproval } = makeProps({ notifications: [approvalItem()] })
    render(<NotificationTab {...tabProps} />)
    fireEvent.click(screen.getByRole('button', { name: '允许一次' }))
    expect(respondApproval).toHaveBeenCalledWith('a:ap1', 'allowed-once')
    expect(screen.getByRole('button', { name: '已处理' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: '拒绝' }).hasAttribute('disabled')).toBe(true)
  })

  it('re-arms the row for retry when the response is rejected', async () => {
    const { tabProps, respondApproval } = makeProps({
      notifications: [approvalItem()],
      respondApproval: vi.fn(() => Promise.reject(new Error('transport'))),
    })
    render(<NotificationTab {...tabProps} />)
    fireEvent.click(screen.getByRole('button', { name: '允许一次' }))
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('button', { name: '允许一次' }).hasAttribute('disabled')).toBe(false)
    expect(respondApproval).toHaveBeenCalledTimes(1)
  })

  it('marks the current batch read when the tab becomes visible', () => {
    const { tabProps } = makeProps({ notifications: [approvalItem()], visible: false })
    const { rerender } = render(<NotificationTab {...tabProps} />)
    expect(JSON.parse(localStorage.getItem('dsh:notifications:read') ?? '[]')).toEqual([])
    rerender(<NotificationTab {...{ ...tabProps, visible: true }} />)
    expect(JSON.parse(localStorage.getItem('dsh:notifications:read') ?? '[]')).toContain('approval:a:ap1')
  })

  it('follows the active locale for copy', () => {
    render(<NotificationTab {...makeProps({ active: 'en', notifications: [] }).tabProps} />)
    expect(screen.getByText('Nothing here yet')).toBeTruthy()
  })
})

describe('NotificationIcon', () => {
  it('renders no badge with zero unread', () => {
    const { container } = render(<NotificationIcon size={16} unread={0} />)
    expect(container.querySelector('[class*="badge"]')).toBeNull()
  })

  it('renders the count badge and caps it at 99+', () => {
    const { container, rerender } = render(<NotificationIcon size={16} unread={3} />)
    expect(container.textContent).toContain('3')
    rerender(<NotificationIcon size={16} unread={120} />)
    expect(container.textContent).toContain('99+')
  })
})
