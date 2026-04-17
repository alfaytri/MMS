'use client'

import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const PAYMENT_TERM_PRESETS = [
  { label: '100% Advance', value: '100% Advance' },
  { label: '50/50', value: '50/50' },
  { label: '30/70', value: '30/70' },
  { label: 'Custom', value: 'Custom' },
]

const DELIVERY_TERM_PRESETS = [
  { label: 'EXW', value: 'EXW' },
  { label: 'FOB', value: 'FOB' },
  { label: 'CIF', value: 'CIF' },
  { label: 'DDP', value: 'DDP' },
  { label: 'DAP', value: 'DAP' },
  { label: 'Custom', value: 'Custom' },
]

export interface PoTermsValues {
  payment_terms: string
  payment_terms_notes: string
  delivery_terms: string
  delivery_terms_notes: string
  vendor_notes: string
}

interface PoTermsSectionProps {
  value: PoTermsValues
  onChange: (values: PoTermsValues) => void
}

export function PoTermsSection({ value, onChange }: PoTermsSectionProps) {
  function set(key: keyof PoTermsValues, val: string) {
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
          <Input placeholder="Describe custom payment terms..." value={value.payment_terms_notes} onChange={(e) => set('payment_terms_notes', e.target.value)} />
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
        <Input placeholder="Delivery notes..." value={value.delivery_terms_notes} onChange={(e) => set('delivery_terms_notes', e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Vendor Notes</Label>
        <Textarea placeholder="Notes to vendor..." value={value.vendor_notes} onChange={(e) => set('vendor_notes', e.target.value)} rows={3} />
      </div>
    </div>
  )
}
