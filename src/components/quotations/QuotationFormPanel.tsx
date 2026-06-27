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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Send, Save, User, ChevronDown } from 'lucide-react'
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
  // Split-button: clicking the main button uses the default channel;
  // dropdown lets the user pick explicitly. We expose a single onSend
  // callback that takes the channel id.
  onSend: (channel: 'whapi' | 'wati') => void
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

// Default send channel. Wati is the business account — primary sender for
// customer-facing quotations. WHAPI remains as a personal-account fallback
// available from the dropdown.
const DEFAULT_SEND_CHANNEL: 'whapi' | 'wati' = 'wati'

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
  onSend,
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
                  <p className="truncate font-semibold text-foreground text-sm">
                    {draft.customerName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{draft.phone}</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground italic">No customer selected</p>
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
            <Label htmlFor="quot-form-division" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Division
            </Label>
            <Select
              value={draft.division || null}
              onValueChange={(v) => v && onDivisionChange(v)}
            >
              <SelectTrigger id="quot-form-division" className="h-9 w-full text-sm min-h-[44px] sm:min-h-0">
                <SelectValue placeholder="Select division…" />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {divisions.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No divisions found</div>
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
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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
            <Label htmlFor="quot-form-notes" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Notes
            </Label>
            <Textarea
              id="quot-form-notes"
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
                <Label htmlFor="quot-form-discount" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Discount
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="quot-form-discount"
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
                          : 'bg-white text-muted-foreground hover:bg-muted'
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
                          : 'bg-white text-muted-foreground hover:bg-muted'
                      }`}
                      onClick={() => onDiscountTypeChange('percent')}
                    >
                      %
                    </button>
                  </div>
                </div>
              </div>

              {/* Totals strip */}
              <div className="rounded-md bg-muted p-2 space-y-0.5">
                {discountAmount > 0 && (
                  <>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Subtotal</span>
                      <span>QAR {subtotal.toLocaleString('en-QA')}</span>
                    </div>
                    <div className="flex justify-between text-xs text-destructive">
                      <span>
                        Discount{' '}
                        ({discountType === 'percent' ? `${discountValue}%` : `QAR ${discountValue}`})
                      </span>
                      <span>-QAR {discountAmount.toLocaleString('en-QA')}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between">
                  <span className="text-xs font-semibold text-foreground">Total</span>
                  <span className="font-semibold text-foreground">
                    QAR {total.toLocaleString('en-QA')}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-t px-4 py-3 space-y-2">
          {/* Split-button: main click sends via the default channel, dropdown
              arrow lets the user override with the alternate channel. The
              chevron uses a thin left border to read as one connected control. */}
          <div className="flex w-full">
            <Button
              className="flex-1 gap-2 bg-green-600 hover:bg-green-700 text-white min-h-11 rounded-r-none"
              onClick={() => onSend(DEFAULT_SEND_CHANNEL)}
              disabled={!isValid || isSending || isSaving}
            >
              <Send className="h-4 w-4" />
              {isSending
                ? 'Sending…'
                : `Send via ${DEFAULT_SEND_CHANNEL === 'whapi' ? 'WhatsApp' : 'Wati'}`}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={!isValid || isSending || isSaving}
                aria-label="Choose send channel"
                className="inline-flex items-center justify-center min-h-11 px-2 bg-green-600 hover:bg-green-700 text-white rounded-md rounded-l-none border-l border-l-green-700 disabled:opacity-50 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
              >
                <ChevronDown className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => onSend('whapi')}>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">WhatsApp</span>
                    <span className="text-[11px] text-muted-foreground">
                      Direct via WHAPI{DEFAULT_SEND_CHANNEL === 'whapi' && ' · default'}
                    </span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onSend('wati')}>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Wati</span>
                    <span className="text-[11px] text-muted-foreground">
                      Business channel · uses template
                      {DEFAULT_SEND_CHANNEL === 'wati' && ' · default'}
                    </span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
