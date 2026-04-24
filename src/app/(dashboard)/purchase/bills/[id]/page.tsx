'use client'

import { useState, useEffect, Suspense } from 'react'
import { useParams, useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBillViewModel, useBillsByPO } from '@/hooks/useSupplierBills'
import { useDivisions } from '@/hooks/useDivisions'
import { BillDetailSidebar } from '@/components/purchase/BillDetailSidebar'
import { BillDetailDocument } from '@/components/purchase/BillDetailDocument'

type ToggleKey = 'showReceival' | 'showPaymentPlan' | 'showNotes' | 'showQR'

function BillDetailContent() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function getParam(key: string): boolean {
    const val = searchParams.get(key)
    return val === null ? true : val !== 'false'
  }

  const [showReceival, setShowReceival] = useState(() => getParam('showReceival'))
  const [showPaymentPlan, setShowPaymentPlan] = useState(() => getParam('showPaymentPlan'))
  const [showNotes, setShowNotes] = useState(() => getParam('showNotes'))
  const [showQR, setShowQR] = useState(() => getParam('showQR'))
  const [selectedDivisionId, setSelectedDivisionId] = useState('')

  function handleToggle(key: ToggleKey, value: boolean) {
    const setters: Record<ToggleKey, (v: boolean) => void> = {
      showReceival: setShowReceival,
      showPaymentPlan: setShowPaymentPlan,
      showNotes: setShowNotes,
      showQR: setShowQR,
    }
    setters[key](value)
    const p = new URLSearchParams(searchParams.toString())
    if (value) {
      p.delete(key)
    } else {
      p.set(key, 'false')
    }
    const qs = p.toString()
    router.replace(`${pathname}${qs ? '?' + qs : ''}`, { scroll: false })
  }

  const { data: viewModel, isLoading, isError } = useBillViewModel(id)
  const { data: divisions = [] } = useDivisions()
  const { data: relatedBills = [] } = useBillsByPO(
    viewModel?.bill.purchase_order_id ?? null
  )

  useEffect(() => {
    if (divisions.length > 0 && !selectedDivisionId) {
      setSelectedDivisionId(divisions[0].id)
    }
  }, [divisions, selectedDivisionId])

  const selectedDivision = divisions.find((d) => d.id === selectedDivisionId) ?? null

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

  const { bill, receival, paymentPlan } = viewModel

  return (
    <div className="flex min-h-screen">
      <BillDetailSidebar
        divisions={divisions}
        selectedDivisionId={selectedDivisionId}
        onDivisionChange={setSelectedDivisionId}
        showReceival={showReceival}
        showPaymentPlan={showPaymentPlan}
        showNotes={showNotes}
        showQR={showQR}
        onToggle={handleToggle}
        hasReceival={!!receival}
        hasPaymentPlan={!!paymentPlan}
        hasNotes={!!bill.notes}
      />
      <div className="flex-1 overflow-auto bg-muted/30 p-8">
        <Button
          variant="ghost"
          size="sm"
          className="mb-6 print:hidden"
          onClick={() => router.push('/purchase/bills')}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Bills
        </Button>
        <BillDetailDocument
          viewModel={viewModel}
          division={selectedDivision}
          showReceival={showReceival}
          showPaymentPlan={showPaymentPlan}
          showNotes={showNotes}
          showQR={showQR}
          relatedBills={relatedBills}
          currentBillId={id}
          onNavigate={(billId) => router.push(`/purchase/bills/${billId}`)}
        />
      </div>
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
