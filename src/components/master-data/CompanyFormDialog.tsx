'use client'

import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ImageIcon, Loader2, X } from 'lucide-react'
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
import { createClient } from '@/lib/supabase/client'
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
  logo_url: z.string().url().optional().or(z.literal('')),
  stamp_url: z.string().url().optional().or(z.literal('')),
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

  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [isUploadingStamp, setIsUploadingStamp] = useState(false)

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema) as never,
    defaultValues: {
      name_en: '',
      name_ar: '',
      cr_number: '',
      vat_id: '',
      default_currency: 'QAR',
      default_tax_rate: '0',
      address_en: '',
      address_ar: '',
      logo_url: '',
      stamp_url: '',
    },
  })

  const logoUrl = useWatch({ control: form.control, name: 'logo_url' })
  const stampUrl = useWatch({ control: form.control, name: 'stamp_url' })

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
        logo_url: company.logo_url ?? '',
        stamp_url: company.stamp_url ?? '',
      })
    } else if (open) {
      form.reset()
    }
  }, [open, company, form])

  async function handleUpload(
    file: File,
    field: 'logo_url' | 'stamp_url',
    setUploading: (v: boolean) => void
  ) {
    setUploading(true)
    try {
      const supabase = createClient()
      const safeName = `company-${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      const { error } = await supabase.storage
        .from('division-assets')
        .upload(safeName, file, { upsert: false })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage
        .from('division-assets')
        .getPublicUrl(safeName)
      form.setValue(field, publicUrl, { shouldValidate: true })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function onSubmit(values: CompanyFormValues) {
    const payload = {
      ...values,
      default_tax_rate: parseFloat(values.default_tax_rate) || 0,
      name_ar: values.name_ar || null,
      cr_number: values.cr_number || null,
      vat_id: values.vat_id || null,
      address_en: values.address_en || null,
      address_ar: values.address_ar || null,
      logo_url: values.logo_url || null,
      stamp_url: values.stamp_url || null,
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
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg p-0 flex flex-col max-h-[90vh] overflow-hidden">
        <div className="px-6 pt-6 flex-shrink-0">
          <DialogHeader>
            <DialogTitle className="text-lg">{isEditing ? 'Edit' : 'Add'} Company</DialogTitle>
          </DialogHeader>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col min-h-0 flex-1">
            <div className="px-6 pb-4 space-y-5 overflow-y-auto flex-1 min-h-0">
            {/* ── Name EN + AR ─────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
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

            {/* ── CR + VAT ────────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
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

            {/* ── Currency + Tax Rate ─────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
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

            {/* ── Address EN + AR ─────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              <FormField
                control={form.control}
                name="address_en"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address (EN)</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Company address in English"
                        className="resize-none"
                        {...field}
                      />
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
                    <FormLabel>Address (AR)</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        dir="rtl"
                        placeholder="عنوان الشركة بالعربية"
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ── Logo + Stamp upload ─────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              {/* Logo */}
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium leading-none">Logo</span>
                <div className="relative">
                  <label className="cursor-pointer block">
                    <div className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center gap-1 min-h-[100px] hover:bg-muted/30 transition-colors">
                      {isUploadingLogo ? (
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      ) : logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logoUrl} alt="Logo preview" className="h-16 w-auto object-contain" />
                      ) : (
                        <>
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Upload Logo</span>
                        </>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={isUploadingLogo}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleUpload(file, 'logo_url', setIsUploadingLogo)
                      }}
                    />
                  </label>
                  {logoUrl && !isUploadingLogo && (
                    <button
                      type="button"
                      onClick={() => form.setValue('logo_url', '', { shouldValidate: true })}
                      className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-background border border-border shadow flex items-center justify-center hover:bg-destructive hover:text-white hover:border-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Stamp */}
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium leading-none">Stamp</span>
                <div className="relative">
                  <label className="cursor-pointer block">
                    <div className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center gap-1 min-h-[100px] hover:bg-muted/30 transition-colors">
                      {isUploadingStamp ? (
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      ) : stampUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={stampUrl} alt="Stamp preview" className="h-16 w-auto object-contain" />
                      ) : (
                        <>
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Upload Stamp</span>
                        </>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={isUploadingStamp}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleUpload(file, 'stamp_url', setIsUploadingStamp)
                      }}
                    />
                  </label>
                  {stampUrl && !isUploadingStamp && (
                    <button
                      type="button"
                      onClick={() => form.setValue('stamp_url', '', { shouldValidate: true })}
                      className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-background border border-border shadow flex items-center justify-center hover:bg-destructive hover:text-white hover:border-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            </div>

            <DialogFooter className="flex-shrink-0 border-t bg-background px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending || isUploadingLogo || isUploadingStamp}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || isUploadingLogo || isUploadingStamp}>
                {isPending ? 'Saving...' : isEditing ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
