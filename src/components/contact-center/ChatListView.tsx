'use client'

import { useState } from 'react'
import { Search, MessageSquare, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ChatConversation } from '@/types/contact-center'
import type { SyncProgress } from '@/hooks/contact-center/useContactCenterState'

interface Props {
  conversations: ChatConversation[]
  loading: boolean
  onSelectConversation: (convo: ChatConversation) => void
  onSync?: () => Promise<void>
  syncProgress?: SyncProgress
}

function SyncBanner({ progress }: { progress: SyncProgress }) {
  if (progress.stage === 'idle') return null

  const pct =
    progress.stage === 'upserting' && progress.total
      ? Math.round(((progress.synced ?? 0) / progress.total) * 100)
      : null

  const label =
    progress.stage === 'fetching'
      ? `Fetching from WATI… ${progress.fetched ? `(${progress.fetched} found)` : ''}`
      : progress.stage === 'resolving'
      ? `Resolving ${progress.fetched ?? 0} contacts…`
      : progress.stage === 'upserting'
      ? `Saving ${progress.synced ?? 0} / ${progress.total ?? '?'} contacts…`
      : progress.stage === 'done'
      ? `Synced ${progress.synced ?? 0} contacts`
      : progress.stage === 'error'
      ? (progress.error ?? 'Sync failed')
      : ''

  const isError = progress.stage === 'error'
  const isDone  = progress.stage === 'done'

  return (
    <div
      className={`px-3 py-2 text-xs flex flex-col gap-1 border-b border-border ${
        isError ? 'bg-destructive/10 text-destructive' : isDone ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-primary/5 text-muted-foreground'
      }`}
    >
      <div className="flex items-center gap-1.5">
        {isError ? (
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
        ) : isDone ? (
          <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5 flex-shrink-0 animate-spin" />
        )}
        <span>{label}</span>
      </div>
      {pct !== null && (
        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

export function ChatListView({ conversations, loading, onSelectConversation, onSync, syncProgress }: Props) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'unanswered'>('all')
  const [syncing, setSyncing] = useState(false)

  async function handleSync() {
    if (!onSync || syncing) return
    setSyncing(true)
    try { await onSync() } finally { setSyncing(false) }
  }

  const filtered = conversations.filter((c) => {
    const matchesSearch =
      !search.trim() ||
      (c.customer_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.wati_phone ?? '').includes(search) ||
      (c.last_message ?? '').toLowerCase().includes(search.toLowerCase())
    const matchesFilter = filter === 'all' || c.unread_count > 0
    return matchesSearch && matchesFilter
  })

  const isSyncing = syncing || (syncProgress && syncProgress.stage !== 'idle' && syncProgress.stage !== 'done' && syncProgress.stage !== 'error')

  return (
    <div className="flex flex-col h-full">
      {/* Search + sync */}
      <div className="px-3 py-2 border-b border-border flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="pl-8 h-8 text-xs"
          />
        </div>
        {onSync && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 flex-shrink-0"
            onClick={handleSync}
            disabled={!!isSyncing}
            title="Sync from WATI"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>

      {/* Progress banner */}
      {syncProgress && syncProgress.stage !== 'idle' && (
        <SyncBanner progress={syncProgress} />
      )}

      {/* Filter tabs */}
      <div className="flex border-b border-border">
        {(['all', 'unanswered'] as const).map((f) => (
          <button
            key={f}
            className={`flex-1 py-1.5 text-xs font-medium capitalize transition-colors ${
              filter === f
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {loading && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">Loading…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
            <MessageSquare className="h-8 w-8 opacity-30" />
            <p className="text-xs">No conversations</p>
            {onSync && !isSyncing && (
              <p className="text-xs opacity-60">Press the sync button to import from WATI</p>
            )}
          </div>
        )}
        {filtered.map((c) => (
          <button
            key={c.id}
            className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-muted/50 transition-colors border-b border-border/50 text-left"
            onClick={() => onSelectConversation(c)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-medium truncate">
                  {c.customer_name ?? c.wati_phone ?? 'Unknown'}
                </span>
                {c.last_message_at && (
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {new Date(c.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-1 mt-0.5">
                <span className="text-xs text-muted-foreground truncate">
                  {c.last_message ?? 'No messages yet'}
                </span>
                {c.unread_count > 0 && (
                  <Badge className="h-4 min-w-4 text-xs px-1 py-0 flex-shrink-0">
                    {c.unread_count > 99 ? '99+' : c.unread_count}
                  </Badge>
                )}
              </div>
              {c.wati_phone && (
                <span className="text-xs text-muted-foreground font-mono">{c.wati_phone}</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
