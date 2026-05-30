// src/components/orders/OrderFormPanel.tsx
'use client'
import { useState, useEffect } from 'react'
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
import { VisitDateSchedule } from './VisitDateSchedule'
import { AttachmentsUpload } from './AttachmentsUpload'
import type { PendingAttachment } from './AttachmentsUpload'
import { useUserCompanyDivisions } from '@/hooks/useUserCompanyDivisions'
import { cn } from '@/lib/utils'
import { SiteVisitCard } from './SiteVisitCard'
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
  onTypeChange: (type: OrderType) => void | Promise<void>
  onAddService: (s: OrderServiceDraft) => void
  onRemoveService: (id: string) => void
  onUpdateServiceQty: (serviceId: string, qty: number) => void
  onUpdateServiceTime: (serviceId: string, fromTime: string | null, toTime: string | null) => void
  onAddressSelect: (a: CustomerAddress) => void
  onUpdateSiteVisitTime: (fromTime: string | null, toTime: string | null) => void
  onUpdate: (patch: Partial<OrderDraft>) => void
  onPendingFilesChange: (files: PendingAttachment[]) => void
  onLookupCustomer: () => void
  onSubmit: () => void
  isSubmitting: boolean
  isValid: boolean
  submitLabel?: string
  onDivisionsChange?: (slugs: string[]) => void
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
      {children}
    </p>
  )
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
  onUpdateSiteVisitTime,
  onUpdate,
  onPendingFilesChange,
  onLookupCustomer,
  onSubmit,
  isSubmitting,
  isValid,
  submitLabel = 'Confirm Order',
  onDivisionsChange,
}: Props) {
  const { data: divisions = [] } = useUserCompanyDivisions()
  const [multiDivision, setMultiDivision] = useState(false)
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([])
  const [arrivalCountryCode, setArrivalCountryCode] = useState('+974')

  // Pre-populate division when editing an existing order
  useEffect(() => {
    if (draft.division && selectedDivisions.length === 0) {
      setSelectedDivisions([draft.division])
    }
  }, [draft.division]) // eslint-disable-line react-hooks/exhaustive-deps

  function syncDivision(slugs: string[]) {
    onUpdate({ division: slugs[0] ?? '' })
    onDivisionsChange?.(slugs)
  }

  function toggleDivision(slug: string) {
    const next = selectedDivisions.includes(slug)
      ? selectedDivisions.filter((s) => s !== slug)
      : [...selectedDivisions, slug]
    setSelectedDivisions(next)
    syncDivision(next)
  }

  function handleSingleDivision(slug: string) {
    const next = slug ? [slug] : []
    setSelectedDivisions(next)
    syncDivision(next)
  }

  function handleArrivalPhoneChange(local: string) {
    const full = local.trim() ? `${arrivalCountryCode}${local.trim().replace(/^0/, '')}` : ''
    onUpdate({ arrivalPhone: full })
  }

  const arrivalLocalNumber = draft.arrivalPhone
    ? draft.arrivalPhone.replace(arrivalCountryCode, '')
    : ''

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
    <div className="flex h-full w-full shrink-0 flex-col border-r bg-white sm:w-[360px]">
      <div className="flex-1 overflow-y-auto">

        {/* ── Customer ── */}
        <div className="px-5 pt-5 pb-4">
          {draft.customerId ? (
            <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 shadow-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100">
                <User className="h-4 w-4 text-orange-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{draft.customerName}</p>
                <p className="truncate text-xs text-slate-400">{draft.phone}</p>
              </div>
              <button
                type="button"
                onClick={onLookupCustomer}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors shadow-sm"
              >
                <Search className="h-3 w-3" />
                Change
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onLookupCustomer}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-orange-200 bg-orange-50/50 px-4 py-4 text-sm font-medium text-orange-500 hover:border-orange-300 hover:bg-orange-50 transition-colors"
            >
              <Search className="h-4 w-4 shrink-0" />
              Look up a customer to start
            </button>
          )}
        </div>

        <div className="mx-5 border-t border-slate-100" />

        {/* ── Order Type ── */}
        <div className="px-5 py-4">
          <Tabs value={draft.type} onValueChange={(v) => onTypeChange(v as OrderType)}>
            <TabsList className="w-full h-10">
              <TabsTrigger value="order" className="flex-1 text-sm">Order</TabsTrigger>
              <TabsTrigger value="site-visit" className="flex-1 text-sm">Site Visit</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="mx-5 border-t border-slate-100" />

        {/* ── Division + Services ── */}
        <div className={cn('px-5 py-4 space-y-4', !draft.customerId && 'pointer-events-none opacity-40 select-none')}>

          {draft.type === 'order' && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <SectionLabel>Division</SectionLabel>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={multiDivision}
                    onChange={(e) => { setMultiDivision(e.target.checked); setSelectedDivisions([]); onUpdate({ division: '' }) }}
                    className="rounded accent-orange-500"
                  />
                  <span className="text-xs text-slate-400">Multi-division</span>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {divisions.map((d) =>
                  !multiDivision ? (
                    <button
                      key={d.slug}
                      type="button"
                      onClick={() => handleSingleDivision(selectedDivisions[0] === d.slug ? '' : d.slug)}
                      className={cn(
                        'rounded-full px-4 py-1.5 text-sm font-medium transition-all',
                        selectedDivisions[0] === d.slug
                          ? 'bg-orange-500 text-white shadow-sm shadow-orange-200'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      )}
                    >
                      {d.name}
                    </button>
                  ) : (
                    <label
                      key={d.slug}
                      className={cn(
                        'flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all',
                        selectedDivisions.includes(d.slug)
                          ? 'bg-orange-500 text-white shadow-sm shadow-orange-200'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      )}
                    >
                      <input type="checkbox" className="sr-only" checked={selectedDivisions.includes(d.slug)} onChange={() => toggleDivision(d.slug)} />
                      {d.name}
                    </label>
                  )
                )}
              </div>
            </div>
          )}

          {/* ── Requested Services ── */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <SectionLabel>Requested Services</SectionLabel>
              {draft.services.length > 0 && (
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-600">
                  {draft.services.length} selected
                </span>
              )}
            </div>

            {draft.type === 'order' && (
              selectedDivisions.length === 0 ? (
                <p className="text-xs text-slate-400">Select a division first</p>
              ) : (
                <div className="space-y-2">
                  <ServiceSelector onAdd={onAddService} divisionFilters={selectedDivisions} />
                  {draft.services.length > 0 && (
                    <div className="space-y-2">
                      {draft.services.map((s) => (
                        <SelectedServiceCard
                          key={s.serviceId}
                          service={s}
                          onRemove={onRemoveService}
                          onQtyChange={onUpdateServiceQty}
                          onTimeChange={onUpdateServiceTime}
                          hideTimeControls
                          hideDragHandle
                          visitDate={draft.visitDate}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            )}

            {draft.type === 'site-visit' && (
              <SiteVisitCard
                fromTime={draft.siteVisitFromTime}
                toTime={draft.siteVisitToTime}
                onTimeChange={onUpdateSiteVisitTime}
                visitDate={draft.visitDate}
              />
            )}
          </div>
        </div>

        <div className="mx-5 border-t border-slate-100" />

        {/* ── Visit Date ── */}
        <div className="px-5 py-4 space-y-4">
          <div className="space-y-2.5">
            <SectionLabel>Visit Date</SectionLabel>
            <VisitDatePicker
              selected={draft.visitDates.map((w) => w.date)}
              onChange={handleDatesChange}
            />
          </div>

          {draft.visitDates.length > 0 && (
            <VisitDateSchedule
              windows={draft.visitDates}
              onChange={(windows) => onUpdate({ visitDates: windows })}
              services={draft.services.map((s) => ({
                serviceId:   s.serviceId,
                serviceName: s.serviceName,
                qty:         s.qty,
              }))}
            />
          )}
        </div>

        <div className="mx-5 border-t border-slate-100" />

        {/* ── Order Address ── */}
        <div className="px-5 py-4 space-y-2.5">
          <SectionLabel>Order Address</SectionLabel>
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

        <div className="mx-5 border-t border-slate-100" />

        {/* ── Notes ── */}
        <div className="px-5 py-4 space-y-2.5">
          <SectionLabel>Notes</SectionLabel>
          <Textarea
            placeholder="Add notes…"
            value={draft.notes}
            onChange={(e) => onUpdate({ notes: e.target.value })}
            rows={3}
            className="resize-none text-sm"
          />
        </div>

        <div className="mx-5 border-t border-slate-100" />

        {/* ── Phone on Arrival ── */}
        <div className="px-5 py-4 space-y-2.5">
          <SectionLabel>Phone on Arrival</SectionLabel>
          <div className="flex h-10 rounded-lg border border-input shadow-sm focus-within:ring-2 focus-within:ring-orange-300 focus-within:border-orange-400 transition-all">
            <Select value={arrivalCountryCode} onValueChange={(v) => {
              if (!v) return
              setArrivalCountryCode(v)
              if (arrivalLocalNumber) onUpdate({ arrivalPhone: `${v}${arrivalLocalNumber}` })
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
              className="rounded-l-none border-0 shadow-none focus-visible:ring-0 h-full flex-1 text-sm"
            />
          </div>
        </div>

        <div className="mx-5 border-t border-slate-100" />

        {/* ── Attachments ── */}
        <div className="px-5 py-4 space-y-2.5">
          <SectionLabel>Attachments</SectionLabel>
          <AttachmentsUpload
            attachments={pendingFiles}
            onChange={onPendingFilesChange}
            disabled={isSubmitting}
          />
        </div>

        <div className="mx-5 border-t border-slate-100" />

        {/* ── Voucher Code ── */}
        <div className="px-5 py-4 space-y-2.5">
          <SectionLabel>Voucher Code</SectionLabel>
          <div className="flex gap-2">
            <Input
              placeholder="Enter code…"
              value={draft.voucherCode}
              onChange={(e) => onUpdate({ voucherCode: e.target.value })}
              className="h-10 flex-1 uppercase text-sm tracking-widest"
            />
            <Button variant="outline" size="sm" className="h-10 px-4 text-xs font-semibold">Apply</Button>
          </div>
        </div>

        {/* ── Total ── */}
        {draft.services.length > 0 && (
          <div className="mx-5 mb-5 rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-slate-500 font-medium">Total</span>
            <span className="text-lg font-bold text-slate-900">
              QAR {draft.services.reduce((sum, s) => sum + s.price * s.qty, 0).toFixed(0)}
            </span>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-slate-100 bg-white px-5 py-4">
        <Button
          className="w-full gap-2 h-11 text-sm font-semibold rounded-xl shadow-sm"
          disabled={!isValid || isSubmitting}
          onClick={onSubmit}
        >
          <CheckCircle className="h-4 w-4" />
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </div>
  )
}
