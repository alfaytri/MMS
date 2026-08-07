// src/components/purchase/BillAttachmentsList.tsx
'use client'

import { useState } from 'react'
import { Download, Eye, Trash2, FileText, Image as ImageIcon, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  useBillAttachments, useDeleteBillAttachment, getBillAttachmentSignedUrl,
  type BillAttachment,
} from '@/hooks/useSupplierBills'
import { useHasPermission } from '@/hooks/usePermissions'
import { formatDate } from '@/lib/utils/formatters'

type Props = { billId: string }

function humanSize(bytes: number | null) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(mime: string | null) {
  if (mime?.startsWith('image/')) return <ImageIcon className="h-4 w-4 text-blue-600 shrink-0" />
  return <FileText className="h-4 w-4 text-red-600 shrink-0" />
}

export function BillAttachmentsList({ billId }: Props) {
  const { data: attachments = [], isLoading } = useBillAttachments(billId)
  const canManage = useHasPermission('purchase.bills.manage')
  const deleteAttachment = useDeleteBillAttachment()
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<BillAttachment | null>(null)

  async function openSigned(a: BillAttachment, mode: 'view' | 'download') {
    try {
      setOpeningId(a.id)
      const url = await getBillAttachmentSignedUrl(a.storage_key)
      if (mode === 'download') {
        const link = document.createElement('a')
        link.href = url
        link.download = a.file_name
        link.rel = 'noopener'
        document.body.appendChild(link)
        link.click()
        link.remove()
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Could not open attachment')
    } finally {
      setOpeningId(null)
    }
  }

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground italic flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading attachments…
      </p>
    )
  }

  if (attachments.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No attachments</p>
  }

  return (
    <>
      <ul className="divide-y rounded-md border">
        {attachments.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-3 px-3 py-2 min-h-11"
          >
            {fileIcon(a.mime_type)}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{a.file_name}</p>
              <p className="text-[11px] text-muted-foreground">
                {humanSize(a.size_bytes)}
                {a.uploaded_at && ` · ${formatDate(a.uploaded_at)}`}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs"
              disabled={openingId === a.id}
              onClick={() => openSigned(a, 'view')}
            >
              <Eye className="h-3.5 w-3.5" />
              View
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs"
              disabled={openingId === a.id}
              onClick={() => openSigned(a, 'download')}
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
            {canManage && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setPendingDelete(a)}
                aria-label={`Delete ${a.file_name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </li>
        ))}
      </ul>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(v) => { if (!v) setPendingDelete(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete attachment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{' '}
              <span className="font-medium">{pendingDelete?.file_name}</span>{' '}
              from this bill. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingDelete) return
                try {
                  await deleteAttachment.mutateAsync({
                    id: pendingDelete.id,
                    storage_key: pendingDelete.storage_key,
                    bill_id: pendingDelete.bill_id,
                  })
                  toast.success('Attachment deleted')
                } catch (err: unknown) {
                  toast.error((err as Error).message ?? 'Delete failed')
                } finally {
                  setPendingDelete(null)
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
