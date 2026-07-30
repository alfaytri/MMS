'use client'

import { useEffect, useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { PhoneInputWithCode, splitPhone } from '@/components/shared/PhoneInputWithCode'
import {
  useCreateRepairVendor, useUpdateRepairVendor, type RepairVendor,
} from '@/hooks/useRepairVendors'

const schema = z.object({
  name:    z.string().min(1, 'Name is required'),
  digits:  z.string().optional(),      // phone digits (concatenated with countryCode on submit)
  address: z.string().optional(),
  notes:   z.string().optional(),
})

type Values = z.infer<typeof schema>

interface RepairVendorFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vendor?: RepairVendor | null
}

export function RepairVendorFormDialog({ open, onOpenChange, vendor }: RepairVendorFormDialogProps) {
  const isEditing = !!vendor
  const create = useCreateRepairVendor()
  const update = useUpdateRepairVendor()
  const isPending = create.isPending || update.isPending

  const [countryCode, setCountryCode] = useState('+974')

  const form = useForm<Values>({
    resolver: zodResolver(schema) as never,
    defaultValues: { name: '', digits: '', address: '', notes: '' },
  })

  useEffect(() => {
    if (!open) return
    if (vendor) {
      const parsed = splitPhone(vendor.phone)
      setCountryCode(parsed.code || '+974')
      form.reset({
        name:    vendor.name,
        digits:  parsed.digits,
        address: vendor.address ?? '',
        notes:   vendor.notes ?? '',
      })
    } else {
      setCountryCode('+974')
      form.reset({ name: '', digits: '', address: '', notes: '' })
    }
  }, [open, vendor, form])

  function onSubmit(values: Values) {
    const phone = values.digits?.trim() ? `${countryCode}${values.digits.trim()}` : null
    const payload = {
      name:    values.name,
      phone,
      address: values.address ?? null,
      notes:   values.notes ?? null,
    }
    if (isEditing && vendor) {
      update.mutate(
        { id: vendor.id, ...payload },
        {
          onSuccess: () => { toast.success('Repair vendor updated'); onOpenChange(false) },
          onError:   (err) => toast.error(err.message),
        },
      )
    } else {
      create.mutate(payload, {
        onSuccess: () => { toast.success('Repair vendor created — virtual warehouse provisioned'); onOpenChange(false) },
        onError:   (err) => toast.error(err.message),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg p-0 flex flex-col max-h-[90vh] overflow-hidden">
        <div className="px-6 pt-6 flex-shrink-0">
          <DialogHeader>
            <DialogTitle className="text-lg">{isEditing ? 'Edit' : 'Add'} Repair Vendor</DialogTitle>
            {!isEditing && (
              <p className="text-xs text-muted-foreground mt-1">
                A virtual warehouse named &quot;Repair: &lt;name&gt;&quot; is auto-created for tracking off-site units.
              </p>
            )}
          </DialogHeader>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col min-h-0 flex-1">
            <div className="px-6 pb-4 space-y-5 overflow-y-auto flex-1 min-h-0">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Al Karama Repair Center" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="digits"
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
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea rows={2} className="resize-none" {...field} />
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
                      <Textarea rows={3} className="resize-none" placeholder="Specialties, contact person, turnaround time…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="flex-shrink-0 border-t bg-background px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving...' : isEditing ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
