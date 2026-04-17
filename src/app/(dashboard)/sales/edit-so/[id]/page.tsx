'use client'

import { useParams } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { useSaleOrder } from '@/hooks/useSaleOrders'

export default function EditSOPage() {
  const { id } = useParams<{ id: string }>()
  const { data: so, isLoading } = useSaleOrder(id)

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!so) return <div className="text-muted-foreground p-8 text-center">Sale order not found</div>

  // TODO: Render same form as create-so, pre-populated with so data.
  // Only quotation-status SOs can be edited.
  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">Edit {so.so_number}</h1>
      <p className="text-muted-foreground">Edit form coming soon — only quotation-status orders can be edited.</p>
    </div>
  )
}
