'use client'
import { ServicePickerDialog } from '@/components/services/ServicePickerDialog'
import type { BasketLine } from '@/components/services/ServicePickerPanel'
import type { OrderServiceDraft } from '@/types/orders'

interface Props {
  onAdd: (service: OrderServiceDraft) => void
  divisionFilters?: string[]
  treeType?: string
}

/**
 * Order/quotation service picker — a thin adapter over the shared picker that
 * maps each chosen service into an OrderServiceDraft.
 *
 * The picker opens in a dialog here because the order form's left column is
 * narrow; `onAdd` still fires once per service, so the form above is unchanged.
 */
export function ServiceSelector({ onAdd, divisionFilters = [], treeType = 'normal' }: Props) {
  return (
    <ServicePickerDialog
      treeType={treeType}
      divisionFilters={divisionFilters}
      onCommit={(lines: BasketLine[]) =>
        lines.forEach(({ service, qty, pathNames }) =>
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
          }),
        )
      }
    />
  )
}
