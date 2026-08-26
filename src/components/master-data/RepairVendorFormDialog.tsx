'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  GuardedFormDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { PhoneInputWithCode, splitPhone } from '@/components/shared/PhoneInputWithCode'
import {
  useCreateRepairVendor,
  useUpdateRepairVendor,
  type RepairVendor,
} from '@/hooks/useRepairVendors'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  address: z.string().optional(),
  notes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

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
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  const initialPhone = useMemo(() => splitPhone(vendor?.phone ?? null), [vendor?.phone])
  const [countryCode, setCountryCode] = useState(initialPhone.code)
  const [digits, setDigits] = useState(initialPhone.digits)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', address: '', notes: '' },
  })

  useEffect(() => {
    if (!open) return
    const sp = splitPhone(vendor?.phone ?? null)
    setCountryCode(sp.code)
    setDigits(sp.digits)
    form.reset({
      name: vendor?.name ?? '',
      address: vendor?.address ?? '',
      notes: vendor?.notes ?? '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vendor?.id, form])

  const phoneDirty = digits !== initialPhone.digits || countryCode !== initialPhone.code

  async function submit(values: FormValues) {
    const phone = digits.trim() ? `${countryCode}${digits.trim()}` : null
    try {
      if (isEditing && vendor) {
        await update.mutateAsync({
          id: vendor.id,
          name: values.name,
          phone,
          address: values.address || null,
          notes: values.notes || null,
        })
      } else {
        await create.mutateAsync({
          name: values.name,
          phone,
          address: values.address || null,
          notes: values.notes || null,
        })
      }
      toast.success(isEditing ? 'Repair vendor updated' : 'Repair vendor created')
      guardRef.current?.closeAfterSubmit()
    } catch (e) {
      toast.error(humanizeDbError(e))
    }
  }

  return (
    <GuardedFormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      extraDirty={phoneDirty}
      ref={guardRef}
    >
      <DialogContent className="w-full sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Repair Vendor</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Gulf Compressor Repairs" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-2">
              <Label className="text-sm font-medium">Phone</Label>
              <PhoneInputWithCode
                value={digits}
                onChange={setDigits}
                countryCode={countryCode}
                onCountryCodeChange={setCountryCode}
                disabled={isPending}
              />
            </div>
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="Area / street" {...field} />
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
                    <Textarea rows={3} placeholder="What they repair, turnaround time, etc." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => guardRef.current?.requestClose()}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving…' : isEditing ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </GuardedFormDialog>
  )
}
