import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ResponsivePageHeader } from '../ResponsivePageHeader'

describe('ResponsivePageHeader', () => {
  it('renders title', () => {
    render(<ResponsivePageHeader title="My Page" />)
    expect(screen.getByRole('heading', { level: 1, name: 'My Page' })).toBeInTheDocument()
  })

  it('renders description when provided', () => {
    render(<ResponsivePageHeader title="x" description="some subtitle" />)
    expect(screen.getByText('some subtitle')).toBeInTheDocument()
  })

  it('does not render description block when omitted', () => {
    const { container } = render(<ResponsivePageHeader title="x" />)
    expect(container.querySelector('p')).toBeNull()
  })

  it('renders action buttons when provided', () => {
    render(
      <ResponsivePageHeader
        title="x"
        actions={<button>Do Thing</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Do Thing' })).toBeInTheDocument()
  })

  it('applies stacking classes on mobile, side-by-side on sm+', () => {
    const { container } = render(<ResponsivePageHeader title="x" />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('flex-col')
    expect(wrapper.className).toContain('sm:flex-row')
  })

  it('applies sticky classes when sticky=true', () => {
    const { container } = render(<ResponsivePageHeader title="x" sticky />)
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('sticky')
    expect(wrapper.className).toContain('top-0')
  })
})
