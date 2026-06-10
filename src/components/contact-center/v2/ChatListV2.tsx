'use client'

import { useState, useMemo } from 'react'
import { Search, MessageSquare, RefreshCw, Headphones, Bot, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCountryCodes } from '@/hooks/useCountryCodes'
import type { ChatConversation } from '@/types/contact-center'
import type { SyncProgress } from '@/hooks/contact-center/useContactCenterState'

interface Props {
  conversations:        ChatConversation[]
  loading:              boolean
  onSelectConversation: (convo: ChatConversation) => void
  onStartNewChat:       (phone: string, provider: 'wati' | 'whapi') => void
  onSync?:              () => Promise<void>
  syncProgress?:        SyncProgress
  provider:             'wati' | 'whapi'
}

function looksLikePhone(s: string): boolean {
  return /^[+\d\s\-().]{3,}$/.test(s.trim()) && /\d{3}/.test(s)
}

function normalisePhone(raw: string, countryCode: string): string {
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return ''
  // If the user typed a full international number, use it as-is
  if (raw.trim().startsWith('+') && digits.length >= 10) return `+${digits}`
  // Otherwise prepend the selected country code
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

function ConversationRow({ c, onClick }: { c: ChatConversation; onClick: () => void }) {
  const isBot = c.assigned_agent?.toLowerCase() === 'bot' || c.assigned_agent?.toLowerCase() === 'chatbot'
  const isResolved = c.wati_status === 'resolved'
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-start gap-2.5 px-3 py-2 hover:bg-muted/50 transition-colors border-b border-border/50 text-left ${
        isResolved ? 'opacity-60' : ''
      }`}
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary mt-0.5">
        {(c.customer_name ?? c.wati_contact_name ?? c.wati_phone ?? '?')[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 min-w-0">
            <ProviderTag provider={c.provider} />
            <span className={`text-xs font-semibold truncate ${!c.is_opened && c.unread_count > 0 ? 'text-foreground' : 'text-foreground/80'}`}>
              {c.customer_name ?? c.wati_contact_name ?? c.wati_phone ?? 'Unknown'}
            </span>
          </div>
          {c.last_message_at && (
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              {new Date(c.last_message_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        {c.assigned_agent && (
          <div className="flex items-center gap-1 mt-0.5">
            {isBot ? <Bot className="h-3 w-3 text-muted-foreground" /> : <Headphones className="h-3 w-3 text-muted-foreground" />}
            <span className="text-[11px] text-muted-foreground truncate">{c.assigned_agent}</span>
          </div>
        )}
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
  )
}

export function ChatListV2({
  conversations, loading, onSelectConversation, onStartNewChat,
  onSync, syncProgress, provider,
}: Props) {
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [countryCode, setCountryCode] = useState('+974')
  const { data: codes = [] } = useCountryCodes()

  const isSearchingPhone = !!(search.trim() && looksLikePhone(search))

  async function handleSync() {
    if (!onSync || syncing) return
    setSyncing(true)
    try { await onSync() } finally { setSyncing(false) }
  }

  // Flat list — no day grouping. Already sorted by last_message_at desc upstream.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return conversations

    // When searching by phone, build a full international number to match against
    if (isSearchingPhone) {
      const digits = search.replace(/[^\d]/g, '')
      const fullPhone = normalisePhone(search, countryCode)
      return conversations.filter((c) =>
        (c.wati_phone ?? '').includes(digits) ||
        (c.wati_phone ?? '').includes(fullPhone) ||
        (c.customer_name ?? '').toLowerCase().includes(term) ||
        (c.wati_contact_name ?? '').toLowerCase().includes(term)
      )
    }

    return conversations.filter((c) =>
      (c.customer_name ?? '').toLowerCase().includes(term) ||
      (c.wati_contact_name ?? '').toLowerCase().includes(term) ||
      (c.wati_phone ?? '').includes(search) ||
      (c.last_message ?? '').toLowerCase().includes(term)
    )
  }, [conversations, search, countryCode, isSearchingPhone])

  const showStartNewChat = isSearchingPhone && filtered.length === 0
  const normalisedNew = showStartNewChat ? normalisePhone(search, countryCode) : ''

  const currentCodeEntry = codes.find((c) => c.code === countryCode)

  const isSyncing =
    syncing ||
    (syncProgress && syncProgress.stage !== 'idle' && syncProgress.stage !== 'done' && syncProgress.stage !== 'error')

  return (
    <div className="flex flex-col h-full">
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
        {isSearchingPhone && (
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

      {/* List */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {loading && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">Loading…</div>
        )}

        {!loading && filtered.length > 0 && filtered.map((c) => (
          <ConversationRow key={c.id} c={c} onClick={() => onSelectConversation(c)} />
        ))}

        {!loading && showStartNewChat && (
          <div className="flex flex-col gap-2 px-3 py-4">
            <p className="text-xs text-muted-foreground text-center">
              No conversation with <span className="font-mono text-foreground">{normalisedNew}</span> yet
            </p>
            <p className="text-[11px] text-muted-foreground text-center">Start a new chat:</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-xs gap-1.5"
                onClick={() => onStartNewChat(normalisedNew, 'wati')}
              >
                <Plus className="h-3 w-3" /> WATI
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-xs gap-1.5"
                onClick={() => onStartNewChat(normalisedNew, 'whapi')}
              >
                <Plus className="h-3 w-3" /> WHAPI
              </Button>
            </div>
          </div>
        )}

        {!loading && filtered.length === 0 && !showStartNewChat && (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
            <MessageSquare className="h-8 w-8 opacity-30" />
            <p className="text-xs">
              {search.trim() ? 'No conversations found' : 'No conversations yet'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
