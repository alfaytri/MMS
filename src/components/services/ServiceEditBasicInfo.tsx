'use client'

import { useState } from 'react'
import { useWatch, type UseFormReturn } from 'react-hook-form'
import { Upload, X, ImageIcon, Check, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
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
        <Select value={field.value} onValueChange={(v) => field.onChange(v)}>
          <SelectTrigger className="mt-1.5 h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
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
  const [open, setOpen] = useState(false)
  const inherited = mode === 'new' && hasParent
  const selected = (useWatch({ control: form.control, name: 'division' }) ?? []) as string[]

  function toggle(slug: string) {
    const current = form.getValues('division') as string[]
    const next = current.includes(slug)
      ? current.filter((s) => s !== slug)
      : [...current, slug]
    form.setValue('division', next, { shouldDirty: true, shouldValidate: true })
  }

  const selectedLabels = divisions
    .filter((d) => selected.includes(d.slug))
    .map((d) => d.short_name ?? d.name)

  return (
    <FormField control={form.control} name="division" render={() => (
      <FormItem className="flex flex-col">
        <FormLabel>Division <span className="text-destructive">*</span></FormLabel>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            disabled={inherited}
            className="mt-1.5 inline-flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm font-normal shadow-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            render={(props) => (
              <button type="button" role="combobox" aria-expanded={open} {...props} />
            )}
          >
            <span className={cn('truncate', selectedLabels.length === 0 && 'text-muted-foreground')}>
              {selectedLabels.length > 0 ? selectedLabels.join(', ') : 'Select divisions'}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-1">
            {divisions.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">No divisions</p>
            ) : (
              divisions.map((d) => {
                const isSel = selected.includes(d.slug)
                return (
                  <button
                    key={d.slug}
                    type="button"
                    onClick={() => toggle(d.slug)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      isSel ? 'border-primary bg-primary' : 'border-input',
                    )}>
                      {isSel && <Check className="h-3 w-3 text-primary-foreground" />}
                    </span>
                    {d.short_name ?? d.name}
                  </button>
                )
              })
            )}
          </PopoverContent>
        </Popover>
        {inherited && (
          <p className="text-[11px] text-muted-foreground mt-1">Inherited from parent service</p>
        )}
        <FormMessage />
      </FormItem>
    )} />
  )
}
