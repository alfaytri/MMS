import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatListV2 } from '../ChatListV2'
import type { ChatConversation } from '@/types/contact-center'

vi.mock('@/hooks/useCountryCodes', () => ({
  useCountryCodes: () => ({ data: [] }),
}))

beforeEach(() => localStorage.clear())

const teamPhones = { teams: [], byPhone: new Map(), isLoading: false }
const divisions  = [] as { id: string; name: string }[]

const conv: ChatConversation = {
  id: 'c1', customer_id: null, conversation_type: null,
  wati_phone: '+97412345678', wati_contact_name: 'Alice',
  last_message: 'Hello', last_message_at: '2026-06-14T10:00:00Z',
  last_message_from_type: 'customer', unanswered_dismissed_at: null,
  unread_count: 0, assigned_agent: null, is_opened: true,
  wati_status: 'open', provider: 'wati', created_at: '2026-06-01T00:00:00Z',
}

function props() {
  return {
    conversations: [conv],
    loading: false,
    onSelectConversation: vi.fn(),
    onStartNewChat:       vi.fn(),
    provider: 'wati' as const,
    teamPhones, divisions,
    onOpenTeam: vi.fn(), onMarkResolved: vi.fn(async () => {}),
  } as unknown as Parameters<typeof ChatListV2>[0]
}

describe('ChatListV2 search', () => {
  it('clears the search input when the active tab changes', () => {
    render(<ChatListV2 {...props()} />)
    const input = screen.getByPlaceholderText(/search by name/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Alice' } })
    expect(input.value).toBe('Alice')

    fireEvent.click(screen.getByRole('tab', { name: /teams/i }))
    expect(input.value).toBe('')
  })

  it('renders "no matches for X" when a search yields nothing', () => {
    render(<ChatListV2 {...props()} />)
    const input = screen.getByPlaceholderText(/search by name/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'zzz-not-found' } })
    expect(screen.getByText(/no matches for "zzz-not-found"/i)).toBeInTheDocument()
  })

  it('renders the Tasks placeholder copy on the Tasks tab', () => {
    render(<ChatListV2 {...props()} />)
    fireEvent.click(screen.getByRole('tab', { name: /tasks/i }))
    expect(screen.getByText(/tasks coming soon/i)).toBeInTheDocument()
  })
})
