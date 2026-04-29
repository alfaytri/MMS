'use client'

import { useState, useEffect, Suspense } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Printer, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useCustomerInvoice, useSendInvoice } from '@/hooks/useCustomerInvoices'
import { useCustomerPayments } from '@/hooks/useCustomerPayments'
import { usePaymentPlans } from '@/hooks/usePaymentPlans'
import { useCompanies } from '@/hooks/useCompanies'
import { useDivisionsByCompany } from '@/hooks/useDivisions'
import { InvoiceDetailDocument } from '@/components/sales/InvoiceDetailDocument'
import { CustomerPaymentDialog } from '@/components/sales/CustomerPaymentDialog'
import { PaymentPlanDialog } from '@/components/purchase/PaymentPlanDialog'
import { PAYMENT_PLAN_THRESHOLD } from '@/types/invoice'

function InvoiceDetailContent() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()

  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [selectedDivisionId, setSelectedDivisionId] = useState('')
  const [payOpen, setPayOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)

  const { data: invoice, isLoading, isError } = useCustomerInvoice(id)
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
    <div className="min-h-screen bg-muted/30 print:bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 bg-background border-b print:hidden flex-wrap">
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
            Pay Now
          </Button>
        )}
        {outstanding >= PAYMENT_PLAN_THRESHOLD && !hasActivePlan && (
          <Button variant="outline" size="sm" onClick={() => setPlanOpen(true)}>
            Payment Plan
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1.5" />
          Print
        </Button>
      </div>

      {/* Document */}
      <div className="p-4 lg:p-8 print:p-0">
        <InvoiceDetailDocument
          invoice={invoice}
          payments={payments}
          company={selectedCompany}
          division={selectedDivision}
        />
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
