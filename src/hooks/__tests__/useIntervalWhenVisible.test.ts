import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIntervalWhenVisible } from '../useIntervalWhenVisible'

describe('useIntervalWhenVisible', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'hidden', { value: false, configurable: true, writable: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs the callback on the interval when the tab is visible', () => {
    const cb = vi.fn()
    renderHook(() => useIntervalWhenVisible(cb, 1000))
    expect(cb).toHaveBeenCalledTimes(0)
    act(() => { vi.advanceTimersByTime(3500) })
    expect(cb).toHaveBeenCalledTimes(3)
  })

  it('does not run the callback while document.hidden is true', () => {
    const cb = vi.fn()
    Object.defineProperty(document, 'hidden', { value: true, configurable: true, writable: true })
    renderHook(() => useIntervalWhenVisible(cb, 1000))
    act(() => { vi.advanceTimersByTime(5000) })
    expect(cb).toHaveBeenCalledTimes(0)
  })

  it('triggers an immediate run on visibility change to visible', () => {
    const cb = vi.fn()
    Object.defineProperty(document, 'hidden', { value: true, configurable: true, writable: true })
    renderHook(() => useIntervalWhenVisible(cb, 10_000))
    act(() => { vi.advanceTimersByTime(2000) })
    expect(cb).toHaveBeenCalledTimes(0)

    Object.defineProperty(document, 'hidden', { value: false, configurable: true, writable: true })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })

    expect(cb).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('clears the interval on unmount', () => {
    const cb = vi.fn()
    const { unmount } = renderHook(() => useIntervalWhenVisible(cb, 1000))
    unmount()
    act(() => { vi.advanceTimersByTime(5000) })
    expect(cb).toHaveBeenCalledTimes(0)
  })
})
