import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { SOStatus } from '@/hooks/useSaleOrders'

const STATUS_CONFIG: Record<SOStatus, { label: string; className: string }> = {
  quotation:        { label: 'Quotation',        className: 'border-muted-foreground/40 text-muted-foreground' },
  pending_approval: { label: 'Pending Approval', className: 'border-warning text-warning' },
  confirmed:        { label: 'Confirmed',         className: 'border-blue-500 text-blue-500' },
  partial_delivery: { label: 'Partial Delivery',  className: 'border-orange-500 text-orange-500' },
  delivered:        { label: 'Delivered',          className: 'border-success text-success' },
  invoiced:         { label: 'Invoiced',           className: 'border-success text-success bg-success/10' },
  closed:           { label: 'Closed',             className: 'border-muted-foreground/60 text-muted-foreground bg-muted' },
  cancelled:        { label: 'Cancelled',          className: 'border-destructive text-destructive' },
}

export function SoStatusBadge({ status, className }: { status: SOStatus; className?: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: '' }
  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  )
}
