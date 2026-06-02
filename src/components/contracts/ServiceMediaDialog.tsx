'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Image as ImageIcon, FileText, Volume2, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

interface MediaItem {
  id: string
  name: string
  type: 'image' | 'document' | 'audio' | 'text'
  url: string
  size?: number
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  serviceId: string | null
  serviceName: string
}

function getMediaType(mimeType: string): MediaItem['type'] {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.includes('pdf') || mimeType.includes('word') || mimeType.includes('document')) return 'document'
  return 'text'
}

const ICON_MAP = {
  image: ImageIcon,
  document: FileText,
  audio: Volume2,
  text: FileText,
}

export function ServiceMediaDialog({ open, onOpenChange, serviceId, serviceName }: Props) {
  const supabase = createClient()
  const [selectedIdx, setSelectedIdx] = useState(0)

  const { data: mediaItems = [] } = useQuery<MediaItem[]>({
    queryKey: ['serviceMedia', serviceId],
    queryFn: async () => {
      if (!serviceId) return []
      const { data, error } = await supabase.storage
        .from('contract-documents')
        .list(serviceId, { limit: 50 })

      if (error || !data) return []

      return data.map((file) => {
        const { data: urlData } = supabase.storage
          .from('contract-documents')
          .getPublicUrl(`${serviceId}/${file.name}`)

        return {
          id: file.id || file.name,
          name: file.name,
          type: getMediaType(file.metadata?.mimetype || ''),
          url: urlData.publicUrl,
          size: file.metadata?.size,
        }
      })
    },
    enabled: open && !!serviceId,
  })

  useEffect(() => {
    setSelectedIdx(0)
  }, [serviceId])

  const selected = mediaItems[selectedIdx]

  function navigatePrev() {
    setSelectedIdx((prev) => Math.max(0, prev - 1))
  }

  function navigateNext() {
    setSelectedIdx((prev) => Math.min(mediaItems.length - 1, prev + 1))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full max-w-full max-h-full md:max-w-4xl md:max-h-[80vh] md:h-auto rounded-none md:rounded-lg p-0">
        <div className="flex flex-col md:flex-row h-full">
          {/* Left sidebar — media list */}
          <div className="w-full md:w-60 border-b md:border-b-0 md:border-r bg-muted/50 p-4 overflow-y-auto max-h-40 md:max-h-none">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">{serviceName}</h3>
              <span className="text-xs text-muted-foreground">{mediaItems.length} files</span>
            </div>
            <div className="space-y-1">
              {mediaItems.map((item, idx) => {
                const Icon = ICON_MAP[item.type]
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedIdx(idx)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left',
                      idx === selectedIdx ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.name}</span>
                  </button>
                )
              })}
              {mediaItems.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">No media attached</p>
              )}
            </div>
          </div>

          {/* Right panel — preview */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={navigatePrev} disabled={selectedIdx === 0}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground">
                  {mediaItems.length > 0 ? `${selectedIdx + 1} / ${mediaItems.length}` : '—'}
                </span>
                <Button variant="ghost" size="sm" onClick={navigateNext} disabled={selectedIdx >= mediaItems.length - 1}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
              {!selected && (
                <p className="text-sm text-muted-foreground">Select a file to preview</p>
              )}
              {selected?.type === 'image' && (
                <img
                  src={selected.url}
                  alt={selected.name}
                  className="max-w-full max-h-full object-contain rounded"
                />
              )}
              {selected?.type === 'audio' && (
                <div className="text-center space-y-3">
                  <Volume2 className="h-16 w-16 mx-auto text-muted-foreground" />
                  <audio controls src={selected.url} className="w-full max-w-md" />
                  <p className="text-sm text-muted-foreground">{selected.name}</p>
                </div>
              )}
              {selected?.type === 'document' && (
                <div className="text-center space-y-3">
                  <FileText className="h-16 w-16 mx-auto text-muted-foreground" />
                  <p className="text-sm">{selected.name}</p>
                  <a
                    href={selected.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary underline"
                  >
                    Open in new tab
                  </a>
                </div>
              )}
              {selected?.type === 'text' && (
                <div className="text-center space-y-3">
                  <FileText className="h-16 w-16 mx-auto text-muted-foreground" />
                  <p className="text-sm">{selected.name}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
