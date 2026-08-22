'use client'

import type { ChatMessage } from '@/types/contact-center'

interface Props {
  message: ChatMessage
}

export function SystemEventBubble({ message }: Props) {
  const text = (message.text ?? '').trim()
  if (!text) return null

  return (
    <div className="flex items-center gap-2 my-1.5 px-1">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[10px] text-muted-foreground italic text-center max-w-[70%] whitespace-pre-wrap leading-tight">
        {text}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}
