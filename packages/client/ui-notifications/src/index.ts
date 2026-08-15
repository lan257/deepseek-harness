/**
 * Web approval-center plugin, node half.
 *
 * Deliberately empty: the approval center is pure browser chrome — it reads
 * the runtime's cross-session pending-approval feed and answers through
 * `ctx.sessions.respondApproval`; nothing here reaches a model request, and
 * the host-side approval seam (`dsh-user-approval`) already owns the policy
 * and audit.
 */

/** Host plugin body — the browser half owns the whole surface. */
export function apply(): void {}
