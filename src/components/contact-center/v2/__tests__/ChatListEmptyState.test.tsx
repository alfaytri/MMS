import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatListEmptyState } from '../ChatListEmptyState'

describe('ChatListEmptyState', () => {
  it("renders 'no chats yet' when no search and no data", () => {
    render(<ChatListEmptyState variant="empty" filter="all" />)
    expect(screen.getByText(/no chats yet/i)).toBeInTheDocument()
  })

  it("renders 'nothing unanswered' for the Unanswered tab", () => {
    render(<ChatListEmptyState variant="empty" filter="unanswered" />)
    expect(screen.getByText(/nothing unanswered/i)).toBeInTheDocument()
  })

  it("renders 'no teams with a phone' for the Teams tab", () => {
    render(<ChatListEmptyState variant="empty" filter="teams" />)
    expect(screen.getByText(/no teams with a phone/i)).toBeInTheDocument()
  })

  it("renders 'no matches for X' when search returns nothing", () => {
    render(<ChatListEmptyState variant="no-match" filter="all" searchTerm="john" />)
    expect(screen.getByText(/no matches for "john"/i)).toBeInTheDocument()
    expect(screen.getByText(/try a different name or number/i)).toBeInTheDocument()
  })
})
