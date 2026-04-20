'use client'

import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { DollarSign, Truck, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type PaymentMilestone = { _key?: string; label: string; percent: number }

export interface PoTermsValues {
  payment_terms: string
  payment_terms_notes: string
  payment_milestones: PaymentMilestone[]
  delivery_terms: string
  delivery_terms_notes: string
  expected_delivery: string
  vendor_notes: string
}

export const DEFAULT_TERMS: PoTermsValues = {
  payment_terms: '',
  payment_terms_notes: '',
  payment_milestones: [],
  delivery_terms: '',
  delivery_terms_notes: '',
  expected_delivery: '',
  vendor_notes: '',
}

const PAYMENT_PRESETS: { label: string; milestones: PaymentMilestone[] }[] = [
  {
    label: '100% Advance',
    milestones: [{ label: 'Advance Payment', percent: 100 }],
  },
  {
    label: '100% After Delivery',
    milestones: [{ label: 'Upon Delivery', percent: 100 }],
  },
  {
    label: '50% Advance / 50% After Delivery',
    milestones: [
      { label: 'Advance Payment', percent: 50 },
      { label: 'Upon Delivery', percent: 50 },
    ],
  },
  {
    label: '30% Advance / 70% After Delivery',
    milestones: [
      { label: 'Advance Payment', percent: 30 },
      { label: 'Balance on Delivery', percent: 70 },
    ],
  },
  {
    label: 'Custom',
    milestones: [{ label: '', percent: 100 }],
  },
]

const DELIVERY_PRESETS = ['EXW', 'FOB', 'CIF', 'DDP', 'DAP', 'Custom']

interface PoTermsSectionProps {
  value: PoTermsValues
  onChange: (values: PoTermsValues) => void
}

export function PoTermsSection({ value, onChange }: PoTermsSectionProps) {
  function set<K extends keyof PoTermsValues>(key: K, val: PoTermsValues[K]) {
    onChange({ ...value, [key]: val })
  }

  function selectPaymentPreset(label: string) {
    const preset = PAYMENT_PRESETS.find((p) => p.label === label)
    onChange({
      ...value,
      payment_terms: label,
      payment_milestones: preset ? preset.milestones.map((m) => ({ ...m, _key: crypto.randomUUID() })) : [],
    })
  }

  function updateMilestone(idx: number, patch: Partial<PaymentMilestone>) {
    const updated = value.payment_milestones.map((m, i) => (i === idx ? { ...m, ...patch } : m))
    set('payment_milestones', updated)
  }

  function addMilestone() {
    set('payment_milestones', [...value.payment_milestones, { _key: crypto.randomUUID(), label: '', percent: 0 }])
  }

  function removeMilestone(idx: number) {
    set('payment_milestones', value.payment_milestones.filter((_, i) => i !== idx))
  }

  const isCustomPayment = value.payment_terms === 'Custom'
  const milestoneSum = value.payment_milestones.reduce((s, m) => s + m.percent, 0)
  const milestoneValid = milestoneSum === 100

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* ── Payment Terms ── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <DollarSign className="h-4 w-4 text-primary" />
          Payment Terms
        </h2>

        {/* Preset pills */}
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

        {/* Milestones */}
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
                    type="number"
                    min="0"
                    max="100"
                    className="w-16 h-8 text-xs text-center"
                    value={m.percent}
                    readOnly={!isCustomPayment}
                    onChange={(e) => updateMilestone(idx, { percent: Number(e.target.value) })}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                {isCustomPayment && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => removeMilestone(idx)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}

            {isCustomPayment && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="text-primary px-0 h-auto text-xs"
                onClick={addMilestone}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add milestone
              </Button>
            )}

            {isCustomPayment && !milestoneValid && (
              <p className="text-xs text-destructive">
                Total is {milestoneSum}% — must equal 100%
              </p>
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

      {/* ── Delivery Terms ── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <Truck className="h-4 w-4 text-primary" />
          Delivery Terms
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Terms select */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Terms
            </label>
            <select
              value={value.delivery_terms}
              onChange={(e) => set('delivery_terms', e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select…</option>
              {DELIVERY_PRESETS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Expected delivery */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Expected Delivery *
            </label>
            <Input
              type="date"
              className="h-9"
              value={value.expected_delivery}
              onChange={(e) => set('expected_delivery', e.target.value)}
            />
          </div>
        </div>

        <Textarea
          className="min-h-[50px] text-xs resize-none"
          placeholder="Additional delivery notes…"
          value={value.delivery_terms_notes}
          onChange={(e) => set('delivery_terms_notes', e.target.value)}
        />
      </div>
    </div>
  )
}
