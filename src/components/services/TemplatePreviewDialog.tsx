// src/components/services/TemplatePreviewDialog.tsx
'use client'

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'

export type PreviewItem = {
  label: string
  labelAr?: string | null
  category: string
  triggerType: string
  timingDescription?: string | null
  bodyText?: string | null
  mediaType?: string
}

interface TemplatePreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: PreviewItem | null
}

export function TemplatePreviewDialog({ open, onOpenChange, item }: TemplatePreviewDialogProps) {
  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">{item.label}</DialogTitle>
          {item.labelAr && (
            <p className="text-xs text-muted-foreground" dir="rtl">{item.labelAr}</p>
          )}
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5 mt-1">
          <Badge variant="outline" className="text-[10px] capitalize">{item.category}</Badge>
          <Badge variant="outline" className="text-[10px]">{item.triggerType}</Badge>
          {item.mediaType && item.mediaType !== 'none' && (
            <Badge variant="outline" className="text-[10px]">{item.mediaType}</Badge>
          )}
        </div>

        {item.timingDescription && (
          <p className="text-xs text-muted-foreground">{item.timingDescription}</p>
        )}

        <pre className="text-xs bg-muted rounded p-3 whitespace-pre-wrap font-mono leading-relaxed">
          {item.bodyText ?? 'No preview available'}
        </pre>
      </DialogContent>
    </Dialog>
  )
}
