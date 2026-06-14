import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatListV2 } from '../ChatListV2'
import type { ChatConversation } from '@/types/contact-center'
import type { TeamSlim } from '@/hooks/contact-center/local/useTeamPhones'

vi.mock('@/hooks/useCountryCodes', () => ({
  useCountryCodes: () => ({ data: [] }),
}))

beforeEach(() => localStorage.clear())

const TEAM_PHONE = '+97412345678'

const conversations: ChatConversation[] = [
  {
    id: 'c1', customer_id: null, conversation_type: null,
    wati_phone: '+97499990001', wati_contact_name: 'Customer A',
    last_message: 'Hi', last_message_at: '2026-06-14T10:00:00Z',
    last_message_from_type: 'customer', unanswered_dismissed_at: null,
    unread_count: 1, assigned_agent: null, is_opened: false,
    wati_status: 'open', provider: 'wati', created_at: '2026-06-01T00:00:00Z',
  },
  {
    id: 'c2', customer_id: null, conversation_type: null,
    wati_phone: '+97499990002', wati_contact_name: 'Customer B',
    last_message: 'Sure', last_message_at: '2026-06-14T11:00:00Z',
    last_message_from_type: 'agent', unanswered_dismissed_at: null,
    unread_count: 0, assigned_agent: 'Omar', is_opened: true,
    wati_status: 'open', provider: 'wati', created_at: '2026-06-01T00:00:00Z',
  },
  {
    id: 'c3', customer_id: null, conversation_type: 'team',
    wati_phone: TEAM_PHONE, wati_contact_name: 'Team 1',
    last_message: 'Heading out', last_message_at: '2026-06-14T09:00:00Z',
    last_message_from_type: 'customer', unanswered_dismissed_at: null,
    unread_count: 0, assigned_agent: null, is_opened: true,
    wati_status: 'open', provider: 'whapi', created_at: '2026-06-01T00:00:00Z',
  },
  {
    id: 'c4', customer_id: null, conversation_type: null,
    wati_phone: '+97499990004', wati_contact_name: 'Customer D',
    last_message: 'Thanks!', last_message_at: '2026-06-14T08:00:00Z',
    last_message_from_type: 'customer', unanswered_dismissed_at: '2026-06-14T08:01:00Z',
    unread_count: 0, assigned_agent: null, is_opened: true,
    wati_status: 'open', provider: 'wati', created_at: '2026-06-01T00:00:00Z',
  },
]

const teams: TeamSlim[] = [
  { id: 't1', name_en: 'Team 1', name_ar: null, phone: TEAM_PHONE, division_id: 'd1' },
]
const divisions = [{ id: 'd1', name: 'Kitchen', short_name: 'KIT', sort_order: 1 }]
const teamPhones = {
  teams,
  byPhone:   new Map([[TEAM_PHONE, teams[0]]]),
  isLoading: false,
}

function baseProps() {
  return {
    conversations,
    loading: false,
    onSelectConversation: vi.fn(),
    onStartNewChat:       vi.fn(),
    provider: 'wati' as const,
    teamPhones,
    divisions,
    onOpenTeam:     vi.fn(),
    onMarkResolved: vi.fn(async () => {}),
  }
}

describe('ChatListV2 filtering', () => {
  it('ALL shows customer + agent-last chats but hides team chats', () => {
    render(<ChatListV2 {...baseProps()} />)
    expect(screen.getByText('Customer A')).toBeInTheDocument()
    expect(screen.getByText('Customer B')).toBeInTheDocument()
    expect(screen.getByText('Customer D')).toBeInTheDocument()
    expect(screen.queryByText('Team 1')).not.toBeInTheDocument()
  })

  it('Unanswered keeps customer-last, hides agent-last and dismissed', () => {
    render(<ChatListV2 {...baseProps()} />)
    fireEvent.click(screen.getByRole('tab', { name: /unanswered/i }))
    expect(screen.getByText('Customer A')).toBeInTheDocument()
    expect(screen.queryByText('Customer B')).not.toBeInTheDocument()
    expect(screen.queryByText('Customer D')).not.toBeInTheDocument()
  })

  it('Teams shows the team grouped under its division', () => {
    render(<ChatListV2 {...baseProps()} />)
    fireEvent.click(screen.getByRole('tab', { name: /teams/i }))
    expect(screen.getByText('Kitchen')).toBeInTheDocument()
    expect(screen.getByText('Team 1')).toBeInTheDocument()
  })

  it('Tab counts reflect the buckets', () => {
    render(<ChatListV2 {...baseProps()} />)
    const allTab        = screen.getByRole('tab', { name: /all/i })
    const unansweredTab = screen.getByRole('tab', { name: /unanswered/i })
    const teamsTab      = screen.getByRole('tab', { name: /teams/i })
    expect(allTab).toHaveTextContent('3')
    expect(unansweredTab).toHaveTextContent('1')
    expect(teamsTab).toHaveTextContent('1')
  })
})
