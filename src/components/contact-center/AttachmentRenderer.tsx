'use client'

import { FileText, Download } from 'lucide-react'

function truncateFilename(name: string, max = 22): string {
  if (name.length <= max) return name
  const dot = name.lastIndexOf('.')
  if (dot > 0) {
    const ext  = name.slice(dot)           // e.g. ".pdf"
    const base = name.slice(0, dot)
    const keep = Math.max(max - ext.length - 1, 6)
    return `${base.slice(0, keep)}…${ext}`
  }
  return `${name.slice(0, max - 1)}…`
}

interface Props {
  url: string | null
  type: string | null
  name: string | null
  isAgent?: boolean
}

function downloadBlob(url: string, filename: string) {
  fetch(url)
    .then((r) => r.blob())
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename || 'file'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    })
    .catch(() => window.open(url, '_blank'))
}

export function AttachmentRenderer({ url, type, name, isAgent }: Props) {
  // Empty URL = WATI didn't return a URL (e.g. broadcast docs or undownloaded media)
  if (url === '') {
    return (
      <div className={`flex items-center gap-1.5 mt-1 px-2 py-1.5 rounded border border-dashed text-xs cursor-default ${
        isAgent
          ? 'bg-white/20 border-white/40 text-white/80'
          : 'bg-background border-border text-muted-foreground'
      }`}>
        <FileText className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
        <span className="font-medium">{truncateFilename(name ?? 'attachment')}</span>
        <span className="ml-auto text-[10px] whitespace-nowrap opacity-60">not available</span>
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
      <div className="relative group mt-1 inline-block">
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img
            src={url}
            alt={name ?? 'image'}
            className="max-w-[200px] max-h-[160px] rounded-md object-cover border border-border/50 block"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              const sibling = e.currentTarget.nextElementSibling as HTMLElement | null
              if (sibling) sibling.style.display = 'flex'
            }}
          />
          <div style={{ display: 'none' }} className="items-center gap-1.5 px-2 py-1.5 rounded border border-dashed text-xs text-muted-foreground border-border">
            <FileText className="h-3.5 w-3.5 opacity-70" />
            <span>{name ? truncateFilename(name) : 'image'}</span>
            <span className="opacity-60 text-[10px]">unavailable</span>
          </div>
        </a>
        {/* Download overlay */}
        <button
          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-black/70 rounded p-1"
          onClick={(e) => { e.preventDefault(); downloadBlob(url, name ?? 'image') }}
          title="Download image"
        >
          <Download className="h-3 w-3 text-white" />
        </button>
      </div>
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
      <div className={`mt-1 rounded-lg overflow-hidden ${
        isAgent ? '-mx-2 -mb-1 -mt-0.5' : '-mx-2 -mb-1 -mt-0.5'
      }`}>
        <audio
          src={url}
          controls
          className="h-10 w-[240px] max-w-full block"
          preload="metadata"
        />
      </div>
    )
  }

  // Document / generic file — programmatic download so the browser doesn't open text files inline
  return (
    <button
      type="button"
      onClick={() => downloadBlob(url, name ?? 'file')}
      className={`flex items-center gap-2 mt-1 w-full px-2.5 py-2 rounded-lg border text-xs transition-colors text-left ${
        isAgent
          ? 'bg-black/25 border-white/20 text-white hover:bg-black/35'
          : 'bg-background border-border text-foreground hover:bg-muted'
      }`}
      title={`Download ${name ?? 'file'}`}
    >
      <FileText className="h-4 w-4 flex-shrink-0 opacity-80" />
      <span className="font-medium">{truncateFilename(name ?? 'attachment')}</span>
      <Download className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
    </button>
  )
}
