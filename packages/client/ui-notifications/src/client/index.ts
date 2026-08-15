/**
 * Web notification-center plugin, browser half: registers the
 * `notifications` dictionaries and, when the third-party `dsh-better-sidebar`
 * service is present, one message-center tab into its registry. The tab reads
 * the runtime's cross-session notification feed (approvals, settled jobs,
 * agent errors) and answers approvals through `ctx.sessions.respondApproval`,
 * so everything from any session — including sessions never opened — is
 * actionable from the right sidebar without switching sessions. The tab icon
 * carries an unread badge computed from the feed and the browser-local read
 * state. Export discipline: packages/client/AGENTS.md.
 *
 * The tab registration rides the optional-service seam: `betterSidebar` is
 * absent in deployments without the plugin, so the apply body registers the
 * tab the moment the service appears (`internal/service`) and never fails
 * the plugin fiber over an uninstalled host.
 */
import { createElement } from 'react'
import type { ClientContext, NotificationItem } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { NotificationIcon, NotificationTab } from './NotificationTab.tsx'
import type { BetterSidebarService, SidebarTabDescriptor } from './better-sidebar.ts'
import { en, zh, type NotificationKey } from './locales.ts'
import { loadReadIds } from './read-state.ts'

/** The tab's stable type id (also its SidebarTab.type). */
export const TAB_ID = 'notifications'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The notification center's copy. */
    notifications: NotificationKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'notifications'

/** Required services: the locale service (dictionaries) — the sidebar is optional. */
export const inject = ['slots', 'locale']

/**
 * Unread badge count: feed items whose id is not in the browser-local read
 * set. Read synchronously at render time (the sidebar re-renders on list
 * changes, so the badge tracks new arrivals); storage failures read empty.
 * @param ctx - client context carrying the sessions list feed.
 */
function unreadCount(ctx: ClientContext): number {
  // Read through ctx.get: the tab icon renders inside the better-sidebar's
  // tree, but this plugin's own ctx only injects the locale service, and a
  // bare ctx.sessions read would trip the cordis "without inject" guard.
  const sessions = ctx.get('sessions') as { list: { getSnapshot(): { notifications?: readonly NotificationItem[] } } } | undefined
  const notifications = sessions?.list.getSnapshot().notifications
  if (notifications === undefined || notifications.length === 0) return 0
  const read = loadReadIds()
  return notifications.reduce((count, item) => count + (read.has(item.id) ? 0 : 1), 0)
}

/** Build the tab descriptor against a live context (title/icon read live state). */
function tabDescriptor(ctx: ClientContext): SidebarTabDescriptor {
  const t = (key: NotificationKey): string =>
    ctx.locale.getSnapshot().active === 'zh' ? zh[key] : en[key]
  return {
    id: TAB_ID,
    title: () => t('tab.title'),
    icon: (size: number) => createElement(NotificationIcon, { size, unread: unreadCount(ctx) }),
    // Before the built-in explorer row, after nothing else at this order.
    order: 50,
    // One message center per session scope: opening focuses the existing tab.
    single: true,
    component: props => createElement(NotificationTab, props),
  }
}

/**
 * Client plugin body: register the `notifications` dictionaries and, when the
 * better-sidebar service exists, the message-center tab. The tab follows the
 * sidebar's own optional-service pattern — absent the plugin, this package is
 * a dictionary-only no-op rather than a boot failure.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const disposeDicts = ctx.locale.register(NS, { zh, en })
    // Optional host: register the moment the service appears, dispose with
    // this fiber, and re-register after a redeclaration (HMR-safe).
    let disposeTab: (() => void) | undefined
    const mount = (): void => {
      if (disposeTab !== undefined) return
      const sidebar = ctx.get('betterSidebar') as BetterSidebarService | undefined
      if (sidebar === undefined) return
      disposeTab = sidebar.registerTab(tabDescriptor(ctx))
    }
    const unmount = (): void => {
      disposeTab?.()
      disposeTab = undefined
    }
    mount()
    const off = ctx.on('internal/service', (name: string) => {
      if (name === 'betterSidebar') mount()
    })
    return () => {
      off()
      unmount()
      disposeDicts()
    }
  }, 'ui-notifications: dictionaries + better-sidebar tab')
}
