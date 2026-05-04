'use client'

import { formatDistanceToNow, parseISO } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useTeamActivityLog } from '@/hooks/useTeams'

interface Props {
  open: boolean
  entityId: string
  entityName: string
  onClose: () => void
}

export function EntityActivityLogDialog({ open, entityId, entityName, onClose }: Props) {
  const { data: logs = [] } = useTeamActivityLog(entityId)

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-lg max-h-[80vh] overflow-y-auto md:rounded-lg">
        <DialogHeader>
          <DialogTitle>Activity — {entityName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {logs.map(log => (
            <div key={log.id} className="border rounded p-3 space-y-1 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium capitalize">
                  {log.action.replace(/-/g, ' ')}
                </span>
                <Badge variant="secondary" className="text-[10px] capitalize">
                  {log.entity_type ?? '—'}
                </Badge>
              </div>
              {log.actor && (
                <p className="text-xs text-muted-foreground">by {log.actor.full_name}</p>
              )}
              {log.created_at && (
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(parseISO(log.created_at), { addSuffix: true })}
                </p>
              )}
            </div>
          ))}
          {logs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No activity recorded
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
