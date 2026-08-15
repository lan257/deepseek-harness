/**
 * 内置中文插件目录：描述 + 功能分类。
 *
 * 设置 → 插件列表为当前部署中的每个 Loader 条目渲染一行描述，并支持按功能
 * 分类过滤。目录的键优先取**行 id**（Loader 条目 id，忽略 `include:` 前缀，
 * 用于区分同包的多个行，如多行 MCP 服务器），否则取**精确模块名**（package
 * name，含子路径，作为包级默认）：
 * - `title`（可选）：行级标题覆盖，默认用模块短名称；
 * - `description`：中文描述，渲染时优先于 Host 提供的描述；
 * - `category`：功能分类，参与列表顶部的分类过滤。
 *
 * 描述内容来源：各分组 `README.zh.md` 的包对照表；vendored Cordis 插件与
 * 用户安装的第三方 bundle 据其英文描述手写；MCP 等按行定制的条目据部署
 * 配置手写。分类按插件对使用者的功能角色划分（模型工具 / 技能 / MCP /
 * 浏览器界面 / 宿主基础设施）。本文件不随 locale 切换——该项目仅维护中文
 * 文案，英文 locale 下同样显示中文描述。
 */

/** 功能分类展示顺序（也即 chips 的排列顺序）。`skill` 是内置的技能插件
 * （skill 注册表、发现器、loader 等），`skill-rows` 是用户自装的 Skill
 * （`$DSH_HOME/skills` 下的 SKILL.md 条目），两者分开过滤。 */
export const CATEGORY_ORDER = ['tool', 'skill', 'skill-rows', 'mcp', 'ui', 'infra', 'other'] as const

/** 插件功能分类：模型工具 / 内置技能插件 / 用户 Skill / MCP 桥接 / 浏览器界面 / 宿主基础设施 / 其它（无法归类）。 */
export type PluginCategory = (typeof CATEGORY_ORDER)[number]

/** 一个插件的中文目录条目。 */
export interface PluginCatalogEntry {
  /** 行级标题覆盖；缺省用模块短名称。 */
  readonly title?: string
  /** 一行中文描述。 */
  readonly description: string
  /** 功能分类。 */
  readonly category: PluginCategory
}

/** 中文插件目录：键为行 id（忽略 `include:` 前缀）或 Loader 模块名。 */
export const PLUGIN_CATALOG: Readonly<Record<string, PluginCatalogEntry>> = {
  '@deepseek-ai/cordis-plugin-hmr': { description: 'Cordis 热模块替换插件：开发期热更新模块', category: 'infra' },
  '@deepseek-ai/cordis-plugin-timer': { description: 'Cordis 定时器服务：为插件提供定时调度能力', category: 'infra' },
  '@deepseek-ai/dsh-agent': { description: 'Agent 接口、注册表和事件词汇', category: 'infra' },
  '@deepseek-ai/dsh-agent-default-model': { description: '各 Agent 入口共享的默认模型选择', category: 'infra' },
  '@deepseek-ai/dsh-agent-instructions': { description: '工作区指令上下文', category: 'infra' },
  '@deepseek-ai/dsh-agent-loop': { description: '默认的具体 agent 驱动器', category: 'infra' },
  '@deepseek-ai/dsh-agent-presets': { description: 'preset 词汇体系、对受信任根目录与用户自定义根目录的发现，以及受防护的按 agent 挂载', category: 'infra' },
  '@deepseek-ai/dsh-api-gateway': { description: 'Host Typert 分发器与 Client Remote endpoint', category: 'infra' },
  '@deepseek-ai/dsh-api-remotes': { description: '在 Client 侧挂载所选 Host Remote 命名空间的装配层', category: 'ui' },
  '@deepseek-ai/dsh-attachment-local': { description: 'DSH_HOME 下的私有内容寻址附件存储', category: 'infra' },
  '@deepseek-ai/dsh-bash-sandbox': { description: '在本地执行前应用已配置的 sandbox 后端', category: 'infra' },
  '@deepseek-ai/dsh-client-connection': { description: '维护浏览器与宿主之间的 RPC 通信和事件传递', category: 'ui' },
  '@deepseek-ai/dsh-client-hmr': { description: '在开发期间刷新客户端插件', category: 'ui' },
  '@deepseek-ai/dsh-client-locale': { description: '提供本地化偏好与消息词典', category: 'ui' },
  '@deepseek-ai/dsh-client-modules': { description: '加载浏览器侧客户端模块：扫描 dsh.client 声明、组合引导图并提供 bundle 路由', category: 'ui' },
  '@deepseek-ai/dsh-client-runtime': { description: '为会话、工作区和 UI 组合提供共享客户端服务', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-agent-preset': { description: '选择会话的 agent 预设，并编写预设组合', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-commands': { description: '提供会话感知的命令发现与分发', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-conversation': { description: '展示当前对话及其输入界面', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-cordis': { description: '浏览器面：操作动态插件的全局面板与只读 define 卡片', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-deliverables': { description: '在每条收尾的 assistant 消息下展示本次产出文件', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-goal': { description: '展示和管理当前目标', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-input-trigger': { description: '协调内联命令和引用建议', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-jobs': { description: '在会话标题栏列出当前会话的后台任务', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-layout': { description: '排列应用的主要区域', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-message-feedback': { description: '在消息操作条提供赞/踩与可选备注的反馈界面', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-model-selection': { description: '在对话界面中提供模型选择', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-permission-presets': { description: '配置默认权限并切换当前会话的访问模式', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-plan': { description: '展示生效中的 plan mode 状态及其退出控件', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-settings': { description: '承载设置界面及其扩展区域', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-settings-general': { description: '提供常规设置分区', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-settings-models': { description: '提供模型提供方配置与 DeepSeek 配置引导', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-settings-plugin-inventory': { description: '向“插件”设置贡献只读的 Host Loader 清单标签页', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-settings-plugins': { description: '拥有“插件”设置分区、标签页扩展点与可配置的宿主插件卡片', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-sidebar': { description: '展示工作区与会话导航', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-skill': { description: '向内联建议添加 skill 引用', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-subagent': { description: '提供 subagent 导航、子级 transcript 状态和内联引用', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-theme': { description: '应用所选颜色主题', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-tool': { description: '编排工具调用树和按工具键控的视图', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-trajectory': { description: '提供 agent 活动的其他视图', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-user-questions': { description: '展示 agent 请求的交互式问题', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-workflow-run': { description: '把持久工作流运行回放为 Chat 嵌套折叠项', category: 'ui' },
  '@deepseek-ai/dsh-client-ui-workspace': { description: '提供工作区选择与创建界面', category: 'ui' },
  '@deepseek-ai/dsh-code-runtime-worker-thread': { description: 'Worker 线程代码执行后端', category: 'infra' },
  '@deepseek-ai/dsh-command-compact': { description: '用户压缩命令', category: 'infra' },
  '@deepseek-ai/dsh-command-feedback': { description: '与触发方式无关的 feedback/record 事件与面向用户的 /feedback 命令', category: 'infra' },
  '@deepseek-ai/dsh-command-goal': { description: '面向用户的目标命令', category: 'infra' },
  '@deepseek-ai/dsh-commands': { description: '为交互式适配器注册并分派用户命令', category: 'infra' },
  '@deepseek-ai/dsh-compaction-basic': { description: 'token 压力与摘要后端', category: 'infra' },
  '@deepseek-ai/dsh-compaction-tool-result-pruner': { description: '可选的无模型工具结果修剪', category: 'infra' },
  '@deepseek-ai/dsh-cordis-client-runner': { description: '把动态插件定义求值成活的浏览器插件并应答运行请求', category: 'ui' },
  '@deepseek-ai/dsh-cordis-host-runner': { description: '定义动态插件注册表、Host 半的 node:vm 沙箱与运行请求往返', category: 'infra' },
  '@deepseek-ai/dsh-credentials-local': { description: '环境与本地文件凭据提供方', category: 'infra' },
  '@deepseek-ai/dsh-fs-observation-policy': { description: '政策门禁插件：提供已观察状态、编辑前读取和版本防护的写入/编辑', category: 'infra' },
  '@deepseek-ai/dsh-fs-sandbox': { description: '强制沙箱的 FileSystem 后端：按每次调用的模式与工作区根政策约束写入/编辑', category: 'infra' },
  '@deepseek-ai/dsh-goal': { description: '目标状态与生命周期', category: 'infra' },
  '@deepseek-ai/dsh-goal-round-driver': { description: '同会话目标续行', category: 'infra' },
  '@deepseek-ai/dsh-host-apiproxy': { description: '共享宿主 API 网关和协议约定', category: 'infra' },
  '@deepseek-ai/dsh-host-directory-picker-auto': { description: '宿主自适应目录选择器组合', category: 'infra' },
  '@deepseek-ai/dsh-host-plugin-inventory': { description: '当前 Loader 条目的只读投影（pluginInventory/list）', category: 'infra' },
  '@deepseek-ai/dsh-host-webserver': { description: 'HTTP 路由载体', category: 'infra' },
  '@deepseek-ai/dsh-jobs-local': { description: '实现进程本地任务注册表', category: 'infra' },
  '@deepseek-ai/dsh-llm': { description: 'LLM 服务与共享流式词汇', category: 'infra' },
  '@deepseek-ai/dsh-llm-deepseek': { description: '直接 DeepSeek 适配器', category: 'infra' },
  '@deepseek-ai/dsh-llm-pi-ai': { description: '多提供方 pi-ai 适配器', category: 'infra' },
  '@deepseek-ai/dsh-llm-retry': { description: '提供方作用域的重试策略', category: 'infra' },
  // MCP server rows share the mcp-client package; each row gets its own
  // title and functional description below (the Host provides a per-server
  // fallback for any uncatalogued MCP row).
  'mcp-chrome-devtools': { title: 'chrome-devtools', description: 'MCP 服务器：Chrome DevTools 浏览器自动化——页面操作、元素调试、截图与性能分析', category: 'mcp' },
  'mcp-postgres': { title: 'postgres', description: 'MCP 服务器：PostgreSQL 数据库查询、表结构操作与 SQL 执行', category: 'mcp' },
  'mcp-xmind': { title: 'xmind', description: 'MCP 服务器：XMind 思维导图的创建、读取与编辑', category: 'mcp' },
  '@deepseek-ai/dsh-message-feedback': { description: '绑定生命周期的逐消息评分/备注伴随记录及 Host messageFeedback Remote 契约', category: 'infra' },
  '@deepseek-ai/dsh-permission-presets': { description: '呈现并持久化面向用户的权限预设', category: 'infra' },
  '@deepseek-ai/dsh-plan-mode': { description: '负责 plan mode 状态、指引、命令和评审流程', category: 'infra' },
  '@deepseek-ai/dsh-pwsh-sandbox': { description: '经 ctx.sandbox 隔离的 PowerShell 执行器（bash-sandbox 的 pwsh 孪生）', category: 'infra' },
  '@deepseek-ai/dsh-repeat-tool-reminder': { description: '针对重复工具调用的建议性提醒', category: 'infra' },
  '@deepseek-ai/dsh-sandbox-local': { description: '提供本地平台限制后端', category: 'infra' },
  '@deepseek-ai/dsh-sandbox-policy': { description: '解析持久的逐会话沙箱策略', category: 'infra' },
  '@deepseek-ai/dsh-session': { description: '事件溯源会话日志和内存存储', category: 'infra' },
  '@deepseek-ai/dsh-session-checkpoint-policy': { description: '应用语义持久性检查点', category: 'infra' },
  '@deepseek-ai/dsh-session-log-export': { description: '在 Host ZIP 端点之上增加 Web /export 命令与下载弹窗', category: 'infra' },
  '@deepseek-ai/dsh-session-persistence-jsonl': { description: '将会话持久化到 JSONL 文件', category: 'infra' },
  '@deepseek-ai/dsh-session-projection': { description: '定义并驱动会话投影单元', category: 'infra' },
  '@deepseek-ai/dsh-session-projection-cache': { description: '持久化并恢复投影检查点', category: 'infra' },
  '@deepseek-ai/dsh-session-query-sqlite': { description: '使用 SQLite 全文搜索实现会话查询', category: 'infra' },
  '@deepseek-ai/dsh-session-stats': { description: '提供全日志会话计数与墙钟时间', category: 'infra' },
  '@deepseek-ai/dsh-session-telemetry-otel': { description: '通过 OpenTelemetry 日志以 FULL、FEEDBACK_ONLY 或 DISABLED 模式投递遥测', category: 'infra' },
  '@deepseek-ai/dsh-session-title': { description: '负责标题状态、回退行为、提供方注册与刷新', category: 'infra' },
  '@deepseek-ai/dsh-session-title-first-prompt-llm': { description: '根据第一条合格的人类消息生成会话标题', category: 'infra' },
  '@deepseek-ai/dsh-settings-file': { description: '在本地文件中存储设置并观察外部编辑', category: 'infra' },
  '@deepseek-ai/dsh-shell-env': { description: '提供 shell 工具共享的托管 DSH_* 环境', category: 'infra' },
  '@deepseek-ai/dsh-skill': { description: '定义 skill 提供方注册和查找', category: 'skill' },
  '@deepseek-ai/dsh-skill-badge': { description: '贡献可选的内置 dsh 徽章 skill', category: 'skill' },
  '@deepseek-ai/dsh-skill-filesystem': { description: '从本地文件系统发现 skill', category: 'skill' },
  '@deepseek-ai/dsh-spill-local': { description: '在会话范围的本地文件中存储 spill 文本', category: 'infra' },
  '@deepseek-ai/dsh-spill-policy': { description: '应用执行后 spill 策略', category: 'infra' },
  '@deepseek-ai/dsh-storage': { description: '将已注册后端与类型化数据形式连接起来', category: 'infra' },
  '@deepseek-ai/dsh-storage-domain': { description: '提供经过验证的领域记录存储', category: 'infra' },
  '@deepseek-ai/dsh-storage-json': { description: '在 JSON 文件中存储数据', category: 'infra' },
  '@deepseek-ai/dsh-subagent': { description: '定义提供方注册、委派和继续执行', category: 'infra' },
  '@deepseek-ai/dsh-subagent-fork-in-process': { description: '从父 agent 已完成的历史记录启动进程内子 agent', category: 'infra' },
  '@deepseek-ai/dsh-subagent-spawn-in-process': { description: '启动全新的进程内子 agent', category: 'infra' },
  '@deepseek-ai/dsh-subprocess-local': { description: '本地子进程提供方：detached 进程树、有界收集/spill、node-pty 等', category: 'infra' },
  '@deepseek-ai/dsh-system-prompt': { description: '提示词和工具 schema 组装注册表', category: 'infra' },
  '@deepseek-ai/dsh-token-meter': { description: '可感知回放的 token 测量', category: 'infra' },
  '@deepseek-ai/dsh-tool-bash': { description: '向模型公开 Bash 执行和后台任务集成', category: 'tool' },
  '@deepseek-ai/dsh-tool-call-timeout-policy': { description: '以部署策略形式设置单次工具调用截止时间', category: 'infra' },
  '@deepseek-ai/dsh-tool-fs': { description: '面向模型的 read/write/edit 文件工具与执行器', category: 'tool' },
  '@deepseek-ai/dsh-tool-fs-search': { description: '面向模型的 glob/grep 发现工具（基于 ripgrep）', category: 'tool' },
  '@deepseek-ai/dsh-tool-goal': { description: '面向模型的目标工具', category: 'tool' },
  '@deepseek-ai/dsh-tool-jobs': { description: '向模型公开任务控制和完成通知', category: 'tool' },
  '@deepseek-ai/dsh-tool-pwsh': { description: '向模型公开 PowerShell 执行', category: 'tool' },
  '@deepseek-ai/dsh-tool-ralph': { description: '公开使用全新 agent 的固定 Ralph 工作流', category: 'tool' },
  '@deepseek-ai/dsh-tool-skill': { description: '发布 skill 目录和面向模型的 loader', category: 'skill' },
  '@deepseek-ai/dsh-tool-str-replace-editor': { description: '基于 ctx.fs、面向模型的独立 str_replace_editor 文本编辑工具', category: 'tool' },
  '@deepseek-ai/dsh-tool-subagent': { description: '向模型公开委派操作', category: 'tool' },
  '@deepseek-ai/dsh-tool-subagent-control': { description: '向模型公开子级消息发送和列举操作', category: 'tool' },
  '@deepseek-ai/dsh-tool-subagent-control/list-agents': { description: '向模型公开子级消息发送和列举操作', category: 'tool' },
  '@deepseek-ai/dsh-tool-subagent-report': { description: '提供从子级到父级的报告通道', category: 'tool' },
  '@deepseek-ai/dsh-tool-todo': { description: '存储并公开会话的 todo 列表', category: 'tool' },
  '@deepseek-ai/dsh-tool-vision': { description: '通过 opencode go 的 mimo-v2.5 识别本地图片，失败时自动切换配置', category: 'tool' },
  '@deepseek-ai/dsh-tool-web': { description: '向模型公开 web 搜索和抓取', category: 'tool' },
  '@deepseek-ai/dsh-tool-workflow': { description: '向模型公开通用工作流执行', category: 'tool' },
  '@deepseek-ai/dsh-tools': { description: '作用域工具注册表和执行流水线', category: 'infra' },
  '@deepseek-ai/dsh-typert-loader': { description: '发现 Loader 条目并注册生成的宿主产物', category: 'infra' },
  '@deepseek-ai/dsh-typert-registry': { description: '存储运行时包反射和 schema', category: 'infra' },
  '@deepseek-ai/dsh-user-approval': { description: '协调一次性审批决策', category: 'infra' },
  '@deepseek-ai/dsh-user-questions': { description: '定义与提供方无关的用户问答 seam', category: 'infra' },
  '@deepseek-ai/dsh-web': { description: '定义 web 提供方注册、选择和共享错误', category: 'infra' },
  '@deepseek-ai/dsh-web-app': { description: '浏览器表层 bundle：web patch 层 + 运行时粘合插件（前端 dist 服务、URL 行等）', category: 'ui' },
  '@deepseek-ai/dsh-web-app/startup': { description: '提供解析后的 Web 启动参数（host、port、trustedHosts）', category: 'ui' },
  '@deepseek-ai/dsh-web-search-deepseek': { description: '提供 DeepSeek 原生 web 搜索', category: 'infra' },
  '@deepseek-ai/dsh-workflow-worker-thread': { description: '在线程中运行工作流脚本', category: 'infra' },
  '@deepseek-ai/dsh-workspace': { description: '注册 workspace 并记录其会话归属', category: 'infra' },
  'dsh-daily-recap': { description: 'turn/end 事件驱动的工作日志：每次对用户完成一条正式回复后，按 daily-recap skill 模板生成摘要并写入 D:\\工作\\日报\\YYYY-MM-DD.md', category: 'infra' },
  '@omdsh-dev/dsh-genui': { description: 'GenUI：在回复中以内联 dsh-ui 围栏渲染交互式 UI 组件（布局、图表、表单、测验、mermaid、3D 等）并回传动作事件', category: 'ui' },
  'dsh-better-sidebar': { description: 'VSCode 风格右侧栏（资源管理器/编辑器/终端/Git/浏览器），按会话隔离，可注册自定义标签页与文件查看器', category: 'ui' },
}

/**
 * 模块名 → 功能分类。目录收录的插件直接返回其分类；未收录的按名称关键词
 * 回退（mcp → 技能 → 工具 → 浏览器侧），关键词也无法区分的一律归入
 * `other`（其它）。
 * @param moduleName - Loader 模块名。
 * @returns 该插件的功能分类。
 */
export function categoryOf(moduleName: string): PluginCategory {
  const listed = PLUGIN_CATALOG[moduleName]?.category
  if (listed !== undefined) return listed
  if (moduleName.includes('mcp')) return 'mcp'
  if (moduleName.includes('skill')) return 'skill'
  if (moduleName.includes('tool')) return 'tool'
  if (moduleName.includes('client')) return 'ui'
  return 'other'
}
