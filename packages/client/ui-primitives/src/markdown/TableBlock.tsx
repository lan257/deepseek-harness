// TableBlock: the scroll-capped frame and width-resize handle around a rendered
// markdown table. The frame bounds the table's height and width so a long or
// wide table scrolls in place — the horizontal scrollbar sits at the bottom of
// the bounded viewport, reachable while reading the top rows — and a right-edge
// handle lets the reader drag the viewport width or nudge it with
// ArrowLeft/ArrowRight; double-click restores the full column width.

import { useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import clsx from 'clsx'
import css from './MarkdownText.module.css'

/** Resize-handle copy for the scroll-capped table frame. Zero-cordis: label
 * props with Chinese defaults; localized plugins pass their dictionary labels. */
export interface MarkdownTableLabels {
  /** Accessible resize-handle label. */
  resizeLabel: string
  /** Hover title describing drag resize and double-click reset. */
  resizeTitle: string
}

/** Narrowest frame width a drag or arrow key can set. */
const TABLE_MIN_WIDTH = 200
/** Arrow-key resize step, in px. */
const TABLE_RESIZE_STEP = 16

interface ResizeDrag {
  pointerId: number
  startX: number
  startWidth: number
  maxWidth: number
}

function clampWidth(candidate: number, maxWidth: number): number {
  return Math.min(Math.max(candidate, TABLE_MIN_WIDTH), maxWidth)
}

export function TableBlock({ children, labels }: {
  children: ReactNode
  labels: MarkdownTableLabels | undefined
}) {
  const [width, setWidth] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<ResizeDrag | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)

  const resizeLabel = labels?.resizeLabel ?? '调整表格宽度'
  const resizeTitle = labels?.resizeTitle ?? '拖动调整宽度，双击恢复默认'

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    const frame = frameRef.current
    /* v8 ignore next -- ref-null guard: the handle only fires while the frame is mounted. */
    if (frame === null) return
    const parentWidth = frame.parentElement?.getBoundingClientRect().width
    /* v8 ignore next -- the frame's parent is the markdown root while mounted; the fallback only defends a detached frame. */
    const maxWidth = parentWidth ?? window.innerWidth
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width ?? frame.getBoundingClientRect().width,
      maxWidth,
    }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    setWidth(clampWidth(drag.startWidth + event.clientX - drag.startX, drag.maxWidth))
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    /* v8 ignore next -- capture is set in beginDrag on the same pointer, so release always follows. */
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const resetWidth = (): void => {
    setWidth(null)
  }

  const nudgeWidth = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const frame = frameRef.current
    /* v8 ignore next -- ref-null guard: the handle only fires while the frame is mounted. */
    if (frame === null) return
    const parentWidth = frame.parentElement?.getBoundingClientRect().width
    /* v8 ignore next -- the frame's parent is the markdown root while mounted; the fallback only defends a detached frame. */
    const maxWidth = parentWidth ?? window.innerWidth
    const direction = event.key === 'ArrowLeft' ? -1 : 1
    const current = width ?? frame.getBoundingClientRect().width
    setWidth(clampWidth(current + direction * TABLE_RESIZE_STEP, maxWidth))
    event.preventDefault()
  }

  return (
    <div
      ref={frameRef}
      className={css.tableFrame}
      style={width === null ? undefined : { width: `${width}px` }}
    >
      <div className={css.tableScroll}>{children}</div>
      <div
        className={clsx(css.tableResizeHandle, dragging && css.tableResizeDragging)}
        role="separator"
        aria-label={resizeLabel}
        aria-orientation="vertical"
        tabIndex={0}
        title={resizeTitle}
        onDoubleClick={resetWidth}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={nudgeWidth}
      />
    </div>
  )
}
