'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getDb } from '@/lib/contact-center/local/db'
import { SyncWorker } from '@/lib/contact-center/local/sync-worker'
import { prune } from '@/lib/contact-center/local/retention'

export function useSyncWorker(authUserId: string | null, provider: 'wati' | 'whapi'): { fileMap: Map<string, File> | null } {
  const workerRef = useRef<SyncWorker | null>(null)
  const fileMapRef = useRef<Map<string, File> | null>(null)

  useEffect(() => {
    if (!authUserId) return

    const db = getDb(authUserId)
    const supabase = createClient()
    const w = new SyncWorker(db, supabase, provider)
    workerRef.current = w
    fileMapRef.current = w.fileMap
    w.start()

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

  return { fileMap: fileMapRef.current }
}
