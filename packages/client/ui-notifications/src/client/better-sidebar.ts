/**
 * Structural mirror of the `dsh-better-sidebar` third-party plugin's tab
 * registration API. The plugin resolves against a separate cordis instance and
 * is not part of this monorepo, so its type declarations never reach this
 * package; only the field subsets this package consumes are restated, exactly
 * as the plugin itself mirrors DSH services. The tab is registered through
 * `ctx.get('betterSidebar')` (an optional service — the center degrades to a
 * no-op deployment without the sidebar), so no Context augmentation is made
 * here and nothing collides with the plugin's own declaration.
 */
import type { ReactNode } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** One open sidebar tab instance (the render identity the center keys on). */
export interface SidebarTab {
  type: string
  id: string
  title: string
}

/** Props every tab component receives (builtins and external alike). */
export interface SidebarTabComponentProps {
  ctx: ClientContext
  store: unknown
  /** The session the sidebar is scoped to (tab content may ignore it). */
  scope: { sessionId: string; cwd?: string }
  tab: SidebarTab
  /** Whether this tab is the active one AND the panel is open. */
  visible: boolean
}

/** Describes one kind of sidebar tab (what `registerTab` accepts). */
export interface SidebarTabDescriptor {
  /** Unique id; also the `SidebarTab.type` value. */
  id: string
  title: string | (() => string)
  icon?: unknown
  /** + menu sort order (ascending); default 100. */
  order?: number
  /** Single-instance: opening focuses the existing tab instead of duplicating. */
  single?: boolean
  component: (props: SidebarTabComponentProps) => ReactNode
}

/** The `ctx.betterSidebar` service face, subset this package calls. */
export interface BetterSidebarService {
  registerTab(descriptor: SidebarTabDescriptor): () => void
  openTab(seed: { type: string; title?: string; id?: string }): void
  closeTab(tabId: string): void
  isTabEnabled(id: string): boolean
}
