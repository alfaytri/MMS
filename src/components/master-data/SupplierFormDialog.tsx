'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PhoneInputWithCode, splitPhone } from '@/components/shared/PhoneInputWithCode'
import {
  GuardedFormDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { useCreateSupplier, useUpdateSupplier, type Supplier } from '@/hooks/useSuppliers'
import { useCurrencies } from '@/hooks/useCurrencies'
import { useCountryCodes } from '@/hooks/useCountryCodes'
import { useActiveDivision } from '@/components/providers/DivisionProvider'

const supplierSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  category: z.string().optional(),
  supplier_type: z.enum(['local', 'international']),
  currency_id: z.string().optional(),
  country: z.string().optional(),
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
  const { data: currencies = [] } = useCurrencies()
  const { data: countryCodes = [] } = useCountryCodes()
  const qarCurrency = currencies.find((c) => c.code === 'QAR')
  const guardRef = useRef<GuardedFormDialogHandle>(null)
  const { activeDivisionId, availableDivisions } = useActiveDivision()
  // Visibility scope. Global (division_id NULL) = visible to every division and
  // is the DEFAULT for new suppliers. "Specific division" stamps the chosen
  // division_id. On edit, both reflect the row's current division_id.
  const [isGlobal, setIsGlobal] = useState(true)
  const [scopedDivisionId, setScopedDivisionId] = useState('')

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: '',
      category: '',
      supplier_type: 'local' as const,
      currency_id: '',
      country: '',
      contact_name: '',
      phone: '',
      email: '',
      address: '',
      notes: '',
    },
  })

  const supplierType = form.watch('supplier_type')

  useEffect(() => {
    if (supplierType === 'local' && qarCurrency) {
      form.setValue('currency_id', qarCurrency.id)
    }
  }, [supplierType, qarCurrency, form])

  useEffect(() => {
    if (supplierType === 'local') {
      form.setValue('country', 'Qatar')
    }
  }, [supplierType, form])

  useEffect(() => {
    if (open && supplier) {
      const { code, digits } = splitPhone(supplier.phone)
      setCountryCode(code)
      setIsGlobal(supplier.division_id == null)
      setScopedDivisionId(supplier.division_id ?? '')
      form.reset({
        name: supplier.name,
        category: supplier.category ?? '',
        supplier_type: (supplier.supplier_type ?? 'local') as 'local' | 'international',
        currency_id: supplier.currency_id ?? '',
        country: supplier.country ?? '',
        contact_name: supplier.contact_name ?? '',
        phone: digits,
        email: supplier.email ?? '',
        address: supplier.address ?? '',
        notes: supplier.notes ?? '',
      })
    } else if (open) {
      setCountryCode('+974')
      setIsGlobal(true)
      setScopedDivisionId('')
      form.reset({ name: '', category: '', supplier_type: 'local' as const, currency_id: '', country: '', contact_name: '', phone: '', email: '', address: '', notes: '' })
    }
    // Form fields (re)initialise only when the dialog opens or the target
    // supplier changes.
  }, [open, supplier, form])

  function onSubmit(values: SupplierFormValues) {
    if (!isGlobal && !scopedDivisionId) {
      toast.error('Select a division for a division-specific supplier')
      return
    }
    const fullPhone = values.phone ? `${countryCode}${values.phone}` : null
    const cleanValues = {
      ...values,
      category: values.category || null,
      supplier_type: values.supplier_type,
      currency_id: values.currency_id || null,
      country: values.country || null,
      contact_name: values.contact_name || null,
      phone: fullPhone,
      email: values.email || null,
      address: values.address || null,
      notes: values.notes || null,
      // Division stamping: null = global (visible to every division).
      // Otherwise stamp the chosen division.
      division_id: isGlobal ? null : scopedDivisionId,
    }

    if (isEditing && supplier) {
      update.mutate(
        { id: supplier.id, ...cleanValues },
        {
          onSuccess: () => {
            toast.success('Supplier updated')
            guardRef.current?.closeAfterSubmit()
          },
          onError: (err) => toast.error(humanizeDbError(err)),
        }
      )
    } else {
      create.mutate(cleanValues, {
        onSuccess: () => {
          toast.success('Supplier created')
          guardRef.current?.closeAfterSubmit()
        },
        onError: (err) => toast.error(humanizeDbError(err)),
      })
    }
  }

  return (
    <GuardedFormDialog open={open} onOpenChange={onOpenChange} form={form} ref={guardRef}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg p-0 flex flex-col max-h-[90vh] overflow-hidden">
        <div className="px-6 pt-6 flex-shrink-0">
          <DialogHeader>
            <DialogTitle className="text-lg">{isEditing ? 'Edit' : 'Add'} Supplier</DialogTitle>
          </DialogHeader>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col min-h-0 flex-1">
            <div className="px-6 pb-4 space-y-5 overflow-y-auto flex-1 min-h-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
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
                <FormField
                  control={form.control}
                  name="supplier_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supplier Type</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select type..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          <SelectItem value="local">Local</SelectItem>
                          <SelectItem value="international">International</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <Select
                        value={field.value ?? ''}
                        onValueChange={field.onChange}
                        disabled={supplierType === 'local'}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select country..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          {countryCodes.map((cc) => (
                            <SelectItem key={cc.id} value={cc.name}>
                              {cc.flag} {cc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="currency_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <Select
                        value={field.value ?? ''}
                        onValueChange={field.onChange}
                        disabled={supplierType === 'local'}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select currency..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          {currencies.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.code}{c.symbol ? ` ${c.symbol}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
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
                    <FormLabel>
                      Address <span className="text-muted-foreground font-normal">(Optional)</span>
                    </FormLabel>
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
                    <FormLabel>
                      Notes <span className="text-muted-foreground font-normal">(Optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea placeholder="Internal notes..." rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Division scope */}
              <div className="rounded-md border p-3 space-y-2 bg-muted/30">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">Visible to</label>
                  <p className="text-[11px] text-muted-foreground min-h-4">
                    {isGlobal
                      ? 'Global — visible in every division.'
                      : 'Visible only in the selected division.'}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select
                    value={isGlobal ? 'global' : 'specific'}
                    onValueChange={(v) => {
                      const global = v === 'global'
                      setIsGlobal(global)
                      if (!global && !scopedDivisionId) {
                        setScopedDivisionId(activeDivisionId ?? availableDivisions[0]?.id ?? '')
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      <SelectItem value="global">All divisions (global)</SelectItem>
                      <SelectItem value="specific">Specific division</SelectItem>
                    </SelectContent>
                  </Select>
                  {!isGlobal && (
                    <Select
                      value={scopedDivisionId}
                      onValueChange={(v) => setScopedDivisionId(v ?? '')}
                      disabled={availableDivisions.length <= 1}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select division…" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        {availableDivisions.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="flex-shrink-0 border-t bg-background px-6 py-4">
              <Button type="button" variant="outline" onClick={() => guardRef.current?.requestClose()} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving...' : isEditing ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </GuardedFormDialog>
  )
}
