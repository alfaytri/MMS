// src/app/(dashboard)/quotations/[id]/edit/page.tsx
'use client'
import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { QuotationFormPanel } from '@/components/quotations/QuotationFormPanel'
import { QuotationPdfPreviewIframe } from '@/components/quotations/QuotationPdfPreviewIframe'
import { useCreateQuotation, WindowClosedError } from '@/hooks/useCreateQuotation'
import { useQuotationDetail } from '@/hooks/useQuotationDetail'
import { useUserCompanyDivisions } from '@/hooks/useUserCompanyDivisions'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import type { QuotationDetail, QuotationDraft } from '@/types/quotations'

export default function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: q, isLoading } = useQuotationDetail(id)

  if (isLoading || !q) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  return <EditQuotationClient quotationRowId={id} detail={q} />
}

function detailToDraft(q: QuotationDetail): QuotationDraft {
  return {
    quotationId:   q.quotation_id,
    customerId:    q.customer_id,
    phoneId:       '',
    customerName:  q.customer_name,
    phone:         q.customer_phone,
    division:      q.division,
    services: q.line_items.map((li) => ({
      serviceId: li.service_id ?? '',
      name:      li.name,
      path:      li.path,
      qty:       li.qty,
      price:     li.price,
      duration:  li.duration,
      division:  q.division,
    })),
    notes:         q.notes ?? '',
    discountType:  q.discount_type ?? 'flat',
    discountValue: q.discount_value ?? 0,
  }
}

function EditQuotationClient({
  quotationRowId,
  detail,
}: {
  quotationRowId: string
  detail: QuotationDetail
}) {
  const router = useRouter()

  const [, setSendStatus] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)

  const { data: divisions = [] } = useUserCompanyDivisions()
  const { data: profile } = useCurrentUserProfile()

  const initialDraft = detailToDraft(detail)

  const {
    draft,
    setCustomer,
    setDivision,
    addService,
    removeService,
    updateQty,
    update,
    setDiscountType,
    setDiscountValue,
    isValid,
    saveDraft,
    sendViaWati,
    sendViaWhapi,
    subtotal,
    discountAmount,
    total,
  } = useCreateQuotation(initialDraft)

  const creatorName = profile
    ? `${profile.title ?? 'Mr.'} ${profile.full_name}`
    : null

  async function handleSaveDraft() {
    try {
      await saveDraft.mutateAsync()
      toast.success('Quotation updated')
      router.push(`/quotations/${quotationRowId}`)
    } catch {
      toast.error('Failed to save quotation')
    }
  }

  async function handleSendWati() {
    setIsSending(true)
    setSendStatus('Saving quotation…')
    try {
      setSendStatus('Generating PDF…')
      setSendStatus('Sending via Wati…')
      await sendViaWati.mutateAsync()
      toast.success('Quotation sent via Wati (PDF)')
      router.push(`/quotations/${quotationRowId}`)
    } catch (err) {
      if (err instanceof WindowClosedError) {
        toast.info('Wati window closed — sending via WHAPI instead')
        setSendStatus('Window closed. Sending via WHAPI…')
        try {
          await handleWhapiSend()
        } catch {
          toast.error('WHAPI fallback failed')
        }
      } else {
        toast.error('Failed to send via Wati')
      }
    } finally {
      setIsSending(false)
      setSendStatus(null)
    }
  }

  async function handleSendWhapi() {
    setIsSending(true)
    try {
      await handleWhapiSend()
    } catch {
      toast.error('Failed to send via WHAPI')
    } finally {
      setIsSending(false)
      setSendStatus(null)
    }
  }

  async function handleWhapiSend() {
    setSendStatus('Generating PDF…')
    setSendStatus('Sending via WHAPI…')
    await sendViaWhapi.mutateAsync()
    toast.success('Quotation sent via WHAPI (PDF)')
    router.push(`/quotations/${quotationRowId}`)
  }

  return (
    <div className="flex flex-col overflow-hidden md:h-[calc(100vh-56px)] md:flex-row">
      <QuotationFormPanel
        draft={draft}
        divisions={divisions}
        onDivisionChange={setDivision}
        onCustomerSelect={setCustomer}
        onAddService={addService}
        onRemoveService={removeService}
        onUpdateQty={updateQty}
        onNotesChange={(notes) => update({ notes })}
        onSaveDraft={handleSaveDraft}
        onSend={(channel) => (channel === 'wati' ? handleSendWati() : handleSendWhapi())}
        isSaving={saveDraft.isPending}
        isSending={isSending}
        isValid={isValid()}
        discountType={draft.discountType}
        discountValue={draft.discountValue}
        onDiscountTypeChange={setDiscountType}
        onDiscountValueChange={setDiscountValue}
        subtotal={subtotal}
        discountAmount={discountAmount}
        total={total}
      />

      <div className="flex-1 overflow-hidden">
        <QuotationPdfPreviewIframe
          draft={draft}
          subtotal={subtotal}
          discountAmount={discountAmount}
          total={total}
          creatorName={creatorName}
        />
      </div>
    </div>
  )
}
