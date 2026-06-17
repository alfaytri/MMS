import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DesktopOnlyGate } from '../DesktopOnlyGate'

describe('DesktopOnlyGate', () => {
  it('renders the gate message (hidden visually above lg, shown below)', () => {
    render(
      <DesktopOnlyGate>
        <div>secret content</div>
      </DesktopOnlyGate>,
    )
    expect(screen.getByText('Best viewed on a desktop or tablet')).toBeInTheDocument()
    expect(screen.getByText('secret content')).toBeInTheDocument()
  })

  it('applies hide-below-lg class to children wrapper', () => {
    const { container } = render(
      <DesktopOnlyGate>
        <div>secret</div>
      </DesktopOnlyGate>,
    )
    const childWrap = container.querySelector('[data-desktop-content]') as HTMLElement
    expect(childWrap.className).toContain('hidden')
    expect(childWrap.className).toContain('lg:block')
  })

  it('applies show-below-lg class to gate', () => {
    const { container } = render(
      <DesktopOnlyGate>
        <div>secret</div>
      </DesktopOnlyGate>,
    )
    const gate = container.querySelector('[data-desktop-gate]') as HTMLElement
    expect(gate.className).toContain('lg:hidden')
  })
})
