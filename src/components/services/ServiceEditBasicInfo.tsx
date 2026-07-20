'use client'

import { useWatch, type UseFormReturn } from 'react-hook-form'
import { Upload, X, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { cn } from '@/lib/utils'
import { useDivisions } from '@/hooks/useDivisions'
import type { ServiceFormValues } from './ServiceEditSections'

// ─── Core Identity ─────────────────────────────────────────────────────────────

export function CoreSection({ form }: { form: UseFormReturn<ServiceFormValues> }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField control={form.control} name="name_en" render={({ field }) => (
          <FormItem>
            <FormLabel>Name (English) <span className="text-destructive">*</span></FormLabel>
            <FormControl><Input {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="name_ar" render={({ field }) => (
          <FormItem>
            <FormLabel>Name (Arabic)</FormLabel>
            <FormControl><Input {...field} value={field.value ?? ''} dir="rtl" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField control={form.control} name="code" render={({ field }) => (
          <FormItem>
            <FormLabel>Service Code</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value ?? ''}
                readOnly
                disabled
                placeholder="Auto-generated"
                className="bg-muted/50"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="legacy_service_id" render={({ field }) => (
          <FormItem>
            <FormLabel>Legacy Service ID</FormLabel>
            <FormControl><Input {...field} value={field.value ?? ''} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </div>
    </div>
  )
}

// ─── Catalog Image ─────────────────────────────────────────────────────────────

interface CatalogImageSectionProps {
  pendingFile: File | null
  currentUrl: string | null
  onFileChange: (f: File | null) => void
}

export function CatalogImageSection({ pendingFile, currentUrl, onFileChange }: CatalogImageSectionProps) {
  const thumbSrc = pendingFile ? URL.createObjectURL(pendingFile) : currentUrl

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5 MB')
      return
    }
    onFileChange(file)
  }

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-sm">
        <ImageIcon className="h-3.5 w-3.5" />Catalog Image
      </Label>
      {thumbSrc ? (
        <div className="flex items-center gap-3">
          <img src={thumbSrc} alt="Service" className="h-16 w-16 rounded border object-cover" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => onFileChange(null)}
          >
            <X className="h-3 w-3" />Remove
          </Button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed rounded cursor-pointer hover:bg-muted/30 transition-colors">
          <Upload className="h-4 w-4 text-muted-foreground mb-1" />
          <span className="text-xs text-muted-foreground">Click to upload image (max 5 MB)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
      )}
    </div>
  )
}

// ─── Status ────────────────────────────────────────────────────────────────────

export function StatusSection({ form }: { form: UseFormReturn<ServiceFormValues> }) {
  return (
    <FormField control={form.control} name="status" render={({ field }) => (
      <FormItem>
        <FormLabel>Status</FormLabel>
        <div className="flex gap-2 mt-1.5">
          {(['active', 'inactive'] as const).map((v) => (
            <Button
              key={v}
              type="button"
              size="sm"
              variant={field.value === v ? 'default' : 'outline'}
              className="h-8 text-[11px] capitalize flex-1"
              onClick={() => field.onChange(v)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </Button>
          ))}
        </div>
        <FormMessage />
      </FormItem>
    )} />
  )
}

// ─── Division (multi-select toggle) ────────────────────────────────────────────

interface DivisionSectionProps {
  form: UseFormReturn<ServiceFormValues>
  mode: 'new' | 'edit'
  hasParent: boolean
}

export function DivisionSection({ form, mode, hasParent }: DivisionSectionProps) {
  const { data: divisions = [] } = useDivisions()
  const inherited = mode === 'new' && hasParent
  const selected = (useWatch({ control: form.control, name: 'division' }) ?? []) as string[]

  function toggle(slug: string) {
    const current = form.getValues('division') as string[]
    const next = current.includes(slug)
      ? current.filter((s) => s !== slug)
      : [...current, slug]
    form.setValue('division', next, { shouldDirty: true, shouldValidate: true })
  }

  return (
    <FormField control={form.control} name="division" render={() => (
      <FormItem>
        <FormLabel>Division <span className="text-destructive">*</span></FormLabel>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {divisions.map((d) => (
            <button
              key={d.slug}
              type="button"
              disabled={inherited}
              onClick={() => toggle(d.slug)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border transition-colors',
                selected.includes(d.slug)
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-transparent text-foreground hover:bg-muted',
              )}
            >
              {d.short_name ?? d.name}
            </button>
          ))}
        </div>
        {inherited && (
          <p className="text-[11px] text-muted-foreground mt-1">Inherited from parent service</p>
        )}
        <FormMessage />
      </FormItem>
    )} />
  )
}
