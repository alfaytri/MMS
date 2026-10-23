'use client'

import { Users, MessageCircle } from 'lucide-react'
import { useHandlingTeams, type HandlingTeam } from '@/hooks/contact-center/useHandlingTeams'

interface Props {
  customerId: string
  onOpenTeam: (team: HandlingTeam) => void
}

/**
 * Shown inside a customer's conversation: the team(s) handling that customer's
 * open jobs, each a tap-to-chat shortcut. A customer with many jobs under one
 * team shows a single chip (deduped) with the job count.
 */
export function HandlingTeamBridge({ customerId, onOpenTeam }: Props) {
  const { data: teams = [], isLoading } = useHandlingTeams(customerId)
  if (isLoading || teams.length === 0) return null

  return (
    <div className="flex-shrink-0 border-b border-border px-3 py-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Users className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {teams.length > 1 ? 'Handling teams' : 'Handling team'}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {teams.map((t) => (
          <button
            key={t.team_id}
            type="button"
            onClick={() => onOpenTeam(t)}
            title={`Open WhatsApp chat with ${t.name_en ?? t.name_ar ?? 'this team'}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 hover:bg-muted px-2 py-1 transition-colors"
          >
            <span className="text-[11px] font-semibold truncate max-w-[130px]">
              {t.name_en ?? t.name_ar ?? 'Team'}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {t.open_orders} {t.open_orders === 1 ? 'job' : 'jobs'}
            </span>
            <MessageCircle className="h-3 w-3 text-primary flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  )
}
