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
  }

  private subscribeRealtime(): void {
    this.channel = this.supabase
      .channel(`cc-sync-${this.provider}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages' },
        (payload: { eventType: string; new?: unknown; old?: unknown }) => this.onMessagePayload(payload),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_conversations' },
        (payload: { eventType: string; new?: unknown; old?: unknown }) => this.onConversationPayload(payload),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_customers' },
        (payload: { eventType: string; new?: unknown; old?: unknown }) => this.onCrmPayload('customers', payload),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_customer_addresses' },
        (payload: { eventType: string; new?: unknown; old?: unknown }) => this.onCrmPayload('addresses', payload),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_customer_phones' },
        (payload: { eventType: string; new?: unknown; old?: unknown }) => this.onCrmPayload('phones', payload),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_customer_products' },
        (payload: { eventType: string; new?: unknown; old?: unknown }) => this.onCrmPayload('products', payload),
      )
      .subscribe((channelStatus: string) => {
        if (channelStatus === 'SUBSCRIBED')        this.setStatus('connected')
        else if (channelStatus === 'CHANNEL_ERROR') this.setStatus('offline')
        else if (channelStatus === 'TIMED_OUT')    this.setStatus('reconnecting')
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

  private onCrmPayload(
    table: 'customers' | 'addresses' | 'phones' | 'products',
    payload: { eventType: string; new?: unknown; old?: unknown },
  ): void {
    const row = (payload.new ?? payload.old) as { id: string } | undefined
    if (!row?.id) return
    if (payload.eventType === 'DELETE') {
      void this.db[table].delete(row.id)
    } else {
      void this.db[table].put(row as never)
    }
  }

  private onConversationPayload(payload: { eventType: string; new?: unknown; old?: unknown }): void {
    const row = (payload.new ?? payload.old) as { id: string } | undefined
    if (!row?.id) return
    if (payload.eventType === 'DELETE') {
      void this.db.conversations.delete(row.id)
    } else {
      void this.db.conversations.put(row as never)
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
    await q.markInFlight(this.db, row.id!)
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
    const { id, phone, text } = row.payload as {
      id: string; conversationId: string; phone: string; text: string
    }
    const { data, error } = await this.supabase.functions.invoke('api-wati', {
      body: { action: 'send_session_message', phone, text, message_id: id },
    })
    if (error) throw new Error(error.message ?? 'send_message failed')
    const watiId = data?.message?.whatsappMessageId
    if (watiId) {
      await this.db.messages.update(id, {
        external_id: `wati_${watiId}`,
        delivery_status: 'sent',
        _localOnly: false,
      })
    }
  }

  private async sendFile(row: PendingWrite): Promise<void> {
    if (!row.fileRef) throw new TerminalError('send_file row missing fileRef')
    const file = this.fileMap.get(row.fileRef)
    if (!file) throw new TerminalError('file lost on reload — re-upload required')

    const p = row.payload as {
      id: string; conversationId: string; phone: string
      caption: string; filename: string; mime: string
    }

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

    const watiId = (data as any)?.message?.whatsappMessageId
                ?? (data as any)?.info?.whatsAppMessageId
    const externalId = watiId ? `wati_${watiId}` : null

    await this.db.messages.update(p.id, {
      external_id: externalId,
      delivery_status: 'sent',
      _localOnly: false,
    })

    this.fileMap.delete(row.fileRef)
  }

  private async sendTemplate(row: PendingWrite): Promise<void> {
    const p = row.payload as {
      id: string; conversationId: string; phone: string
      templateName: string; broadcastName: string
      parameters: string[]; headerUrl: string | null
    }
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
    if (watiId) {
      await this.db.messages.update(p.id, {
        external_id: `wati_${watiId}`,
        delivery_status: 'sent',
        _localOnly: false,
      })
    }
  }

  private async sendReaction(row: PendingWrite): Promise<void> {
    const p = row.payload as {
      messageId: string; emoji: string; phone: string; provider: 'whapi'
    }
    const msg = await this.db.messages.get(p.messageId)
    const externalId = msg?.external_id
    if (!externalId) return

    try {
      const res = await fetch('/api/whapi/send-reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: externalId, emoji: p.emoji, phone: p.phone }),
      })
      if (!res.ok && res.status >= 400 && res.status < 500) return
      if (!res.ok) throw new Error(`send-reaction ${res.status}`)
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('send-reaction 4')) return
      throw err
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
