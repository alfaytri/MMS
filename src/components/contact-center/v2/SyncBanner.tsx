'use client'

import { AlertTriangle, CloudOff, Loader2 } from 'lucide-react'
import { useSyncStatus } from '@/hooks/contact-center/local/useSyncStatus'

interface Props {
  authUserId: string
}

export function SyncBanner({ authUserId }: Props) {
  const { online, pending, failed } = useSyncStatus(authUserId)

  if (online && pending === 0 && failed === 0) return null

  if (!online) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] bg-amber-50 border-b border-amber-200 text-amber-800">
        <CloudOff className="h-3 w-3 flex-shrink-0" />
        Working offline{pending > 0 && ` — ${pending} change${pending !== 1 ? 's' : ''} queued`}
      </div>
    )
  }
  if (pending > 0) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] bg-muted/40 border-b border-border text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
        Syncing {pending} change{pending !== 1 ? 's' : ''}…
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 text-[11px] bg-destructive/10 border-b border-destructive/30 text-destructive">
      <AlertTriangle className="h-3 w-3 flex-shrink-0" />
      {failed} send{failed !== 1 ? 's' : ''} failed — open the retry tray
    </div>
  )
}
