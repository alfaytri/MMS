'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, X, Loader2, FileText, Image as ImageIcon, Video, Music, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

// ── Attachment categories ─────────────────────────────────────────────────────
export const ATTACH_TABS = [
  { key: 'image',    label: 'Images',    icon: <ImageIcon className="h-4 w-4" />,  accept: 'image/jpeg,image/png,image/webp,image/gif' },
  { key: 'video',    label: 'Videos',    icon: <Video className="h-4 w-4" />,      accept: 'video/mp4,video/3gpp,video/quicktime' },
  { key: 'document', label: 'Documents', icon: <FileText className="h-4 w-4" />,   accept: 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { key: 'audio',    label: 'Audios',    icon: <Music className="h-4 w-4" />,      accept: 'audio/ogg,audio/mpeg,audio/mp4,audio/aac' },
] as const

interface ChatAttachmentDialogProps {
  open: boolean
  sending: boolean
  onSend: (file: File, caption: string) => void
  onClose: () => void
}

export function ChatAttachmentDialog({
  open, sending, onSend, onClose,
}: ChatAttachmentDialogProps) {
  const [tab, setTab]       = useState<typeof ATTACH_TABS[number]['key']>('image')
  const [file, setFile]     = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef            = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) { setFile(null); setCaption('') }
  }, [open])

  const activeTab = ATTACH_TABS.find((t) => t.key === tab)!

  function handleFile(f: File) { setFile(f); setCaption('') }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  function reset() { setFile(null); setCaption('') }

  function handleClose() { reset(); onClose() }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="w-[95vw] max-w-xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-base">Send Attachment</DialogTitle>
        </DialogHeader>

        {/* Category tabs */}
        <div className="flex border-b border-border bg-muted/30">
          {ATTACH_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); reset() }}
              className={`flex-1 flex flex-col items-center gap-1.5 py-3.5 text-xs font-medium transition-colors border-r last:border-r-0 border-border ${
                tab === t.key
                  ? 'bg-background text-primary border-b-2 border-b-primary'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {!file ? (
            /* Drop zone */
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-xl py-14 cursor-pointer transition-colors ${
                dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/20'
              }`}
            >
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold">Drag & Drop Files Here</p>
                <p className="text-xs text-muted-foreground">
                  Supported: {activeTab.label.toLowerCase()}
                </p>
              </div>
              <Button variant="outline" size="sm" className="px-6" type="button">Browse Files</Button>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept={activeTab.accept}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
            </div>
          ) : (
            /* File preview */
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4">
                <div className="h-12 w-12 flex items-center justify-center rounded-lg bg-muted flex-shrink-0">
                  {activeTab.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button onClick={reset} className="p-1.5 rounded-md hover:bg-muted">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* Image preview */}
              {tab === 'image' && (
                <img
                  src={URL.createObjectURL(file)}
                  alt="preview"
                  className="w-full max-h-52 object-contain rounded-xl border border-border bg-muted/20"
                />
              )}

              <div className="space-y-1.5">
                <Label className="text-sm">Caption (optional)</Label>
                <Input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="h-9"
                  placeholder="Add a caption…"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-5 pb-5 gap-2">
          <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          <Button
            disabled={!file || sending}
            onClick={() => { if (file) onSend(file, caption) }}
          >
            {sending
              ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Sending…</>
              : <><Send className="h-4 w-4 mr-1.5" />Send</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
