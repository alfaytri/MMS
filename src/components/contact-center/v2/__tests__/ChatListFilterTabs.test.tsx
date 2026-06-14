import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatListFilterTabs, readPersistedFilter, persistFilter } from '../ChatListFilterTabs'

beforeEach(() => localStorage.clear())

describe('ChatListFilterTabs', () => {
  it('renders all four tab labels', () => {
    render(<ChatListFilterTabs value="all" onChange={() => {}} counts={{ all: 0, unanswered: 0, tasks: 0, teams: 0 }} />)
    expect(screen.getByRole('tab', { name: /all/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /unanswered/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /tasks/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /teams/i })).toBeInTheDocument()
  })

  it('hides the count badge when count === 0', () => {
    render(<ChatListFilterTabs value="all" onChange={() => {}} counts={{ all: 12, unanswered: 0, tasks: 0, teams: 5 }} />)
    expect(screen.getByRole('tab', { name: /all/i })).toHaveTextContent(/12/)
    expect(screen.getByRole('tab', { name: /unanswered/i })).not.toHaveTextContent(/\d/)
  })

  it('calls onChange when a tab is clicked', () => {
    const onChange = vi.fn()
    render(<ChatListFilterTabs value="all" onChange={onChange} counts={{ all: 1, unanswered: 0, tasks: 0, teams: 0 }} />)
    fireEvent.click(screen.getByRole('tab', { name: /unanswered/i }))
    expect(onChange).toHaveBeenCalledWith('unanswered')
  })

  it('marks the value tab as aria-selected', () => {
    render(<ChatListFilterTabs value="teams" onChange={() => {}} counts={{ all: 0, unanswered: 0, tasks: 0, teams: 0 }} />)
    expect(screen.getByRole('tab', { name: /teams/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /all/i })).toHaveAttribute('aria-selected', 'false')
  })
})

describe('filter localStorage', () => {
  it('round-trips a persisted filter', () => {
    persistFilter('teams')
    expect(readPersistedFilter()).toBe('teams')
  })

  it('defaults to all when storage is empty or junk', () => {
    localStorage.removeItem('ccChatListFilter')
    expect(readPersistedFilter()).toBe('all')
    localStorage.setItem('ccChatListFilter', 'garbage')
    expect(readPersistedFilter()).toBe('all')
  })
})
