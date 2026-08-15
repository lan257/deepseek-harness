# @deepseek-ai/dsh-host-plugin-inventory

English | [中文](README.zh.md)

Host projection and enablement control of the current Cordis Loader tree plus local skills. `PluginInventoryGateway` registers the `pluginInventory` service and publishes two generated direct Remotes: `pluginInventory/list` and `pluginInventory/setEnabled`. Every `list` call reads `ctx.loader.entries()` directly, skips structural group rows, and returns the remaining entries in Loader order with their Loader entry id, module specifier, row kind, effective enablement, and current root Fiber phase; local skills discovered from `$DSH_HOME/skills` and `$DSH_AGENTS_HOME` (or `~/.agents`)/`skills` follow as `skill:<name>` rows with their frontmatter description and SKILL.md path. Each plugin entry additionally carries a description: the resolved plugin package's `package.json` `description` (the package root is derived from the specifier, resolved through `createRequire` anchored at the config tree's `baseUrl`, cached per package root), or — for MCP client rows (`@deepseek-ai/dsh-mcp-client`) — a per-server Chinese description built from the row's `config.serverName` so distinct MCP servers stay distinct. `cordis:` builtins and unresolvable roots simply carry no description; a bare in-memory `Context` without `baseUrl` reports none either.

The phase is `pending`, `loading`, `active`, `failed`, or `unloading`; it is `null` when the entry has no live root Fiber (skill rows always report `null`). The snapshot is intentionally point-in-time: Loader remains the sole lifecycle authority for plugin rows, while skill rows are re-discovered per call. `setEnabled(entryId, enabled)` routes plugin rows through `ctx.loader.update(entryId, { disabled: !enabled })`, so the Loader disposes or re-runs the entry's root Fiber and persists the change through the entry's owning tree; skill rows (`skill:<name>`) are toggled by renaming their entry file between `SKILL.md` / `<name>.md` and the `.disabled` variant, which every filesystem skill provider honors without code changes. On failure the operation rolls back and the Remote rejects. Its public payload types live under `./types`, and Typert generates the Host and Client Remote artifacts exposed by `./typert` and `./remote`.

The service is Remote-only and deliberately declares no same-process Cordis `Context` merge. Client packages consume it through the explicit [`api-remotes`](../../api/remotes/README.md) assembly rather than importing the Host implementation.

## Model Experience

None, as this Host-only inventory projection registers no prompt, tool, message, or provider request.

#### KV Cache effect

None; this package never assembles model input.

## Known Limitations and Deferred Work

- **Point-in-time state only** — the result contains no durable failure history or subscription; a missing root Fiber is reported as `null`, regardless of why no live root exists.
- **No provenance or structural mutation** — the service does not identify which bundle, profile, or override introduced an entry, and it cannot add or remove plugin rows, only flip an existing entry's enablement.
