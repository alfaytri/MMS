// src/components/orders/OrderFormPanel.tsx
'use client'
import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle, User, Search } from 'lucide-react'
import { ServiceSelector } from './ServiceSelector'
import { SelectedServiceCard } from './SelectedServiceCard'
import { AddressPicker } from './AddressPicker'
import { VisitDatePicker } from './VisitDatePicker'
import { AttachmentsUpload } from './AttachmentsUpload'
import type { PendingAttachment } from './AttachmentsUpload'
import { useDivisions } from '@/hooks/useDivisions'
import { cn } from '@/lib/utils'
import type { OrderDraft, OrderServiceDraft, CustomerAddress, OrderType, VisitDateWindow } from '@/types/orders'

const COUNTRY_CODES = [
  { code: '+974', label: 'QA +974' },
  { code: '+971', label: 'AE +971' },
  { code: '+966', label: 'SA +966' },
  { code: '+965', label: 'KW +965' },
  { code: '+973', label: 'BH +973' },
  { code: '+968', label: 'OM +968' },
  { code: '+20',  label: 'EG +20'  },
  { code: '+91',  label: 'IN +91'  },
  { code: '+92',  label: 'PK +92'  },
  { code: '+880', label: 'BD +880' },
  { code: '+63',  label: 'PH +63'  },
  { code: '+94',  label: 'LK +94'  },
]

interface Props {
  draft: OrderDraft
  pendingFiles: PendingAttachment[]
  onTypeChange: (type: OrderType) => void
  onAddService: (s: OrderServiceDraft) => void
  onRemoveService: (id: string) => void
  onUpdateServiceQty: (serviceId: string, qty: number) => void
  onUpdateServiceTime: (serviceId: string, fromTime: string | null, toTime: string | null) => void
  onAddressSelect: (a: CustomerAddress) => void
  onUpdate: (patch: Partial<OrderDraft>) => void
  onPendingFilesChange: (files: PendingAttachment[]) => void
  onLookupCustomer: () => void
  onSubmit: () => void
  isSubmitting: boolean
  isValid: boolean
}

export function OrderFormPanel({
  draft,
  pendingFiles,
  onTypeChange,
  onAddService,
  onRemoveService,
  onUpdateServiceQty,
  onUpdateServiceTime,
  onAddressSelect,
  onUpdate,
  onPendingFilesChange,
  onLookupCustomer,
  onSubmit,
  isSubmitting,
  isValid,
}: Props) {
  const { data: divisions = [] } = useDivisions()
  const [multiDivision, setMultiDivision] = useState(false)
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([])
  const [arrivalCountryCode, setArrivalCountryCode] = useState('+974')

  function toggleDivision(slug: string) {
    setSelectedDivisions((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    )
  }

  function handleSingleDivision(slug: string) {
    setSelectedDivisions(slug ? [slug] : [])
  }

  function handleArrivalPhoneChange(local: string) {
    const full = local.trim() ? `${arrivalCountryCode}${local.trim().replace(/^0/, '')}` : ''
    onUpdate({ arrivalPhone: full })
  }

  const arrivalLocalNumber = draft.arrivalPhone
    ? draft.arrivalPhone.replace(arrivalCountryCode, '')
    : ''

  // Transform string[] from VisitDatePicker → VisitDateWindow[], preserving existing time windows
  function handleDatesChange(dates: string[]) {
    const existingMap = new Map(draft.visitDates.map((w) => [w.date, w]))
    const newWindows: VisitDateWindow[] = dates.map(
      (date) => existingMap.get(date) ?? { date, fromTime: null, toTime: null }
    )
    const primaryDate =
      newWindows.length > 0
        ? [...newWindows].sort((a, b) => a.date.localeCompare(b.date))[0].date
        : draft.visitDate
    onUpdate({ visitDates: newWindows, visitDate: primaryDate })
  }

  return (
    <div className="flex h-full w-full shrink-0 flex-col border-r bg-white sm:w-[340px]">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── Customer row ── */}
        {draft.customerId ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <User className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{draft.customerName}</p>
              <p className="truncate text-xs text-slate-500">{draft.phone}</p>
            </div>
            <button
              type="button"
              onClick={onLookupCustomer}
              className="flex shrink-0 items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors"
            >
              <Search className="h-3 w-3" />
              Change
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onLookupCustomer}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-orange-300 bg-orange-50 px-3 py-2.5 text-sm text-orange-600 hover:bg-orange-100 transition-colors"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="font-medium">Look up a customer to start</span>
          </button>
        )}

        {/* Type toggle */}
        <Tabs value={draft.type} onValueChange={(v) => onTypeChange(v as OrderType)}>
          <TabsList className="w-full">
            <TabsTrigger value="order" className="flex-1">Order</TabsTrigger>
            <TabsTrigger value="site-visit" className="flex-1">Site Visit</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* ── Division + Services (disabled until customer selected) ── */}
        <div className={cn(!draft.customerId && 'pointer-events-none opacity-40 select-none')}>
        {draft.type === 'order' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Division
              </Label>
              <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={multiDivision}
                  onChange={(e) => { setMultiDivision(e.target.checked); setSelectedDivisions([]) }}
                  className="rounded"
                />
                Multi-division
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {divisions.map((d) =>
                !multiDivision ? (
                  <button
                    key={d.slug}
                    type="button"
                    onClick={() => handleSingleDivision(selectedDivisions[0] === d.slug ? '' : d.slug)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      selectedDivisions[0] === d.slug
                        ? 'border-orange-500 bg-orange-500 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    )}
                  >
                    {d.short_name ?? d.name}
                  </button>
                ) : (
                  <label
                    key={d.slug}
                    className={cn(
                      'flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      selectedDivisions.includes(d.slug)
                        ? 'border-orange-500 bg-orange-500 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    )}
                  >
                    <input type="checkbox" className="sr-only" checked={selectedDivisions.includes(d.slug)} onChange={() => toggleDivision(d.slug)} />
                    {d.short_name ?? d.name}
                  </label>
                )
              )}
            </div>
          </div>
        )}

        {/* ── Requested Services ── */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Requested Services
            </Label>
            {draft.services.length > 0 && (
              <span className="text-xs text-slate-400">{draft.services.length} selected</span>
            )}
          </div>
          {draft.type === 'order' && (
            selectedDivisions.length === 0 ? (
              <p className="text-xs text-slate-400 mt-1">Select a division first</p>
            ) : (
              <>
                <ServiceSelector onAdd={onAddService} divisionFilters={selectedDivisions} />
                {draft.services.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {draft.services.map((s) => (
                      <SelectedServiceCard
                        key={s.serviceId}
                        service={s}
                        onRemove={onRemoveService}
                        onQtyChange={onUpdateServiceQty}
                        onTimeChange={onUpdateServiceTime}
                      />
                    ))}
                  </div>
                )}
              </>
            )
          )}
          {draft.type === 'site-visit' && (
            <p className="text-xs text-slate-400 mt-1">Site visit — no services required</p>
          )}
        </div>
        </div>{/* end disabled wrapper */}

        {/* ── Visit Date (multi-date picker) ── */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Visit Date
          </Label>
          <VisitDatePicker
            selected={draft.visitDates.map((w) => w.date)}
            onChange={handleDatesChange}
          />
        </div>

        {/* ── Order Address ── */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Order Address
          </Label>
          {draft.customerId ? (
            <AddressPicker
              customerId={draft.customerId}
              phoneId={draft.phoneId}
              selected={draft.addressSnapshot}
              onSelect={(addr) => {
                onAddressSelect(addr)
                onUpdate({ addressId: addr.id, addressSnapshot: addr })
              }}
            />
          ) : (
            <p className="text-xs text-slate-400">Look up a customer first</p>
          )}
        </div>

        {/* ── Notes ── */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Notes
          </Label>
          <Textarea
            placeholder="Add notes…"
            value={draft.notes}
            onChange={(e) => onUpdate({ notes: e.target.value })}
            rows={2}
            className="resize-none"
          />
        </div>

        {/* ── Phone on Arrival ── */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Phone on Arrival
          </Label>
          <div className="flex h-10 rounded-md border border-input shadow-sm focus-within:ring-1 focus-within:ring-ring">
            <Select value={arrivalCountryCode} onValueChange={(v) => {
              if (!v) return
              setArrivalCountryCode(v)
              if (arrivalLocalNumber) {
                onUpdate({ arrivalPhone: `${v}${arrivalLocalNumber}` })
              }
            }}>
              <SelectTrigger className="w-28 shrink-0 rounded-r-none border-0 shadow-none focus:ring-0 h-full bg-slate-50 text-xs font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRY_CODES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="w-px bg-border self-stretch" />
            <Input
              placeholder="5XXX XXXX"
              value={arrivalLocalNumber}
              onChange={(e) => handleArrivalPhoneChange(e.target.value)}
              className="rounded-l-none border-0 shadow-none focus-visible:ring-0 h-full flex-1"
            />
          </div>
        </div>

        {/* ── Attachments ── */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Attachments
          </Label>
          <AttachmentsUpload
            attachments={pendingFiles}
            onChange={onPendingFilesChange}
            disabled={isSubmitting}
          />
        </div>

        {/* ── Voucher Code ── */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Voucher Code
          </Label>
          <div className="flex gap-2">
            <Input
              placeholder="ENTER VOUCHER CODE"
              value={draft.voucherCode}
              onChange={(e) => onUpdate({ voucherCode: e.target.value })}
              className="h-9 flex-1 uppercase"
            />
            <Button variant="outline" size="sm" className="h-9 min-h-[44px] sm:min-h-0">Apply</Button>
          </div>
        </div>

        {/* ── Total ── */}
        {draft.services.length > 0 && (
          <div className="rounded-md bg-slate-50 p-2 text-right">
            <span className="text-xs text-slate-500">Total: </span>
            <span className="font-semibold text-slate-900">
              QAR {draft.services.reduce((sum, s) => sum + s.price * s.qty, 0).toFixed(0)}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t p-3">
        <Button
          className="w-full gap-2 min-h-[44px]"
          disabled={!isValid || isSubmitting}
          onClick={onSubmit}
        >
          <CheckCircle className="h-4 w-4" />
          {isSubmitting ? 'Confirming…' : 'Confirm Order'}
        </Button>
      </div>
    </div>
  )
}
