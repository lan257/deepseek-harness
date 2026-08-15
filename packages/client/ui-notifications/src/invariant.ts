/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-notifications`.
 * @module @deepseek-ai/dsh-client-ui-notifications/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-notifications'

/** Cordis companion plugin name. */
export const name = 'client-ui-notifications-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the approval center is a pure reader/answerer over the
 * sessions list feed (`pendingApprovals`) and `ctx.sessions.respondApproval`;
 * both endpoints are exercised through their owning packages' tests, and the
 * better-sidebar tab registration is an effect the host registry observes.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns The installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
