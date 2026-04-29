'use client'

import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { DollarSign, Truck, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type PaymentMilestone = { _key?: string; label: string; percent: number }

export interface SoTermsValues {
  payment_terms:        string
  payment_milestones:   PaymentMilestone[]
  payment_terms_notes:  string
  delivery_terms:       string
  delivery_terms_notes: string
  expected_delivery:    string
  customer_notes:       string
  validity_days:        number
}

export const DEFAULT_TERMS: SoTermsValues = {
  payment_terms:        '',
  payment_milestones:   [],
  payment_terms_notes:  '',
  delivery_terms:       '',
  delivery_terms_notes: '',
  expected_delivery:    '',
  customer_notes:       '',
  validity_days:        30,
}

const PAYMENT_PRESETS: { label: string; milestones: PaymentMilestone[] }[] = [
  { label: '100% Advance',       milestones: [{ label: 'Advance Payment', percent: 100 }] },
  { label: '100% After Delivery', milestones: [{ label: 'Upon Delivery', percent: 100 }] },
  { label: '50/50',              milestones: [{ label: 'Advance Payment', percent: 50 }, { label: 'Upon Delivery', percent: 50 }] },
  { label: 'Net 30',             milestones: [{ label: 'Net 30 days', percent: 100 }] },
  { label: 'Net 60',             milestones: [{ label: 'Net 60 days', percent: 100 }] },
  { label: 'Custom',             milestones: [{ label: '', percent: 100 }] },
]

const DELIVERY_PRESETS = ['Pickup', 'Deliver to Site', 'Courier', 'Custom']

interface SoTermsSectionProps {
  value: SoTermsValues
  onChange: (values: SoTermsValues) => void
  hidePaymentTerms?: boolean
}

export function SoTermsSection({ value, onChange, hidePaymentTerms = false }: SoTermsSectionProps) {
  function set<K extends keyof SoTermsValues>(key: K, val: SoTermsValues[K]) {
    onChange({ ...value, [key]: val })
  }

  function selectPaymentPreset(label: string) {
    const preset = PAYMENT_PRESETS.find((p) => p.label === label)
    onChange({
      ...value,
      payment_terms: label,
      payment_milestones: preset
        ? preset.milestones.map((m) => ({ ...m, _key: crypto.randomUUID() }))
        : [],
    })
  }

  function updateMilestone(idx: number, patch: Partial<PaymentMilestone>) {
    set('payment_milestones', value.payment_milestones.map((m, i) => i === idx ? { ...m, ...patch } : m))
  }

  function addMilestone() {
    set('payment_milestones', [...value.payment_milestones, { _key: crypto.randomUUID(), label: '', percent: 0 }])
  }

  function removeMilestone(idx: number) {
    set('payment_milestones', value.payment_milestones.filter((_, i) => i !== idx))
  }

  const isCustomPayment = value.payment_terms === 'Custom'
  const milestoneSum    = value.payment_milestones.reduce((s, m) => s + m.percent, 0)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

      {/* ── Payment Terms ── */}
      {!hidePaymentTerms && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <DollarSign className="h-4 w-4 text-primary" />
            Payment Terms
          </h2>

          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => selectPaymentPreset(p.label)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs border transition-colors',
                  value.payment_terms === p.label
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/50 hover:bg-muted border-border'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {value.payment_milestones.length > 0 && (
            <div className="space-y-1.5">
              {value.payment_milestones.map((m, idx) => (
                <div key={m._key ?? idx} className="flex items-center gap-2">
                  <Input
                    className="flex-1 h-8 text-xs"
                    placeholder="Milestone label"
                    value={m.label}
                    readOnly={!isCustomPayment}
                    onChange={(e) => updateMilestone(idx, { label: e.target.value })}
                  />
                  <div className="flex items-center gap-0.5">
                    <Input
                      type="number" min="0" max="100"
                      className="w-16 h-8 text-xs text-center"
                      value={m.percent}
                      readOnly={!isCustomPayment}
                      onChange={(e) => updateMilestone(idx, { percent: Number(e.target.value) })}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  {isCustomPayment && (
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeMilestone(idx)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              {isCustomPayment && (
                <Button type="button" variant="link" size="sm" className="text-primary px-0 h-auto text-xs" onClick={addMilestone}>
                  <Plus className="h-3 w-3 mr-1" />Add milestone
                </Button>
              )}
              {isCustomPayment && milestoneSum !== 100 && (
                <p className="text-xs text-destructive">Total is {milestoneSum}% — must equal 100%</p>
              )}
            </div>
          )}

          <Textarea
            className="min-h-[50px] text-xs resize-none"
            placeholder="Additional payment notes…"
            value={value.payment_terms_notes}
            onChange={(e) => set('payment_terms_notes', e.target.value)}
          />
        </div>
      )}

      {/* ── Delivery Terms ── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <Truck className="h-4 w-4 text-primary" />
          Delivery Terms
        </h2>

        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Method</p>
          <div className="flex flex-wrap gap-1.5">
            {DELIVERY_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => set('delivery_terms', p)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs border transition-colors',
                  value.delivery_terms === p
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/50 hover:bg-muted border-border'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Expected Delivery</p>
          <Input
            type="date"
            className="h-9"
            value={value.expected_delivery}
            onChange={(e) => set('expected_delivery', e.target.value)}
          />
        </div>

        <Textarea
          className="min-h-[50px] text-xs resize-none"
          placeholder="Delivery notes…"
          value={value.delivery_terms_notes}
          onChange={(e) => set('delivery_terms_notes', e.target.value)}
        />
      </div>

      {/* ── Customer Notes + Validity ── */}
      <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Customer Notes</p>
          <Textarea
            className="min-h-[70px] text-xs resize-none"
            placeholder="Notes visible to customer…"
            value={value.customer_notes}
            onChange={(e) => set('customer_notes', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Quotation Validity (days)</p>
          <Input
            type="number" min={1}
            className="h-9 w-32 text-sm"
            value={value.validity_days}
            onChange={(e) => onChange({ ...value, validity_days: Math.max(1, Number(e.target.value)) })}
          />
          <p className="text-xs text-muted-foreground">How long this quotation remains valid</p>
        </div>
      </div>
    </div>
  )
}
