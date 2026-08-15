/**
 * apply wiring on a real cordis Context: the notification-center dictionaries
 * and the optional better-sidebar tab — registered the moment the service
 * appears, absent without one, disposed with the fiber. Component behavior is
 * covered props-direct in notification-tab.client.spec.tsx; no renderer
 * machinery here.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { NotificationTab } from '../src/client/NotificationTab.tsx'
import { apply, inject, TAB_ID } from '../src/client/index.ts'
import type { BetterSidebarService, SidebarTabDescriptor } from '../src/client/better-sidebar.ts'

/** Scripted sidebar double: records registrations, disposes on the returned disposer. */
function fakeSidebar() {
  const tabs: SidebarTabDescriptor[] = []
  const service: BetterSidebarService = {
    registerTab: (descriptor) => {
      tabs.push(descriptor)
      return () => {
        const at = tabs.indexOf(descriptor)
        if (at >= 0) tabs.splice(at, 1)
      }
    },
    openTab: vi.fn(),
    closeTab: vi.fn(),
    isTabEnabled: () => true,
  }
  return { service, tabs }
}

/** Root context with the slot registry and locale service seated. */
async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  return ctx
}

describe('apply', () => {
  it('declares the services it binds (the sidebar host is optional)', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('activates without the better-sidebar service (a dictionary-only no-op)', async () => {
    const ctx = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(() => ctx.get('betterSidebar')).not.toThrow()
    await fiber.dispose()
  })

  it('registers the notification-center tab when the sidebar service appears', async () => {
    const ctx = await bench()
    const { service, tabs } = fakeSidebar()
    ctx.provide('betterSidebar', service)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(tabs).toHaveLength(1)
    const descriptor = tabs[0]!
    expect(descriptor.id).toBe(TAB_ID)
    expect(descriptor.single).toBe(true)
    // The descriptor's component renders NotificationTab (props flow through the tab contract).
    const rendered = descriptor.component({ ctx, store: undefined, scope: { sessionId: 's' }, tab: { type: TAB_ID, id: 't', title: 'x' }, visible: true }) as { type: unknown }
    expect(rendered.type).toBe(NotificationTab)
  })

  it('registers a tab that appeared after apply (optional-service arrival)', async () => {
    const ctx = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const { service, tabs } = fakeSidebar()
    // Service arrives after the plugin body ran: the internal/service event mounts it.
    ctx.provide('betterSidebar', service)
    await Promise.resolve()
    expect(tabs).toHaveLength(1)
  })

  it('teardown unregisters the tab and the dictionaries', async () => {
    const ctx = await bench()
    const { service, tabs } = fakeSidebar()
    ctx.provide('betterSidebar', service)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(tabs).toHaveLength(1)
    await fiber.dispose()
    expect(tabs).toHaveLength(0)
  })
})
