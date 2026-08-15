/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-tool-vision`.
 * @module @deepseek-ai/dsh-tool-vision/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tool-vision'

/** Cordis companion plugin name. */
export const name = 'tool-vision-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the tool produces no package-owned event sequence or
 * mutable data relation. Its results are ordinary `tool/call` + `tool/result`
 * session events owned by the tool registry, and the vision script keeps no
 * durable state of its own.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
