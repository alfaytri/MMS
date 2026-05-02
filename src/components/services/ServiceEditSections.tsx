// src/components/services/ServiceEditSections.tsx
'use client'

import { useWatch, useFieldArray, type UseFormReturn } from 'react-hook-form'
import { z } from 'zod'
import { Upload, X, ImageIcon, Trash2, Plus, Search, Check } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { cn } from '@/lib/utils'
import { useDivisions } from '@/hooks/useDivisions'
import type { Service } from '@/hooks/useServices'

// ─── Schema ───────────────────────────────────────────────────────────────────

export const serviceSchema = z.object({
  name_en: z.string().min(1, 'Name (EN) is required'),
  name_ar: z.string().optional().nullable(),
  code: z.string().optional().nullable(),
  legacy_service_id: z.string().optional().nullable(),
  status: z.enum(['active', 'inactive']),
  division: z.array(z.string()).min(1, 'Select at least one division'),
  parent_id: z.string().nullable(),
  // Pricing
  price: z.coerce.number().nullable(),
  emergency_price: z.coerce.number().nullable(),
  discount: z.coerce.number().nullable(),
  price_unit: z.string().nullable(),
  // Contract
  contract_type: z.enum(['preventive', 'area', 'general']).nullable(),
  // Duration & Warranty
  duration: z.coerce.number().nullable(),
  warranty: z.coerce.number().nullable(),
  // Invoice text
  invoice_text_en: z.string().nullable(),
  invoice_text_ar: z.string().nullable(),
  // Photo requirement
  photo_requirement: z.enum(['none', 'before', 'after', 'both', 'optional']),
  // Feature toggles
  has_inventory: z.boolean(),
  inventory_items_list: z.array(
    z.object({ name: z.string().min(1), qty: z.coerce.number().min(0) }),
  ),
  has_reminders: z.boolean(),
  reminder_days: z.coerce.number().nullable(),
  qc_checklist: z.boolean(),
  spare_parts: z.boolean(),
  service_type: z.enum(['standard', 'configurable']),
  component_service_ids: z.array(z.string()).nullable(),
  qc_items: z.array(
    z.object({ label: z.string().min(1), max_score: z.coerce.number().min(0) }),
  ),
})

export type ServiceFormValues = z.infer<typeof serviceSchema>

export function toDefaults(
  node: Service | null,
  type: 'normal' | 'contract' | 'mobile',
  parentId: string | null,
  parentDivision?: string[] | null,
): ServiceFormValues {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = node as any
  return {
    name_en: s?.name_en ?? '',
    name_ar: s?.name_ar ?? null,
    code: s?.code ?? null,
    legacy_service_id: s?.legacy_service_id ?? null,
    status: (s?.status as 'active' | 'inactive') ?? 'active',
    division: Array.isArray(s?.division) && s.division.length > 0
      ? s.division
      : (Array.isArray(parentDivision) && parentDivision.length > 0 ? parentDivision : []),
    parent_id: s?.parent_id ?? parentId,
    price: s?.price ?? null,
    emergency_price: s?.emergency_price ?? null,
    discount: s?.discount ?? null,
    price_unit: s?.price_unit ?? null,
    contract_type: (s?.contract_type as ServiceFormValues['contract_type']) ?? null,
    duration: s?.duration ?? null,
    warranty: s?.warranty ?? null,
    invoice_text_en: s?.invoice_text_en ?? null,
    invoice_text_ar: s?.invoice_text_ar ?? null,
    photo_requirement: (s?.photo_requirement as ServiceFormValues['photo_requirement']) ?? 'none',
    has_inventory: Array.isArray(s?.inventory_items)
      ? s.inventory_items.length > 0
      : !!s?.inventory_items,
    inventory_items_list: Array.isArray(s?.inventory_items) ? s.inventory_items : [],
    has_reminders: s?.reminder_days != null,
    reminder_days: s?.reminder_days ?? null,
    qc_checklist: s?.qc_checklist ?? false,
    spare_parts: s?.spare_parts ?? false,
    service_type: (s?.service_type as 'standard' | 'configurable') ?? 'standard',
    component_service_ids: Array.isArray(s?.components) ? s.components : null,
    qc_items: Array.isArray(s?.qc_items) ? s.qc_items : [],
  }
}

// ─── Core Identity ─────────────────────────────────────────────────────────────

export function CoreSection({ form }: { form: UseFormReturn<ServiceFormValues> }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField control={form.control} name="name_en" render={({ field }) => (
          <FormItem>
            <FormLabel>Name (English) <span className="text-destructive">*</span></FormLabel>
            <FormControl><Input {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="name_ar" render={({ field }) => (
          <FormItem>
            <FormLabel>Name (Arabic)</FormLabel>
            <FormControl><Input {...field} value={field.value ?? ''} dir="rtl" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField control={form.control} name="code" render={({ field }) => (
          <FormItem>
            <FormLabel>Service Code</FormLabel>
            <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="legacy_service_id" render={({ field }) => (
          <FormItem>
            <FormLabel>Legacy Service ID</FormLabel>
            <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>
    </div>
  )
}

// ─── Catalog Image ─────────────────────────────────────────────────────────────

interface CatalogImageSectionProps {
  pendingFile: File | null
  currentUrl: string | null
  onFileChange: (f: File | null) => void
}

export function CatalogImageSection({ pendingFile, currentUrl, onFileChange }: CatalogImageSectionProps) {
  const thumbSrc = pendingFile ? URL.createObjectURL(pendingFile) : currentUrl

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5 MB')
      return
    }
    onFileChange(file)
  }

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-sm">
        <ImageIcon className="h-3.5 w-3.5" />Catalog Image
      </Label>
      {thumbSrc ? (
        <div className="flex items-center gap-3">
          <img src={thumbSrc} alt="Service" className="h-16 w-16 rounded border object-cover" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => onFileChange(null)}
          >
            <X className="h-3 w-3" />Remove
          </Button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed rounded cursor-pointer hover:bg-muted/30 transition-colors">
          <Upload className="h-4 w-4 text-muted-foreground mb-1" />
          <span className="text-xs text-muted-foreground">Click to upload image (max 5 MB)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
      )}
    </div>
  )
}

// ─── Status ────────────────────────────────────────────────────────────────────

export function StatusSection({ form }: { form: UseFormReturn<ServiceFormValues> }) {
  return (
    <FormField control={form.control} name="status" render={({ field }) => (
      <FormItem>
        <FormLabel>Status</FormLabel>
        <div className="flex gap-2 mt-1.5">
          {(['active', 'inactive'] as const).map((v) => (
            <Button
              key={v}
              type="button"
              size="sm"
              variant={field.value === v ? 'default' : 'outline'}
              className="h-8 text-[11px] capitalize flex-1"
              onClick={() => field.onChange(v)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </Button>
          ))}
        </div>
        <FormMessage />
      </FormItem>
    )} />
  )
}

// ─── Division (multi-select toggle) ────────────────────────────────────────────

interface DivisionSectionProps {
  form: UseFormReturn<ServiceFormValues>
  mode: 'new' | 'edit'
  hasParent: boolean
}

export function DivisionSection({ form, mode, hasParent }: DivisionSectionProps) {
  const { data: divisions = [] } = useDivisions()
  const inherited = mode === 'new' && hasParent
  const selected = (useWatch({ control: form.control, name: 'division' }) ?? []) as string[]

  function toggle(slug: string) {
    const current = form.getValues('division') as string[]
    const next = current.includes(slug)
      ? current.filter((s) => s !== slug)
      : [...current, slug]
    form.setValue('division', next, { shouldDirty: true, shouldValidate: true })
  }

  return (
    <FormField control={form.control} name="division" render={() => (
      <FormItem>
        <FormLabel>Division <span className="text-destructive">*</span></FormLabel>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {divisions.map((d) => (
            <button
              key={d.slug}
              type="button"
              disabled={inherited}
              onClick={() => toggle(d.slug)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border transition-colors',
                selected.includes(d.slug)
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-transparent text-foreground hover:bg-muted',
              )}
            >
              {d.short_name ?? d.name}
            </button>
          ))}
        </div>
        {inherited && (
          <p className="text-[11px] text-muted-foreground mt-1">Inherited from parent service</p>
        )}
        <FormMessage />
      </FormItem>
    )} />
  )
}

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
            <FormControl><Textarea rows={2} {...field} value={field.value ?? ''} /></FormControl>
          </FormItem>
        )} />
        <FormField control={form.control} name="invoice_text_ar" render={({ field }) => (
          <FormItem>
            <FormLabel>Invoice Text (AR)</FormLabel>
            <FormControl><Textarea rows={2} dir="rtl" {...field} value={field.value ?? ''} /></FormControl>
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

// ─── Feature Fields (QC, parts, inventory, reminders, service type, components) ─

interface FeatureFieldsSectionProps {
  form: UseFormReturn<ServiceFormValues>
  treeData?: Service[]
  currentServiceId?: string | null
}

export function FeatureFieldsSection({
  form,
  treeData = [],
  currentServiceId,
}: FeatureFieldsSectionProps) {
  const [componentSearch, setComponentSearch] = useState('')

  const { fields: inventoryFields, append: appendItem, remove: removeItem } = useFieldArray({
    control: form.control,
    name: 'inventory_items_list',
  })
  const { fields: qcFields, append: appendQc, remove: removeQc } = useFieldArray({
    control: form.control,
    name: 'qc_items',
  })
  const hasInventory = useWatch({ control: form.control, name: 'has_inventory' })
  const hasReminders = useWatch({ control: form.control, name: 'has_reminders' })
  const serviceType = useWatch({ control: form.control, name: 'service_type' })
  const componentIds = (useWatch({ control: form.control, name: 'component_service_ids' }) ?? []) as string[]

  function toggleComponent(id: string) {
    const current = componentIds
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id]
    form.setValue('component_service_ids', next, { shouldDirty: true })
  }

  // Services available as components: exclude self and descendants
  const availableComponents = treeData.filter((s) => s.id !== currentServiceId)

  const filteredComponents = componentSearch.trim()
    ? availableComponents.filter(
        (s) =>
          s.name_en.toLowerCase().includes(componentSearch.toLowerCase()) ||
          (s.name_ar && s.name_ar.toLowerCase().includes(componentSearch.toLowerCase())),
      )
    : availableComponents

  return (
    <div className="space-y-4">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Features</h4>

      <FormField control={form.control} name="qc_checklist" render={({ field }) => (
        <FormItem className="flex items-center justify-between">
          <FormLabel className="text-sm font-normal">QC Checklist</FormLabel>
          <FormControl><Switch checked={field.value ?? false} onCheckedChange={field.onChange} /></FormControl>
        </FormItem>
      )} />

      <FormField control={form.control} name="spare_parts" render={({ field }) => (
        <FormItem className="flex items-center justify-between">
          <FormLabel className="text-sm font-normal">Spare Parts Included</FormLabel>
          <FormControl><Switch checked={field.value ?? false} onCheckedChange={field.onChange} /></FormControl>
        </FormItem>
      )} />

      {/* Inventory */}
      <div className="space-y-2">
        <FormField control={form.control} name="has_inventory" render={({ field }) => (
          <FormItem className="flex items-center justify-between">
            <FormLabel className="text-sm font-normal">Inventory Items</FormLabel>
            <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
          </FormItem>
        )} />
        {hasInventory && (
          <div className="ml-4 space-y-2 border-l-2 border-border pl-3">
            {inventoryFields.map((f, idx) => (
              <div key={f.id} className="flex gap-2 items-end">
                <FormField control={form.control} name={`inventory_items_list.${idx}.name`} render={({ field }) => (
                  <FormItem className="flex-1">
                    {idx === 0 && <FormLabel className="text-xs">Item Name</FormLabel>}
                    <FormControl><Input className="h-8 text-xs" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name={`inventory_items_list.${idx}.qty`} render={({ field }) => (
                  <FormItem className="w-20">
                    {idx === 0 && <FormLabel className="text-xs">Qty</FormLabel>}
                    <FormControl><Input type="number" className="h-8 text-xs" {...field} /></FormControl>
                  </FormItem>
                )} />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => removeItem(idx)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1"
              onClick={() => appendItem({ name: '', qty: 1 })}>
              <Plus className="h-3 w-3" />Add Item
            </Button>
          </div>
        )}
      </div>

      {/* Reminders */}
      <div className="space-y-2">
        <FormField control={form.control} name="has_reminders" render={({ field }) => (
          <FormItem className="flex items-center justify-between">
            <FormLabel className="text-sm font-normal">Reminders</FormLabel>
            <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
          </FormItem>
        )} />
        {hasReminders && (
          <div className="ml-4 border-l-2 border-border pl-3">
            <FormField control={form.control} name="reminder_days" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">Remind every N days</FormLabel>
                <FormControl>
                  <Input type="number" className="h-8 text-xs w-32" {...field}
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.valueAsNumber)}
                  />
                </FormControl>
              </FormItem>
            )} />
          </div>
        )}
      </div>

      {/* Service Type */}
      <div className="space-y-2">
        <FormField control={form.control} name="service_type" render={({ field }) => (
          <FormItem>
            <FormLabel className="text-sm font-normal">Service Type</FormLabel>
            <div className="flex gap-2 mt-1">
              <Button
                type="button" size="sm"
                variant={field.value === 'standard' ? 'default' : 'outline'}
                className="h-7 text-[11px]"
                onClick={() => field.onChange('standard')}
              >
                Standard
              </Button>
              <Button
                type="button" size="sm"
                variant={field.value === 'configurable' ? 'default' : 'outline'}
                className="h-7 text-[11px]"
                onClick={() => field.onChange('configurable')}
              >
                Configurable
              </Button>
            </div>
          </FormItem>
        )} />

        {/* Component services selector — only for configurable */}
        {serviceType === 'configurable' && (
          <div className="ml-4 border-l-2 border-border pl-3 space-y-2">
            <p className="text-[11px] text-muted-foreground">
              Select the services bundled inside this configurable service.
            </p>
            {componentIds.length > 0 && (
              <p className="text-[11px] font-medium text-foreground">
                {componentIds.length} service{componentIds.length !== 1 ? 's' : ''} selected
              </p>
            )}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search services…"
                value={componentSearch}
                onChange={(e) => setComponentSearch(e.target.value)}
                className="h-7 pl-6 text-[11px]"
              />
            </div>
            <div className="border rounded-md max-h-48 overflow-y-auto">
              {filteredComponents.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-4">No services found</p>
              ) : (
                filteredComponents.map((s) => {
                  const isSelected = componentIds.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleComponent(s.id)}
                      className={cn(
                        'flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0',
                        isSelected && 'bg-primary/5',
                      )}
                    >
                      <Check className={cn(
                        'h-3 w-3 shrink-0',
                        isSelected ? 'text-primary opacity-100' : 'opacity-0',
                      )} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs truncate font-normal">{s.name_en}</div>
                        {s.name_ar && (
                          <div className="text-[10px] truncate text-muted-foreground">{s.name_ar}</div>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* QC Items */}
      <div className="space-y-2">
        <h5 className="text-xs font-medium text-foreground">QC Items</h5>
        {qcFields.map((f, idx) => (
          <div key={f.id} className="flex gap-2 items-end">
            <FormField control={form.control} name={`qc_items.${idx}.label`} render={({ field }) => (
              <FormItem className="flex-1">
                {idx === 0 && <FormLabel className="text-xs">Label</FormLabel>}
                <FormControl><Input className="h-8 text-xs" {...field} /></FormControl>
              </FormItem>
            )} />
            <FormField control={form.control} name={`qc_items.${idx}.max_score`} render={({ field }) => (
              <FormItem className="w-24">
                {idx === 0 && <FormLabel className="text-xs">Max Score</FormLabel>}
                <FormControl><Input type="number" className="h-8 text-xs" {...field} /></FormControl>
              </FormItem>
            )} />
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => removeQc(idx)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1"
          onClick={() => appendQc({ label: '', max_score: 10 })}>
          <Plus className="h-3 w-3" />Add QC Item
        </Button>
      </div>
    </div>
  )
}
