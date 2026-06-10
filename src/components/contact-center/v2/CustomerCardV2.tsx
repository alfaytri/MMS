'use client'

import { User, Edit2, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface Customer {
  id:                       string
  name:                     string
  customer_type:            'individual' | 'business'
  is_blocked:               boolean
  pending_payment_amount:   number
}

interface Props {
  customer: Customer | null
  onEdit:   () => void
}

export function CustomerCardV2({ customer, onEdit }: Props) {
  if (!customer) {
    return <p className="text-xs text-muted-foreground px-3 py-2">No customer linked</p>
  }

  return (
    <div className="px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-medium truncate flex-1">{customer.name}</span>
        <Badge variant="outline" className="text-xs uppercase">
          {customer.customer_type === 'business' ? 'BIZ' : 'IND'}
        </Badge>
        <Button size="icon" variant="ghost" className="h-6 w-6 -mr-1" onClick={onEdit}>
          <Edit2 className="h-3 w-3" />
        </Button>
      </div>

      {customer.is_blocked && (
        <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 border border-destructive/30 px-2 py-1">
          <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />
          <span className="text-xs text-destructive flex-1">Blocked</span>
        </div>
      )}

      {customer.pending_payment_amount > 0 && (
        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
          Pending: QAR {customer.pending_payment_amount.toFixed(2)}
        </Badge>
      )}
    </div>
  )
}
