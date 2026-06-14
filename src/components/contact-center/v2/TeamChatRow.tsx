'use client'

import { Badge } from '@/components/ui/badge'
import type { TeamSlim } from '@/hooks/contact-center/local/useTeamPhones'
import type { ChatConversation } from '@/types/contact-center'

interface Props {
  team:         TeamSlim
  conversation: ChatConversation | null
  divisionCode: string | null
  onClick:      () => void
}

export function TeamChatRow({ team, conversation, divisionCode, onClick }: Props) {
  const initial = (team.name_en ?? team.name_ar ?? '?').trim()[0]?.toUpperCase() ?? '?'
  const displayName = team.name_en ?? team.name_ar ?? '(Unnamed team)'
  const hasConv     = !!conversation
  const lastMessage = hasConv ? conversation.last_message : null
  const lastAt      = hasConv ? conversation.last_message_at : null
  const unread      = hasConv ? (conversation.unread_count ?? 0) : 0

  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-2.5 px-3 py-2 hover:bg-muted/50 transition-colors border-b border-border/50 text-left"
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary mt-0.5">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-semibold truncate">{displayName}</span>
            {divisionCode && (
              <Badge variant="secondary" className="h-4 px-1 py-0 text-[9px] font-semibold">
                {divisionCode}
              </Badge>
            )}
          </div>
          {lastAt && (
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              {new Date(lastAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5 min-h-[16px]">
          <span className="text-[11px] text-muted-foreground truncate">
            {lastMessage ?? (hasConv ? '' : 'No messages yet')}
          </span>
          {unread > 0 && (
            <Badge className="h-4 min-w-4 text-[10px] px-1 py-0">
              {unread > 99 ? '99+' : unread}
            </Badge>
          )}
        </div>
      </div>
    </button>
  )
}
