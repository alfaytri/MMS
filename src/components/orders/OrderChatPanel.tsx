'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Send, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  BillAttachmentPicker,
  type BillAttachmentPickerHandle,
  type BillAttachmentUpload,
} from '@/components/purchase/BillAttachmentPicker'
import {
  useOrderChat, useSendOrderMessage, getOrderChatAttachmentSignedUrl,
  type OrderKind, type OrderChatAttachment,
} from '@/hooks/useOrderChat'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { messageSide } from '@/lib/orders/messageSide'
import { cn } from '@/lib/utils'

export function OrderChatPanel({ kind, orderId }: { kind: OrderKind; orderId: string | null }) {
  const { data: messages = [], isLoading } = useOrderChat(kind, orderId)
  const { data: profile } = useCurrentUserProfile()
  const send = useSendOrderMessage()
  const [body, setBody] = useState('')
  const [uploads, setUploads] = useState<BillAttachmentUpload[]>([])
  const pickerRef = useRef<BillAttachmentPickerHandle>(null)
  const myId = profile?.id ?? null

  async function openAttachment(a: OrderChatAttachment) {
    try {
      const url = await getOrderChatAttachmentSignedUrl(a.storage_key)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error((err as Error).message ?? 'Could not open attachment')
    }
  }

  async function handleSend() {
    if (!orderId) return
    if (!body.trim() && uploads.length === 0) return
    try {
      await send.mutateAsync({ kind, orderId, body: body.trim(), attachments: uploads })
      setBody('')
      setUploads([])
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to send message')
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto space-y-3 p-1">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">No messages yet. Start the discussion.</p>
        ) : (
          messages.map((m) => {
            const side = messageSide(m.author_id, myId)
            return (
              <div
                key={m.id}
                className={cn('flex max-w-[80%] flex-col', side === 'right' ? 'ml-auto items-end' : 'mr-auto items-start')}
              >
                <div className="mb-0.5 text-[11px] text-muted-foreground">
                  {m.author_name ?? 'Unknown'} · {new Date(m.created_at).toLocaleString('en-GB')}
                </div>
                <div
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words',
                    side === 'right' ? 'bg-primary text-primary-foreground' : 'bg-muted',
                  )}
                >
                  {m.body && <p>{m.body}</p>}
                  {m.attachments.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => openAttachment(a)}
                      className="mt-1 flex items-center gap-1 text-xs underline"
                    >
                      <FileText className="h-3 w-3" /> {a.file_name}
                    </button>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t pt-2">
        <BillAttachmentPicker
          ref={pickerRef}
          uploads={uploads}
          onChange={setUploads}
          bucket="order-chat-attachments"
          label="Attachments"
          addLabel="Attach files"
          disabled={send.isPending}
        />
        <div className="flex items-end gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Write a message…"
            className="flex-1 resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={send.isPending || (!body.trim() && uploads.length === 0)}
          >
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
