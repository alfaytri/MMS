// src/components/team-leader/shared/DamageReportDialog.tsx
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { PhotoCapture } from './PhotoCapture'
import type { DamageReportEntry } from '@/types/team-leader'

interface Props {
  open: boolean
  visitId: string
  onSubmit: (entry: DamageReportEntry) => void
  onClose: () => void
}

export function DamageReportDialog({ open, visitId, onSubmit, onClose }: Props) {
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<Blob[]>([])
  const [customerNotified, setCustomerNotified] = useState(false)

  function handleSubmit() {
    if (!description.trim()) return
    onSubmit({
      id: crypto.randomUUID(),
      description: description.trim(),
      photos,
      customerNotified,
    })
    setDescription('')
    setPhotos([])
    setCustomerNotified(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-lg sm:max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b">
          <DialogTitle>Report Damage</DialogTitle>
        </DialogHeader>

        <div className="p-4 space-y-4 overflow-y-auto">
          <Textarea
            placeholder="Describe the damage or issue..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />

          <PhotoCapture
            visitId={`${visitId}-damage-${Date.now()}`}
            label="Damage Photos"
            photos={photos}
            onChange={setPhotos}
          />

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="notify-toggle" className="text-sm">Customer Notified</Label>
            <Switch
              id="notify-toggle"
              checked={customerNotified}
              onCheckedChange={setCustomerNotified}
            />
          </div>
        </div>

        <div className="p-4 border-t flex gap-2">
          <Button variant="outline" className="flex-1 min-h-11" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1 min-h-11"
            onClick={handleSubmit}
            disabled={!description.trim()}
          >
            Add Report
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
