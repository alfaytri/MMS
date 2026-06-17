import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from '../ResponsiveDialog'

describe('ResponsiveDialog', () => {
  it('renders children when open', () => {
    render(
      <ResponsiveDialog open onOpenChange={() => {}}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Test title</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <div>body content</div>
          <ResponsiveDialogFooter>
            <button>OK</button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>,
    )
    expect(screen.getByText('Test title')).toBeInTheDocument()
    expect(screen.getByText('body content')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument()
  })

  it('applies the mobile full-screen classes to content', () => {
    render(
      <ResponsiveDialog open onOpenChange={() => {}}>
        <ResponsiveDialogContent data-testid="content">
          <div>x</div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>,
    )
    const content = screen.getByTestId('content')
    expect(content.className).toContain('rounded-none')
    expect(content.className).toContain('md:rounded-lg')
    expect(content.className).toContain('max-w-full')
    expect(content.className).toContain('md:max-w-lg')
  })
})
