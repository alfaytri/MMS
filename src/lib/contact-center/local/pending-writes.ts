import type { MmsCcDb } from './db'
import type { PendingWrite, PendingWriteKind } from './schema'

export const MAX_RETRIES = 5

export const RETRY_BACKOFF_MS = [1_000, 2_000, 5_000, 15_000, 60_000]

export type EnqueueArgs = {
  kind: PendingWriteKind
  payload: Record<string, unknown>
  localMessageId?: string
  fileRef?: string
}

export async function enqueue(db: MmsCcDb, args: EnqueueArgs): Promise<number> {
  const id = await db.pendingWrites.add({
    kind: args.kind,
    payload: args.payload,
    status: 'queued',
    retryCount: 0,
    lastError: null,
    createdAt: Date.now(),
    localMessageId: args.localMessageId,
    fileRef: args.fileRef,
  })
  return id as number
}

export async function listQueued(db: MmsCcDb): Promise<PendingWrite[]> {
  return db.pendingWrites
    .where('status').equals('queued')
    .sortBy('id')
}

export async function listFailed(db: MmsCcDb): Promise<PendingWrite[]> {
  return db.pendingWrites
    .where('status').equals('failed')
    .sortBy('id')
}

export async function markInFlight(db: MmsCcDb, id: number): Promise<void> {
  await db.pendingWrites.update(id, { status: 'in_flight' })
}

/**
 * Atomically claim a queued pending write for processing.
 * Uses a Dexie readwrite transaction so that only ONE tab/worker
 * can claim each row — prevents the duplicate-send bug when
 * multiple tabs share the same IndexedDB.
 */
export async function claimForFlight(db: MmsCcDb, id: number): Promise<boolean> {
  return db.transaction('rw', db.pendingWrites, async () => {
    const row = await db.pendingWrites.get(id)
    if (!row || row.status !== 'queued') return false
    await db.pendingWrites.update(id, { status: 'in_flight' })
    return true
  })
}

export async function markSuccess(db: MmsCcDb, id: number): Promise<void> {
  await db.pendingWrites.delete(id)
}

export async function markFailedTransient(db: MmsCcDb, id: number, error: string): Promise<void> {
  const row = await db.pendingWrites.get(id)
  if (!row) return
  await db.pendingWrites.update(id, {
    status: 'queued',
    retryCount: row.retryCount + 1,
    lastError: error,
  })
}

export async function markFailedTerminal(
  db: MmsCcDb,
  id: number,
  error: string,
  onFileMapCleanup: (fileRef: string) => void,
): Promise<void> {
  const row = await db.pendingWrites.get(id)
  if (!row) return
  if (row.fileRef) onFileMapCleanup(row.fileRef)
  await db.pendingWrites.update(id, {
    status: 'failed',
    lastError: error,
  })
}

export async function discard(
  db: MmsCcDb,
  id: number,
  onFileMapCleanup: (fileRef: string) => void,
): Promise<void> {
  const row = await db.pendingWrites.get(id)
  if (!row) return
  if (row.fileRef) onFileMapCleanup(row.fileRef)
  await db.pendingWrites.delete(id)
}

export async function failedCount(db: MmsCcDb): Promise<number> {
  return db.pendingWrites.where('status').equals('failed').count()
}

export async function pendingCount(db: MmsCcDb): Promise<number> {
  return db.pendingWrites
    .where('status').anyOf(['queued', 'in_flight'])
    .count()
}
