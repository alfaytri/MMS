'use client'

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils/formatters'
import type { ActivityLog } from '@/hooks/useActivityLog'

interface AuditDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: ActivityLog | null
}

function JsonDiff({ label, data }: { label: string; data: Record<string, unknown> | null }) {
  if (!data) return null
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">{label}</h4>
      <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto max-h-60">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

export function AuditDetailDialog({ open, onOpenChange, entry }: AuditDetailDialogProps) {
  if (!entry) return null

  const severityVariant = entry.severity === 'critical' ? 'destructive'
    : entry.severity === 'warning' ? 'warning'
    : 'active'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Audit Log Detail</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Action:</span>
              <p className="font-medium">{entry.action}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Module:</span>
              <p><Badge variant="outline">{entry.module ?? '—'}</Badge></p>
            </div>
            <div>
              <span className="text-muted-foreground">Performed by:</span>
              <p className="font-medium">{entry.performer_name ?? '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Date:</span>
              <p>{formatDateTime(entry.created_at)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Severity:</span>
              <p><Badge variant="outline" className={severityVariant === 'destructive' ? 'border-destructive text-destructive' : severityVariant === 'warning' ? 'border-warning text-warning' : ''}>{entry.severity ?? 'info'}</Badge></p>
            </div>
            <div>
              <span className="text-muted-foreground">IP Address:</span>
              <p className="font-mono text-xs">{entry.ip_address ?? '—'}</p>
            </div>
          </div>

          {entry.details && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Details</h4>
              <p className="text-sm bg-muted rounded-md p-3">{entry.details}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <JsonDiff label="Old Data" data={entry.old_data as Record<string, unknown> | null} />
            <JsonDiff label="New Data" data={entry.new_data as Record<string, unknown> | null} />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
