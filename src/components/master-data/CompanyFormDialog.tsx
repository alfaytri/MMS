'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useDirtyDialogGuard } from '@/hooks/useDirtyDialogGuard'
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
import { useCurrencies } from '@/hooks/useCurrencies'

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
  const { data: currencies = [] } = useCurrencies()
  const isPending = create.isPending || update.isPending

  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [isUploadingStamp, setIsUploadingStamp] = useState(false)

  // Track paths uploaded THIS dialog session so we can sweep them on cancel
  // and clean up superseded uploads when the user re-picks a file.
  const sessionUploadsRef = useRef<{ field: 'logo_url' | 'stamp_url'; path: string }[]>([])
  const submittedRef      = useRef(false)

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
      form.reset({ name_en: '', name_ar: '', cr_number: '', vat_id: '', default_currency: 'QAR', default_tax_rate: '0', address_en: '', address_ar: '', logo_url: '', stamp_url: '' })
    }
  }, [open, company, form])

  async function handleUpload(
    file: File,
    field: 'logo_url' | 'stamp_url',
    setUploading: (v: boolean) => void
  ) {
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
    if (!ALLOWED.includes(file.type)) {
      toast.error('Unsupported type — JPG / PNG / WEBP / SVG only')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image too large — maximum 5 MB')
      return
    }
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

      // Photo-replace within this session: drop the superseded upload NOW so
      // repeated re-picks don't accumulate orphans on save.
      const superseded = sessionUploadsRef.current.filter((u) => u.field === field)
      if (superseded.length > 0) {
        void supabase.storage.from('division-assets').remove(superseded.map((u) => u.path)).catch(() => {})
      }
      sessionUploadsRef.current = [
        ...sessionUploadsRef.current.filter((u) => u.field !== field),
        { field, path: safeName },
      ]
      form.setValue(field, publicUrl, { shouldValidate: true })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function handleRemoveAsset(field: 'logo_url' | 'stamp_url') {
    const match = sessionUploadsRef.current.find((u) => u.field === field)
    if (match) {
      const supabase = createClient()
      void supabase.storage.from('division-assets').remove([match.path]).catch(() => {})
      sessionUploadsRef.current = sessionUploadsRef.current.filter((u) => u.field !== field)
    }
    form.setValue(field, '', { shouldValidate: true })
  }

  function sweepSessionUploads() {
    const paths = sessionUploadsRef.current.map((u) => u.path)
    if (paths.length === 0) return
    sessionUploadsRef.current = []
    const supabase = createClient()
    void supabase.storage.from('division-assets').remove(paths).catch(() => {})
  }

  function handleOpenChange(next: boolean) {
    if (!next && !submittedRef.current) sweepSessionUploads()
    if (!next) submittedRef.current = false
    onOpenChange(next)
  }

   
  useEffect(() => () => { if (!submittedRef.current) sweepSessionUploads() }, [])

  // Force re-render on any field change so isDirty stays fresh in the closure.
  useWatch({ control: form.control })

  const { guardedOnOpenChange, confirmDialog } = useDirtyDialogGuard({
    isDirty: form.formState.isDirty,
    onOpenChange: handleOpenChange,
  })

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
            sessionUploadsRef.current = []
            submittedRef.current = true
            toast.success('Company updated')
            handleOpenChange(false)
          },
          onError: (err) => toast.error(humanizeDbError(err)),
        }
      )
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          sessionUploadsRef.current = []
          submittedRef.current = true
          toast.success('Company created')
          handleOpenChange(false)
        },
        onError: (err) => toast.error(humanizeDbError(err)),
      })
    }
  }

  return (
    <><Dialog open={open} onOpenChange={guardedOnOpenChange}>
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
                      <select
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {currencies.map((c) => (
                          <option key={c.id} value={c.code}>
                            {c.code}{c.symbol ? ` ${c.symbol}` : ''}
                          </option>
                        ))}
                      </select>
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
                      onClick={() => handleRemoveAsset('logo_url')}
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
                      onClick={() => handleRemoveAsset('stamp_url')}
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
                onClick={() => guardedOnOpenChange(false)}
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
    </Dialog>{confirmDialog}</>
  )
}
