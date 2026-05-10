'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { QuotationFormPanel } from '@/components/quotations/QuotationFormPanel'
import { QuotationPdfPreview } from '@/components/quotations/QuotationPdfPreview'
import { CustomerHistoryPanel } from '@/components/orders/CustomerHistoryPanel'
import { useCreateQuotation } from '@/hooks/useCreateQuotation'

export default function CreateQuotationPage() {
  const router = useRouter()
  const [windowClosed, setWindowClosed] = useState(false)

  const {
    draft,
    setCustomer,
    addService,
    removeService,
    updateQty,
    update,
    isValid,
    saveDraft,
    sendViaWhatsApp,
    total,
  } = useCreateQuotation()

  async function handleSaveDraft() {
    try {
      await saveDraft.mutateAsync()
      toast.success('Quotation saved as draft')
      router.push('/quotations')
    } catch {
      toast.error('Failed to save quotation')
    }
  }

  async function handleSendWhatsApp() {
    setWindowClosed(false)
    try {
      const result = await sendViaWhatsApp.mutateAsync()
      if (result?.windowClosed) {
        setWindowClosed(true)
        return
      }
      toast.success('Quotation sent via WhatsApp')
      router.push('/quotations')
    } catch {
      toast.error('Failed to send quotation')
    }
  }

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden sm:flex-row">
      <QuotationFormPanel
        draft={draft}
        onCustomerSelect={setCustomer}
        onAddService={addService}
        onRemoveService={removeService}
        onUpdateQty={updateQty}
        onNotesChange={(notes) => update({ notes })}
        onSaveDraft={handleSaveDraft}
        onSendWhatsApp={handleSendWhatsApp}
        isSaving={saveDraft.isPending}
        isSending={sendViaWhatsApp.isPending}
        isValid={isValid()}
        whatsAppWindowClosed={windowClosed}
      />

      <div className="flex-1 overflow-hidden">
        <QuotationPdfPreview draft={draft} total={total} />
      </div>

      <CustomerHistoryPanel
        customerId={draft.customerId || null}
        onViewOrder={(id) => window.open(`/orders/${id}`, '_blank')}
        onCreateBackwork={(id) => window.open(`/orders/create-backwork?from=${id}`, '_blank')}
      />
    </div>
  )
}
