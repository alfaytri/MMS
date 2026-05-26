'use client'

import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSendWati: () => void
  onSendWhapi: () => void
  isSending: boolean
  sendStatus: string | null
}

export function WhatsAppSendDialog({
  open,
  onOpenChange,
  onSendWati,
  onSendWhapi,
  isSending,
  sendStatus,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isSending) onOpenChange(v) }}>
      <DialogContent
        className="w-full max-w-sm rounded-none sm:rounded-lg"
        onInteractOutside={(e) => { if (isSending) e.preventDefault() }}
        onEscapeKeyDown={(e) => { if (isSending) e.preventDefault() }}
      >
        <DialogHeader>
          <DialogTitle>Send Quotation via WhatsApp</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            WHAPI sends the quotation as a PDF document. Wati sends as a text message.
          </DialogDescription>
        </DialogHeader>

        {isSending ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            <p className="text-sm text-slate-600 text-center">{sendStatus ?? 'Sending…'}</p>
          </div>
        ) : (
          <div className="space-y-2 py-2">
            <Button
              className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white min-h-11"
              onClick={onSendWati}
            >
              Send via Wati (Text)
            </Button>
            <Button
              className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white min-h-11"
              onClick={onSendWhapi}
            >
              Send via WHAPI (PDF)
            </Button>
            <Button
              variant="ghost"
              className="w-full min-h-11"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
