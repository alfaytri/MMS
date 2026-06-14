'use client'

import { useMemo } from 'react'
import { TeamChatRow } from './TeamChatRow'
import { ChatListEmptyState } from './ChatListEmptyState'
import type { TeamSlim } from '@/hooks/contact-center/local/useTeamPhones'
import type { ChatConversation } from '@/types/contact-center'

export interface DivisionSlim {
  id:         string
  name:       string
  short_name: string | null
  sort_order: number | null
}

interface Props {
  teams:                TeamSlim[]
  divisions:            DivisionSlim[]
  conversationsByPhone: Map<string, ChatConversation>
  search:               string
  onClickTeam:          (team: TeamSlim, conversation: ChatConversation | null) => void
}

export function TeamGroupedList({
  teams, divisions, conversationsByPhone, search, onClickTeam,
}: Props) {
  const term = search.trim().toLowerCase()

  const filteredTeams = useMemo(() => {
    if (!term) return teams
    return teams.filter((t) =>
      (t.name_en ?? '').toLowerCase().includes(term) ||
      (t.name_ar ?? '').toLowerCase().includes(term) ||
      (t.phone ?? '').includes(term),
    )
  }, [teams, term])

  const grouped = useMemo(() => {
    const byDivId = new Map<string, TeamSlim[]>()
    for (const t of filteredTeams) {
      const key = t.division_id ?? '__none__'
      const arr = byDivId.get(key) ?? []
      arr.push(t)
      byDivId.set(key, arr)
    }
    return divisions
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((d) => ({ division: d, teams: byDivId.get(d.id) ?? [] }))
      .filter((g) => g.teams.length > 0)
  }, [filteredTeams, divisions])

  if (filteredTeams.length === 0) {
    return term
      ? <ChatListEmptyState variant="no-match" filter="teams" searchTerm={search} />
      : <ChatListEmptyState variant="empty"    filter="teams" />
  }

  return (
    <>
      {grouped.map(({ division, teams: divTeams }) => (
        <div key={division.id}>
          <div className="flex items-center gap-2 my-1.5 px-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {division.name}
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>
          {divTeams
            .slice()
            .sort((a, b) => (a.name_en ?? '').localeCompare(b.name_en ?? ''))
            .map((team) => {
              const conv = team.phone ? conversationsByPhone.get(team.phone) ?? null : null
              return (
                <TeamChatRow
                  key={team.id}
                  team={team}
                  conversation={conv}
                  divisionCode={division.short_name}
                  onClick={() => onClickTeam(team, conv)}
                />
              )
            })}
        </div>
      ))}
    </>
  )
}
