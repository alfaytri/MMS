'use client'

import { useState, useEffect, Suspense } from 'react'
import { useParams, useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ArrowLeft, Link2, Send, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AttachInvoiceDialog } from '@/components/sales/AttachInvoiceDialog'
import { useUnlinkedIncomingPayments } from '@/hooks/useUnlinkedIncomingPayments'
import { useCustomerInvoice, useSendInvoice } from '@/hooks/useCustomerInvoices'
import { useCustomerPayments } from '@/hooks/useCustomerPayments'
import { usePaymentPlans } from '@/hooks/usePaymentPlans'
import { useCompanies } from '@/hooks/useCompanies'
import { useDivisionsByCompany } from '@/hooks/useDivisions'
import { InvoiceDetailDocument } from '@/components/sales/InvoiceDetailDocument'
import { CustomerPaymentDialog } from '@/components/sales/CustomerPaymentDialog'
import { PaymentPlanDialog, AR_LABELS } from '@/components/finance/PaymentPlanDialog'
import { InvoiceDetailSidebar, type InvoiceToggleKey } from '@/components/sales/InvoiceDetailSidebar'
import { cn } from '@/lib/utils'

function InvoiceDetailContent() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function getParam(key: string): boolean {
    const val = searchParams.get(key)
    return val === null ? true : val !== 'false'
  }

  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [selectedDivisionId, setSelectedDivisionId] = useState('')
  const [showNotes, setShowNotes] = useState(() => getParam('showNotes'))
  const [showQR, setShowQR] = useState(() => getParam('showQR'))
  const [showPaymentPlan, setShowPaymentPlan] = useState(() => getParam('showPaymentPlan'))
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)

  function handleToggle(key: InvoiceToggleKey, value: boolean) {
    const setters: Record<InvoiceToggleKey, (v: boolean) => void> = {
      showNotes: setShowNotes,
      showQR: setShowQR,
      showPaymentPlan: setShowPaymentPlan,
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

  const { data: invoice, isLoading, isError } = useCustomerInvoice(id)
  const { data: unlinkedPayments = [], isLoading: loadingUnlinked } = useUnlinkedIncomingPayments(
    invoice?.customer_id ?? ''
  )
  const hasUnlinkedPayments = unlinkedPayments.length > 0
  const { data: payments = [] } = useCustomerPayments(id)
  const { data: plans = [] } = usePaymentPlans(id)
  const { data: companies = [] } = useCompanies()
  const { data: divisionsByCompany = [] } = useDivisionsByCompany(selectedCompanyId || null)
  const sendInvoice = useSendInvoice()

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

  const selectedCompany   = companies.find((c) => c.id === selectedCompanyId) ?? null
  const selectedDivision  = divisionsByCompany.find((d) => d.id === selectedDivisionId) ?? null
  const totalPaid         = payments.reduce((s, p) => s + p.amount, 0)
  const outstanding       = (invoice?.total_amount ?? 0) - totalPaid
  const hasActivePlan     = plans.some((p) => p.status === 'active')

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground text-sm">
        Loading invoice…
      </div>
    )
  }

  if (isError || !invoice) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Invoice not found.</p>
        <Button variant="outline" size="sm" onClick={() => router.push('/sales/invoices')}>
          Back to Invoices
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen print:block print:min-h-0">
      {/* Sidebar */}
      <>
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <div className={cn(
          'fixed inset-y-0 left-0 z-50 lg:static lg:z-auto transition-transform lg:transform-none',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}>
          <InvoiceDetailSidebar
            companies={companies}
            selectedCompanyId={selectedCompanyId}
            onCompanyChange={setSelectedCompanyId}
            divisions={divisionsByCompany}
            selectedDivisionId={selectedDivisionId}
            onDivisionChange={setSelectedDivisionId}
            showNotes={showNotes}
            showQR={showQR}
            showPaymentPlan={showPaymentPlan}
            onToggle={handleToggle}
            hasNotes={!!invoice.notes}
            hasPaymentPlan={plans.some((p) => p.status === 'active')}
          />
        </div>
      </>

      {/* Main content */}
      <div className="flex-1 overflow-auto bg-muted/30 print:p-0 print:bg-white print:overflow-visible">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-3 bg-background border-b print:hidden flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Settings2 className="h-4 w-4 mr-1.5" />
            Options
          </Button>
          <Button variant="ghost" size="sm" onClick={() => router.push('/sales/invoices')}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>
          <div className="flex-1" />
          {invoice.doc_status === 'ready_to_send' && (
            <Button
              size="sm"
              disabled={sendInvoice.isPending}
              onClick={() => sendInvoice.mutate(invoice.id, {
                onSuccess: () => toast.success('Invoice marked as sent'),
                onError: () => toast.error('Failed to mark as sent'),
              })}
            >
              <Send className="h-4 w-4 mr-1.5" />
              {sendInvoice.isPending ? 'Sending…' : 'Send to Customer'}
            </Button>
          )}
          {outstanding > 0 && invoice.doc_status !== 'draft' && (
            <Button variant="outline" size="sm" onClick={() => setPayOpen(true)}>
              Record Payment
            </Button>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loadingUnlinked || !hasUnlinkedPayments}
                    onClick={() => setAttachOpen(true)}
                  >
                    <Link2 className="h-4 w-4 mr-1.5" />
                    Attach Payment
                  </Button>
                </span>
              </TooltipTrigger>
              {!hasUnlinkedPayments && (
                <TooltipContent>No unlinked payments for this customer</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          {invoice.payment_status !== 'paid' && (
            <Button variant="outline" size="sm" onClick={() => setPlanOpen(true)}>
              Payment Plan
            </Button>
          )}
        </div>

        {/* Document */}
        <div className="p-4 lg:p-8 print:p-0">
          <InvoiceDetailDocument
            invoice={invoice}
            payments={payments}
            company={selectedCompany}
            division={selectedDivision}
            plans={plans}
            showNotes={showNotes}
            showQR={showQR}
            showPaymentPlan={showPaymentPlan}
          />
        </div>
      </div>

      {payOpen && (
        <CustomerPaymentDialog
          open
          onOpenChange={setPayOpen}
          invoice={invoice}
          alreadyPaid={totalPaid}
          plans={plans}
        />
      )}
      {planOpen && (
        <PaymentPlanDialog
          open
          onOpenChange={setPlanOpen}
          invoiceId={invoice.id}
          outstanding={outstanding}
          labels={AR_LABELS}
        />
      )}
      {attachOpen && invoice && (
        <AttachInvoiceDialog
          open
          onOpenChange={setAttachOpen}
          invoiceId={invoice.id}
          customerId={invoice.customer_id}
          invoicePaid={invoice.payment_status === 'paid'}
        />
      )}
    </div>
  )
}

export default function InvoiceDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-muted-foreground text-sm">
          Loading…
        </div>
      }
    >
      <InvoiceDetailContent />
    </Suspense>
  )
}
