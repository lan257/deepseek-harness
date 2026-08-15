/**
 * NotificationTab: the message-center content registered into the
 * better-sidebar's tab registry. It renders the runtime's cross-session
 * notification feed (the sessions list snapshot's `notifications` field) —
 * pending approvals (actionable), settled background jobs (completed /
 * failed / interrupted), and agent errors — and answers approvals through
 * `ctx.sessions.respondApproval`, so everything from every session, opened or
 * not, is actionable here without switching sessions. Rendered by the
 * sidebar's own React tree (not a slot entry), so it receives the raw tab
 * props (ctx, visible) and subscribes to the feed directly; copy follows the
 * DSH locale preference through the locale service. Read state is
 * browser-local (localStorage) so the unread badge survives reloads.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { NotificationItem } from '@deepseek-ai/dsh-client-runtime/client'
import type { SidebarTabComponentProps } from './better-sidebar.ts'
import { en, zh, type NotificationKey } from './locales.ts'
import { loadReadIds, saveReadIds } from './read-state.ts'
import css from './NotificationTab.module.css'

/** The only two outcomes a client can give; the host closes the rest. */
type ClientOutcome = 'allowed-once' | 'rejected'

/** Relative-time label for a notification's arrival (bucketed, locale-aware). */
function timeLabel(time: number, now: number, t: (key: NotificationKey, vars?: Record<string, string>) => string): string {
  const delta = Math.max(0, now - time)
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return t('time.now')
  if (minutes < 60) return t('time.minutes', { n: String(minutes) })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('time.hours', { n: String(hours) })
  return t('time.days', { n: String(Math.floor(hours / 24)) })
}

/**
 * The tab component (descriptor.component's contract). `visible` is true only
 * while the tab is the active one AND the panel is open — that moment marks
 * every current notification read.
 */
export function NotificationTab({ ctx, visible }: SidebarTabComponentProps) {
  // Copy follows the Host locale preference (the sidebar's own approach).
  const active = useSyncExternalStore(
    cb => ctx.locale.subscribe(cb),
    () => ctx.locale.getSnapshot().active,
  )
  const t = (key: NotificationKey, vars?: Record<string, string>): string => {
    const dict = active === 'zh' ? zh : en
    const text = dict[key]
    return vars === undefined ? text : text.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? `{${name}}`)
  }

  const list = useSyncExternalStore(
    cb => ctx.sessions.list.subscribe(cb),
    () => ctx.sessions.list.getSnapshot(),
  )
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => loadReadIds())
  const [answered, setAnswered] = useState<ReadonlySet<string>>(new Set())
  const respond = (key: string, outcome: ClientOutcome): Promise<unknown> =>
    ctx.sessions.respondApproval(key, outcome)

  const notifications = list.notifications ?? []
  // Opening the tab consumes the current batch (badge clears for these ids).
  useEffect(() => {
    if (!visible || notifications.length === 0) return
    setReadIds(prev => {
      let changed = false
      const next = new Set(prev)
      for (const item of notifications) {
        if (!next.has(item.id)) {
          next.add(item.id)
          changed = true
        }
      }
      if (!changed) return prev
      saveReadIds(next)
      return next
    })
  }, [visible, notifications])

  if (notifications.length === 0) {
    return (
      <div className={css.root}>
        <div className={css.empty}>{t('empty')}</div>
        <div className={css.emptyDesc}>{t('empty.desc')}</div>
      </div>
    )
  }
  return (
    <div className={css.root}>
      <ul className={css.list}>
        {notifications.map(item => (
          <NotificationRow
            key={item.id}
            item={item}
            title={list.byId[item.sessionId]?.displayTitle ?? item.sessionId}
            unread={!readIds.has(item.id)}
            answered={answered.has(item.id)}
            t={t}
            onAnswer={(outcome) => {
              setAnswered(prev => new Set(prev).add(item.id))
              void respond(item.approval!.key, outcome).catch(() => {
                setAnswered(prev => {
                  const next = new Set(prev)
                  next.delete(item.id)
                  return next
                })
              })
            }}
          />
        ))}
      </ul>
    </div>
  )
}

/** One notification row: kind glyph, session title, body, and — for live approvals — the two actions. */
function NotificationRow({ item, title, unread, answered, t, onAnswer }: {
  item: NotificationItem
  title: string
  unread: boolean
  answered: boolean
  t: (key: NotificationKey, vars?: Record<string, string>) => string
  onAnswer: (outcome: ClientOutcome) => void
}) {
  const now = Date.now()
  const glyph = item.kind === 'approval'
    ? <span className={css.glyph} data-kind="approval" data-resolved={item.resolved || undefined} />
    : item.kind === 'job-settled'
      ? <span className={css.glyph} data-kind={item.status} />
      : <span className={css.glyph} data-kind="agent-error" />
  return (
    <li className={css.row} data-unread={unread || undefined}>
      {glyph}
      <div className={css.rowContent}>
        <div className={css.rowHeader}>
          <span className={css.session} title={title}>{title}</span>
          <span className={css.time}>{timeLabel(item.time, now, t)}</span>
        </div>
        <div className={css.body}>
          {item.kind === 'approval' && (
            item.resolved === true
              ? <span className={css.resolved}>{t('state.resolved')}</span>
              : <ApprovalBody item={item} answered={answered} t={t} onAnswer={onAnswer} />
          )}
          {item.kind === 'job-settled' && (
            <>
              <span className={css.statusBadge} data-status={item.status}>{jobStatusLabel(item.status, t)}</span>
              <span className={css.detail}>{item.detail}</span>
            </>
          )}
          {item.kind === 'agent-error' && (
            <>
              <span className={css.statusBadge} data-status="agent-error">{t('agent.error')}</span>
              <span className={css.detail}>{item.detail}</span>
            </>
          )}
        </div>
      </div>
    </li>
  )
}

/** The live-approval row body: reason + refuse/allow actions. */
function ApprovalBody({ item, answered, t, onAnswer }: {
  item: NotificationItem
  answered: boolean
  t: (key: NotificationKey, vars?: Record<string, string>) => string
  onAnswer: (outcome: ClientOutcome) => void
}) {
  const approval = item.approval
  if (approval === undefined) return <span className={css.resolved}>{t('state.resolved')}</span>
  const reason = approval.reason ?? t('reason.fallback').replace('{toolName}', approval.toolName)
  return (
    <>
      <div className={css.approvalReason}>{reason}</div>
      <div className={css.actions}>
        <button
          type="button" className={css.reject} disabled={answered}
          onClick={() => { onAnswer('rejected') }}
        >
          {t('action.reject')}
        </button>
        <button
          type="button" className={css.allow} disabled={answered}
          onClick={() => { onAnswer('allowed-once') }}
        >
          {answered ? t('state.resolved') : t('action.allowOnce')}
        </button>
      </div>
    </>
  )
}

/** Job-settlement outcome label. */
function jobStatusLabel(status: NotificationItem['status'], t: (key: NotificationKey) => string): string {
  switch (status) {
    case 'completed': return t('job.completed')
    case 'failed': return t('job.failed')
    case 'killed': return t('job.killed')
    /* v8 ignore next -- closed NotificationJobStatus union; a forged status renders nothing */
    default: return ''
  }
}

/** Bell glyph with an unread-count badge (the tab strip / + menu icon). */
export function NotificationIcon({ size, unread }: { size: number; unread: number }) {
  return (
    <span className={css.iconWrap} style={{ width: size, height: size }}>
      <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden focusable="false">
        <path
          d="M8 2a4.5 4.5 0 0 0-4.5 4.5v2.7L2.3 11a.6.6 0 0 0 .5.9h10.4a.6.6 0 0 0 .5-.9l-1.2-1.8V6.5A4.5 4.5 0 0 0 8 2Z"
          fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
        />
        <path d="M6.6 13a1.5 1.5 0 0 0 2.8 0" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      {unread > 0 && <span className={css.badge}>{unread > 99 ? '99+' : unread}</span>}
    </span>
  )
}
