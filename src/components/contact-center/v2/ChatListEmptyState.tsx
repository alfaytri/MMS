'use client'

import { MessageSquare, Search } from 'lucide-react'

export type FilterKey = 'all' | 'unanswered' | 'tasks' | 'teams'
export type EmptyVariant = 'empty' | 'no-match'

interface Props {
  variant:    EmptyVariant
  filter:     FilterKey
  searchTerm?: string
}

const EMPTY_HEADINGS: Record<FilterKey, string> = {
  all:        'No chats yet',
  unanswered: 'Nothing unanswered',
  tasks:      'Tasks coming soon',
  teams:      'No teams with a phone',
}

export function ChatListEmptyState({ variant, filter, searchTerm }: Props) {
  if (variant === 'no-match') {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
        <Search className="h-8 w-8 opacity-30" />
        <p className="text-xs">No matches for &quot;{searchTerm ?? ''}&quot;</p>
        <p className="text-[11px] opacity-80">Try a different name or number</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
      <MessageSquare className="h-8 w-8 opacity-30" />
      <p className="text-xs">{EMPTY_HEADINGS[filter]}</p>
    </div>
  )
}
