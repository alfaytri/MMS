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
import { useCreateBrandVariant, useUpdateBrandVariant, type BrandVariant } from '@/hooks/useInventory'

const variantSchema = z.object({
  brand: z.string().min(1, 'Brand is required'),
  code: z.string().optional().default(''),
  cost_price: z.coerce.number().min(0).default(0),
  selling_price: z.coerce.number().min(0).default(0),
})

type VariantFormValues = z.infer<typeof variantSchema>

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

  const form = useForm<VariantFormValues>({
    resolver: zodResolver(variantSchema) as never,
    defaultValues: { brand: '', code: '', cost_price: 0, selling_price: 0 },
  })

  useEffect(() => {
    if (open && variant) {
      form.reset({
        brand: (variant as any).brand ?? '',
        code: (variant as any).code ?? '',
        cost_price: Number((variant as any).cost_price ?? 0),
        selling_price: Number((variant as any).selling_price ?? 0),
      })
    } else if (open) {
      form.reset({ brand: '', code: '', cost_price: 0, selling_price: 0 })
    }
  }, [open, variant, form])

  function onSubmit(values: VariantFormValues) {
    const payload = {
      item_id: itemId,
      brand: values.brand,
      code: values.code || null,
      cost_price: values.cost_price,
      selling_price: values.selling_price,
    }

    const mutation = isEditing
      ? () => update.mutateAsync({ id: variant!.id, ...payload })
      : () => create.mutateAsync(payload)

    mutation()
      .then(() => { toast.success(`Variant ${isEditing ? 'updated' : 'created'}`); onOpenChange(false) })
      .catch((err: Error) => toast.error(err.message))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Brand Variant</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="brand" render={({ field }) => (
              <FormItem>
                <FormLabel>Brand *</FormLabel>
                <FormControl><Input placeholder="e.g. LG, Alfacool" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="code" render={({ field }) => (
              <FormItem>
                <FormLabel>Variant Code</FormLabel>
                <FormControl><Input placeholder="e.g. BV-001" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="cost_price" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cost Price</FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="selling_price" render={({ field }) => (
                <FormItem>
                  <FormLabel>Selling Price</FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
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
