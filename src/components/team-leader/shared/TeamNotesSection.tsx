// src/components/team-leader/shared/TeamNotesSection.tsx
'use client'

import { Video, Mic, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { PhotoCapture } from './PhotoCapture'
import { toast } from 'sonner'

interface Props {
  visitId: string
  notes: string
  onNotesChange: (notes: string) => void
  photos: Blob[]
  onPhotosChange: (photos: Blob[]) => void
}

export function TeamNotesSection({ visitId, notes, onNotesChange, photos, onPhotosChange }: Props) {
  function notAvailable(type: string) {
    toast.info(`${type} capture available on mobile device`)
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
      <p className="text-sm font-semibold">Team Notes</p>
      <Textarea
        placeholder="Add notes about this visit..."
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        rows={3}
      />

      <p className="text-xs font-medium text-muted-foreground">Attachments</p>
      <div className="grid grid-cols-2 gap-2">
        <PhotoCapture visitId={`${visitId}-team-notes`} label="Photos" photos={photos} onChange={onPhotosChange} maxPhotos={5} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" size="sm" className="min-h-11 gap-1.5 text-xs" onClick={() => notAvailable('Video')}>
          <Video className="h-4 w-4" /> Video
        </Button>
        <Button variant="outline" size="sm" className="min-h-11 gap-1.5 text-xs" onClick={() => notAvailable('Voice')}>
          <Mic className="h-4 w-4" /> Voice
        </Button>
        <Button variant="outline" size="sm" className="min-h-11 gap-1.5 text-xs" onClick={() => notAvailable('Document')}>
          <FileText className="h-4 w-4" /> Doc
        </Button>
      </div>
    </div>
  )
}
