'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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

// Per-viewer convenience: remember which division sections the agent collapsed.
const COLLAPSE_KEY = 'cc.teams.collapsedDivisions'

function readCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function TeamGroupedList({
  teams, divisions, conversationsByPhone, search, onClickTeam,
}: Props) {
  const term = search.trim().toLowerCase()
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed)

  const toggle = (divisionId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(divisionId)) next.delete(divisionId)
      else next.add(divisionId)
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next])) } catch { /* private mode */ }
      return next
    })
  }

  const filteredTeams = useMemo(() => {
    if (!term) return teams
    return teams.filter((t) =>
      (t.name_en ?? '').toLowerCase().includes(term) ||
      (t.name_ar ?? '').toLowerCase().includes(term) ||
      (t.phone ?? '').includes(term),
    )
  }, [teams, term])

  const grouped = useMemo(() => {
    const known = new Set(divisions.map((d) => d.id))
    const byDivId = new Map<string, TeamSlim[]>()
    for (const t of filteredTeams) {
      // A team whose division is null (or not in the divisions list) still has to
      // surface — bucket it under "Unassigned" rather than dropping it silently.
      const key = t.division_id && known.has(t.division_id) ? t.division_id : '__unassigned__'
      const arr = byDivId.get(key) ?? []
      arr.push(t)
      byDivId.set(key, arr)
    }
    const groups = divisions
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((d) => ({ division: d, teams: byDivId.get(d.id) ?? [] }))
      .filter((g) => g.teams.length > 0)
    const orphans = byDivId.get('__unassigned__') ?? []
    if (orphans.length) {
      groups.push({
        division: { id: '__unassigned__', name: 'Unassigned', short_name: null, sort_order: 9999 },
        teams: orphans,
      })
    }
    return groups
  }, [filteredTeams, divisions])

  // Unread rolls up per division so a collapsed section still signals new activity.
  const unreadByDiv = useMemo(() => {
    const m = new Map<string, number>()
    for (const { division, teams: divTeams } of grouped) {
      let sum = 0
      for (const t of divTeams) {
        const conv = t.phone ? conversationsByPhone.get(t.phone) : undefined
        sum += conv?.unread_count ?? 0
      }
      m.set(division.id, sum)
    }
    return m
  }, [grouped, conversationsByPhone])

  if (filteredTeams.length === 0) {
    return term
      ? <ChatListEmptyState variant="no-match" filter="teams" searchTerm={search} />
      : <ChatListEmptyState variant="empty"    filter="teams" />
  }

  return (
    <>
      {grouped.map(({ division, teams: divTeams }) => {
        const isCollapsed = collapsed.has(division.id)
        const unread = unreadByDiv.get(division.id) ?? 0
        const Chevron = isCollapsed ? ChevronRight : ChevronDown
        return (
          <div key={division.id}>
            <button
              type="button"
              onClick={() => toggle(division.id)}
              aria-expanded={!isCollapsed}
              className="w-full flex items-center gap-1.5 my-1.5 px-2 py-0.5 rounded hover:bg-muted/40 transition-colors"
            >
              <Chevron className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">
                {division.name}
              </span>
              <span className="text-[10px] text-muted-foreground/70">({divTeams.length})</span>
              <div className="flex-1 h-px bg-border" />
              {unread > 0 && (
                <Badge className="h-4 min-w-4 text-[10px] px-1 py-0 flex-shrink-0">
                  {unread > 99 ? '99+' : unread}
                </Badge>
              )}
            </button>
            {!isCollapsed && divTeams
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
        )
      })}
    </>
  )
}
