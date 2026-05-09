'use client'
import { useRef } from 'react'
import { Paperclip, X, FileText, ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PendingAttachment {
  file: File
  previewUrl: string | null   // data URL for images, null for other files
  id: string
}

interface Props {
  attachments: PendingAttachment[]
  onChange: (attachments: PendingAttachment[]) => void
  disabled?: boolean
}

const ACCEPT = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx'
const MAX_FILE_SIZE_MB = 20

function isImage(file: File) {
  return file.type.startsWith('image/')
}

export function AttachmentsUpload({ attachments, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(files: FileList | null) {
    if (!files) return
    const newItems: PendingAttachment[] = []
    Array.from(files).forEach((file) => {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) return // skip oversized
      const id = crypto.randomUUID()
      if (isImage(file)) {
        const reader = new FileReader()
        reader.onload = (e) => {
          onChange([...attachments, ...newItems, {
            file,
            previewUrl: e.target?.result as string,
            id,
          }])
        }
        reader.readAsDataURL(file)
      } else {
        newItems.push({ file, previewUrl: null, id })
      }
    })
    // For non-image files push immediately
    if (newItems.length) onChange([...attachments, ...newItems])
  }

  function remove(id: string) {
    onChange(attachments.filter((a) => a.id !== id))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="space-y-2">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-slate-200 px-4 py-4 text-sm text-slate-400 transition-colors hover:border-orange-300 hover:bg-orange-50/40 hover:text-orange-500',
          disabled && 'pointer-events-none opacity-50'
        )}
      >
        <Paperclip className="h-5 w-5" />
        <span>Drop files or click to attach</span>
        <span className="text-xs">Images, PDF, Word, Excel · max {MAX_FILE_SIZE_MB}MB each</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={disabled}
        />
      </div>

      {/* Preview grid */}
      {attachments.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {attachments.map((item) => (
            <div key={item.id} className="group relative rounded-md border border-slate-200 bg-slate-50 overflow-hidden">
              {item.previewUrl ? (
                // Image preview
                <img
                  src={item.previewUrl}
                  alt={item.file.name}
                  className="h-20 w-full object-cover"
                />
              ) : (
                // File icon
                <div className="flex h-20 flex-col items-center justify-center gap-1 px-1">
                  {item.file.type.includes('pdf') ? (
                    <FileText className="h-7 w-7 text-red-400" />
                  ) : (
                    <ImageIcon className="h-7 w-7 text-slate-400" />
                  )}
                  <span className="w-full truncate text-center text-[10px] text-slate-500 px-1">
                    {item.file.name}
                  </span>
                </div>
              )}
              {/* Remove button */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(item.id) }}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
              {/* Filename tooltip on images */}
              {item.previewUrl && (
                <div className="absolute bottom-0 left-0 right-0 truncate bg-black/50 px-1 py-0.5 text-[9px] text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  {item.file.name}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
