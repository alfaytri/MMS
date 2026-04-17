'use client'

import { useParams } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { usePurchaseOrder } from '@/hooks/usePurchaseOrders'

export default function EditPOPage() {
  const { id } = useParams<{ id: string }>()
  const { data: po, isLoading } = usePurchaseOrder(id)

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!po) return <div className="text-muted-foreground p-8 text-center">PO not found</div>

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">Edit {po.po_number}</h1>
      <p className="text-muted-foreground">Edit form coming soon — currently only draft POs can be edited.</p>
    </div>
  )
}
