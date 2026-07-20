import type { SupabaseClient } from '@supabase/supabase-js'
import type { MmsCcDb } from './db'
import type { LocalMessage, PendingWrite } from './schema'
import * as messagesRepo from './repos/messages'
import * as q from './pending-writes'

type Status = 'connected' | 'reconnecting' | 'offline'

class TerminalError extends Error {}

const FLUSH_WINDOW_MS = 50

export class SyncWorker {
  readonly fileMap = new Map<string, File>()
  status: Status = 'offline'
  isRunning = false

  private channel: ReturnType<SupabaseClient['channel']> | null = null
  private drainTimer: ReturnType<typeof setInterval> | null = null

  private updateBuffer = new Map<string, LocalMessage>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    public readonly db: MmsCcDb,
    public readonly supabase: SupabaseClient,
    public readonly provider: 'wati' | 'whapi',
  ) {}

  start(): void {
    if (this.isRunning) return
    this.isRunning = true
    this.subscribeRealtime()
    this.drainTimer = setInterval(() => { void this.drainOnce() }, 1_000)
    void this.drainOnce()
  }

  stop(): void {
    if (!this.isRunning) return
    this.isRunning = false
    this.fileMap.clear()
    if (this.channel) {
      this.supabase.removeChannel(this.channel)
      this.channel = null
    }
    if (this.drainTimer) { clearInterval(this.drainTimer); this.drainTimer = null }
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null }
    this.updateBuffer.clear()
    this.setStatus('offline')
  }

  setStatus(next: Status): void {
    this.status = next
    void this.db.sync.put({ key: 'realtimeStatus', value: next, updatedAt: Date.now() })
  }

  private subscribeRealtime(): void {
    // QUOTA REMEDIATION (2026-06-13): see docs/superpowers/specs/2026-06-13-supabase-quota-remediation-design.md
    //
    // Was 6 unfiltered `event: '*'` subscriptions across chat_messages,
    // chat_conversations, service_customers, _addresses, _phones, installed_products
    // — consumed ~70% of the project's Realtime quota.
    //
    // Tightened to ONE filtered INSERT subscription (from_type=customer).
    //
    // UPDATE (2026-06-14): customer-only filter broke the V2 sidebar — the UI reads
    // from Dexie via useLocalMessages, so agent INSERTs from fetch-messages (Wati
    // dashboard replies, broadcast templates) and from_type heal UPDATEs never
    // reached the cache and the chat appeared empty / mis-sided. Restored full
    // chat_messages event coverage. Still ONE subscription — far below the
    // original six. Other quota optimisations (chat_conversations polling, CRM
    // lazy-fetch) remain in effect.
    this.channel = this.supabase
      .channel(`cc-sync-${this.provider}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages' },
        (payload: { eventType: string; new?: unknown; old?: unknown }) => this.onMessagePayload(payload),
      )
      .subscribe((channelStatus: string) => {
        if (channelStatus === 'SUBSCRIBED')         this.setStatus('connected')
        else if (channelStatus === 'CHANNEL_ERROR') this.setStatus('offline')
        else if (channelStatus === 'TIMED_OUT')     this.setStatus('reconnecting')
      })
  }

  private onMessagePayload(payload: { eventType: string; new?: unknown; old?: unknown }): void {
    const row = (payload.new ?? payload.old) as LocalMessage | undefined
    if (!row?.id) return

    if (payload.eventType === 'DELETE') {
      void this.db.messages.delete(row.id)
      return
    }

    this.updateBuffer.set(row.id, row)
    if (this.flushTimer == null) {
      this.flushTimer = setTimeout(() => this.flush(), FLUSH_WINDOW_MS)
    }
  }

  private async flush(): Promise<void> {
    const batch = [...this.updateBuffer.values()]
    this.updateBuffer.clear()
    this.flushTimer = null
    if (batch.length === 0) return
    await messagesRepo.upsertMany(this.db, batch)
  }

  /* ── Drain loop (Task 11) ────────────────────────────── */

  async drainOnce(): Promise<void> {
    if (!this.isRunning) return
    try {
      const rows = await q.listQueued(this.db)
      for (const row of rows) {
        if (!this.isRunning) return
        await this.runOne(row)
      }
    } catch {
      // DB may have been closed between ticks — swallow gracefully
    }
  }

  private async runOne(row: PendingWrite): Promise<void> {
    // Atomic claim: only one tab/worker can claim a row.
    // Prevents duplicate sends when multiple tabs share the same IndexedDB.
    const claimed = await q.claimForFlight(this.db, row.id!)
    if (!claimed) return // another tab already claimed it
    try {
      switch (row.kind) {
        case 'send_message':
          await this.sendText(row)
          break
        case 'send_template':
          await this.sendTemplate(row)
          break
        case 'send_file':
          await this.sendFile(row)
          break
        case 'react':
          await this.sendReaction(row)
          break
        case 'update_customer':
          await this.pushCustomerUpdate(row)
          break
        case 'add_address':
          await this.pushAddressInsert(row)
          break
        case 'update_address':
          await this.pushAddressUpdate(row)
          break
        case 'add_phone':
          await this.pushPhoneInsert(row)
          break
        case 'remove_phone':
          await this.pushPhoneDelete(row)
          break
        case 'mark_read':
          await this.pushMarkRead(row)
          break
        case 'mark_opened':
          await this.pushMarkOpened(row)
          break
        default:
          throw new Error(`Unknown pending-write kind: ${row.kind}`)
      }
      await q.markSuccess(this.db, row.id!)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (err instanceof TerminalError || row.retryCount >= q.MAX_RETRIES) {
        await q.markFailedTerminal(this.db, row.id!, msg, (ref) => this.fileMap.delete(ref))
      } else {
        await q.markFailedTransient(this.db, row.id!, msg)
      }
    }
  }

  private async sendText(row: PendingWrite): Promise<void> {
    const { id, conversationId, phone, text, provider } = row.payload as {
      id: string; conversationId: string; phone: string; text: string
      provider?: 'wati' | 'whapi'
    }
    // Push to Supabase FIRST (before provider API) so the inbound webhook's
    // dedup can find this row and update it with the real external_id +
    // delivery status. Also guarantees the row carries our agent_name +
    // sent_by_profile_id — otherwise a webhook insert race creates a
    // duplicate row without them.
    await this.pushFullMessage(id, conversationId, null)

    if ((provider ?? this.provider) === 'whapi') {
      const res = await fetch('/api/whapi/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, text, skipDbInsert: true }),
      })
      const data = await res.json().catch(() => ({} as { messageId?: string; error?: string }))
      if (!res.ok) {
        const errMsg = (data as { error?: string }).error ?? `whapi send-message ${res.status}`
        if (res.status >= 400 && res.status < 500) throw new TerminalError(errMsg)
        throw new Error(errMsg)
      }
      const whapiId = (data as { messageId?: string }).messageId ?? null
      const patch = whapiId
        ? { external_id: whapiId, delivery_status: 'sent' as const, _localOnly: false }
        : { delivery_status: 'sent' as const, _localOnly: false }
      await this.db.messages.update(id, patch)
      if (whapiId) {
        // Only set external_id if not already a real wamid from an inbound
        // webhook race. WHAPI ids don't share the wati_ prefix, so match nulls.
        await this.supabase.from('chat_messages')
          .update({ external_id: whapiId, delivery_status: 'sent' })
          .eq('id', id)
          .is('external_id', null)
      } else {
        await this.supabase.from('chat_messages')
          .update({ delivery_status: 'sent' })
          .eq('id', id)
      }
      return
    }

    const { data, error } = await this.supabase.functions.invoke('api-wati', {
      body: { action: 'send_session_message', phone, text, message_id: id },
    })
    if (error) throw new Error(error.message ?? 'send_message failed')
    // Wati uses several different field names for the message ID across endpoints
    const watiId = data?.message?.whatsappMessageId
                ?? data?.message?.whatsAppMessageId
                ?? data?.info?.whatsAppMessageId
                ?? data?.whatsappMessageId
                ?? data?.id
                ?? null
    // Always promote the local bubble out of 'sending' once api-wati returned
    // without error — some response shapes omit the wamid and the row would
    // otherwise stick at the clock icon forever. The webhook will fill in
    // external_id when WATI echoes the message back.
    await this.db.messages.update(id, {
      delivery_status: 'sent',
      _localOnly: false,
      ...(watiId ? { external_id: `wati_${watiId}` } : {}),
    })
    // Conditional update: only set external_id if it's still null or
    // wati_-prefixed. Never overwrite a real wamid that the webhook may
    // have already written between pushFullMessage and now.
    await this.supabase.from('chat_messages')
      .update({
        delivery_status: 'sent',
        ...(watiId ? { external_id: `wati_${watiId}` } : {}),
      })
      .eq('id', id)
      .or('external_id.is.null,external_id.like.wati_%')
  }

  private async sendFile(row: PendingWrite): Promise<void> {
    if (!row.fileRef) throw new TerminalError('send_file row missing fileRef')
    const file = this.fileMap.get(row.fileRef)
    if (!file) throw new TerminalError('file lost on reload — re-upload required')

    const p = row.payload as {
      id: string; conversationId: string; phone: string
      caption: string; filename: string; mime: string
      provider?: 'wati' | 'whapi'
    }
    const provider = p.provider ?? this.provider

    const ext = p.filename.split('.').pop() ?? 'bin'
    const path = `${p.conversationId}/${p.id}.${ext}`
    const contentType = p.mime.split(';')[0]
    const { error: upErr } = await this.supabase.storage
      .from('chat-attachments')
      .upload(path, file, { contentType, upsert: false })
    if (upErr) throw new Error(upErr.message)

    const { data: { publicUrl } } = this.supabase.storage
      .from('chat-attachments').getPublicUrl(path)

    const m = await this.db.messages.get(p.id)
    if (m?.attachments?.[0]?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(m.attachments[0].url)
    }
    await this.db.messages.update(p.id, {
      attachments: [{ url: publicUrl, type: p.mime, name: p.filename }],
    })

    // Push to Supabase BEFORE calling the provider so the webhook dedup can find
    // the row (carries agent_name + sent_by_profile_id) instead of inserting a
    // duplicate when the inbound echo lands.
    await this.pushFullMessage(p.id, p.conversationId, null)

    if (provider === 'whapi') {
      // WHAPI accepts a public media URL; pick the endpoint by mime family.
      // Anything we can't classify (PDF, docx, zip) goes through /messages/document.
      const mediaField =
        p.mime.startsWith('image/') ? 'imageUrl' :
        p.mime.startsWith('video/') ? 'videoUrl' :
        p.mime.startsWith('audio/') ? 'audioUrl' :
        'documentUrl'

      const res = await fetch('/api/whapi/send-message', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          phone:        p.phone,
          text:         p.caption || undefined,
          [mediaField]: publicUrl,
          ...(mediaField === 'documentUrl' ? { documentName: p.filename } : {}),
          skipDbInsert: true,
        }),
      })
      const data = await res.json().catch(() => ({} as { messageId?: string; error?: string }))
      if (!res.ok) {
        const errMsg = (data as { error?: string }).error ?? `whapi send-file ${res.status}`
        if (res.status >= 400 && res.status < 500) throw new TerminalError(errMsg)
        throw new Error(errMsg)
      }
      const whapiId = (data as { messageId?: string }).messageId ?? null
      await this.db.messages.update(p.id, {
        external_id:     whapiId ?? null,
        delivery_status: 'sent',
        _localOnly:      false,
      })
      this.fileMap.delete(row.fileRef)
      if (whapiId) {
        // Don't overwrite a real wamid the inbound webhook may have already set.
        await this.supabase.from('chat_messages')
          .update({ external_id: whapiId, delivery_status: 'sent' })
          .eq('id', p.id)
          .is('external_id', null)
      } else {
        await this.supabase.from('chat_messages')
          .update({ delivery_status: 'sent' })
          .eq('id', p.id)
      }
      return
    }

    const { data, error } = await this.supabase.functions.invoke('api-wati', {
      body: {
        action: 'send_file',
        phone: p.phone,
        url: publicUrl,
        caption: p.caption || undefined,
        filename: p.filename,
        mime_type: p.mime,
        message_id: p.id,
      },
    })
    if (error) throw new Error(error.message ?? 'send_file failed')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const watiId = (data as any)?.message?.whatsappMessageId
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ?? (data as any)?.message?.whatsAppMessageId
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ?? (data as any)?.info?.whatsAppMessageId
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ?? (data as any)?.whatsappMessageId
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ?? (data as any)?.id
                ?? null
    const externalId = watiId ? `wati_${watiId}` : null

    await this.db.messages.update(p.id, {
      external_id: externalId,
      delivery_status: 'sent',
      _localOnly: false,
    })

    this.fileMap.delete(row.fileRef)
    // Only update Supabase external_id if a wamid hasn't already been set by
    // the webhook. Never overwrite a real wamid.
    if (watiId) {
      await this.supabase.from('chat_messages')
        .update({ external_id: externalId, delivery_status: 'sent' })
        .eq('id', p.id)
        .or('external_id.is.null,external_id.like.wati_%')
    }
  }

  private async sendTemplate(row: PendingWrite): Promise<void> {
    const p = row.payload as {
      id: string; conversationId: string; phone: string
      templateName: string; broadcastName: string
      parameters: string[]; headerUrl: string | null
    }
    // Push to Supabase BEFORE calling Wati so the webhook dedup can find it
    // (carries agent_name + sent_by_profile_id) instead of inserting a duplicate.
    await this.pushFullMessage(p.id, p.conversationId, null)

    const { data, error } = await this.supabase.functions.invoke('api-wati', {
      body: {
        action: 'send_template',
        phone: p.phone,
        template_name: p.templateName,
        broadcast_name: p.broadcastName,
        parameters: p.parameters,
        header_url: p.headerUrl || undefined,
        message_id: p.id,
      },
    })
    if (error) throw new Error(error.message ?? 'send_template failed')
    const watiId = data?.message?.whatsappMessageId
                ?? data?.message?.whatsAppMessageId
                ?? data?.info?.whatsAppMessageId
                ?? data?.whatsappMessageId
                ?? data?.id
                ?? null
    // Always promote the local bubble out of 'sending' after a successful
    // invoke — template responses often omit the wamid, and leaving the row
    // at 'sending' was the cause of the perpetual clock icon. The webhook
    // will backfill external_id later when WATI echoes the message.
    await this.db.messages.update(p.id, {
      delivery_status: 'sent',
      _localOnly: false,
      ...(watiId ? { external_id: `wati_${watiId}` } : {}),
    })
    await this.supabase.from('chat_messages')
      .update({
        delivery_status: 'sent',
        ...(watiId ? { external_id: `wati_${watiId}` } : {}),
      })
      .eq('id', p.id)
      .or('external_id.is.null,external_id.like.wati_%')
  }

  /**
   * Upsert the full message row to Supabase so:
   *  1. The Wati webhook's dedup path can find it (via external_id LIKE 'wati_%')
   *     and update it with the real wamid + delivery status.
   *  2. Delivery status webhooks (delivered/read) can match by external_id.
   *  3. Reactions can match by wamid once the webhook backfills it.
   * Uses onConflict:'id' so re-drains don't create duplicates.
   */
  private async pushFullMessage(
    messageId: string,
    conversationId: string,
    watiId: string | null | undefined,
  ): Promise<void> {
    try {
      const m = await this.db.messages.get(messageId)
      if (!m) return
      const externalId = watiId ? `wati_${watiId}` : null
      await this.supabase.from('chat_messages')
        .upsert({
          id:               messageId,
          conversation_id:  conversationId,
          from_type:        'agent',
          source:           m.source ?? 'whatsapp_api',
          text:             m.text ?? '',
          agent_name:       m.agent_name ?? null,
          sent_by_profile_id: m.sent_by_profile_id ?? null,
          attachments:      (m.attachments ?? null) as unknown as import('@/types/database.types').Json,
          delivery_status:  m.delivery_status ?? 'sent',
          external_id:      externalId,
          created_at:       m.created_at,
          message_kind:     m.message_kind ?? 'message',
        }, { onConflict: 'id', ignoreDuplicates: false })
    } catch {
      // Non-critical — the webhook insert path will create the row as a fallback
    }
  }

  private async sendReaction(row: PendingWrite): Promise<void> {
    const p = row.payload as {
      messageId: string; emoji: string; phone: string; provider: 'wati' | 'whapi'
    }
    const msg = await this.db.messages.get(p.messageId)
    const externalId = msg?.external_id
    if (!externalId) {
      console.warn('[sync-worker:react] no external_id for message', p.messageId)
      throw new TerminalError('message has no external_id; cannot react')
    }

    // The provider call MUST surface failures — historically a silent `return`
    // on 4xx made the pending_write look successful when WHAPI/WATI actually
    // rejected, so the customer's WhatsApp never saw the agent reaction.
    if (p.provider === 'wati') {
      const res = await this.supabase.functions.invoke('api-wati', {
        body: { action: 'send_reaction', phone: p.phone, emoji: p.emoji, message_id: externalId },
      })
      // Two failure shapes: transport-level (res.error from the SDK) and
      // application-level (the function returned {error: ...} per wati() helper).
      const appErr = (res.data as { error?: string; detail?: string } | null)?.error
      if (res.error || appErr) {
        const detail = (res.data as { detail?: string } | null)?.detail ?? ''
        const msgText = `api-wati send_reaction failed: ${res.error?.message ?? appErr} ${detail}`.trim()
        // Dump the full payload — when the edge function tries multiple body
        // shapes the `attempts` array is the diagnostic gold.
        console.warn('[sync-worker:react:wati]', {
          messageId: externalId,
          emoji: p.emoji,
          err: msgText,
          data: res.data,
        })
        if (typeof appErr === 'string' && /4\d\d/.test(appErr)) throw new TerminalError(msgText)
        throw new Error(msgText)
      }
    } else {
      const res = await fetch('/api/whapi/send-reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: externalId, emoji: p.emoji, phone: p.phone }),
      })
      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        console.warn('[sync-worker:react:whapi]', {
          messageId: externalId, emoji: p.emoji, status: res.status, body: errBody.slice(0, 300),
        })
        // 4xx = WHAPI rejected (bad id, expired token, etc.). Don't burn retries.
        if (res.status >= 400 && res.status < 500) {
          throw new TerminalError(`whapi send-reaction ${res.status}: ${errBody.slice(0, 200)}`)
        }
        throw new Error(`whapi send-reaction ${res.status}`)
      }
    }
  }

  private async pushCustomerUpdate(row: PendingWrite): Promise<void> {
    const { customerId, ...patch } = row.payload as { customerId: string; [k: string]: unknown }
    const { error } = await this.supabase
      .from('service_customers')
      .update(patch)
      .eq('id', customerId)
    if (error) throw new Error(error.message)
  }

  private async pushAddressInsert(row: PendingWrite): Promise<void> {
    const p = row.payload as Record<string, unknown>
    const { error } = await this.supabase
      .from('service_customer_addresses')
      .insert(p)
    if (error) throw new Error(error.message)
  }

  private async pushAddressUpdate(row: PendingWrite): Promise<void> {
    const { addressId, ...patch } = row.payload as { addressId: string; [k: string]: unknown }
    const { error } = await this.supabase
      .from('service_customer_addresses')
      .update(patch)
      .eq('id', addressId)
    if (error) throw new Error(error.message)
  }

  private async pushPhoneInsert(row: PendingWrite): Promise<void> {
    const p = row.payload as Record<string, unknown>
    const { error } = await this.supabase
      .from('service_customer_phones')
      .insert(p)
    if (error) throw new Error(error.message)
  }

  private async pushPhoneDelete(row: PendingWrite): Promise<void> {
    const { phoneId } = row.payload as { phoneId: string }
    const { error } = await this.supabase
      .from('service_customer_phones')
      .delete()
      .eq('id', phoneId)
    if (error) throw new Error(error.message)
  }

  private async pushMarkRead(row: PendingWrite): Promise<void> {
    const { conversationId } = row.payload as { conversationId: string }
    const { error } = await this.supabase
      .from('chat_conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId)
    if (error) throw new Error(error.message)
  }

  private async pushMarkOpened(row: PendingWrite): Promise<void> {
    const { conversationId } = row.payload as { conversationId: string }
    const { error } = await this.supabase
      .from('chat_conversations')
      .update({ is_opened: true })
      .eq('id', conversationId)
    if (error) throw new Error(error.message)
  }
}
