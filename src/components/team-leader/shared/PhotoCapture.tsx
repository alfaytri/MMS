// src/components/team-leader/shared/PhotoCapture.tsx
// Fix 4: Writes each captured photo to IndexedDB immediately on capture.
// On mount, re-hydrates any drafts saved from a previous session.
'use client'

import { useEffect, useRef } from 'react'
import { Camera, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveDraftPhotos, getDraftPhotos } from '@/lib/visitDrafts'
import { cn } from '@/lib/utils'

interface Props {
  visitId: string
  label?: string
  photos: Blob[]
  onChange: (photos: Blob[]) => void
  maxPhotos?: number
}

export function PhotoCapture({ visitId, label = 'Photos', photos, onChange, maxPhotos = 10 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Re-hydrate drafts from IndexedDB on mount (crash recovery)
  useEffect(() => {
    getDraftPhotos(visitId).then((saved) => {
      if (saved.length > 0 && photos.length === 0) {
        onChange(saved)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId])

  async function handleFiles(files: FileList | null) {
    if (!files) return
    const newBlobs = Array.from(files).map((f) => f as Blob)
    const next = [...photos, ...newBlobs].slice(0, maxPhotos)
    onChange(next)
    await saveDraftPhotos(visitId, next)
  }

  async function remove(index: number) {
    const next = photos.filter((_, i) => i !== index)
    onChange(next)
    await saveDraftPhotos(visitId, next)
  }

  const previewUrls = photos.map((b) => URL.createObjectURL(b))

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>

      {/* Preview grid */}
      {previewUrls.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {previewUrls.map((url, i) => (
            <div key={i} className="relative aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-full object-cover rounded-md" />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute top-1 right-1 rounded-full bg-background/80 p-0.5 text-destructive hover:bg-background"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {photos.length < maxPhotos && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            className={cn('w-full min-h-11 gap-2')}
            onClick={() => inputRef.current?.click()}
          >
            <Camera className="h-4 w-4" />
            {photos.length === 0 ? `Take ${label}` : 'Add More'}
          </Button>
        </>
      )}
    </div>
  )
}
