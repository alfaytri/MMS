'use client'

import { Loader2, FileText } from 'lucide-react'
import { useCCTranscript } from '@/hooks/contact-center/useCCMonitoring'

function AttachmentView({ att }: { att: { url: string; type: string; name: string } }) {
  const type = att.type ?? ''
  const name = att.name || 'file'
  if (!att.url) {
    return <span className="text-[11px] italic text-muted-foreground">[{name} — no link]</span>
  }
  if (type.startsWith('image/')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={att.url} alt={name} className="max-w-[220px] rounded-md border border-border" />
  }
  if (type.startsWith('audio/')) {
    return <audio src={att.url} controls className="max-w-[240px]" />
  }
  if (type.startsWith('video/')) {
    return <video src={att.url} controls className="max-w-[240px] rounded-md" />
  }
  return (
    <a
      href={att.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-xs text-blue-600 underline dark:text-blue-400"
    >
      <FileText className="h-3.5 w-3.5" />
      {name}
    </a>
  )
}

export function TranscriptViewer({ conversationId }: { conversationId: string | null }) {
  const { data: rows, isLoading, isError } = useCCTranscript(conversationId)

  if (!conversationId) return null
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }
  if (isError) {
    return <div className="py-10 text-center text-sm text-destructive">Could not load this conversation.</div>
  }
  const messages = rows ?? []
  if (messages.length === 0) {
    return <div className="py-10 text-center text-sm text-muted-foreground">No messages recorded.</div>
  }

  return (
    <div className="space-y-3">
      {messages.map((m) => {
        const isAgent = m.from_type === 'agent'
        return (
          <div key={m.id} className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[82%] rounded-lg px-3 py-2 ${isAgent ? 'bg-primary/10' : 'bg-muted'}`}>
              <div className="mb-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground/80">
                  {isAgent ? (m.agent_name || 'Agent') : 'Customer'}
                </span>
                <span>{new Date(m.created_at).toLocaleString('en-QA')}</span>
              </div>
              {m.text && <div className="whitespace-pre-wrap break-words text-sm">{m.text}</div>}
              {m.attachments && m.attachments.length > 0 && (
                <div className="mt-1.5 space-y-1.5">
                  {m.attachments.map((att, i) => <AttachmentView key={i} att={att} />)}
                </div>
              )}
              {m.reactions && m.reactions.length > 0 && (
                <div className="mt-1 text-sm">{m.reactions.map((r) => r.emoji).join(' ')}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
