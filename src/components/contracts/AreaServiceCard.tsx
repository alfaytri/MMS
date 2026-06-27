'use client'

import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ContractService } from '@/types/contracts'

interface Props {
  service: ContractService
  editable: boolean
  onEdit?: () => void
  onRemove?: () => void
  onViewMedia?: () => void
}

export function AreaServiceCard({ service, editable, onEdit, onRemove, onViewMedia }: Props) {
  const conditionColors: Record<string, string> = {
    good: 'bg-green-100 text-green-700',
    fair: 'bg-yellow-100 text-yellow-700',
    poor: 'bg-red-100 text-red-700',
  }

  return (
    <div className="rounded-md border bg-background p-3 space-y-1.5">
      {service.service_path.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {service.service_path.join(' > ')}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="text-xs capitalize">
          {service.contract_type}
        </Badge>
        {service.item_kind === 'product' && (
          <Badge variant="secondary" className="text-xs">Product</Badge>
        )}
        {service.brand_name && (
          <Badge variant="outline" className="text-xs">
            {service.brand_name}
            {service.reliability_factor < 1 ? ' ✓' : ''}
          </Badge>
        )}
        {service.divisions.map((d) => (
          <Badge key={d} variant="secondary" className="text-xs">
            {d}
          </Badge>
        ))}
        {service.condition && (
          <span className={cn('text-xs px-1.5 py-0.5 rounded', conditionColors[service.condition])}>
            {service.condition} {service.condition_factor}×
          </span>
        )}
        {service.contract_type !== 'general' && (
          <Badge variant="outline" className="text-xs">
            {service.frequency}
          </Badge>
        )}
        {service.contract_type === 'general' && service.discount > 0 && (
          <Badge variant="outline" className="text-xs text-amber-700">
            {service.discount}% off
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          Qty {service.quantity}
          {service.contract_type === 'area' && service.price_unit ? ` ${service.price_unit}` : ''}
          {' × '}{service.unit_price.toLocaleString('en-QA')} QAR ={' '}
          <span className="font-bold">{service.total_price.toLocaleString('en-QA')} QAR</span>
        </span>
        <div className="flex items-center gap-1">
          {editable && onEdit && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {editable && onRemove && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {service.note && (
        <p className="text-xs text-muted-foreground italic">{service.note}</p>
      )}
    </div>
  )
}
