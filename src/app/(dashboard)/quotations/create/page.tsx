'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { QuotationFormPanel } from '@/components/quotations/QuotationFormPanel'
import { QuotationPdfPreview } from '@/components/quotations/QuotationPdfPreview'
import { CustomerHistoryPanel } from '@/components/orders/CustomerHistoryPanel'
import { WhatsAppSendDialog } from '@/components/quotations/WhatsAppSendDialog'
import { useCreateQuotation, WindowClosedError } from '@/hooks/useCreateQuotation'
import { useUserCompanyDivisions } from '@/hooks/useUserCompanyDivisions'
import { useCurrentUserProfile } from '@/hooks/useProfiles'

export default function CreateQuotationPage() {
  const router = useRouter()
  const pdfRef = useRef<HTMLDivElement>(null)
  const hiddenPdfRef = useRef<HTMLDivElement>(null)

  const [sendDialogOpen, setSendDialogOpen] = useState(false)
  const [sendStatus, setSendStatus] = useState<string | null>(null)
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

  // title column exists in DB but may not be in generated types yet
  const creatorName = profile
    ? `${(profile as any).title ?? 'Mr.'} ${profile.full_name}`
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

  function getPdfElement(): HTMLElement {
    // Prefer the hidden render target (fixed A4 width, always fully rendered)
    return hiddenPdfRef.current ?? pdfRef.current!
  }

  async function handleSendWati() {
    setIsSending(true)
    setSendStatus('Saving quotation…')
    try {
      setSendStatus('Generating PDF…')
      const el = getPdfElement()
      await new Promise((r) => setTimeout(r, 50))
      setSendStatus('Sending via Wati…')
      await sendViaWati.mutateAsync(el)
      toast.success('Quotation sent via Wati (PDF)')
      setSendDialogOpen(false)
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
    const el = getPdfElement()
    setSendStatus('Uploading PDF…')
    // Small delay to allow status text to render
    await new Promise((r) => setTimeout(r, 50))
    setSendStatus('Sending via WHAPI…')
    await sendViaWhapi.mutateAsync(el)
    toast.success('Quotation sent via WHAPI (PDF)')
    setSendDialogOpen(false)
    router.push('/quotations')
  }

  return (
    <>
      <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden sm:flex-row">
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
          onSendWhatsApp={() => setSendDialogOpen(true)}
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
          <QuotationPdfPreview
            ref={pdfRef}
            draft={draft}
            total={total}
            discountType={draft.discountType}
            discountValue={draft.discountValue}
            subtotal={subtotal}
            discountAmount={discountAmount}
            creatorName={creatorName}
          />
        </div>

        <CustomerHistoryPanel
          customerId={draft.customerId || null}
          onViewOrder={(id) => window.open(`/orders/${id}`, '_blank')}
          onCreateBackwork={(id) => window.open(`/orders/create-backwork?from=${id}`, '_blank')}
        />
      </div>

      {/* Hidden off-screen PDF render target for consistent capture.
          IMPORTANT: This must remain mounted at ALL times — including while
          isSending is true — because capturePdfBlob reads from this ref.
          Never conditionally render this based on loading/sending state. */}
      <div
        className="fixed"
        style={{ left: '-9999px', top: 0, width: '794px' }}
        aria-hidden="true"
      >
        <QuotationPdfPreview
          ref={hiddenPdfRef}
          draft={draft}
          total={total}
          discountType={draft.discountType}
          discountValue={draft.discountValue}
          subtotal={subtotal}
          discountAmount={discountAmount}
          creatorName={creatorName}
        />
      </div>

      <WhatsAppSendDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        onSendWati={handleSendWati}
        onSendWhapi={handleSendWhapi}
        isSending={isSending}
        sendStatus={sendStatus}
      />
    </>
  )
}
