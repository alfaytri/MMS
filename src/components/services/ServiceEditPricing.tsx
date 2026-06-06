'use client'

import { useWatch, type UseFormReturn } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { cn } from '@/lib/utils'
import type { ServiceFormValues } from './ServiceEditSections'

// ─── Contract Type ─────────────────────────────────────────────────────────────

export function ContractSection({ form }: { form: UseFormReturn<ServiceFormValues> }) {
  const contractType = useWatch({ control: form.control, name: 'contract_type' })

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Contract Type
      </h4>
      <FormField control={form.control} name="contract_type" render={({ field }) => (
        <FormItem>
          <div className="flex gap-2">
            {(['preventive', 'area', 'general'] as const).map((t) => (
              <Button
                key={t}
                type="button"
                size="sm"
                variant={field.value === t ? 'default' : 'outline'}
                className="h-7 text-[11px] capitalize"
                onClick={() => field.onChange(field.value === t ? null : t)}
              >
                {t === 'area' ? 'Area-Based' : t.charAt(0).toUpperCase() + t.slice(1)}
              </Button>
            ))}
          </div>
          <FormMessage />
        </FormItem>
      )} />
      {contractType === 'area' && (
        <FormField control={form.control} name="price_unit" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">Price Unit (e.g. sqm)</FormLabel>
            <FormControl>
              <Input className="h-8 text-xs" {...field} value={field.value ?? ''} />
            </FormControl>
          </FormItem>
        )} />
      )}
    </div>
  )
}

// ─── Item Kind ─────────────────────────────────────────────────────────────────

export function ItemKindSection({ form }: { form: UseFormReturn<ServiceFormValues> }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Item Kind
      </h4>
      <FormField control={form.control} name="item_kind" render={({ field }) => (
        <FormItem>
          <div className="flex gap-2">
            {([
              { value: 'service', label: 'Service' },
              { value: 'product', label: 'Product' },
            ] as const).map((opt) => (
              <Button
                key={opt.value}
                type="button"
                size="sm"
                variant={field.value === opt.value ? 'default' : 'outline'}
                className={cn(
                  'h-8 text-[11px] flex-1',
                  field.value === opt.value
                    ? 'bg-orange-500 text-white border-orange-500 hover:bg-orange-600'
                    : 'border-orange-200 text-orange-700 hover:bg-orange-50',
                )}
                onClick={() => field.onChange(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <FormMessage />
        </FormItem>
      )} />
    </div>
  )
}

// ─── Pricing Mode ──────────────────────────────────────────────────────────────

export function PricingModeSection({ form }: { form: UseFormReturn<ServiceFormValues> }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Pricing Mode
      </h4>
      <FormField control={form.control} name="pricing_mode" render={({ field }) => (
        <FormItem>
          <div className="flex gap-2">
            {([
              { value: 'fixed', label: 'Fixed Visit Price' },
              { value: 'by_condition', label: 'By Reliability & Condition' },
            ] as const).map((opt) => (
              <Button
                key={opt.value}
                type="button"
                size="sm"
                variant={field.value === opt.value ? 'default' : 'outline'}
                className={cn(
                  'h-8 text-[11px] flex-1',
                  field.value === opt.value
                    ? 'bg-orange-500 text-white border-orange-500 hover:bg-orange-600'
                    : 'border-orange-200 text-orange-700 hover:bg-orange-50',
                )}
                onClick={() => field.onChange(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <FormMessage />
        </FormItem>
      )} />
    </div>
  )
}

// ─── Discount Scope ────────────────────────────────────────────────────────────

export function DiscountScopeSection({ form }: { form: UseFormReturn<ServiceFormValues> }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Discount Applies To
      </h4>
      <FormField control={form.control} name="discount_scope" render={({ field }) => (
        <FormItem>
          <div className="flex gap-2">
            {([
              { value: 'services_only', label: 'Services Only' },
              { value: 'services_and_products', label: 'Services + Products' },
            ] as const).map((opt) => (
              <Button
                key={opt.value}
                type="button"
                size="sm"
                variant={field.value === opt.value ? 'default' : 'outline'}
                className={cn(
                  'h-8 text-[11px] flex-1',
                  field.value === opt.value
                    ? 'bg-orange-500 text-white border-orange-500 hover:bg-orange-600'
                    : 'border-orange-200 text-orange-700 hover:bg-orange-50',
                )}
                onClick={() => field.onChange(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <FormMessage />
        </FormItem>
      )} />
    </div>
  )
}

// ─── Pricing ───────────────────────────────────────────────────────────────────

interface PricingSectionProps {
  form: UseFormReturn<ServiceFormValues>
  type: 'normal' | 'contract' | 'mobile'
}

export function PricingSection({ form, type }: PricingSectionProps) {
  const contractType = useWatch({ control: form.control, name: 'contract_type' })
  const isGeneralContract = type === 'contract' && contractType === 'general'
  const isPreventiveContract = type === 'contract' && contractType === 'preventive'
  const emergencyLabel = isPreventiveContract ? 'Price per Visit (QAR)' : 'Emergency Price (QAR)'

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pricing</h4>
      <div className="grid grid-cols-2 gap-3">
        <FormField control={form.control} name="price" render={({ field }) => (
          <FormItem>
            <FormLabel>Price (QAR)</FormLabel>
            <FormControl>
              <Input
                type="number" step="0.01" {...field}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.valueAsNumber)}
              />
            </FormControl>
          </FormItem>
        )} />
        {isGeneralContract ? (
          <FormField control={form.control} name="discount" render={({ field }) => (
            <FormItem>
              <FormLabel>Discount %</FormLabel>
              <FormControl>
                <Input
                  type="number" step="0.1" {...field}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.valueAsNumber)}
                />
              </FormControl>
            </FormItem>
          )} />
        ) : (
          <FormField control={form.control} name="emergency_price" render={({ field }) => (
            <FormItem>
              <FormLabel>{emergencyLabel}</FormLabel>
              <FormControl>
                <Input
                  type="number" step="0.01" {...field}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.valueAsNumber)}
                />
              </FormControl>
            </FormItem>
          )} />
        )}
      </div>
    </div>
  )
}

// ─── Duration & Warranty ───────────────────────────────────────────────────────

export function DurationWarrantySection({ form }: { form: UseFormReturn<ServiceFormValues> }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Duration &amp; Warranty
      </h4>
      <div className="grid grid-cols-2 gap-3">
        <FormField control={form.control} name="duration" render={({ field }) => (
          <FormItem>
            <FormLabel>Duration (minutes)</FormLabel>
            <FormControl>
              <Input
                type="number" {...field}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.valueAsNumber)}
              />
            </FormControl>
          </FormItem>
        )} />
        <FormField control={form.control} name="warranty" render={({ field }) => (
          <FormItem>
            <FormLabel>Warranty (months)</FormLabel>
            <FormControl>
              <Input
                type="number" {...field}
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.valueAsNumber)}
              />
            </FormControl>
          </FormItem>
        )} />
      </div>
    </div>
  )
}

// ─── Invoice Text ──────────────────────────────────────────────────────────────

export function InvoiceTextSection({ form }: { form: UseFormReturn<ServiceFormValues> }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Invoice Text
      </h4>
      <div className="grid grid-cols-2 gap-3">
        <FormField control={form.control} name="invoice_text_en" render={({ field }) => (
          <FormItem>
            <FormLabel>Invoice Text (EN)</FormLabel>
            <FormControl><Textarea rows={1} className="resize-none overflow-hidden [field-sizing:content] min-h-[2.5rem]" {...field} value={field.value ?? ''} /></FormControl>
          </FormItem>
        )} />
        <FormField control={form.control} name="invoice_text_ar" render={({ field }) => (
          <FormItem>
            <FormLabel>Invoice Text (AR)</FormLabel>
            <FormControl><Textarea rows={1} dir="rtl" className="resize-none overflow-hidden [field-sizing:content] min-h-[2.5rem]" {...field} value={field.value ?? ''} /></FormControl>
          </FormItem>
        )} />
      </div>
    </div>
  )
}

// ─── Photo Requirement ─────────────────────────────────────────────────────────

const PHOTO_OPTIONS: { value: ServiceFormValues['photo_requirement']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'before', label: 'Before' },
  { value: 'after', label: 'After' },
  { value: 'both', label: 'Both' },
  { value: 'optional', label: 'Optional' },
]

export function PhotoRequirementSection({ form }: { form: UseFormReturn<ServiceFormValues> }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Photo Requirement
      </h4>
      <FormField control={form.control} name="photo_requirement" render={({ field }) => (
        <FormItem>
          <div className="flex flex-wrap gap-1.5">
            {PHOTO_OPTIONS.map(({ value, label }) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={field.value === value ? 'default' : 'outline'}
                className="h-7 text-[11px]"
                onClick={() => field.onChange(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <FormMessage />
        </FormItem>
      )} />
    </div>
  )
}
