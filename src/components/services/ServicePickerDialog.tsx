'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  ServicePickerPanel,
  type BasketLine,
  type ServicePickerPanelProps,
} from './ServicePickerPanel'

export interface ServicePickerDialogProps extends ServicePickerPanelProps {
  triggerLabel?: string
}

/**
 * Dialog wrapper around `ServicePickerPanel`, for the order and quotation
 * forms, where the picker used to sit inline in a cramped column.
 *
 * The team-leader surfaces deliberately do NOT use this — they render the panel
 * directly, because each of their own dialogs is already full-screen on mobile
 * and a dialog inside one would stack a modal on a modal.
 */
export function ServicePickerDialog({
  onCommit,
  treeType,
  divisionFilters,
  triggerLabel = 'Add services',
}: ServicePickerDialogProps) {
  const [open, setOpen] = useState(false)

  function handleCommit(lines: BasketLine[]) {
    onCommit(lines)
    setOpen(false)
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full gap-2"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4" />
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex h-full w-full max-w-3xl flex-col gap-0 rounded-none p-0 md:h-auto md:max-h-[85vh] md:rounded-xl">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
          <DialogTitle>Add services</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 p-4">
          {/* Remount per opening so the basket and query start clean. */}
          {open && (
            <ServicePickerPanel
              commitLabel="Add to order"
              onCommit={handleCommit}
              treeType={treeType}
              divisionFilters={divisionFilters}
            />
          )}
        </div>
      </DialogContent>
      </Dialog>
    </>
  )
}
