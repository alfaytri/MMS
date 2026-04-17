'use client'

import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const PAYMENT_TERM_PRESETS = [
  { label: '100% Advance', value: '100% Advance' },
  { label: 'On Delivery', value: 'On Delivery' },
  { label: 'Net 15', value: 'Net 15' },
  { label: 'Net 30', value: 'Net 30' },
  { label: '50/50', value: '50/50' },
  { label: 'Custom', value: 'Custom' },
]

const DELIVERY_TERM_PRESETS = [
  { label: 'Pickup', value: 'Pickup' },
  { label: 'Deliver to Site', value: 'Deliver to Site' },
  { label: 'Courier', value: 'Courier' },
  { label: 'Custom', value: 'Custom' },
]

export interface SoTermsValues {
  payment_terms: string
  payment_terms_notes: string
  delivery_terms: string
  delivery_terms_notes: string
  customer_notes: string
}

interface SoTermsSectionProps {
  value: SoTermsValues
  onChange: (values: SoTermsValues) => void
}

export function SoTermsSection({ value, onChange }: SoTermsSectionProps) {
  function set(key: keyof SoTermsValues, val: string) {
    onChange({ ...value, [key]: val })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Payment Terms</Label>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_TERM_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => set('payment_terms', p.value)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                value.payment_terms === p.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'hover:bg-muted'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {value.payment_terms === 'Custom' && (
          <Input
            placeholder="Describe custom payment terms..."
            value={value.payment_terms_notes}
            onChange={(e) => set('payment_terms_notes', e.target.value)}
          />
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Delivery Terms</Label>
        <div className="flex flex-wrap gap-2">
          {DELIVERY_TERM_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => set('delivery_terms', p.value)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                value.delivery_terms === p.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'hover:bg-muted'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Input
          placeholder="Delivery notes..."
          value={value.delivery_terms_notes}
          onChange={(e) => set('delivery_terms_notes', e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Customer Notes</Label>
        <Textarea
          placeholder="Notes to customer..."
          value={value.customer_notes}
          onChange={(e) => set('customer_notes', e.target.value)}
          rows={3}
        />
      </div>
    </div>
  )
}
