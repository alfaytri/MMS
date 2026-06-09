import type { SupabaseClient } from '@supabase/supabase-js'
import type { MmsCcDb } from './db'

type Status = 'connected' | 'reconnecting' | 'offline'

export class SyncWorker {
  readonly fileMap = new Map<string, File>()
  status: Status = 'offline'
  isRunning = false

  private channel: ReturnType<SupabaseClient['channel']> | null = null
  private drainTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    public readonly db: MmsCcDb,
    public readonly supabase: SupabaseClient,
    public readonly provider: 'wati' | 'whapi',
  ) {}

  start(): void {
    if (this.isRunning) return
    this.isRunning = true
    // Task 10 subscribes Realtime here
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
    if (this.drainTimer) {
      clearInterval(this.drainTimer)
      this.drainTimer = null
    }
    this.setStatus('offline')
  }

  setStatus(next: Status): void {
    this.status = next
  }
}
