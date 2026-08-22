'use client'

import { useWatch, useFieldArray, type UseFormReturn } from 'react-hook-form'
import { Trash2, Plus, Search, Check, ChevronRight, ChevronDown } from 'lucide-react'
import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  FormControl, FormField, FormItem, FormLabel,
} from '@/components/ui/form'
import { cn } from '@/lib/utils'
import type { Service } from '@/hooks/useServices'
import type { ServiceFormValues } from './ServiceEditSections'

// ─── Component Tree Picker (used inside Configurable service type) ─────────────

type ComponentEntry = { id: string; qty: number }

interface ComponentTreePickerProps {
  flat: Service[]
  selectedEntries: ComponentEntry[]
  onToggle: (id: string) => void
  onQtyChange: (id: string, qty: number) => void
}

function ComponentTreePicker({ flat, selectedEntries, onToggle, onQtyChange }: ComponentTreePickerProps) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const selectedIds = useMemo(() => new Set(selectedEntries.map((e) => e.id)), [selectedEntries])
  const qtyMap = useMemo(
    () => new Map(selectedEntries.map((e) => [e.id, e.qty])),
    [selectedEntries],
  )

  const visibleFlat = useMemo(() => {
    if (!search.trim()) return flat
    const lower = search.toLowerCase()
    const parentMap = new Map(flat.map((s) => [s.id, s.parent_id ?? null]))
    const directMatches = new Set(
      flat
        .filter(
          (s) =>
            s.name_en.toLowerCase().includes(lower) ||
            (s.name_ar && s.name_ar.toLowerCase().includes(lower)),
        )
        .map((s) => s.id),
    )
    const keepIds = new Set(directMatches)
    function addAncestors(id: string) {
      const parent = parentMap.get(id)
      if (parent && !keepIds.has(parent)) { keepIds.add(parent); addAncestors(parent) }
    }
    directMatches.forEach((id) => addAncestors(id))
    return flat.filter((s) => keepIds.has(s.id))
  }, [flat, search])

  const treeMap = useMemo(() => {
    const map = new Map<string | null, Service[]>()
    for (const s of visibleFlat) {
      const key = s.parent_id ?? null
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return map
  }, [visibleFlat])

  const descendantSelectedCount = useMemo(() => {
    const counts = new Map<string, number>()
    function countSelected(id: string): number {
      const children = treeMap.get(id) ?? []
      const childSum = children.reduce((acc, c) => acc + countSelected(c.id), 0)
      const self = selectedIds.has(id) ? 1 : 0
      counts.set(id, self + childSum)
      return self + childSum
    }
    const roots = treeMap.get(null) ?? []
    roots.forEach((r) => countSelected(r.id))
    return counts
  }, [treeMap, selectedIds])

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function renderNode(service: Service, depth: number): React.ReactNode {
    const children = treeMap.get(service.id) ?? []
    const hasChildren = children.length > 0
    const isExpanded = expanded.has(service.id) || !!search.trim()
    const isSelected = selectedIds.has(service.id)
    const qty = qtyMap.get(service.id) ?? 1
    const hiddenChildCount = !isExpanded && hasChildren
      ? (descendantSelectedCount.get(service.id) ?? 0) - (isSelected ? 1 : 0)
      : 0

    return (
      <div key={service.id}>
        <div
          className={cn(
            'flex items-center gap-1.5 w-full py-1.5 pr-2 border-b border-border/20 last:border-0',
            isSelected && 'bg-primary/5',
          )}
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          <button
            type="button"
            className="w-4 h-4 flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground relative"
            onClick={() => hasChildren && toggleExpand(service.id)}
            tabIndex={hasChildren ? 0 : -1}
          >
            {hasChildren
              ? isExpanded
                ? <ChevronDown className="h-3 w-3" />
                : <ChevronRight className="h-3 w-3" />
              : null}
            {hiddenChildCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-primary block" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onToggle(service.id)}
            className={cn(
              'h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 transition-colors',
              isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/40 bg-background hover:border-primary/60',
            )}
          >
            {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
          </button>

          <button
            type="button"
            onClick={() => onToggle(service.id)}
            className="min-w-0 flex-1 text-left"
          >
            <div className={cn('text-xs truncate', hasChildren ? 'font-medium' : 'font-normal')}>
              {service.name_en}
            </div>
            {service.name_ar && (
              <div className="text-[10px] truncate text-muted-foreground">{service.name_ar}</div>
            )}
          </button>

          {isSelected && (
            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <span className="text-[10px] text-muted-foreground">&times;</span>
              <Input
                type="number"
                min={1}
                step={1}
                value={qty}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  if (v > 0) onQtyChange(service.id, v)
                }}
                className="h-6 w-12 text-[11px] px-1.5"
                aria-label="Quantity"
              />
            </div>
          )}
        </div>

        {hasChildren && isExpanded && children.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  const roots = treeMap.get(null) ?? []

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search services…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 pl-6 text-[11px]"
        />
      </div>
      <div className="border rounded-md max-h-56 overflow-y-auto">
        {roots.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-4">No services found</p>
        ) : (
          roots.map((root) => renderNode(root, 0))
        )}
      </div>
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
  const componentEntries = (useWatch({ control: form.control, name: 'component_service_ids' }) ?? []) as ComponentEntry[]

  function toggleComponent(id: string) {
    const already = componentEntries.find((e) => e.id === id)
    const next = already
      ? componentEntries.filter((e) => e.id !== id)
      : [...componentEntries, { id, qty: 1 }]
    form.setValue('component_service_ids', next, { shouldDirty: true })
  }

  function setComponentQty(id: string, qty: number) {
    const next = componentEntries.map((e) => e.id === id ? { ...e, qty } : e)
    form.setValue('component_service_ids', next, { shouldDirty: true })
  }

  const availableComponents = treeData.filter((s) => s.id !== currentServiceId)

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

        {serviceType === 'configurable' && (
          <div className="ml-4 border-l-2 border-border pl-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                Select the services bundled into this one.
              </p>
              {componentEntries.length > 0 && (
                <span className="text-[11px] font-medium text-primary">
                  {componentEntries.length} selected
                </span>
              )}
            </div>
            <ComponentTreePicker
              flat={availableComponents}
              selectedEntries={componentEntries}
              onToggle={toggleComponent}
              onQtyChange={setComponentQty}
            />
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
