'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getDb } from '@/lib/contact-center/local/db'
import { SyncWorker } from '@/lib/contact-center/local/sync-worker'
import { prune } from '@/lib/contact-center/local/retention'

export function useSyncWorker(
  authUserId: string | null,
  provider: 'wati' | 'whapi',
  activeConversationId: string | null,
): { fileMap: Map<string, File> | null } {
  const workerRef = useRef<SyncWorker | null>(null)
  const fileMapRef = useRef<Map<string, File> | null>(null)
  // Latest open-conversation id, readable by the worker-creation effect so a
  // freshly (re)created worker (e.g. after a provider flip) re-subscribes the
  // thread topic without waiting for the next conversation change.
  const activeRef = useRef<string | null>(activeConversationId)
  activeRef.current = activeConversationId

  useEffect(() => {
    if (!authUserId) return

    const db = getDb(authUserId)
    const supabase = createClient()
    const w = new SyncWorker(db, supabase, provider)
    workerRef.current = w
    fileMapRef.current = w.fileMap
    w.start()
    w.setActiveConversation(activeRef.current)

    const pruneTimer = setTimeout(() => { void prune(db) }, 5_000)
    const hourly     = setInterval(() => { void prune(db) }, 60 * 60_000)

    return () => {
      clearTimeout(pruneTimer)
      clearInterval(hourly)
      w.stop()
      workerRef.current = null
      fileMapRef.current = null
    }
  }, [authUserId, provider])

  // Point the worker's thread subscription at whatever conversation is open.
  useEffect(() => {
    workerRef.current?.setActiveConversation(activeConversationId)
  }, [activeConversationId])

  return { fileMap: fileMapRef.current }
}
