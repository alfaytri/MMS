'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { getDb } from '@/lib/contact-center/local/db'

export interface SyncStatus {
  online: boolean
  pending: number
  failed: number
  lastSyncedAt: string | null
}

export function useSyncStatus(authUserId: string): SyncStatus {
  const db = getDb(authUserId)

  const statusRow = useLiveQuery(() => db.sync.get('realtimeStatus'), [authUserId])
  const lastSync  = useLiveQuery(() => db.sync.get('lastConversationSync:wati'), [authUserId])
  const pending   = useLiveQuery(
    () => db.pendingWrites.where('status').anyOf(['queued', 'in_flight']).count(),
    [authUserId], 0,
  )
  const failed    = useLiveQuery(
    () => db.pendingWrites.where('status').equals('failed').count(),
    [authUserId], 0,
  )

  return {
    online: statusRow?.value === 'connected',
    pending: pending ?? 0,
    failed: failed ?? 0,
    lastSyncedAt: typeof lastSync?.value === 'string' ? lastSync.value : null,
  }
}
