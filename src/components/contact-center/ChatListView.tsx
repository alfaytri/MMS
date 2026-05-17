'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, MessageSquare, RefreshCw, AlertCircle, CheckCircle2, Headphones, Bot } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ChatConversation } from '@/types/contact-center'
import type { SyncProgress } from '@/hooks/contact-center/useContactCenterState'

interface Props {
  conversations: ChatConversation[]
  loading: boolean
  onSelectConversation: (convo: ChatConversation) => void
  onSync?: (full?: boolean) => Promise<void>
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
      ? `Fetching from WATI… ${progress.fetched ? `(${progress.fetched} so far)` : ''}`
      : progress.stage === 'resolving'
      ? `Resolving ${progress.fetched ?? 0} contacts…`
      : progress.stage === 'upserting'
      ? `Saving ${progress.synced ?? 0} contacts…`
      : progress.stage === 'done'
      ? `Synced ${progress.synced ?? 0} contacts`
      : (progress.error ?? 'Sync failed')

  const isError = progress.stage === 'error'
  const isDone  = progress.stage === 'done'

  return (
    <div
      className={`px-3 py-2 text-xs flex flex-col gap-1 border-b border-border ${
        isError
          ? 'bg-destructive/10 text-destructive'
          : isDone
          ? 'bg-green-500/10 text-green-700 dark:text-green-400'
          : 'bg-primary/5 text-muted-foreground'
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

function ConversationRow({ c, onClick }: { c: ChatConversation; onClick: () => void }) {
  const isBot      = c.assigned_agent?.toLowerCase() === 'bot' || c.assigned_agent?.toLowerCase() === 'chatbot'
  const isResolved = c.wati_status === 'resolved'

  return (
    <button
      className={`w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-muted/50 transition-colors border-b border-border/50 text-left ${
        isResolved ? 'opacity-60' : ''
      }`}
      onClick={onClick}
    >
      {/* Avatar circle */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary mt-0.5">
        {(c.customer_name ?? c.wati_contact_name ?? c.wati_phone ?? '?')[0]?.toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        {/* Row 1: name + time */}
        <div className="flex items-center justify-between gap-1">
          <span className={`text-xs font-semibold truncate ${!c.is_opened && c.unread_count > 0 ? 'text-foreground' : 'text-foreground/80'}`}>
            {c.customer_name ?? c.wati_contact_name ?? c.wati_phone ?? 'Unknown'}
          </span>
          {c.last_message_at && (
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {new Date(c.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {/* Row 2: assigned agent */}
        {c.assigned_agent && (
          <div className="flex items-center gap-1 mt-0.5">
            {isBot
              ? <Bot className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              : <Headphones className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            }
            <span className="text-xs text-muted-foreground truncate">{c.assigned_agent}</span>
          </div>
        )}

        {/* Row 3: last message + unread badge */}
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <span className="text-xs text-muted-foreground truncate">
            {c.last_message ?? 'No messages yet'}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {c.wati_status === 'resolved' && (
              <span className="text-[10px] text-emerald-600 border border-emerald-300 bg-emerald-50 rounded px-1 leading-tight py-px">Solved</span>
            )}
            {c.wati_status === 'pending' && (
              <span className="text-[10px] text-amber-600 border border-amber-300 bg-amber-50 rounded px-1 leading-tight py-px">Pending</span>
            )}
            {!isResolved && c.is_opened && c.unread_count === 0 && (
              <CheckCircle2 className="h-3 w-3 text-muted-foreground/50" />
            )}
            {c.unread_count > 0 && (
              <Badge className="h-4 min-w-4 text-xs px-1 py-0">
                {c.unread_count > 99 ? '99+' : c.unread_count}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

// A search term looks like a phone number if it contains at least 6 digits
// (possibly with +, spaces, or dashes) and no alpha characters
function looksLikePhone(s: string): boolean {
  return /^[+\d\s\-().]{6,}$/.test(s.trim()) && /\d{6}/.test(s)
}

export function ChatListView({ conversations, loading, onSelectConversation, onSync, syncProgress }: Props) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'unanswered'>('all')
  const [syncing, setSyncing] = useState(false)

  // Phone lookup state
  const [lookupResult, setLookupResult] = useState<ChatConversation | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupNotFound, setLookupNotFound] = useState(false)
  const lookupAbortRef = useRef<AbortController | null>(null)

  async function handleSync(full = false) {
    if (!onSync || syncing) return
    setSyncing(true)
    try { await onSync(full) } finally { setSyncing(false) }
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

  // When search looks like a phone and produces no local hits, fetch from WATI
  useEffect(() => {
    setLookupResult(null)
    setLookupNotFound(false)

    if (lookupAbortRef.current) {
      lookupAbortRef.current.abort()
      lookupAbortRef.current = null
    }

    const term = search.trim()
    if (!term || !looksLikePhone(term) || filtered.length > 0) {
      setLookupLoading(false)
      return
    }

    setLookupLoading(true)
    const ctrl = new AbortController()
    lookupAbortRef.current = ctrl

    // Debounce 600 ms so we don't fire on every keystroke
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/wati/lookup-contact?phone=${encodeURIComponent(term)}`,
          { signal: ctrl.signal }
        )
        if (!res.ok) throw new Error('lookup failed')
        const json = await res.json()
        if (json.conversation) {
          setLookupResult(json.conversation)
        } else {
          setLookupNotFound(true)
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') setLookupNotFound(true)
      } finally {
        setLookupLoading(false)
      }
    }, 600)

    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filtered.length])

  const isSyncing =
    syncing ||
    (syncProgress &&
      syncProgress.stage !== 'idle' &&
      syncProgress.stage !== 'done' &&
      syncProgress.stage !== 'error')

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
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            disabled={!!isSyncing}
            title="Sync from WATI (today + yesterday)"
            onClick={() => handleSync()}
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

        {/* Normal results grouped by Today / Yesterday / Earlier */}
        {!loading && filtered.length > 0 && (() => {
          const todayStart     = new Date(); todayStart.setHours(0, 0, 0, 0)
          const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1)
          const earlierStart   = new Date(todayStart); earlierStart.setDate(earlierStart.getDate() - 3)

          const todayRows     = filtered.filter(c => new Date(c.last_message_at!) >= todayStart)
          const yesterdayRows = filtered.filter(c => {
            const d = new Date(c.last_message_at!)
            return d >= yesterdayStart && d < todayStart
          })
          const earlierRows   = filtered.filter(c => {
            const d = new Date(c.last_message_at!)
            return d >= earlierStart && d < yesterdayStart
          })

          const DayHeading = ({ label, count }: { label: string; count: number }) => (
            <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 bg-background border-b border-border">
              <div className="flex-1 h-px bg-border" />
              <span className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-0.5 text-xs font-semibold text-foreground/70 whitespace-nowrap select-none">
                {label}
                <span className="bg-primary/15 text-primary rounded-full px-1.5 py-px text-[10px] font-bold leading-none">
                  {count}
                </span>
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )

          return (
            <>
              {todayRows.length > 0 && (
                <>
                  <DayHeading label="Today" count={todayRows.length} />
                  {todayRows.map(c => (
                    <ConversationRow key={c.id} c={c} onClick={() => onSelectConversation(c)} />
                  ))}
                </>
              )}
              {yesterdayRows.length > 0 && (
                <>
                  <DayHeading label="Yesterday" count={yesterdayRows.length} />
                  {yesterdayRows.map(c => (
                    <ConversationRow key={c.id} c={c} onClick={() => onSelectConversation(c)} />
                  ))}
                </>
              )}
              {earlierRows.length > 0 && (
                <>
                  <DayHeading label="Earlier" count={earlierRows.length} />
                  {earlierRows.map(c => (
                    <ConversationRow key={c.id} c={c} onClick={() => onSelectConversation(c)} />
                  ))}
                </>
              )}
            </>
          )
        })()}

        {/* Phone lookup feedback — only when no local results */}
        {!loading && filtered.length === 0 && (
          <>
            {lookupLoading && (
              <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                Searching WATI for {search.trim()}…
              </div>
            )}
            {!lookupLoading && lookupResult && (
              <>
                <div className="px-3 py-1.5 text-xs text-muted-foreground bg-muted/40 border-b border-border">
                  From WATI
                </div>
                <ConversationRow
                  c={lookupResult}
                  onClick={() => onSelectConversation(lookupResult)}
                />
              </>
            )}
            {!lookupLoading && lookupNotFound && (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                <MessageSquare className="h-8 w-8 opacity-30" />
                <p className="text-xs">Not found in WATI</p>
              </div>
            )}
            {!lookupLoading && !lookupResult && !lookupNotFound && !search.trim() && (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                <MessageSquare className="h-8 w-8 opacity-30" />
                <p className="text-xs">No conversations in the last 3 days</p>
                <p className="text-xs opacity-60 text-center px-4">
                  Search a phone number to find older contacts
                </p>
              </div>
            )}
            {!lookupLoading && !lookupResult && !lookupNotFound && search.trim() && !looksLikePhone(search) && (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                <MessageSquare className="h-8 w-8 opacity-30" />
                <p className="text-xs">No conversations found</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
