'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { QuotationFormPanel } from '@/components/quotations/QuotationFormPanel'
import { QuotationPdfPreviewIframe } from '@/components/quotations/QuotationPdfPreviewIframe'
import { useCreateQuotation, WindowClosedError } from '@/hooks/useCreateQuotation'
import { useUserCompanyDivisions } from '@/hooks/useUserCompanyDivisions'
import { useCurrentUserProfile } from '@/hooks/useProfiles'

export default function CreateQuotationPage() {
  const router = useRouter()

  const [, setSendStatus] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)

  const { data: divisions = [] } = useUserCompanyDivisions()
  const { data: profile } = useCurrentUserProfile()

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
  } = useCreateQuotation()

  const creatorName = profile
    ? `${profile.title ?? 'Mr.'} ${profile.full_name}`
    : null

  async function handleSaveDraft() {
    try {
      await saveDraft.mutateAsync()
      toast.success('Quotation saved as draft')
      router.push('/quotations')
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
      router.push('/quotations')
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
    router.push('/quotations')
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
