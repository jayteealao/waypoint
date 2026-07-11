/**
 * Unit tests for useSimulatedStream.
 *
 * Verifies:
 *   - Initial state has all sections null (all-skeleton start)
 *   - Each interval tick reveals exactly one additional section
 *   - All sections are revealed after N × delayMs
 *   - Cleanup on unmount clears the interval (no lingering timer)
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSimulatedStream } from '#/lib/lesson/stream-driver'
import { FIXTURE_LESSON } from '#/fixtures/lesson-fixture'

describe('useSimulatedStream', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with all sections null', () => {
    const { result } = renderHook(() => useSimulatedStream(FIXTURE_LESSON))
    const partial = result.current
    expect(partial.title).toBe(FIXTURE_LESSON.title)
    expect(partial.sections).toHaveLength(FIXTURE_LESSON.sections.length)
    expect(partial.sections.every((s) => s === null)).toBe(true)
  })

  it('reveals one section per interval tick', () => {
    const delayMs = 100
    const { result } = renderHook(() =>
      useSimulatedStream(FIXTURE_LESSON, { delayMs }),
    )

    // After 0ms: all null
    expect(result.current.sections.filter((s) => s !== null)).toHaveLength(0)

    // After 1 tick: 1 section revealed
    act(() => { vi.advanceTimersByTime(delayMs) })
    expect(result.current.sections.filter((s) => s !== null)).toHaveLength(1)
    expect(result.current.sections[0]).toEqual(FIXTURE_LESSON.sections[0])

    // After 2 ticks: 2 sections
    act(() => { vi.advanceTimersByTime(delayMs) })
    expect(result.current.sections.filter((s) => s !== null)).toHaveLength(2)
  })

  it('reveals all sections after N × delayMs', () => {
    const delayMs = 50
    const total = FIXTURE_LESSON.sections.length
    const { result } = renderHook(() =>
      useSimulatedStream(FIXTURE_LESSON, { delayMs }),
    )

    act(() => { vi.advanceTimersByTime(delayMs * total) })

    expect(result.current.sections.every((s) => s !== null)).toBe(true)
    result.current.sections.forEach((s, i) => {
      expect(s).toEqual(FIXTURE_LESSON.sections[i])
    })
  })

  it('does not add extra sections beyond the document length', () => {
    const delayMs = 50
    const total = FIXTURE_LESSON.sections.length
    const { result } = renderHook(() =>
      useSimulatedStream(FIXTURE_LESSON, { delayMs }),
    )

    // Advance well past completion
    act(() => { vi.advanceTimersByTime(delayMs * (total + 10)) })

    expect(result.current.sections).toHaveLength(total)
    expect(result.current.sections.every((s) => s !== null)).toBe(true)
  })

  it('clears the interval on unmount (no lingering timer)', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval')
    const { unmount } = renderHook(() => useSimulatedStream(FIXTURE_LESSON))

    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })
})
