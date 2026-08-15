# @deepseek-ai/dsh-host-plugin-inventory

[English](README.md) | 中文

当前 Cordis Loader 树的 Host 投影与启用控制，外加本地技能。`PluginInventoryGateway` 注册 `pluginInventory` 服务，并发布两个由 Typert 生成的直接 Remote：`pluginInventory/list` 与 `pluginInventory/setEnabled`。每次 `list` 调用都直接读取 `ctx.loader.entries()`，跳过结构性的 group 行，再按 Loader 顺序返回其余条目，并包含 Loader 条目 id、模块标识、行类型、有效启用状态与当前根 Fiber 阶段；从 `$DSH_HOME/skills` 与 `$DSH_AGENTS_HOME`（或 `~/.agents`）`/skills` 发现的本地技能随后以 `skill:<name>` 行返回，携带其 frontmatter 描述与 SKILL.md 路径。每个插件条目还附带描述：解析到的插件包的 `package.json.description`（从标识符推导包根，通过锚定在配置树 `baseUrl` 上的 `createRequire` 解析，按包根缓存）——而 MCP 客户端行（`@deepseek-ai/dsh-mcp-client`）则按行的 `config.serverName` 生成"连接 MCP 服务器 <名称>"的中文描述，使不同的 MCP 服务器互不混淆。`cordis:` 内建项与无法解析的根自然没有描述；没有 `baseUrl` 的裸内存 `Context` 也一律不报告描述。

阶段为 `pending`、`loading`、`active`、`failed` 或 `unloading`；条目没有存活的根 Fiber 时则为 `null`（技能行一律为 `null`）。该快照刻意只表示调用当下：插件行以 Loader 为唯一生命周期权威，技能行则每次调用重新发现。`setEnabled(entryId, enabled)` 对插件行经由 `ctx.loader.update(entryId, { disabled: !enabled })` 执行：Loader 会随之销毁或重新运行条目的根 Fiber，并通过其所属配置树持久化改动；对技能行（`skill:<name>`）则把条目文件在 `SKILL.md` / `<name>.md` 与其 `.disabled` 变体之间改名，任何文件系统 skill 提供方都会在不改代码的情况下遵守。失败时操作回滚，Remote 调用报错。公开 payload 类型位于 `./types`，Typert 生成由 `./typert` 与 `./remote` 导出的 Host 和 Client Remote 产物。

该服务仅供 Remote 使用，刻意不声明同进程 Cordis `Context` merge。Client 包通过显式的 [`api-remotes`](../../api/remotes/README.md) 组合消费它，而不导入 Host 实现。

## 模型体验

无，因为这个仅限 Host 的清单投影不注册提示词、工具、消息或提供方请求。

#### KV Cache 影响

无；本包从不组装模型输入。

## 已知限制与暂缓事项

- **仅表示调用当下** —— 结果不包含持久的失败历史或订阅；只要不存在存活的根 Fiber，就会报告 `null`，而不区分其原因。
- **无来源与结构性修改能力** —— 服务不识别条目由哪个 bundle、profile 或 override 引入，也不能添加或移除插件行，只能切换既有条目的启用状态。
