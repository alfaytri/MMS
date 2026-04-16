'use client'

import { useEffect } from 'react'
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
import { useCreateBrandVariant, useUpdateBrandVariant, type BrandVariant, type BrandVariantInsert, type BrandVariantUpdate } from '@/hooks/useInventory'

const variantSchema = z.object({
  brand: z.string().min(1, 'Brand is required'),
  code: z.string().default(''),
  cost_price: z.coerce.number().min(0),
  selling_price: z.coerce.number().min(0),
})

type VariantFormValues = {
  brand: string
  code: string
  cost_price: number
  selling_price: number
}

interface BrandVariantFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  variant?: BrandVariant | null
  itemId: string
}

export function BrandVariantFormDialog({ open, onOpenChange, variant, itemId }: BrandVariantFormDialogProps) {
  const isEditing = !!variant
  const create = useCreateBrandVariant()
  const update = useUpdateBrandVariant()
  const isPending = create.isPending || update.isPending

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<VariantFormValues>({ resolver: zodResolver(variantSchema) as any, defaultValues: { brand: '', code: '', cost_price: 0, selling_price: 0 } })

  useEffect(() => {
    if (open && variant) {
      form.reset({
        brand: variant.brand ?? '',
        code: variant.code ?? '',
        cost_price: Number(variant.cost_price ?? 0),
        selling_price: Number(variant.selling_price ?? 0),
      })
    } else if (open) {
      form.reset({ brand: '', code: '', cost_price: 0, selling_price: 0 })
    }
  }, [open, variant, form])

  function onSubmit(values: VariantFormValues) {
    const base = { ...values, item_id: itemId, code: values.code || null }
    if (isEditing) {
      const payload: BrandVariantUpdate & { id: string } = { id: variant!.id, ...base }
      update.mutateAsync(payload)
        .then(() => { toast.success('Variant updated'); onOpenChange(false) })
        .catch((err: Error) => toast.error(err.message))
    } else {
      const payload: BrandVariantInsert = { ...base, brand: values.brand }
      create.mutateAsync(payload)
        .then(() => { toast.success('Variant created'); onOpenChange(false) })
        .catch((err: Error) => toast.error(err.message))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Brand Variant</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-4">
            <FormField control={form.control as any} name="brand" render={({ field }: any) => (
              <FormItem><FormLabel>Brand *</FormLabel><FormControl><Input placeholder="e.g. Samsung" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control as any} name="code" render={({ field }: any) => (
              <FormItem><FormLabel>Variant Code</FormLabel><FormControl><Input placeholder="e.g. BV-001" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control as any} name="cost_price" render={({ field }: any) => (
                <FormItem><FormLabel>Cost Price</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control as any} name="selling_price" render={({ field }: any) => (
                <FormItem><FormLabel>Selling Price</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
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
