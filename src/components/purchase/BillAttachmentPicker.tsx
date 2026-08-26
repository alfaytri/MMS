// src/components/purchase/BillAttachmentPicker.tsx
'use client'

/**
 * Multi-file attachment picker for the Create Supplier Bill dialogs.
 *
 * Behaviour: upload-on-selection into the private `bill-attachments`
 * bucket. Selected files show as chips with per-file remove.
 * Parent owns the `uploads` state so it can (a) submit them alongside
 * the bill create RPC and (b) sweep them on Cancel — same pattern used by
 * the landed-costs page.
 */

import { humanizeDbError } from '@/lib/dbErrors'
import { useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { Paperclip, Upload, X, FileText, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024

export type BillAttachmentUpload = {
  storage_key: string
  file_name: string
  mime_type: string | null
  size_bytes: number
}

type Props = {
  uploads: BillAttachmentUpload[]
  onChange: (next: BillAttachmentUpload[]) => void
  disabled?: boolean
}

export type BillAttachmentPickerHandle = {
  /** Delete every uploaded file from storage (called on dialog cancel). */
  sweep: () => Promise<void>
}

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(mime: string | null) {
  if (mime?.startsWith('image/')) return <ImageIcon className="h-4 w-4 text-blue-600" />
  return <FileText className="h-4 w-4 text-red-600" />
}

export const BillAttachmentPicker = forwardRef<BillAttachmentPickerHandle, Props>(
  function BillAttachmentPicker({ uploads, onChange, disabled }, ref) {
    const inputRef = useRef<HTMLInputElement | null>(null)
    const [busy, setBusy] = useState(false)

    useImperativeHandle(ref, () => ({
      sweep: async () => {
        if (uploads.length === 0) return
        const supabase = createClient()
        await supabase.storage
          .from('bill-attachments')
          .remove(uploads.map((u) => u.storage_key))
          .catch(() => { /* best-effort */ })
      },
    }), [uploads])

    async function handleFiles(files: FileList | null) {
      if (!files || files.length === 0) return
      setBusy(true)
      const supabase = createClient()
      const now = new Date()
      const year = now.getUTCFullYear()
      const month = String(now.getUTCMonth() + 1).padStart(2, '0')
      const added: BillAttachmentUpload[] = []
      try {
        for (const file of Array.from(files)) {
          if (!ALLOWED_MIME.includes(file.type)) {
            toast.error(`${file.name}: unsupported type (${file.type || 'unknown'})`)
            continue
          }
          if (file.size > MAX_BYTES) {
            toast.error(`${file.name}: exceeds 5 MB limit`)
            continue
          }
          const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
          const path = `${year}/${month}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitized}`
          const { error } = await supabase.storage
            .from('bill-attachments')
            .upload(path, file, { contentType: file.type, cacheControl: '3600' })
          if (error) {
            toast.error(`${file.name}: ${humanizeDbError(error)}`)
            continue
          }
          added.push({
            storage_key: path,
            file_name: file.name,
            mime_type: file.type || null,
            size_bytes: file.size,
          })
        }
        if (added.length > 0) onChange([...uploads, ...added])
      } finally {
        setBusy(false)
        if (inputRef.current) inputRef.current.value = ''
      }
    }

    async function removeAt(idx: number) {
      const target = uploads[idx]
      if (!target) return
      const supabase = createClient()
      await supabase.storage
        .from('bill-attachments')
        .remove([target.storage_key])
        .catch(() => { /* best-effort */ })
      onChange(uploads.filter((_, i) => i !== idx))
    }

    return (
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5" />
          Supplier Invoice Attachments
        </Label>
        <div className="flex flex-wrap gap-2">
          {uploads.map((u, idx) => (
            <div
              key={u.storage_key}
              className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-xs min-h-11 sm:min-h-0"
            >
              {fileIcon(u.mime_type)}
              <div className="flex flex-col leading-tight">
                <span className="font-medium truncate max-w-[220px]">{u.file_name}</span>
                <span className="text-muted-foreground text-[10px]">{humanSize(u.size_bytes)}</span>
              </div>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                disabled={disabled}
                className="ml-1 text-muted-foreground hover:text-destructive disabled:opacity-40"
                aria-label={`Remove ${u.file_name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
            disabled={disabled || busy}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy}
            className={cn('gap-1.5 h-8')}
          >
            <Upload className="h-3.5 w-3.5" />
            {busy ? 'Uploading…' : uploads.length === 0 ? 'Add invoice files' : 'Add more'}
          </Button>
          <p className="text-[11px] text-muted-foreground mt-1">
            PDF, JPG, PNG, WEBP. Max 5 MB each. Multiple files allowed.
          </p>
        </div>
      </div>
    )
  },
)
