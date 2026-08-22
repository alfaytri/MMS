import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TeamGroupedList } from '../TeamGroupedList'

const divisions = [
  { id: 'd1', name: 'Kitchen',     short_name: 'KIT', sort_order: 1 },
  { id: 'd2', name: 'Maintenance', short_name: 'MNT', sort_order: 2 },
]
const teams = [
  { id: 't1', name_en: 'Team 1', name_ar: null, phone: '+97411111111', division_id: 'd1' },
  { id: 't2', name_en: 'Team 2', name_ar: null, phone: '+97422222222', division_id: 'd1' },
  { id: 't3', name_en: 'Team 3', name_ar: null, phone: '+97433333333', division_id: 'd2' },
]
const conversations = new Map<string, { id: string; last_message: string }>([
  ['+97411111111', { id: 'c1', last_message: 'Hello' }],
])

describe('TeamGroupedList', () => {
  it('renders one division header per non-empty group', () => {
    render(
      <TeamGroupedList
        teams={teams}
        divisions={divisions}
        conversationsByPhone={conversations}
        search=""
        onClickTeam={() => {}}
      />,
    )
    expect(screen.getByText('Kitchen')).toBeInTheDocument()
    expect(screen.getByText('Maintenance')).toBeInTheDocument()
  })

  it("hides empty division header when search matches only one division's team", () => {
    render(
      <TeamGroupedList
        teams={teams}
        divisions={divisions}
        conversationsByPhone={conversations}
        search="Team 3"
        onClickTeam={() => {}}
      />,
    )
    expect(screen.queryByText('Kitchen')).not.toBeInTheDocument()
    expect(screen.getByText('Maintenance')).toBeInTheDocument()
  })

  it('renders empty state when no team matches search', () => {
    render(
      <TeamGroupedList
        teams={teams}
        divisions={divisions}
        conversationsByPhone={conversations}
        search="zzz"
        onClickTeam={() => {}}
      />,
    )
    expect(screen.getByText(/no matches for "zzz"/i)).toBeInTheDocument()
  })
})
