// The auto-collapsed process row: one 24px disclosure header at the turn's
// first tool-call position, replacing the cards until the reader expands.
// Clicking toggles the shared chat store's per-turn expansion flag.

import { memo } from 'react'
import { DisclosureRow, IconCodeOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { isSettledTool, type ChatNode } from '../contract/chat-nodes.ts'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import css from './ProcessSummary.module.css'

/** Props for the process summary row. */
export interface ProcessSummaryProps {
  /** Owning turn number; the store key for the expansion flag. */
  turn: number
  /** Whether the reader expanded the process (cards visible). */
  expanded: boolean
  /** Flip the turn's expansion flag. */
  onToggle: () => void
  /** Session snapshot hook; the count is derived from the live location index. */
  useSession: ChatViewSlotProps['useSession']
  /** The owning view's locale seat. */
  t: ChatViewSlotProps['t']
}

/**
 * Render one turn's settled tool-call process as a collapsible disclosure
 * header. The count counts settled root calls through the location index, so
 * the summary stays accurate while the underlying nodes stream or page in.
 * @param props - turn identity, expansion state, toggle, and the snapshot/locale seats.
 * @returns the disclosure row.
 */
export const ProcessSummary = memo(function ProcessSummary({
  turn, expanded, onToggle, useSession, t,
}: ProcessSummaryProps) {
  const count = useSession((snapshot) => {
    let total = 0
    for (const key of snapshot.chat.locations.getTurn(turn)) {
      const node = snapshot.chat.nodes.get(key) as ChatNode | undefined
      if (node !== undefined && node.kind === 'tool-call' && isSettledTool(node.data.root)) total += 1
    }
    return total
  })
  return (
    <div className={css.root} data-chat-anchor-key={`process:${turn}`} data-chat-flow-kind="process-summary">
      <DisclosureRow
        icon={<IconCodeOutline16 size={14} />}
        title={t('process.summary', { count })}
        open={expanded}
        expandable
        expandOnRowClick
        onToggle={onToggle}
      />
    </div>
  )
})
