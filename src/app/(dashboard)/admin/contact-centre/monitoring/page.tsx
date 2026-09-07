'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, Loader2, MessageSquare, Paperclip, ShieldAlert } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useHasPermission } from '@/hooks/usePermissions'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { createClient } from '@/lib/supabase/client'
import { useCCMonitoringFeed, type MonitoringFeedRow } from '@/hooks/contact-center/useCCMonitoring'
import { useCCPresence } from '@/hooks/contact-center/useCCPresence'
import { TranscriptViewer } from '@/components/contact-center/monitoring/TranscriptViewer'

export default function MonitoringPage() {
  const canView = useHasPermission('contact_centre.monitoring')
  const { data: feed = [], isLoading, isError } = useCCMonitoringFeed(200)
  const { data: myProfile } = useCurrentUserProfile()

  const [authUserId, setAuthUserId] = useState<string | null>(null)
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setAuthUserId(data.user?.id ?? null))
  }, [])

  const [search, setSearch] = useState('')
  const [openRow, setOpenRow] = useState<MonitoringFeedRow | null>(null)

  // Live "who is on a chat right now" — same presence channel the inbox uses.
  const { byConversation } = useCCPresence({
    authUserId,
    profileId: myProfile?.id ?? null,
    name: myProfile?.full_name ?? null,
    activeConversationId: null,
  })

  const liveEntries = useMemo(() => {
    const out: { key: string; agent: string; customer: string }[] = []
    for (const [cid, handlers] of byConversation) {
      const conv = feed.find((r) => r.conversation_id === cid)
      const customer = conv?.customer_name ?? conv?.wati_phone ?? 'a customer'
      for (const h of handlers) out.push({ key: `${cid}:${h.profileId}`, agent: h.name, customer })
    }
    return out
  }, [byConversation, feed])

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase()
    if (!t) return feed
    return feed.filter((r) =>
      (r.customer_name ?? '').toLowerCase().includes(t) ||
      (r.wati_phone ?? '').includes(t) ||
      r.handlers.some((h) => (h.name ?? '').toLowerCase().includes(t)),
    )
  }, [feed, search])

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
        <ShieldAlert className="mb-3 h-10 w-10 opacity-40" />
        <p className="text-sm font-medium">You don’t have access to Contact Centre monitoring.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold">Contact Centre — Monitoring</h1>
        <p className="text-sm text-muted-foreground">
          Who handled each customer, and every message and file exchanged.
        </p>
      </header>

      {liveEntries.length > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live now
          </div>
          <div className="flex flex-wrap gap-2">
            {liveEntries.map((e) => (
              <span key={e.key} className="rounded-full bg-background px-2.5 py-1 text-xs shadow-sm">
                <span className="font-medium">{e.agent}</span> ↔ {e.customer}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search customer, phone, or agent…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : isError ? (
        <div className="py-10 text-center text-sm text-destructive">Could not load the monitoring feed.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Customer</th>
                <th className="px-3 py-2 text-left font-medium">Handled by</th>
                <th className="px-3 py-2 text-right font-medium">Messages</th>
                <th className="px-3 py-2 text-right font-medium">Media</th>
                <th className="px-3 py-2 text-right font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.conversation_id}
                  onClick={() => setOpenRow(r)}
                  className="cursor-pointer border-t border-border hover:bg-muted/40"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.customer_name ?? r.wati_phone ?? 'Unknown'}</div>
                    <div className="text-xs text-muted-foreground">{r.wati_phone}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.handlers.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        r.handlers.slice(0, 3).map((h, i) => (
                          <span
                            key={i}
                            className="rounded-full bg-muted px-2 py-0.5 text-xs"
                            title={`${h.msgs} message${h.msgs !== 1 ? 's' : ''}`}
                          >
                            {h.name}
                          </span>
                        ))
                      )}
                      {r.handlers.length > 3 && (
                        <span className="text-xs text-muted-foreground">+{r.handlers.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                      {r.total_messages}
                    </span>
                    <div className="text-[10px] text-muted-foreground">
                      {r.customer_messages} in · {r.agent_messages} out
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.media_messages > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                        {r.media_messages}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                    {r.last_message_at ? new Date(r.last_message_at).toLocaleString('en-QA') : '—'}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    No conversations.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!openRow} onOpenChange={(o) => { if (!o) setOpenRow(null) }}>
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
          <DialogHeader>
            <DialogTitle>{openRow?.customer_name ?? openRow?.wati_phone ?? 'Conversation'}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-1">
            <TranscriptViewer conversationId={openRow?.conversation_id ?? null} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
