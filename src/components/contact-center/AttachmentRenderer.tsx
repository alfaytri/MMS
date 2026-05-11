'use client'

import { FileText } from 'lucide-react'

interface Props {
  url: string | null
  type: string | null
  name: string | null
}

export function AttachmentRenderer({ url, type, name }: Props) {
  if (!url) return null

  const isImage = type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(url)

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-1">
        <img
          src={url}
          alt={name ?? 'attachment'}
          className="max-w-[180px] max-h-[120px] rounded-md object-cover border border-border"
        />
      </a>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 mt-1 px-2 py-1 rounded bg-muted text-xs text-muted-foreground hover:text-foreground"
    >
      <FileText className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="truncate max-w-[160px]">{name ?? 'attachment'}</span>
    </a>
  )
}
