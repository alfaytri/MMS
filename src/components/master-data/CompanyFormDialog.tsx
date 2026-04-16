'use client'

import { useEffect } from 'react'
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
import { Button } from '@/components/ui/button'
import { useCreateCompany, useUpdateCompany, type Company } from '@/hooks/useCompanies'

const companySchema = z.object({
  name_en: z.string().min(1, 'English name is required'),
  name_ar: z.string().optional(),
  cr_number: z.string().optional(),
  vat_id: z.string().optional(),
  default_currency: z.string().min(1),
  default_tax_rate: z.string(),
  address_en: z.string().optional(),
  address_ar: z.string().optional(),
})

type CompanyFormValues = z.infer<typeof companySchema>

interface CompanyFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  company?: Company | null
}

export function CompanyFormDialog({ open, onOpenChange, company }: CompanyFormDialogProps) {
  const isEditing = !!company
  const create = useCreateCompany()
  const update = useUpdateCompany()
  const isPending = create.isPending || update.isPending

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name_en: '',
      name_ar: '',
      cr_number: '',
      vat_id: '',
      default_currency: 'QAR',
      default_tax_rate: '0',
      address_en: '',
      address_ar: '',
    },
  })

  useEffect(() => {
    if (open && company) {
      form.reset({
        name_en: company.name_en,
        name_ar: company.name_ar ?? '',
        cr_number: company.cr_number ?? '',
        vat_id: company.vat_id ?? '',
        default_currency: company.default_currency,
        default_tax_rate: String(company.default_tax_rate),
        address_en: company.address_en ?? '',
        address_ar: company.address_ar ?? '',
      })
    } else if (open) {
      form.reset()
    }
  }, [open, company, form])

  function onSubmit(values: CompanyFormValues) {
    const payload = {
      ...values,
      default_tax_rate: parseFloat(values.default_tax_rate) || 0,
      name_ar: values.name_ar || null,
      cr_number: values.cr_number || null,
      vat_id: values.vat_id || null,
      address_en: values.address_en || null,
      address_ar: values.address_ar || null,
    }
    if (isEditing && company) {
      update.mutate(
        { id: company.id, ...payload },
        {
          onSuccess: () => {
            toast.success('Company updated')
            onOpenChange(false)
          },
          onError: (err) => toast.error(err.message),
        }
      )
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          toast.success('Company created')
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Company</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name_en"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name (English) *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name_ar"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name (Arabic)</FormLabel>
                    <FormControl>
                      <Input dir="rtl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cr_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CR Number</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vat_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>VAT ID</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="default_currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="default_tax_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax Rate (%)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="address_en"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address (English)</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address_ar"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address (Arabic)</FormLabel>
                  <FormControl>
                    <Input dir="rtl" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
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
    </Dialog>
  )
}
