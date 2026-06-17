import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PageContainer } from '../PageContainer'

describe('PageContainer', () => {
  it('renders children', () => {
    render(<PageContainer><div>hello</div></PageContainer>)
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('applies default container classes', () => {
    const { container } = render(<PageContainer><span /></PageContainer>)
    const div = container.firstChild as HTMLElement
    expect(div.className).toContain('w-full')
    expect(div.className).toContain('px-4')
    expect(div.className).toContain('py-4')
  })

  it('compact mode removes padding', () => {
    const { container } = render(<PageContainer compact><span /></PageContainer>)
    const div = container.firstChild as HTMLElement
    expect(div.className).not.toContain('px-4')
    expect(div.className).not.toContain('py-4')
  })

  it('PageWrapper re-export still works', async () => {
    const { PageWrapper } = await import('../PageWrapper')
    render(<PageWrapper><div>legacy</div></PageWrapper>)
    expect(screen.getByText('legacy')).toBeInTheDocument()
  })
})
