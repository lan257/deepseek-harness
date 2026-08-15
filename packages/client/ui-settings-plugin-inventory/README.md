# @deepseek-ai/dsh-client-ui-settings-plugin-inventory

English | [中文](README.zh.md)

**Plugin list** tab for Web Settings with per-entry enablement control, covering both Loader plugins and local skills. The browser plugin registers one localized `settings.plugins.tab` contribution with id `all` beside the configuration tab; the Plugins section owns the navigation entry and tab chrome. It performs no Remote read during plugin activation. Selecting the tab for the first time mounts it and lazily calls `ctx.remote.pluginInventory.list()` through [`api-remotes`](../../api/remotes/README.md).

The tab renders a searchable two-column catalog of compact disclosure cards. Each collapsed card uses the short module name as its title and a small effective-enablement tag; enabled plugin entries also show a colored root-fiber status dot (skill rows carry no fiber, so they show none). The description line under the title (clamped to two lines) comes from the built-in Chinese catalog — see `catalog.ts`, keyed first by the row id (with the `include:` tree prefix stripped, so distinct rows of the same package — e.g. several MCP servers — get their own title and functional description) and then by the exact module name — and otherwise falls back to the entry's description resolved by the Host (a per-server description for MCP rows, the SKILL.md frontmatter description for skills); hovering the clamped line shows the full text as a native tooltip. Above the list, a row of functional-category chips (tools, skill plugins, Skills for user skills, MCP, UI, infrastructure, other) filters the catalog — built-in skill plugins (`dsh-skill` and friends) and user Skill rows are separate chips, and clicking **Skills** isolates the user skills: only categories present in the snapshot render, chips multi-select as a union, and the selection combines with the search box. Catalog entries carry an explicit category; skill rows always land in the skill category, and unlisted module names fall back to a keyword rule (`mcp` → `skill` → `tool` → client side) with anything indistinguishable landing in "other". Expanding a plugin card reveals its Loader-tree entry id without a redundant field label, followed by the effective configuration and, for enabled entries, Cordis status; a skill card shows its SKILL.md path instead of configuration or Cordis status. Disabled entries omit the redundant unmounted runtime state. The entry id remains the React key, disclosure identity, detail value, and an additional search target; it is never classified by string shape. Search matches the module name, the Loader entry id, and the displayed description (including Chinese catalog text). Loading, empty, no-match, and generic failure states stay local to the mounted component, and a failed read can be retried without exposing transport details. The registration uses `ctx.slots.inject()`, so the tab follows late tab declaration, redeclaration, locale changes, and teardown without importing the section owner.

Each expanded card also carries an enablement action: an enabled entry offers **Disable** and a disabled one offers **Enable**. Clicking it calls `ctx.remote.pluginInventory.setEnabled(entryId, target)`; while the request is in flight the action is disabled and an "Applying…" note shows, and a rejected call surfaces the Loader error inline. On success the tab refetches the snapshot, so the card reflects the new effective enablement and Fiber phase. The action is a client affordance over the Host Remote — it never reorders or classifies entries itself.

## Model Experience

None, as this package only visualizes a Host-owned deployment snapshot in browser Settings and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **One snapshot per Settings mount or retry** — the tab does not subscribe to Loader changes or automatically refetch after reconnect; switching tabs preserves the current snapshot, while reopening Settings obtains a new one.
- **Enablement only** — the tab can flip an existing entry's enablement but cannot add, remove, or reconfigure plugin rows; per-row enablement applies as a literal value, replacing any `!!js` disabled expression on that entry.
