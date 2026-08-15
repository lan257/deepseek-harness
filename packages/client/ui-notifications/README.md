# @deepseek-ai/dsh-client-ui-notifications

English | [中文](README.zh.md)

Cross-session message center for the web GUI. When the third-party
[dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) plugin is
installed, this package registers a **Messages** tab into its right-sidebar
tab registry. The tab aggregates what happens in *other* sessions — pending
permission approvals (answerable right there), background jobs that settled
(completed / failed / interrupted), and agent errors — plus an unread badge on
the tab icon, so nothing that needs attention hides behind a session switch.

The data path rides the runtime's sessions list feed: `SessionManager`
aggregates the frames it already routes (every `approval/requested`,
running→settled `session/jobs` migrations, `host/agent-error`) into the list
snapshot's `notifications` field (manager-owned, so uninstantiated sessions
surface too), newest first and capped. Approvals answer through
`ctx.sessions.respondApproval(key, outcome)`, which echoes the requested
frame's rpcId through the live Session wait or the pre-instantiation buffer —
the host reconciles by rpcId, so the owning session never needs to be open.
Read state (which rows the user has seen) is browser-local `localStorage`, so
the unread badge survives reloads.

Without `dsh-better-sidebar` the package is a dictionary-only no-op: the tab
registration rides the optional-service seam (`internal/service` +
`ctx.get('betterSidebar')`) and never fails the plugin fiber over an
uninstalled host. The composer-takeover approval panel (`ui-conversation`'s
`ApprovalPanel`) remains for the current session; the center is additive.

## Plugin composition

This package is a pure browser plugin: `apply` registers the `notifications`
dictionaries and the better-sidebar tab. It depends on the platform
capabilities it consumes, not on another plugin's internals:

- `@deepseek-ai/dsh-client-runtime` (platform): the sessions list feed
  (`pendingApprovals` / `notifications`) and `ctx.sessions.respondApproval`.
- `@deepseek-ai/dsh-client-locale` (platform): the dictionary namespace.
- `dsh-better-sidebar` (optional host): the tab registry the message center
  registers into. Absent, the package is a no-op — no boot failure.

## Model Experience

None — the center is pure browser chrome: it reads a client-side projection of
notifications and answers through the existing client-response path. Nothing
here reaches a model request, and no session event is appended beyond the
audit pair the host already writes.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **No per-row command preview** — an approval row shows the asker's reason
  and the tool name; the paired command text (from the running call's args) is
  only visible in the owning session's composer takeover, because the global
  feed does not carry call arguments.
- **Question and plan-review interactions stay in the composer takeover** —
  only approvals, job settlements, and agent errors aggregate in the center
  today.
- **Read state is per-browser, not synced** — the unread badge follows this
  browser's `localStorage`, not the account across devices.
