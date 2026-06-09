import type { SupabaseClient } from '@supabase/supabase-js'
import type { MmsCcDb } from './db'
import type { LocalMessage } from './schema'
import * as messagesRepo from './repos/messages'

type Status = 'connected' | 'reconnecting' | 'offline'

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
    // Task 11 starts the drain loop here
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
}
