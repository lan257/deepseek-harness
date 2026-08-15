/** `notifications` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'tab.title': '消息',
  'empty': '暂无消息',
  'empty.desc': '其他会话的审批、任务结果与错误都会出现在这里，无需切换会话即可处理。',
  'action.allowOnce': '允许一次',
  'action.reject': '拒绝',
  'state.resolved': '已处理',
  'approval.pending': '权限申请',
  'job.completed': '任务完成',
  'job.failed': '任务失败',
  'job.killed': '任务中断',
  'agent.error': '会话出错',
  'reason.fallback': '请求允许使用工具 {toolName}',
  'time.now': '刚刚',
  'time.minutes': '{n} 分钟前',
  'time.hours': '{n} 小时前',
  'time.days': '{n} 天前',
} satisfies Record<string, string>

/** The notifications namespace key union. */
export type NotificationKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'tab.title': 'Messages',
  'empty': 'Nothing here yet',
  'empty.desc': 'Approvals, task results, and errors from other sessions appear here — act on them without switching sessions.',
  'action.allowOnce': 'Allow once',
  'action.reject': 'Reject',
  'state.resolved': 'Answered',
  'approval.pending': 'Permission request',
  'job.completed': 'Task completed',
  'job.failed': 'Task failed',
  'job.killed': 'Task interrupted',
  'agent.error': 'Session error',
  'reason.fallback': 'Requests permission to use {toolName}',
  'time.now': 'just now',
  'time.minutes': '{n} min ago',
  'time.hours': '{n} h ago',
  'time.days': '{n} d ago',
} satisfies Record<NotificationKey, string>
