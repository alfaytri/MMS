'use client'

import { FileText, Download } from 'lucide-react'

interface Props {
  url: string | null
  type: string | null
  name: string | null
}

export function AttachmentRenderer({ url, type, name }: Props) {
  // Empty URL = placeholder for attachments Wati doesn't return URLs for (e.g. broadcast docs)
  if (url === '') {
    return (
      <div className="flex items-center gap-1.5 mt-1 px-2 py-1.5 rounded bg-muted/40 border border-dashed border-border/60 text-xs text-muted-foreground/60 cursor-default">
        <FileText className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="truncate max-w-[160px]">{name ?? 'document'}</span>
        <span className="ml-auto text-[10px] opacity-60 whitespace-nowrap">URL not available</span>
      </div>
    )
  }
  if (!url) return null

  const mime = type ?? ''
  const isImage = mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|sticker)$/i.test(url)
  const isVideo = mime.startsWith('video/') || /\.(mp4|mov|avi|webm)$/i.test(url)
  const isAudio = mime.startsWith('audio/') || /\.(ogg|mp3|m4a|aac|wav|opus)$/i.test(url)

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-1">
        <img
          src={url}
          alt={name ?? 'image'}
          className="max-w-[200px] max-h-[160px] rounded-md object-cover border border-border/50"
          onError={(e) => {
            // fallback to download link if image fails to load
            const el = e.currentTarget.parentElement!
            el.innerHTML = `<span class="text-xs opacity-60">[image unavailable]</span>`
          }}
        />
      </a>
    )
  }

  if (isVideo) {
    return (
      <div className="mt-1">
        <video
          src={url}
          controls
          className="max-w-[220px] max-h-[160px] rounded-md border border-border/50"
          preload="metadata"
        >
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs underline">
            {name ?? 'video'}
          </a>
        </video>
      </div>
    )
  }

  if (isAudio) {
    return (
      <div className="mt-1">
        <audio
          src={url}
          controls
          className="h-8 max-w-[220px]"
          preload="metadata"
        />
      </div>
    )
  }

  // Document / generic file
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 mt-1 px-2 py-1.5 rounded bg-muted/60 border border-border/50 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      <FileText className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="truncate max-w-[160px]">{name ?? 'attachment'}</span>
      <Download className="h-3 w-3 flex-shrink-0 ml-auto opacity-60" />
    </a>
  )
}
