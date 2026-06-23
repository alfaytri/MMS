'use client'

import { useState, useMemo, useEffect } from 'react'
import { Search, RefreshCw, Bot, Plus, Check, MessageSquareText } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCountryCodes } from '@/hooks/useCountryCodes'
import { ChatListFilterTabs, readPersistedFilter, persistFilter } from './ChatListFilterTabs'
import { TeamGroupedList } from './TeamGroupedList'
import { ChatListEmptyState } from './ChatListEmptyState'
import { FollowUpRequestCard } from './FollowUpRequestCard'
import { useFollowUpRequests } from '@/hooks/useFollowUpRequests'
import type { FollowUpRequestWithContext } from '@/types/follow-ups'
import { tryNormalisePhone } from '@/lib/contact-center/normalise-phone'
import type { FilterKey } from './ChatListEmptyState'
import type { FilterCounts } from './ChatListFilterTabs'
import type { ChatConversation } from '@/types/contact-center'
import type { SyncProgress } from '@/hooks/contact-center/useContactCenterState'
import type { UseTeamPhonesResult } from '@/hooks/contact-center/local/useTeamPhones'
import type { DivisionSlim } from './TeamGroupedList'
import type { TeamSlim } from '@/hooks/contact-center/local/useTeamPhones'

interface Props {
  conversations:        ChatConversation[]
  loading:              boolean
  onSelectConversation: (convo: ChatConversation) => void
  onStartNewChat:       (phone: string, provider: 'wati' | 'whapi') => void
  onSync?:              () => Promise<void>
  syncProgress?:        SyncProgress
  provider:             'wati' | 'whapi'
  teamPhones:           UseTeamPhonesResult
  divisions:            DivisionSlim[]
  onOpenTeam:           (team: TeamSlim) => void
  onMarkResolved:       (conversationId: string) => Promise<void>
}

function looksLikePhone(s: string): boolean {
  return /^[+\d\s\-().]{3,}$/.test(s.trim()) && /\d{3}/.test(s)
}

function normalisePhone(raw: string, countryCode: string): string {
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return ''
  if (raw.trim().startsWith('+') && digits.length >= 10) return `+${digits}`
  return `${countryCode}${digits}`
}

function ProviderTag({ provider }: { provider?: 'wati' | 'whapi' }) {
  if (!provider) return null
  const isWhapi = provider === 'whapi'
  return (
    <span className={`inline-flex items-center px-1 py-0 rounded text-[9px] font-medium leading-tight ${
      isWhapi ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
              : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    }`}>
      {isWhapi ? 'WH' : 'WA'}
    </span>
  )
}

// Window during which an outbound (agent → customer) reply still counts as
// "this agent is actively chatting in here." After this the indicator clears
// even if no new messages arrive — keeps the list honest when an agent steps
// away mid-conversation.
const AGENT_ACTIVE_WINDOW_MS = 30 * 60 * 1000

function ConversationRow({
  c, now, onClick, onMarkResolved,
}: {
  c: ChatConversation
  now: number
  onClick: () => void
  onMarkResolved?: () => void
}) {
  const isBot = c.assigned_agent?.toLowerCase() === 'bot' || c.assigned_agent?.toLowerCase() === 'chatbot'
  const isResolved = c.wati_status === 'resolved'

  // "Agent is chatting" badge appears only while:
  //   • last message in the chat came from our side (an agent reply)
  //   • we know who that agent is (assigned_agent populated)
  //   • the reply is fresh (< 30 min old by `now`)
  // The `now` prop ticks every 60 s in the parent so the badge auto-clears
  // without anyone reloading the page.
  const lastMsgAgeMs = c.last_message_at
    ? now - new Date(c.last_message_at).getTime()
    : Number.POSITIVE_INFINITY
  const agentChatting =
    c.last_message_from_type === 'agent' &&
    !!c.assigned_agent &&
    lastMsgAgeMs < AGENT_ACTIVE_WINDOW_MS

  return (
    <div
      className={`group w-full flex items-start gap-2.5 px-3 py-2 hover:bg-muted/50 transition-colors border-b border-border/50 ${
        isResolved ? 'opacity-60' : ''
      }`}
    >
      <button onClick={onClick} className="flex-1 flex items-start gap-2.5 text-left min-w-0">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary mt-0.5">
          {(c.customer_name ?? c.wati_phone ?? '?')[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          {/* Top row: provider tag + name on the left,
              ephemeral "[agent] chatting" pill above the timestamp on the right. */}
          <div className="flex items-start justify-between gap-1">
            <div className="flex items-center gap-1 min-w-0">
              <ProviderTag provider={c.provider} />
              <span className={`text-xs font-semibold truncate ${!c.is_opened && c.unread_count > 0 ? 'text-foreground' : 'text-foreground/80'}`}>
                {c.customer_name ?? c.wati_phone ?? 'Unknown'}
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
              {agentChatting && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 max-w-[140px]"
                  title={`${c.assigned_agent} is chatting in this conversation`}
                >
                  {isBot
                    ? <Bot className="h-2.5 w-2.5 flex-shrink-0" />
                    : <MessageSquareText className="h-2.5 w-2.5 flex-shrink-0" />}
                  <span className="truncate">{c.assigned_agent} chatting</span>
                </span>
              )}
              {c.last_message_at && (
                <span className="text-[10px] text-muted-foreground">
                  {new Date(c.last_message_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
          {/* Bottom row: last message preview + unread count badge.
              Unread badge stays as-is — the webhook only increments it on
              inbound customer messages, so it never lights up for agent replies. */}
          <div className="flex items-center justify-between gap-1 mt-0.5">
            <span className="text-[11px] text-muted-foreground truncate">{c.last_message ?? 'No messages yet'}</span>
            <div className="flex items-center gap-1 flex-shrink-0">
              {c.unread_count > 0 && (
                <Badge className="h-4 min-w-4 text-[10px] px-1 py-0">
                  {c.unread_count > 99 ? '99+' : c.unread_count}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </button>
      {onMarkResolved && (
        <button
          onClick={(e) => { e.stopPropagation(); onMarkResolved() }}
          title="Mark as resolved"
          className="opacity-0 group-hover:opacity-100 max-md:opacity-100 transition-opacity flex-shrink-0 self-center h-7 w-7 rounded-full hover:bg-primary/10 flex items-center justify-center"
        >
          <Check className="h-3.5 w-3.5 text-primary" />
        </button>
      )}
    </div>
  )
}

export function ChatListV2({
  conversations, loading, onSelectConversation, onStartNewChat,
  onSync, syncProgress, provider, teamPhones, divisions, onOpenTeam, onMarkResolved,
}: Props) {
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [countryCode, setCountryCode] = useState('+974')
  const { data: codes = [] } = useCountryCodes()

  const [filter, setFilter] = useState<FilterKey>(() => readPersistedFilter())

  // Re-render every 60 s so the "[agent] chatting" pill on each row clears
  // automatically once the 30-min window lapses — without it the badge would
  // linger until something else triggered a re-render.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  function changeFilter(next: FilterKey) {
    setFilter(next)
    persistFilter(next)
    setSearch('')
  }

  const isSearchingPhone = !!(search.trim() && looksLikePhone(search))

  async function handleSync() {
    if (!onSync || syncing) return
    setSyncing(true)
    try { await onSync() } finally { setSyncing(false) }
  }

  const isTeamConv = useMemo(() => {
    return (c: ChatConversation): boolean => {
      if (c.provider !== 'whapi' || !c.wati_phone) return false
      const n = tryNormalisePhone(c.wati_phone)
      if (!n) return false
      return teamPhones.byPhone.has(n)
    }
  }, [teamPhones.byPhone])

  const customerChats = useMemo(
    () => conversations.filter((c) => !isTeamConv(c)),
    [conversations, isTeamConv],
  )

  const { data: followUps = [], refetch: refetchFollowUps } = useFollowUpRequests('pending')

  const sortedFollowUps = useMemo(() => {
    const tier = (r: FollowUpRequestWithContext) => {
      if (!r.requested_date) return 3
      const hrs = (new Date(`${r.requested_date}T00:00:00`).getTime() - Date.now()) / (1000 * 60 * 60)
      if (hrs <= 24) return 0
      if (hrs <= 48) return 1
      return 2
    }
    return [...followUps].sort((a, b) => {
      const ta = tier(a), tb = tier(b)
      if (ta !== tb) return ta - tb
      return (a.requested_date ?? '').localeCompare(b.requested_date ?? '')
    })
  }, [followUps])

  const counts: FilterCounts = useMemo(() => ({
    all:        customerChats.length,
    unanswered: customerChats.filter((c) =>
      c.last_message_from_type === 'customer' &&
      (c.unanswered_dismissed_at == null ||
       (c.last_message_at != null && c.unanswered_dismissed_at < c.last_message_at)),
    ).length,
    tasks: sortedFollowUps.length,
    teams: teamPhones.teams.length,
  }), [customerChats, teamPhones.teams.length, sortedFollowUps.length])

  const baseList: ChatConversation[] = useMemo(() => {
    if (filter === 'unanswered') {
      return customerChats.filter((c) =>
        c.last_message_from_type === 'customer' &&
        (c.unanswered_dismissed_at == null ||
         (c.last_message_at != null && c.unanswered_dismissed_at < c.last_message_at)),
      )
    }
    return customerChats
  }, [filter, customerChats])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return baseList

    if (isSearchingPhone) {
      const digits   = search.replace(/[^\d]/g, '')
      const fullPhone = normalisePhone(search, countryCode)
      return baseList.filter((c) =>
        (c.wati_phone ?? '').includes(digits) ||
        (c.wati_phone ?? '').includes(fullPhone) ||
        (c.customer_name ?? '').toLowerCase().includes(term) ||
        (c.wati_contact_name ?? '').toLowerCase().includes(term),
      )
    }

    return baseList.filter((c) =>
      (c.customer_name ?? '').toLowerCase().includes(term) ||
      (c.wati_contact_name ?? '').toLowerCase().includes(term) ||
      (c.wati_phone ?? '').includes(search) ||
      (c.last_message ?? '').toLowerCase().includes(term),
    )
  }, [baseList, search, countryCode, isSearchingPhone])

  const showStartNewChat = isSearchingPhone && filtered.length === 0 && filter === 'all'
  const normalisedNew = showStartNewChat ? normalisePhone(search, countryCode) : ''

  const currentCodeEntry = codes.find((c) => c.code === countryCode)

  const isSyncing =
    syncing ||
    (syncProgress && syncProgress.stage !== 'idle' && syncProgress.stage !== 'done' && syncProgress.stage !== 'error')

  return (
    <div className="flex flex-col h-full">
      {/* Filter tabs */}
      <ChatListFilterTabs value={filter} onChange={changeFilter} counts={counts} />

      {/* Search + sync */}
      <div className="px-3 py-2 border-b border-border flex flex-col gap-1.5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or phone…"
              className="pl-8 h-8 text-xs"
              disabled={filter === 'tasks'}
            />
          </div>
          {onSync && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0"
              disabled={!!isSyncing}
              title={`Sync from ${provider === 'whapi' ? 'WHAPI' : 'WATI'}`}
              onClick={handleSync}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
        {isSearchingPhone && filter !== 'teams' && filter !== 'tasks' && (
          <div className="flex items-center gap-1.5">
            <Select value={countryCode} onValueChange={(v) => { if (v) setCountryCode(v) }}>
              <SelectTrigger className="h-7 w-[90px] text-[11px] px-2 shrink-0">
                <SelectValue>
                  {currentCodeEntry ? `${currentCodeEntry.flag} ${currentCodeEntry.code}` : countryCode}
                </SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {codes.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    <span className="flex items-center gap-1.5">
                      <span>{c.flag}</span>
                      <span className="text-xs font-mono">{c.code}</span>
                      <span className="text-xs text-muted-foreground">{c.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-[11px] text-muted-foreground truncate">
              {normalisePhone(search, countryCode)}
            </span>
          </div>
        )}
      </div>

      {/* Sync progress */}
      {syncProgress && syncProgress.stage !== 'idle' && (
        <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-b border-border bg-muted/30">
          {syncProgress.stage === 'fetching'  && `Fetching… ${syncProgress.fetched ?? 0} so far`}
          {syncProgress.stage === 'resolving' && `Resolving ${syncProgress.fetched ?? 0} chats…`}
          {syncProgress.stage === 'upserting' && `Saving ${syncProgress.synced ?? 0} / ${syncProgress.total ?? '?'}…`}
          {syncProgress.stage === 'done'      && `Synced ${syncProgress.synced ?? 0} chats`}
          {syncProgress.stage === 'error'     && (syncProgress.error ?? 'Sync failed')}
        </div>
      )}

      {/* List — branched by filter */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {loading && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">Loading…</div>
        )}

        {/* Tasks — follow-up requests + future task types */}
        {!loading && filter === 'tasks' && (
          sortedFollowUps.length === 0 ? (
            <ChatListEmptyState variant="empty" filter="tasks" />
          ) : (
            <div className="p-2 space-y-2">
              {sortedFollowUps.map((r) => (
                <FollowUpRequestCard key={r.id} req={r} onChanged={() => { void refetchFollowUps() }} />
              ))}
            </div>
          )
        )}

        {/* Teams branch */}
        {!loading && filter === 'teams' && (
          <TeamGroupedList
            teams={teamPhones.teams}
            divisions={divisions}
            conversationsByPhone={
              new Map(
                conversations
                  .filter((c) => c.wati_phone)
                  .map((c) => [c.wati_phone as string, c]),
              )
            }
            search={search}
            onClickTeam={(t) => onOpenTeam(t)}
          />
        )}

        {/* ALL / Unanswered branch */}
        {!loading && (filter === 'all' || filter === 'unanswered') && filtered.length > 0 && (
          filtered.map((c) => (
            <ConversationRow
              key={c.id}
              c={c}
              now={now}
              onClick={() => onSelectConversation(c)}
              onMarkResolved={
                filter === 'unanswered'
                  ? () => onMarkResolved(c.id).catch(() => {})
                  : undefined
              }
            />
          ))
        )}

        {/* ALL / Unanswered empty states */}
        {!loading && (filter === 'all' || filter === 'unanswered') && filtered.length === 0 && !showStartNewChat && (
          search.trim()
            ? <ChatListEmptyState variant="no-match" filter={filter} searchTerm={search} />
            : <ChatListEmptyState variant="empty"    filter={filter} />
        )}

        {/* "Start new chat" placeholder when searching an absent phone */}
        {!loading && showStartNewChat && (
          <div className="flex flex-col gap-2 px-3 py-4">
            <p className="text-xs text-muted-foreground text-center">
              No conversation with <span className="font-mono text-foreground">{normalisedNew}</span> yet
            </p>
            <p className="text-[11px] text-muted-foreground text-center">Start a new chat:</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1.5"
                onClick={() => onStartNewChat(normalisedNew, 'wati')}>
                <Plus className="h-3 w-3" /> WATI
              </Button>
              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1.5"
                onClick={() => onStartNewChat(normalisedNew, 'whapi')}>
                <Plus className="h-3 w-3" /> WHAPI
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
