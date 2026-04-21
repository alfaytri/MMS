'use client'

import { useState, useEffect, useMemo } from 'react'
import { useForm, useFieldArray, useWatch, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Check, ChevronsUpDown, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useDivisions } from '@/hooks/useDivisions'
import {
  useServiceTree, useCreateService, useUpdateService,
  type Service,
} from '@/hooks/useServices'
import { collectDescendantIds, buildTreeMap } from './ServiceTree'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

const serviceSchema = z.object({
  name_en: z.string().min(1, 'Name (EN) is required'),
  name_ar: z.string().optional().nullable(),
  code: z.string().optional().nullable(),
  status: z.enum(['active', 'inactive']),
  division: z.enum(['maintenance', 'cleaning', 'kitchen', 'pest-control']),
  parent_id: z.string().nullable(),
  // Pricing
  price: z.coerce.number().nullable(),
  emergency_price: z.coerce.number().nullable(),
  discount: z.coerce.number().nullable(),
  price_unit: z.string().nullable(),
  // Contract
  contract_type: z.enum(['preventive', 'area', 'general']).nullable(),
  // Feature toggles
  has_inventory: z.boolean(),
  inventory_items_list: z.array(z.object({ name: z.string().min(1), qty: z.coerce.number().min(0) })),
  has_reminders: z.boolean(),
  reminder_days: z.coerce.number().nullable(),
  has_instructions: z.boolean(),
  qc_checklist: z.boolean(),
  spare_parts: z.boolean(),
  // Invoice text
  invoice_text_en: z.string().nullable(),
  invoice_text_ar: z.string().nullable(),
})

type ServiceFormValues = z.infer<typeof serviceSchema>

interface ServiceEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'new' | 'edit'
  type: 'normal' | 'contract' | 'mobile'
  node: Service | null
  parentId: string | null
}

function toDefaults(node: Service | null, type: string, parentId: string | null): ServiceFormValues {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = node as any
  return {
    name_en: s?.name_en ?? '',
    name_ar: s?.name_ar ?? null,
    code: s?.code ?? null,
    status: (s?.status as 'active' | 'inactive') ?? 'active',
    division: (s?.division as ServiceFormValues['division']) ?? 'maintenance',
    parent_id: s?.parent_id ?? parentId,
    price: s?.price ?? null,
    emergency_price: s?.emergency_price ?? null,
    discount: s?.discount ?? null,
    price_unit: s?.price_unit ?? null,
    contract_type: (s?.contract_type as ServiceFormValues['contract_type']) ?? null,
    has_inventory: Array.isArray(s?.inventory_items)
      ? s.inventory_items.length > 0
      : !!s?.inventory_items,
    inventory_items_list: Array.isArray(s?.inventory_items) ? s.inventory_items : [],
    has_reminders: s?.reminder_days != null,
    reminder_days: s?.reminder_days ?? null,
    has_instructions: s?.instructions ?? false,
    qc_checklist: s?.qc_checklist ?? false,
    spare_parts: s?.spare_parts ?? false,
    invoice_text_en: s?.invoice_text_en ?? null,
    invoice_text_ar: s?.invoice_text_ar ?? null,
  }
}

export function ServiceEditDialog({
  open,
  onOpenChange,
  mode,
  type,
  node,
  parentId,
}: ServiceEditDialogProps) {
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false)
  const [parentOpen, setParentOpen] = useState(false)
  const createService = useCreateService()
  const updateService = useUpdateService()

  const { data: treeData = [] } = useServiceTree(type, [], open)
  const { data: divisions = [] } = useDivisions()

  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceSchema) as Resolver<ServiceFormValues>,
    defaultValues: toDefaults(node, type, parentId),
  })

  useEffect(() => {
    if (open) {
      form.reset(toDefaults(node, type, parentId))
      setParentOpen(false)
    }
  }, [open, node, parentId, type]) // eslint-disable-line react-hooks/exhaustive-deps

  const { fields: inventoryFields, append: appendItem, remove: removeItem } = useFieldArray({
    control: form.control,
    name: 'inventory_items_list',
  })

  const hasInventory = useWatch({ control: form.control, name: 'has_inventory' })
  const hasReminders = useWatch({ control: form.control, name: 'has_reminders' })
  const hasInstructions = useWatch({ control: form.control, name: 'has_instructions' })
  const contractType = useWatch({ control: form.control, name: 'contract_type' })
  const currentParentId = useWatch({ control: form.control, name: 'parent_id' })

  const parentComboItems = useMemo(() => {
    const treeMap = buildTreeMap(treeData)
    const excludeIds = new Set<string>()
    if (node) {
      excludeIds.add(node.id)
      collectDescendantIds(node.id, treeMap).forEach((id) => excludeIds.add(id))
    }

    type ComboItem = { id: string; name_en: string; name_ar: string | null; depth: number; breadcrumb: string }

    function traverse(parentIdKey: string | null, depth: number, breadcrumb: string): ComboItem[] {
      const children = treeMap.get(parentIdKey) ?? []
      const result: ComboItem[] = []
      for (const child of children) {
        if (excludeIds.has(child.id)) continue
        result.push({ id: child.id, name_en: child.name_en, name_ar: child.name_ar, depth, breadcrumb })
        result.push(...traverse(child.id, depth + 1, breadcrumb ? `${breadcrumb} > ${child.name_en}` : child.name_en))
      }
      return result
    }
    return traverse(null, 0, '')
  }, [treeData, node])

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && form.formState.isDirty) {
      setConfirmDiscardOpen(true)
      return
    }
    onOpenChange(nextOpen)
  }

  function buildServicePayload(values: ServiceFormValues) {
    return {
      name_en: values.name_en,
      name_ar: values.name_ar || null,
      code: values.code || null,
      status: values.status,
      division: values.division,
      parent_id: values.parent_id,
      tree_type: type,
      price: values.price,
      emergency_price: type !== 'contract' ? values.emergency_price : null,
      discount: type === 'contract' ? values.discount : null,
      price_unit: values.contract_type === 'area' ? values.price_unit : null,
      contract_type: type === 'contract' ? values.contract_type : null,
      instructions: values.has_instructions,
      reminder_days: values.has_reminders ? values.reminder_days : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inventory_items: values.has_inventory ? (values.inventory_items_list as any) : null,
      qc_checklist: values.qc_checklist,
      spare_parts: values.spare_parts,
      invoice_text_en: values.invoice_text_en || null,
      invoice_text_ar: values.invoice_text_ar || null,
    }
  }

  async function onSubmit(values: ServiceFormValues) {
    try {
      const payload = buildServicePayload(values)
      if (mode === 'new') {
        await createService.mutateAsync({
          ...payload,
          sort_order: 0,
          treeType: type,
        })
      } else if (node) {
        const changedFields = Object.keys(form.formState.dirtyFields)
        await updateService.mutateAsync({
          id: node.id,
          ...payload,
          treeType: type,
          changedFields,
        })
      }
      toast.success('Service saved')
      onOpenChange(false)
    } catch (err) {
      toast.error('Failed to save service')
      console.error(err)
    }
  }

  const selectedParent = parentComboItems.find((i) => i.id === currentParentId)

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto sm:rounded-lg rounded-none">
          <DialogHeader>
            <DialogTitle>
              {mode === 'new'
                ? `New ${type === 'contract' ? 'Contract' : type === 'mobile' ? 'Mobile App' : ''} Service`
                : 'Edit Service'}
            </DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

              {/* CORE SECTION */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="name_en" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name (EN)</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="name_ar" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name (AR)</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ''} dir="rtl" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <FormField control={form.control} name="code" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="division" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Division</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {divisions.map((d) => (
                            <SelectItem key={d.slug} value={d.slug}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Status</FormLabel>
                      <div className="flex items-center gap-2 pt-2">
                        <Switch
                          checked={field.value === 'active'}
                          onCheckedChange={(checked) => field.onChange(checked ? 'active' : 'inactive')}
                        />
                        <span className="text-sm">{field.value === 'active' ? 'Active' : 'Inactive'}</span>
                      </div>
                    </FormItem>
                  )} />
                </div>

                {/* Parent service combobox — state lifted to component level to avoid hook-in-render violation */}
                <FormField control={form.control} name="parent_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Parent Service (optional)</FormLabel>
                    <Popover open={parentOpen} onOpenChange={setParentOpen}>
                      <PopoverTrigger
                        className="w-full h-9 inline-flex items-center justify-between rounded-md border border-input bg-background px-3 text-sm font-normal shadow-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        render={(props) => <button type="button" {...props} />}
                      >
                        {selectedParent ? selectedParent.name_en : 'None (root level)'}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </PopoverTrigger>
                      <PopoverContent className="w-[420px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search services…" />
                          <CommandList className="max-h-60">
                            <CommandEmpty>No services found.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="__none__"
                                onSelect={() => { field.onChange(null); setParentOpen(false) }}
                              >
                                <Check className={cn('mr-2 h-4 w-4', field.value === null ? 'opacity-100' : 'opacity-0')} />
                                <span className="text-sm text-muted-foreground italic">None (root level)</span>
                              </CommandItem>
                              {parentComboItems.map((item) => (
                                <CommandItem
                                  key={item.id}
                                  value={`${item.breadcrumb} ${item.name_en}`}
                                  onSelect={() => { field.onChange(item.id); setParentOpen(false) }}
                                >
                                  <Check className={cn('mr-2 h-4 w-4 shrink-0', field.value === item.id ? 'opacity-100' : 'opacity-0')} />
                                  <div style={{ paddingInlineStart: item.depth * 16 }}>
                                    {item.breadcrumb && (
                                      <div className="text-[10px] text-muted-foreground leading-tight">{item.breadcrumb}</div>
                                    )}
                                    <div className="text-xs">
                                      {item.name_en}
                                      {item.name_ar && <span className="text-muted-foreground ml-1.5">{item.name_ar}</span>}
                                    </div>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </FormItem>
                )} />
              </div>

              {/* PRICING SECTION */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pricing</h4>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="price" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price</FormLabel>
                      <FormControl>
                        <Input
                          type="number" step="0.01"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.valueAsNumber)}
                        />
                      </FormControl>
                    </FormItem>
                  )} />
                  {type !== 'contract' && (
                    <FormField control={form.control} name="emergency_price" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Emergency Price</FormLabel>
                        <FormControl>
                          <Input
                            type="number" step="0.01"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.valueAsNumber)}
                          />
                        </FormControl>
                      </FormItem>
                    )} />
                  )}
                  {type === 'contract' && (
                    <FormField control={form.control} name="discount" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Discount %</FormLabel>
                        <FormControl>
                          <Input
                            type="number" step="0.1"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.valueAsNumber)}
                          />
                        </FormControl>
                      </FormItem>
                    )} />
                  )}
                </div>
                {type === 'contract' && contractType === 'area' && (
                  <FormField control={form.control} name="price_unit" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price Unit (e.g. sqm)</FormLabel>
                      <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
                    </FormItem>
                  )} />
                )}
              </div>

              {/* CONTRACT TYPE SECTION */}
              {type === 'contract' && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contract Type</h4>
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
                    </FormItem>
                  )} />
                </div>
              )}

              {/* FEATURES SECTION — normal + mobile only */}
              {type !== 'contract' && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Features</h4>

                  {/* Inventory */}
                  <div className="space-y-2">
                    <FormField control={form.control} name="has_inventory" render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <Label className="text-sm">Inventory Items</Label>
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
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeItem(idx)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1"
                          onClick={() => appendItem({ name: '', qty: 1 })}
                        >
                          <Plus className="h-3 w-3" />Add Item
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Reminders */}
                  <div className="space-y-2">
                    <FormField control={form.control} name="has_reminders" render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <Label className="text-sm">Reminders</Label>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                    {hasReminders && (
                      <div className="ml-4 border-l-2 border-border pl-3">
                        <FormField control={form.control} name="reminder_days" render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Remind every N days</FormLabel>
                            <FormControl>
                              <Input
                                type="number" className="h-8 text-xs w-32"
                                {...field}
                                value={field.value ?? ''}
                                onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.valueAsNumber)}
                              />
                            </FormControl>
                          </FormItem>
                        )} />
                      </div>
                    )}
                  </div>

                  {/* Instructions */}
                  <div className="space-y-2">
                    <FormField control={form.control} name="has_instructions" render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <Label className="text-sm">Instructions</Label>
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                      </FormItem>
                    )} />
                    {hasInstructions && (
                      <div className="ml-4 border-l-2 border-border pl-3">
                        <p className="text-xs text-muted-foreground">
                          Instruction linking available in the Notifications & Instructions plan.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* QC Checklist */}
                  <FormField control={form.control} name="qc_checklist" render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <Label className="text-sm">QC Checklist</Label>
                      <FormControl><Switch checked={field.value ?? false} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                  )} />

                  {/* Spare Parts */}
                  <FormField control={form.control} name="spare_parts" render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <Label className="text-sm">Spare Parts</Label>
                      <FormControl><Switch checked={field.value ?? false} onCheckedChange={field.onChange} /></FormControl>
                    </FormItem>
                  )} />
                </div>
              )}

              {/* INVOICE TEXT SECTION */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoice Text</h4>
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

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createService.isPending || updateService.isPending}>
                  {createService.isPending || updateService.isPending ? 'Saving…' : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Unsaved changes guard */}
      <ConfirmDialog
        open={confirmDiscardOpen}
        onOpenChange={setConfirmDiscardOpen}
        title="Discard changes?"
        description="You have unsaved changes. They will be lost if you close now."
        confirmLabel="Discard"
        variant="destructive"
        onConfirm={() => { setConfirmDiscardOpen(false); onOpenChange(false) }}
      />
    </>
  )
}
