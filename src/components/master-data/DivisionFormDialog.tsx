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
import { useCreateDivision, useUpdateDivision, type Division } from '@/hooks/useDivisions'

const divisionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  short_name: z.string().optional(),
  slug: z.string().min(1, 'Slug is required'),
  color: z.string().min(1),
  company_name_en: z.string().optional(),
  company_name_ar: z.string().optional(),
  address_en: z.string().optional(),
  address_ar: z.string().optional(),
  logo_url: z.string().optional(),
  stamp_url: z.string().optional(),
  footer_motto: z.string().optional(),
  default_currency: z.string().min(1),
  default_tax_rate: z.string(),
  sort_order: z.string(),
})

type DivisionFormValues = z.infer<typeof divisionSchema>

interface DivisionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  division?: Division | null
  companyId: string
}

export function DivisionFormDialog({ open, onOpenChange, division, companyId }: DivisionFormDialogProps) {
  const isEditing = !!division
  const create = useCreateDivision()
  const update = useUpdateDivision()
  const isPending = create.isPending || update.isPending

  const form = useForm<DivisionFormValues>({
    resolver: zodResolver(divisionSchema),
    defaultValues: {
      name: '',
      short_name: '',
      slug: '',
      color: '#2563eb',
      company_name_en: '',
      company_name_ar: '',
      address_en: '',
      address_ar: '',
      logo_url: '',
      stamp_url: '',
      footer_motto: '',
      default_currency: 'QAR',
      default_tax_rate: '0',
      sort_order: '0',
    },
  })

  useEffect(() => {
    if (open && division) {
      form.reset({
        name: division.name,
        short_name: division.short_name ?? '',
        slug: division.slug,
        color: division.color,
        company_name_en: division.company_name_en ?? '',
        company_name_ar: division.company_name_ar ?? '',
        address_en: division.address_en ?? '',
        address_ar: division.address_ar ?? '',
        logo_url: division.logo_url ?? '',
        stamp_url: division.stamp_url ?? '',
        footer_motto: division.footer_motto ?? '',
        default_currency: division.default_currency,
        default_tax_rate: String(division.default_tax_rate),
        sort_order: String(division.sort_order),
      })
    } else if (open) {
      form.reset()
    }
  }, [open, division, form])

  function onSubmit(values: DivisionFormValues) {
    const payload = {
      ...values,
      company_id: companyId,
      default_tax_rate: parseFloat(values.default_tax_rate) || 0,
      sort_order: parseInt(values.sort_order, 10) || 0,
      short_name: values.short_name || null,
      company_name_en: values.company_name_en || null,
      company_name_ar: values.company_name_ar || null,
      address_en: values.address_en || null,
      address_ar: values.address_ar || null,
      logo_url: values.logo_url || null,
      stamp_url: values.stamp_url || null,
      footer_motto: values.footer_motto || null,
    }
    if (isEditing && division) {
      update.mutate(
        { id: division.id, ...payload },
        {
          onSuccess: () => {
            toast.success('Division updated')
            onOpenChange(false)
          },
          onError: (err) => toast.error(err.message),
        }
      )
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          toast.success('Division created')
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Division</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="short_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Short Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. AFM" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug *</FormLabel>
                    <FormControl>
                      <Input placeholder="alfaytri-maintenance" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color</FormLabel>
                    <FormControl>
                      <Input type="color" className="h-9 w-full" {...field} />
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="company_name_en"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name (English)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="company_name_ar"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name (Arabic)</FormLabel>
                    <FormControl>
                      <Input dir="rtl" {...field} />
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
            <FormField
              control={form.control}
              name="footer_motto"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Footer Motto</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="logo_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Logo URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="stamp_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Stamp URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="sort_order"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sort Order</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
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
