import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MobileTooltip } from '../MobileTooltip'

describe('MobileTooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the trigger child', () => {
    render(
      <MobileTooltip content="Hello tooltip">
        <button>Trigger</button>
      </MobileTooltip>,
    )
    expect(screen.getByRole('button', { name: 'Trigger' })).toBeInTheDocument()
  })

  it('opens after a 500ms touch hold', () => {
    render(
      <MobileTooltip content="Hello tooltip">
        <button>Trigger</button>
      </MobileTooltip>,
    )

    const btn = screen.getByRole('button', { name: 'Trigger' })

    act(() => {
      btn.dispatchEvent(
        new TouchEvent('touchstart', {
          bubbles: true,
          touches: [{ clientX: 10, clientY: 10 } as Touch],
        }),
      )
    })

    expect(screen.queryByText('Hello tooltip')).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(600)
    })

    // After advancing past 500ms, the tooltip open state flips.
    // Radix renders content in a portal; getAllByText finds it.
    const matches = screen.queryAllByText('Hello tooltip')
    expect(matches.length).toBeGreaterThan(0)
  })

  it('does NOT open if touch is released before duration', () => {
    render(
      <MobileTooltip content="Hello tooltip">
        <button>Trigger</button>
      </MobileTooltip>,
    )

    const btn = screen.getByRole('button', { name: 'Trigger' })

    act(() => {
      btn.dispatchEvent(
        new TouchEvent('touchstart', {
          bubbles: true,
          touches: [{ clientX: 10, clientY: 10 } as Touch],
        }),
      )
    })

    act(() => {
      vi.advanceTimersByTime(200)
      btn.dispatchEvent(new TouchEvent('touchend', { bubbles: true }))
      vi.advanceTimersByTime(500)
    })

    expect(screen.queryByText('Hello tooltip')).not.toBeInTheDocument()
  })
})
