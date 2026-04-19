'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateRfq, useUpdateRfq, type Rfq } from '@/hooks/useRfqs'

const lineSchema = z.object({
  item_name: z.string().min(1, 'Required'),
  qty: z.coerce.number().positive('Must be > 0'),
  unit: z.string().min(1, 'Required'),
  sku: z.string().optional(),
  target_price: z.coerce.number().nullable().optional(),
})

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  due_date: z.string().min(1, 'Due date is required'),
  suppliers: z.string().min(1, 'At least one supplier name'),
  line_items: z.array(lineSchema).min(1, 'Add at least one item'),
})

type FormData = z.infer<typeof schema>

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  rfq?: Rfq | null
}

export function RfqFormDialog({ open, onOpenChange, rfq }: Props) {
  const isEdit = !!rfq
  const createRfq = useCreateRfq()
  const updateRfq = useUpdateRfq()
  const [saving, setSaving] = useState(false)

  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      title: rfq?.title ?? '',
      due_date: rfq?.due_date ?? '',
      suppliers: rfq?.suppliers?.join(', ') ?? '',
      line_items: rfq?.rfq_line_items?.map((li) => ({
        item_name: li.item_name,
        qty: li.qty,
        unit: li.unit,
        sku: li.sku ?? '',
        target_price: li.target_price,
      })) ?? [{ item_name: '', qty: 1, unit: 'pcs', sku: '', target_price: null }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'line_items' })

  const close = () => { reset(); onOpenChange(false) }

  const onSubmit = async (data: FormData) => {
    setSaving(true)
    try {
      const suppliers = data.suppliers.split(',').map((s) => s.trim()).filter(Boolean)
      const line_items = data.line_items.map((li) => ({
        item_name: li.item_name,
        qty: li.qty,
        unit: li.unit,
        sku: li.sku ?? '',
        target_price: li.target_price ?? null,
      }))
      if (isEdit && rfq) {
        await updateRfq.mutateAsync({ id: rfq.id, title: data.title, due_date: data.due_date, suppliers })
      } else {
        await createRfq.mutateAsync({ title: data.title, due_date: data.due_date, suppliers, line_items })
      }
      toast.success(isEdit ? 'RFQ updated' : 'RFQ created')
      close()
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit RFQ' : 'Create RFQ'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit as never)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Title *</Label>
              <Input {...register('title')} placeholder="e.g. Office Supplies Q2" />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Due Date *</Label>
              <Input type="date" {...register('due_date')} />
              {errors.due_date && <p className="text-xs text-destructive">{errors.due_date.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Suppliers (comma-separated names) *</Label>
            <Input {...register('suppliers')} placeholder="ABC Supplies, XYZ Trading" />
            {errors.suppliers && <p className="text-xs text-destructive">{errors.suppliers.message}</p>}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line Items *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ item_name: '', qty: 1, unit: 'pcs', sku: '', target_price: null })}
              >
                <Plus className="w-3 h-3 mr-1" /> Add Item
              </Button>
            </div>
            {fields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-4">
                  <Input {...register(`line_items.${idx}.item_name`)} placeholder="Item name" />
                </div>
                <div className="col-span-2">
                  <Input type="number" {...register(`line_items.${idx}.qty`)} placeholder="Qty" min={1} />
                </div>
                <div className="col-span-2">
                  <Input {...register(`line_items.${idx}.unit`)} placeholder="Unit" />
                </div>
                <div className="col-span-2">
                  <Input {...register(`line_items.${idx}.sku`)} placeholder="SKU" />
                </div>
                <div className="col-span-1">
                  <Input type="number" {...register(`line_items.${idx}.target_price`)} placeholder="Price" step="0.01" />
                </div>
                <div className="col-span-1 flex justify-center pt-1">
                  {fields.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create RFQ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
