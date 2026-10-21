'use client'
import { ServicePickerPanel, type BasketLine } from '@/components/services/ServicePickerPanel'
import type { AddedBillableService } from '@/types/team-leader'

interface Props {
  onAdd: (service: AddedBillableService) => void
}

/**
 * Team-leader service picker — a thin adapter over the shared picker that maps
 * each chosen service into an AddedBillableService.
 *
 * Renders the PANEL directly, not the dialog. Every caller here
 * (NormalOrderDialog, BackworkDialog, FollowUpDialog, SiteVisitSingleDialog) is
 * already a full-screen dialog on mobile, and opening another inside one would
 * stack a modal on a modal on a phone-first field surface.
 */
export function ServiceCatalogPicker({ onAdd }: Props) {
  return (
    <ServicePickerPanel
      // Embedded partway down an already-open dialog: taking focus here would
      // scroll past what the operator opened the dialog to do and raise the
      // soft keyboard. The old cascade picker never stole focus either.
      autoFocusSearch={false}
      commitLabel="Add"
      onCommit={(lines: BasketLine[]) =>
        lines.forEach(({ service, qty, pathNames }) =>
          onAdd({
            id: service.id,
            name: service.name_en,
            path: pathNames.join(' › '),
            qty,
            unitPrice: service.price ?? 0,
          }),
        )
      }
    />
  )
}
