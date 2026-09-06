'use client'
import { ServiceCascadePicker, type CascadePickedService } from '@/components/services/ServiceCascadePicker'
import type { AddedBillableService } from '@/types/team-leader'

interface Props {
  onAdd: (service: AddedBillableService) => void
}

/**
 * Team-leader cascade picker — a thin adapter over the shared
 * ServiceCascadePicker that maps the picked leaf into an AddedBillableService.
 */
export function ServiceCatalogPicker({ onAdd }: Props) {
  return (
    <ServiceCascadePicker
      size="md"
      onAdd={(service: CascadePickedService, qty, pathNames) =>
        onAdd({
          id: service.id,
          name: service.name_en,
          path: pathNames.join(' › '),
          qty,
          unitPrice: service.price ?? 0,
        })
      }
    />
  )
}
