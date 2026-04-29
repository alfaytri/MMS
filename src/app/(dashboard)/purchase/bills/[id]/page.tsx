'use client'

import { useState, useEffect, Suspense } from 'react'
import { useParams, useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ArrowLeft, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBillViewModel, useBillsByPO } from '@/hooks/useSupplierBills'
import { useDivisionsByCompany } from '@/hooks/useDivisions'
import { useCompanies } from '@/hooks/useCompanies'
import { BillDetailSidebar } from '@/components/purchase/BillDetailSidebar'
import { BillDetailDocument } from '@/components/purchase/BillDetailDocument'
import { cn } from '@/lib/utils'

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
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [selectedDivisionId, setSelectedDivisionId] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
  const { data: companies = [] } = useCompanies()
  const { data: divisionsByCompany = [] } = useDivisionsByCompany(selectedCompanyId || null)
  const { data: relatedBills = [] } = useBillsByPO(
    viewModel?.bill.purchase_order_id ?? null
  )

  useEffect(() => {
    if (companies.length > 0 && !selectedCompanyId) {
      setSelectedCompanyId(companies[0].id)
    }
  }, [companies]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (divisionsByCompany.length > 0 && selectedCompanyId) {
      setSelectedDivisionId(divisionsByCompany[0].id)
    } else {
      setSelectedDivisionId('')
    }
  }, [divisionsByCompany, selectedCompanyId]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) ?? null
  const selectedDivision = divisionsByCompany.find((d) => d.id === selectedDivisionId) ?? null

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
      {/* Sidebar: always visible on lg+, overlay on mobile */}
      <>
        {/* Mobile overlay backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {/* Sidebar */}
        <div className={cn(
          'fixed inset-y-0 left-0 z-50 lg:static lg:z-auto transition-transform lg:transform-none',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}>
          <BillDetailSidebar
            companies={companies}
            selectedCompanyId={selectedCompanyId}
            onCompanyChange={setSelectedCompanyId}
            divisions={divisionsByCompany}
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
        </div>
      </>
      <div className="flex-1 overflow-auto bg-muted/30 p-4 lg:p-8">
        <div className="flex items-center gap-3 mb-4 lg:mb-6 print:hidden">
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Settings2 className="h-4 w-4 mr-1.5" />
            Options
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/purchase/bills')}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to Bills
          </Button>
        </div>
        <BillDetailDocument
          viewModel={viewModel}
          company={selectedCompany}
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
