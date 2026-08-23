'use client'

import { useEffect, useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Check, ChevronsUpDown } from 'lucide-react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useCreateBrandVariant, useUpdateBrandVariant, type BrandVariant } from '@/hooks/useInventory'
import { useBrands, useCreateBrand } from '@/hooks/useBrands'
import { cn } from '@/lib/utils'

const variantSchema = z.object({
  brand_id: z.string().min(1, 'Brand is required'),
  brand: z.string().min(1),
  code: z.string().optional().default(''),
  cost_price: z.coerce.number().min(0).default(0),
  selling_price: z.coerce.number().min(0).default(0),
})

type VariantFormValues = z.infer<typeof variantSchema>

interface BrandVariantFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  variant?: (BrandVariant & { brand_id?: string | null }) | null
  itemId: string
}

export function BrandVariantFormDialog({ open, onOpenChange, variant, itemId }: BrandVariantFormDialogProps) {
  const isEditing = !!variant
  const create = useCreateBrandVariant()
  const update = useUpdateBrandVariant()
  const createBrand = useCreateBrand()
  const { data: brands = [], isLoading: loadingBrands } = useBrands()
  const isPending = create.isPending || update.isPending || createBrand.isPending

  const [brandPickerOpen, setBrandPickerOpen] = useState(false)
  const [brandSearch, setBrandSearch] = useState('')

  const form = useForm<VariantFormValues>({
    resolver: zodResolver(variantSchema) as never,
    defaultValues: { brand_id: '', brand: '', code: '', cost_price: 0, selling_price: 0 },
  })

  useEffect(() => {
    if (open && variant) {
      form.reset({
        brand_id: variant.brand_id ?? '',
        brand: variant.brand ?? '',
        code: variant.code ?? '',
        cost_price: Number(variant.cost_price ?? 0),
        selling_price: Number(variant.selling_price ?? 0),
      })
    } else if (open) {
      form.reset({ brand_id: '', brand: '', code: '', cost_price: 0, selling_price: 0 })
    }
  }, [open, variant, form])

  const brandName = form.watch('brand')

  const filteredBrands = useMemo(() => {
    const q = brandSearch.trim().toLowerCase()
    if (!q) return brands
    return brands.filter((b) => b.name.toLowerCase().includes(q))
  }, [brands, brandSearch])

  const exactMatch = useMemo(() => {
    const q = brandSearch.trim().toLowerCase()
    if (!q) return null
    return brands.find((b) => b.name.toLowerCase() === q) ?? null
  }, [brands, brandSearch])

  const showCreateOption = brandSearch.trim() && !exactMatch

  async function handleCreateBrand() {
    const name = brandSearch.trim()
    if (!name) return
    try {
      const newBrand = await createBrand.mutateAsync({ name })
      form.setValue('brand_id', newBrand.brand.id, { shouldValidate: true })
      form.setValue('brand', newBrand.brand.name, { shouldValidate: true })
      setBrandPickerOpen(false)
      setBrandSearch('')
      toast.success(`Brand "${newBrand.brand.name}" added`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  function onSubmit(values: VariantFormValues) {
    const payload = {
      item_id: itemId,
      brand: values.brand,
      brand_id: values.brand_id,
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
            <FormField
              control={form.control}
              name="brand_id"
              render={() => (
                <FormItem className="flex flex-col">
                  <FormLabel>Brand *</FormLabel>
                  <Popover open={brandPickerOpen} onOpenChange={setBrandPickerOpen}>
                    <PopoverTrigger
                      disabled={loadingBrands}
                      className={cn(
                        'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                        !brandName && 'text-muted-foreground'
                      )}
                    >
                      {brandName || (loadingBrands ? 'Loading brands…' : 'Select or add brand…')}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Search or type new brand…"
                          value={brandSearch}
                          onValueChange={setBrandSearch}
                        />
                        <CommandList className="max-h-64">
                          <CommandEmpty>
                            {brandSearch.trim() ? (
                              <button
                                type="button"
                                onClick={handleCreateBrand}
                                className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent rounded"
                                disabled={createBrand.isPending}
                              >
                                <Plus className="h-4 w-4" />
                                <span>Add &ldquo;<span className="font-medium">{brandSearch.trim()}</span>&rdquo; as new brand</span>
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground">No brands yet.</span>
                            )}
                          </CommandEmpty>
                          <CommandGroup>
                            {filteredBrands.map((b) => (
                              <CommandItem
                                key={b.id}
                                value={b.name}
                                onSelect={() => {
                                  form.setValue('brand_id', b.id, { shouldValidate: true })
                                  form.setValue('brand', b.name, { shouldValidate: true })
                                  setBrandPickerOpen(false)
                                  setBrandSearch('')
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    form.getValues('brand_id') === b.id ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                {b.name}
                              </CommandItem>
                            ))}
                            {showCreateOption && (
                              <CommandItem
                                value={`__add__${brandSearch}`}
                                onSelect={handleCreateBrand}
                                className="text-primary"
                              >
                                <Plus className="mr-2 h-4 w-4" />
                                Add &ldquo;<span className="font-medium ml-1">{brandSearch.trim()}</span>&rdquo; as new brand
                              </CommandItem>
                            )}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

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
