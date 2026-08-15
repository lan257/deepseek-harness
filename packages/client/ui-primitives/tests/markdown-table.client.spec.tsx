// @vitest-environment jsdom
// Markdown table frame behavior: the scroll-capped wrapper and its width-resize
// handle (drag, arrow keys, double-click reset, label copy).
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'

afterEach(cleanup)

beforeEach(() => {
  // jsdom implements no pointer capture; emulate per-element so the capture
  // guards in the resize handle pass.
  const captured = new Set<Element>()
  Element.prototype.setPointerCapture = function (this: Element) { captured.add(this) }
  Element.prototype.hasPointerCapture = function (this: Element) { return captured.has(this) }
  Element.prototype.releasePointerCapture = function (this: Element) { captured.delete(this) }
})

const TABLE = ['| a | b |', '| --- | --- |', '| 1 | 2 |'].join('\n')

function rect(width: number): DOMRect {
  return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: 0, width, height: 0, toJSON: () => ({}) }
}

function mountTable(labels?: { resizeLabel: string; resizeTitle: string }) {
  const rendered = render(<MarkdownText text={TABLE} tableLabels={labels} />)
  const handle = screen.getByRole('separator')
  const frame = handle.parentElement as HTMLElement
  // jsdom reports zero-size boxes; the drag arithmetic reads both the frame's
  // current width and its parent column width, so pin them like a browser.
  vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(rect(320))
  vi.spyOn(frame.parentElement as HTMLElement, 'getBoundingClientRect').mockReturnValue(rect(640))
  return { ...rendered, handle, frame }
}

describe('MarkdownText table frame', () => {
  it('wraps the table in a bounded scroll frame with an accessible resize handle', () => {
    const { frame, handle } = mountTable()
    expect(frame.querySelector('table')).not.toBeNull()
    expect(frame.firstElementChild?.className).toMatch(/tableScroll/)
    expect(handle.getAttribute('role')).toBe('separator')
    expect(handle.getAttribute('aria-orientation')).toBe('vertical')
    expect(handle.getAttribute('tabindex')).toBe('0')
  })

  it('defaults the handle copy to Chinese and honors provided labels', () => {
    const plain = render(<MarkdownText text={TABLE} />)
    const plainHandle = screen.getByRole('separator')
    expect(plainHandle.getAttribute('aria-label')).toBe('调整表格宽度')
    expect(plainHandle.getAttribute('title')).toBe('拖动调整宽度，双击恢复默认')
    plain.unmount()
    render(
      <MarkdownText text={TABLE} tableLabels={{ resizeLabel: 'Resize table', resizeTitle: 'Drag to resize; double-click to reset' }} />,
    )
    const localizedHandle = screen.getByRole('separator')
    expect(localizedHandle.getAttribute('aria-label')).toBe('Resize table')
    expect(localizedHandle.getAttribute('title')).toBe('Drag to resize; double-click to reset')
  })

  it('drags the handle to resize the frame width and keeps it across re-renders', () => {
    const rendered = mountTable()
    fireEvent.pointerDown(rendered.handle, { button: 0, clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(rendered.handle, { clientX: 180, pointerId: 1 })
    expect(rendered.frame.style.width).toBe('400px')
    expect(rendered.handle.className).toMatch(/tableResizeDragging/)
    fireEvent.pointerUp(rendered.handle, { clientX: 180, pointerId: 1 })
    expect(rendered.handle.className).not.toMatch(/tableResizeDragging/)
    rendered.rerender(<MarkdownText text={`${TABLE}\n\npara after`} />)
    expect(rendered.frame.style.width).toBe('400px')
  })

  it('clamps the drag at the column width and the minimum width', () => {
    const { handle, frame } = mountTable()
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 5000, pointerId: 1 })
    expect(frame.style.width).toBe('640px')
    fireEvent.pointerMove(handle, { clientX: -5000, pointerId: 1 })
    expect(frame.style.width).toBe('200px')
    fireEvent.pointerUp(handle, { clientX: -5000, pointerId: 1 })
  })

  it('ignores non-primary buttons and pointer events without an active drag', () => {
    const { handle, frame } = mountTable()
    fireEvent.pointerDown(handle, { button: 2, clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 200, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: 200, pointerId: 1 })
    expect(frame.style.width).toBe('')
    fireEvent.pointerMove(handle, { clientX: 500, pointerId: 2 })
    expect(frame.style.width).toBe('')
    fireEvent.pointerUp(handle, { clientX: 500, pointerId: 2 })
    expect(frame.style.width).toBe('')
  })

  it('lets only the dragging pointer resize and end the drag', () => {
    const { handle, frame } = mountTable()
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: 300, pointerId: 2 })
    fireEvent.pointerMove(handle, { clientX: 140, pointerId: 1 })
    expect(frame.style.width).toBe('360px')
    fireEvent.pointerMove(handle, { clientX: 500, pointerId: 2 })
    expect(frame.style.width).toBe('360px')
    fireEvent.pointerUp(handle, { clientX: 140, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 600, pointerId: 1 })
    expect(frame.style.width).toBe('360px')
  })

  it('releases the drag on pointer cancel without resizing further', () => {
    const { handle, frame } = mountTable()
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 180, pointerId: 1 })
    fireEvent.pointerCancel(handle, { clientX: 180, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 300, pointerId: 1 })
    expect(frame.style.width).toBe('400px')
  })

  it('nudges the width with arrow keys and ignores other keys', () => {
    const { handle, frame } = mountTable()
    fireEvent.keyDown(handle, { key: 'Enter' })
    expect(frame.style.width).toBe('')
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(frame.style.width).toBe('336px')
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(frame.style.width).toBe('320px')
  })

  it('double-clicking the handle restores the full column width', () => {
    const { handle, frame } = mountTable()
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 180, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: 180, pointerId: 1 })
    expect(frame.style.width).toBe('400px')
    fireEvent.doubleClick(handle)
    expect(frame.style.width).toBe('')
  })
})
