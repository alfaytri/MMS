'use client'

import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  useCreateInventoryItem, useUpdateInventoryItem,
  type InventoryItem,
} from '@/hooks/useInventory'
import { useAllCategoriesFlat, breadcrumb as getBreadcrumb } from '@/hooks/useInventoryTree'

const itemSchema = z.object({
  category_id: z.string().min(1, 'Category is required'),
  name_en: z.string().min(1, 'Name is required'),
  name_ar: z.string().optional().default(''),
  sku: z.string().min(1, 'SKU is required'),
  unit: z.string().min(1, 'Unit is required'),
  cost_price: z.coerce.number().min(0).default(0),
  markup_percent: z.coerce.number().min(0).optional(),
  warranty_months: z.coerce.number().int().min(0).optional(),
  sort_order: z.coerce.number().int().default(0),
})

type ItemFormValues = z.infer<typeof itemSchema>

interface InventoryItemFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: InventoryItem | null
  defaultCategoryId?: string
}

export function InventoryItemFormDialog({ open, onOpenChange, item, defaultCategoryId }: InventoryItemFormDialogProps) {
  const isEditing = !!item
  const create = useCreateInventoryItem()
  const update = useUpdateInventoryItem()
  const { data: allCategories } = useAllCategoriesFlat()
  const categories = useMemo(
    () => (allCategories ?? []).filter((c) => {
      const hasChildren = (allCategories ?? []).some((child) => child.parent_id === c.id)
      return !hasChildren
    }),
    [allCategories],
  )
  const isPending = create.isPending || update.isPending

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema) as never,
    defaultValues: {
      category_id: defaultCategoryId ?? '', name_en: '', name_ar: '', sku: '', unit: 'pcs',
      cost_price: 0, markup_percent: undefined, warranty_months: undefined, sort_order: 0,
    },
  })

  useEffect(() => {
    if (open && item) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const i = item as any
      form.reset({
        category_id: i.category_id, name_en: i.name_en, name_ar: i.name_ar ?? '',
        sku: i.sku, unit: i.unit, cost_price: Number(i.cost_price ?? 0),
        markup_percent: i.markup_percent ? Number(i.markup_percent) : undefined,
        warranty_months: i.warranty_months ?? undefined, sort_order: i.sort_order,
      })
    } else if (open) {
      form.reset({ category_id: defaultCategoryId ?? '', name_en: '', name_ar: '', sku: '', unit: 'pcs', cost_price: 0, markup_percent: undefined, warranty_months: undefined, sort_order: 0 })
    }
  }, [open, item, defaultCategoryId, form])

  function onSubmit(values: ItemFormValues) {
    const payload = {
      ...values,
      name_ar: values.name_ar || null,
      markup_percent: values.markup_percent ?? null,
      warranty_months: values.warranty_months ?? null,
    }
    const mutation = isEditing
      ? () => update.mutateAsync({ id: item!.id, ...payload })
      : () => create.mutateAsync(payload)

    mutation()
      .then(() => { toast.success(`Item ${isEditing ? 'updated' : 'created'}`); onOpenChange(false) })
      .catch((err: Error) => toast.error(err.message))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Inventory Item</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="category_id" render={({ field }) => (
              <FormItem><FormLabel>Category *</FormLabel><FormControl>
                <select {...field} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                  <option value="">Select category</option>
                  {categories?.map((c) => <option key={c.id} value={c.id}>{getBreadcrumb(c.id, allCategories ?? [])}</option>)}
                </select>
              </FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="name_en" render={({ field }) => (
                <FormItem><FormLabel>Name (English) *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="name_ar" render={({ field }) => (
                <FormItem><FormLabel>Name (Arabic)</FormLabel><FormControl><Input dir="rtl" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField control={form.control} name="sku" render={({ field }) => (
                <FormItem><FormLabel>SKU *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="unit" render={({ field }) => (
                <FormItem><FormLabel>Unit *</FormLabel><FormControl><Input placeholder="pcs, kg, L" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="cost_price" render={({ field }) => (
                <FormItem><FormLabel>Cost Price</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="markup_percent" render={({ field }) => (
                <FormItem><FormLabel>Markup %</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="warranty_months" render={({ field }) => (
                <FormItem><FormLabel>Warranty (months)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : isEditing ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
