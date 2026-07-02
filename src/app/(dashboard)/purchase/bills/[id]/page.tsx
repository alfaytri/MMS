'use client'

import { Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBillViewModel, useBillsByPO } from '@/hooks/useSupplierBills'
import { BillDetailDocument } from '@/components/purchase/BillDetailDocument'

function BillDetailContent() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()

  const { data: viewModel, isLoading, isError } = useBillViewModel(id)
  const { data: relatedBills = [] } = useBillsByPO(
    viewModel?.bill.purchase_order_id ?? null
  )

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground text-sm">
        Loading bill…
      </div>
    )
  }

  if (isError || !viewModel) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Bill not found.</p>
        <Button variant="outline" size="sm" onClick={() => router.push('/purchase/bills')}>
          Back to Bills
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4 lg:p-8 print:p-0 print:bg-white">
      <div className="flex items-center gap-3 mb-4 lg:mb-6 print:hidden max-w-3xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/purchase/bills')}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back
        </Button>
      </div>
      <BillDetailDocument
        viewModel={viewModel}
        relatedBills={relatedBills}
        currentBillId={id}
        onNavigate={(billId) => router.push(`/purchase/bills/${billId}`)}
      />
    </div>
  )
}

export default function BillDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-muted-foreground text-sm">
          Loading…
        </div>
      }
    >
      <BillDetailContent />
    </Suspense>
  )
}
