import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { POStatus } from '@/hooks/usePurchaseOrders'

const STATUS_CONFIG: Record<POStatus, { label: string; className: string }> = {
  draft:               { label: 'Draft',              className: 'border-muted-foreground/40 text-muted-foreground' },
  pending_approval:    { label: 'Pending Approval',   className: 'border-warning text-warning' },
  approved:            { label: 'Approved',            className: 'border-success text-success' },
  partially_received:  { label: 'Partially Received', className: 'border-blue-500 text-blue-500' },
  received:            { label: 'Received',            className: 'border-success text-success bg-success/10' },
  cancelled:           { label: 'Cancelled',           className: 'border-destructive text-destructive' },
}

export function PoStatusBadge({ status, className }: { status: POStatus; className?: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: '' }
  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  )
}
