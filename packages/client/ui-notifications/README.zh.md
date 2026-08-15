# @deepseek-ai/dsh-client-ui-notifications

[English](README.md) | 中文

Web GUI 的跨会话消息中心。当安装了第三方 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 插件时，本包会向右侧栏的标签页注册表注册一个 **消息** 标签页。该标签页聚合**其他会话**正在发生的事——待处理的权限审批（可直接就地处理）、已结束的后台任务（成功 / 失败 / 中断）与会话错误——并在标签图标上显示未读徽标，任何需要关注的事情都不再藏在会话切换之后。

数据路径复用 runtime 的会话列表 feed：`SessionManager` 把自身已经路由的帧（每条 `approval/requested`、`session/jobs` 的 running→settled 迁移、`host/agent-error`）聚合进列表快照的 `notifications` 字段（由 manager 持有，未实例化会话同样可见），最新在前、设有上限。审批作答走 `ctx.sessions.respondApproval(key, outcome)`，通过已实例化会话的 PendingWait 或实例化前的缓冲 envelope 回填请求帧的 rpcId——host 按 rpcId 对账，被审批的会话无需打开。已读状态（用户看过的行）保存在浏览器本地 `localStorage`，未读徽标刷新后仍在。

未安装 `dsh-better-sidebar` 时，本包退化为仅注册字典的 no-op：标签页注册走可选服务缝隙（`internal/service` + `ctx.get('betterSidebar')`），绝不会因宿主未安装而让插件纤维启动失败。当前会话的编辑器接管审批面板（`ui-conversation` 的 `ApprovalPanel`）保持不变；消息中心是增量叠加。

## 插件组成

本包是纯浏览器插件：`apply` 注册 `notifications` 字典与 better-sidebar 标签页。它依赖的是所消费的平台能力，而非某个插件的内部实现：

- `@deepseek-ai/dsh-client-runtime`（平台）：会话列表 feed（`pendingApprovals` / `notifications`）与 `ctx.sessions.respondApproval`。
- `@deepseek-ai/dsh-client-locale`（平台）：字典命名空间。
- `dsh-better-sidebar`（可选宿主）：消息中心注册进的标签页注册表。缺失时本包是 no-op，不会导致启动失败。

## Model Experience

无——消息中心是纯浏览器镀铬：读取通知的客户端投影，经既有 client-response 路径作答。不会触及任何模型请求，除 host 已写入的审计对外不追加任何会话事件。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **无逐条命令预览**——审批行只显示请求方理由与工具名；配对命令文本（来自运行中调用的参数）只在所属会话的编辑器接管面板中可见，因为全局 feed 不携带调用参数。
- **问题与计划评审交互仍留在编辑器接管**——目前仅审批、任务结束与会话错误聚合进中心。
- **已读状态按浏览器保存、不跨端同步**——未读徽标跟随本浏览器的 `localStorage`，而非跨设备的账号状态。
