'use client'

import type { FilterKey } from './ChatListEmptyState'

export interface FilterCounts {
  all:        number
  unanswered: number
  tasks:      number
  teams:      number
}

interface Props {
  value:    FilterKey
  onChange: (next: FilterKey) => void
  counts:   FilterCounts
}

const TABS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all',        label: 'ALL' },
  { key: 'unanswered', label: 'Unanswered' },
  { key: 'tasks',      label: 'Tasks' },
  { key: 'teams',      label: 'Teams' },
]

export function ChatListFilterTabs({ value, onChange, counts }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Chat list filter"
      className="flex border-b border-border overflow-x-auto whitespace-nowrap"
    >
      {TABS.map(({ key, label }) => {
        const isActive = value === key
        const count    = counts[key]
        return (
          <button
            key={key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(key)}
            className={`flex-1 min-h-11 flex items-center justify-center gap-1.5 px-2 text-xs font-medium border-b-2 transition-colors ${
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>{label}</span>
            {count > 0 && (
              <span className={`min-w-[18px] h-[18px] inline-flex items-center justify-center px-1 rounded-full text-[10px] ${
                isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function readPersistedFilter(): FilterKey {
  if (typeof window === 'undefined') return 'all'
  const raw = window.localStorage.getItem('ccChatListFilter')
  if (raw === 'all' || raw === 'unanswered' || raw === 'tasks' || raw === 'teams') return raw
  return 'all'
}

export function persistFilter(value: FilterKey): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem('ccChatListFilter', value)
}
