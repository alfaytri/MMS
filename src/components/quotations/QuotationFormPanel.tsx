// src/components/quotations/QuotationFormPanel.tsx
'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { PhoneLookupModal } from '@/components/orders/PhoneLookupModal'
import { ServiceSelector } from '@/components/orders/ServiceSelector'
import { SelectedServiceCard } from '@/components/orders/SelectedServiceCard'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Send, Save, User } from 'lucide-react'
import type { QuotationDraft } from '@/types/quotations'
import type { CustomerLookupResult } from '@/hooks/useCustomerLookup'
import type { OrderServiceDraft } from '@/types/orders'
import type { DivisionOption } from '@/hooks/useUserCompanyDivisions'

interface Props {
  draft: QuotationDraft
  divisions: DivisionOption[]
  onDivisionChange: (slug: string) => void
  onCustomerSelect: (result: CustomerLookupResult) => void
  onAddService: (service: OrderServiceDraft) => void
  onRemoveService: (serviceId: string) => void
  onUpdateQty: (serviceId: string, qty: number) => void
  onNotesChange: (notes: string) => void
  onSaveDraft: () => void
  onSendWhatsApp: () => void
  isSaving: boolean
  isSending: boolean
  isValid: boolean
  // Discount
  discountType: 'flat' | 'percent'
  discountValue: number
  onDiscountTypeChange: (type: 'flat' | 'percent') => void
  onDiscountValueChange: (value: number) => void
  subtotal: number
  discountAmount: number
  total: number
}

export function QuotationFormPanel({
  draft,
  divisions,
  onDivisionChange,
  onCustomerSelect,
  onAddService,
  onRemoveService,
  onUpdateQty,
  onNotesChange,
  onSaveDraft,
  onSendWhatsApp,
  isSaving,
  isSending,
  isValid,
  discountType,
  discountValue,
  onDiscountTypeChange,
  onDiscountValueChange,
  subtotal,
  discountAmount,
  total,
}: Props) {
  const [lookupOpen, setLookupOpen] = useState(!draft.customerId)

  // Re-open modal if customer is cleared (e.g. new quotation in same session)
  useEffect(() => {
    if (!draft.customerId) setLookupOpen(true)
  }, [draft.customerId])

  const hasCustomer = !!draft.customerId

  return (
    <>
      <PhoneLookupModal
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        onConfirm={(result) => {
          onCustomerSelect(result)
          setLookupOpen(false)
        }}
      />

      <div className="flex h-full w-full flex-col border-r bg-white sm:w-[340px] shrink-0">
        {/* Customer header */}
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              {hasCustomer ? (
                <>
                  <p className="truncate font-semibold text-slate-900 text-sm">
                    {draft.customerName}
                  </p>
                  <p className="truncate text-xs text-slate-500">{draft.phone}</p>
                </>
              ) : (
                <p className="text-sm text-slate-400 italic">No customer selected</p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 gap-1.5 text-xs h-8 min-h-[44px] sm:min-h-0"
              onClick={() => setLookupOpen(true)}
            >
              <User className="h-3 w-3" />
              {hasCustomer ? 'Change' : 'Select Customer'}
            </Button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Division selector */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Division
            </Label>
            <Select
              value={draft.division || null}
              onValueChange={(v) => v && onDivisionChange(v)}
            >
              <SelectTrigger className="h-9 w-full text-sm min-h-[44px] sm:min-h-0">
                <SelectValue placeholder="Select division…" />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {divisions.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-400">No divisions found</div>
                ) : (
                  divisions.map((d) => (
                    <SelectItem key={d.id} value={d.slug}>
                      {d.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Service tree browser */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Services
            </Label>
            <ServiceSelector
              onAdd={onAddService}
              divisionFilters={draft.division ? [draft.division] : []}
            />
          </div>

          {/* Selected services */}
          {draft.services.length > 0 && (
            <div className="space-y-2">
              {draft.services.map((s, i) => (
                <SelectedServiceCard
                  key={`${s.serviceId}-${i}`}
                  service={{
                    serviceId: s.serviceId,
                    serviceName: s.name,
                    path: s.path,
                    qty: s.qty,
                    price: s.price,
                    duration: s.duration ?? 0,
                    fromTime: null,
                    toTime: null,
                  }}
                  onRemove={() => onRemoveService(s.serviceId)}
                  onQtyChange={(_serviceId, qty) => onUpdateQty(s.serviceId, qty)}
                  onTimeChange={() => {}}
                  hideTimeControls
                />
              ))}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Notes
            </Label>
            <Textarea
              placeholder="Optional notes for the customer…"
              className="resize-none text-sm min-h-[80px]"
              value={draft.notes}
              onChange={(e) => onNotesChange(e.target.value)}
            />
          </div>

          {/* Discount */}
          {draft.services.length > 0 && (
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Discount
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    step={discountType === 'percent' ? 1 : 0.01}
                    max={discountType === 'percent' ? 100 : undefined}
                    placeholder="0"
                    className="h-9 text-sm text-right flex-1 min-h-[44px] sm:min-h-0"
                    value={discountValue || ''}
                    onChange={(e) => onDiscountValueChange(Number(e.target.value) || 0)}
                  />
                  <div className="flex rounded-md border overflow-hidden shrink-0">
                    <button
                      type="button"
                      className={`px-3 py-1.5 text-xs font-medium transition-colors min-h-[36px] ${
                        discountType === 'flat'
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                      onClick={() => onDiscountTypeChange('flat')}
                    >
                      QAR
                    </button>
                    <button
                      type="button"
                      className={`px-3 py-1.5 text-xs font-medium transition-colors min-h-[36px] border-l ${
                        discountType === 'percent'
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                      onClick={() => onDiscountTypeChange('percent')}
                    >
                      %
                    </button>
                  </div>
                </div>
              </div>

              {/* Totals strip */}
              <div className="rounded-md bg-slate-50 p-2 space-y-0.5">
                {discountAmount > 0 && (
                  <>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>Subtotal</span>
                      <span>QAR {subtotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs text-red-500">
                      <span>
                        Discount{' '}
                        ({discountType === 'percent' ? `${discountValue}%` : `QAR ${discountValue}`})
                      </span>
                      <span>-QAR {discountAmount.toLocaleString()}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between">
                  <span className="text-xs font-semibold text-slate-900">Total</span>
                  <span className="font-semibold text-slate-900">
                    QAR {total.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-t px-4 py-3 space-y-2">
          <Button
            className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white min-h-11"
            onClick={onSendWhatsApp}
            disabled={!isValid || isSending || isSaving}
          >
            <Send className="h-4 w-4" />
            {isSending ? 'Sending…' : 'Send via WhatsApp'}
          </Button>
          <Button
            variant="outline"
            className="w-full gap-2 min-h-11"
            onClick={onSaveDraft}
            disabled={!isValid || isSaving || isSending}
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving…' : 'Save Draft'}
          </Button>
        </div>
      </div>
    </>
  )
}
