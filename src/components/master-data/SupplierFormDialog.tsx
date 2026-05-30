'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { PhoneInputWithCode, splitPhone } from '@/components/shared/PhoneInputWithCode'
import { useCreateSupplier, useUpdateSupplier, type Supplier } from '@/hooks/useSuppliers'

const supplierSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  category: z.string().optional(),
  contact_name: z.string().optional(),
  phone: z.string().optional(),
  email: z.union([z.string().email('Invalid email'), z.literal('')]).optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
})

type SupplierFormValues = z.infer<typeof supplierSchema>

interface SupplierFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier?: Supplier | null
}

export function SupplierFormDialog({ open, onOpenChange, supplier }: SupplierFormDialogProps) {
  const isEditing = !!supplier
  const create = useCreateSupplier()
  const update = useUpdateSupplier()
  const isPending = create.isPending || update.isPending
  const [countryCode, setCountryCode] = useState('+974')

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: '',
      category: '',
      contact_name: '',
      phone: '',
      email: '',
      address: '',
      notes: '',
    },
  })

  useEffect(() => {
    if (open && supplier) {
      const { code, digits } = splitPhone(supplier.phone)
      setCountryCode(code)
      form.reset({
        name: supplier.name,
        category: supplier.category ?? '',
        contact_name: supplier.contact_name ?? '',
        phone: digits,
        email: supplier.email ?? '',
        address: supplier.address ?? '',
        notes: supplier.notes ?? '',
      })
    } else if (open) {
      setCountryCode('+974')
      form.reset()
    }
  }, [open, supplier, form])

  function onSubmit(values: SupplierFormValues) {
    const fullPhone = values.phone ? `${countryCode}${values.phone}` : null
    const cleanValues = {
      ...values,
      category: values.category || null,
      contact_name: values.contact_name || null,
      phone: fullPhone,
      email: values.email || null,
      address: values.address || null,
      notes: values.notes || null,
    }

    if (isEditing && supplier) {
      update.mutate(
        { id: supplier.id, ...cleanValues },
        {
          onSuccess: () => {
            toast.success('Supplier updated')
            onOpenChange(false)
          },
          onError: (err) => toast.error(err.message),
        }
      )
    } else {
      create.mutate(cleanValues, {
        onSuccess: () => {
          toast.success('Supplier created')
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-lg md:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Supplier</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Supplier name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Cleaning supplies" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Person</FormLabel>
                    <FormControl>
                      <Input placeholder="Contact name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <PhoneInputWithCode
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        countryCode={countryCode}
                        onCountryCodeChange={setCountryCode}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="supplier@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="Street address" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Internal notes…" rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving…' : isEditing ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
