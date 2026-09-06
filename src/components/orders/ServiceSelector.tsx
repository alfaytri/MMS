'use client'
import { ServiceCascadePicker, type CascadePickedService } from '@/components/services/ServiceCascadePicker'
import type { OrderServiceDraft } from '@/types/orders'

interface Props {
  onAdd: (service: OrderServiceDraft) => void
  divisionFilters?: string[]
  treeType?: string
}

/**
 * Order/quotation cascade picker — a thin adapter over the shared
 * ServiceCascadePicker that maps the picked leaf into an OrderServiceDraft.
 */
export function ServiceSelector({ onAdd, divisionFilters = [], treeType = 'normal' }: Props) {
  return (
    <ServiceCascadePicker
      treeType={treeType}
      divisionFilters={divisionFilters}
      onAdd={(service: CascadePickedService, qty, pathNames) =>
        onAdd({
          serviceId: service.id,
          serviceName: service.name_en,
          path: pathNames,
          qty,
          price: service.price ?? 0,
          emergencyPrice: service.emergency_price ?? null,
          duration: service.duration ?? 0,
          division: service.division?.[0] ?? '',
          rootSkillId: service.id,
        })
      }
    />
  )
}
