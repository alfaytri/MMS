'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AttributesTab } from './AttributesTab'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  categoryId: string
  categoryName: string
}

export function CategoryAttributesDialog({ open, onOpenChange, categoryId, categoryName }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Attributes — {categoryName}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto py-2">
          {open && <AttributesTab categoryId={categoryId} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
