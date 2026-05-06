'use client'

import { useEffect } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PackageCheck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ServicePickerTree } from './ServicePickerTree'
import {
  useUpsertPackage,
  type SubscriptionPackage,
  type PackageServiceEntry,
  type PriorityResponse,
} from '@/hooks/useSubscriptionPackages'
import { toast } from 'sonner'

const schema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    name_ar: z.string().optional(),
    description: z.string().optional(),
    discount_percent: z.coerce.number().min(0, 'Min 0').max(100, 'Max 100'),
    initial_fee: z.coerce.number().min(0, 'Min 0'),
    duration_months: z.coerce.number().int().min(1, 'Min 1 month'),
    priority_response: z.enum(['none', '24_48hr', 'under_24hr']),
    response_hours: z.coerce.number().int().optional().nullable(),
    auto_renew_default: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.priority_response === '24_48hr') {
      if (!data.response_hours || data.response_hours < 25 || data.response_hours > 48) {
        ctx.addIssue({ code: 'custom', path: ['response_hours'], message: 'Must be 25–48 for "24–48 HR" priority' })
      }
    }
    if (data.priority_response === 'under_24hr') {
      if (!data.response_hours || data.response_hours < 1 || data.response_hours > 24) {
        ctx.addIssue({ code: 'custom', path: ['response_hours'], message: 'Must be 1–24 for "< 24 HR" priority' })
      }
    }
  })

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  pkg?: SubscriptionPackage | null
  performerName?: string | null
  selectedServices: PackageServiceEntry[]
  onServicesChange: (services: PackageServiceEntry[]) => void
}

export function PackageEditDialog({
  open,
  onOpenChange,
  pkg,
  performerName,
  selectedServices,
  onServicesChange,
}: Props) {
  const isEditing = !!pkg
  const upsert = useUpsertPackage()

  const form = useForm<FormValues>({
    // z.coerce fields have `unknown` input types that diverge from FormValues;
    // cast to Resolver<FormValues> to satisfy RHF while keeping output types intact.
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: {
      name: '',
      name_ar: '',
      description: '',
      discount_percent: 0,
      initial_fee: 0,
      duration_months: 12,
      priority_response: 'none',
      response_hours: null,
      auto_renew_default: true,
    },
  })

  const priorityResponse = form.watch('priority_response')
  const discountPercent = form.watch('discount_percent') ?? 0
  const autoRenewDefault = form.watch('auto_renew_default')

  const overrides: Record<string, number | null> = {}
  selectedServices.forEach((s) => {
    overrides[s.service_id] = s.discount_override
  })

  function handleServicesChange(ids: string[], newOverrides: Record<string, number | null>) {
    onServicesChange(
      ids.map((id) => ({ service_id: id, discount_override: newOverrides[id] ?? null })),
    )
  }

  useEffect(() => {
    if (!open) return
    if (pkg) {
      form.reset({
        name: pkg.name,
        name_ar: pkg.name_ar ?? '',
        description: pkg.description ?? '',
        discount_percent: pkg.discount_percent,
        initial_fee: pkg.initial_fee,
        duration_months: pkg.duration_months,
        priority_response: pkg.priority_response,
        response_hours: pkg.response_hours ?? null,
        auto_renew_default: pkg.auto_renew_default,
      })
    } else {
      form.reset({
        name: '',
        name_ar: '',
        description: '',
        discount_percent: 0,
        initial_fee: 0,
        duration_months: 12,
        priority_response: 'none',
        response_hours: null,
        auto_renew_default: true,
      })
      onServicesChange([])
    }
  // form is stable (RHF guarantee); onServicesChange intentionally omitted —
  // we only want to reset when the dialog opens or the target package changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pkg])

  function onSubmit(values: FormValues) {
    if (selectedServices.length === 0) {
      toast.error('Select at least one service')
      return
    }
    upsert.mutate(
      {
        payload: {
          id: pkg?.id ?? null,
          name: values.name,
          name_ar: values.name_ar || null,
          description: values.description || null,
          discount_percent: values.discount_percent,
          initial_fee: values.initial_fee,
          duration_months: values.duration_months,
          priority_response: values.priority_response as PriorityResponse,
          response_hours: values.priority_response === 'none' ? null : values.response_hours ?? null,
          auto_renew_default: values.auto_renew_default,
          services: selectedServices,
          created_by_name: performerName,
        },
        performerName,
      },
      {
        onSuccess: () => {
          toast.success(isEditing ? 'Package updated' : 'Package created')
          onOpenChange(false)
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full rounded-none md:h-auto md:max-w-2xl md:rounded-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-primary" />
            {isEditing ? 'Edit Package' : 'New Subscription Package'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Names */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name (EN) *</Label>
              <Input className="h-8 text-xs" {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-[10px] text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Name (AR)</Label>
              <Input className="h-8 text-xs text-right" dir="rtl" {...form.register('name_ar')} />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              className="text-xs min-h-[60px]"
              placeholder="Optional description…"
              {...form.register('description')}
            />
          </div>

          {/* Numbers row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Discount % *</Label>
              <Input type="number" min={0} max={100} step={0.5} className="h-8 text-xs" {...form.register('discount_percent')} />
              {form.formState.errors.discount_percent && (
                <p className="text-[10px] text-destructive">{form.formState.errors.discount_percent.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Initial Fee (QAR) *</Label>
              <Input type="number" min={0} step={0.01} className="h-8 text-xs" {...form.register('initial_fee')} />
              {form.formState.errors.initial_fee && (
                <p className="text-[10px] text-destructive">{form.formState.errors.initial_fee.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Duration (months) *</Label>
              <Input type="number" min={1} className="h-8 text-xs" {...form.register('duration_months')} />
            </div>
          </div>

          {/* Priority + Response Hours */}
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1.5 flex-1 min-w-[160px]">
              <Label className="text-xs">Priority Response</Label>
              <Select
                value={priorityResponse}
                onValueChange={(v) => {
                  form.setValue('priority_response', v as PriorityResponse, { shouldValidate: true })
                  if (v === 'none') form.setValue('response_hours', null)
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">None</SelectItem>
                  <SelectItem value="24_48hr" className="text-xs">24–48 HR</SelectItem>
                  <SelectItem value="under_24hr" className="text-xs">{'< 24 HR'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {priorityResponse !== 'none' && (
              <div className="space-y-1.5 flex-1 min-w-[160px]">
                <Label className="text-xs">
                  Response Hours *{' '}
                  <span className="text-muted-foreground">
                    ({priorityResponse === '24_48hr' ? '25–48' : '1–24'})
                  </span>
                </Label>
                <Input
                  type="number"
                  min={priorityResponse === '24_48hr' ? 25 : 1}
                  max={priorityResponse === '24_48hr' ? 48 : 24}
                  className="h-8 text-xs"
                  {...form.register('response_hours')}
                />
                {form.formState.errors.response_hours && (
                  <p className="text-[10px] text-destructive">{form.formState.errors.response_hours.message}</p>
                )}
              </div>
            )}
          </div>

          {/* Auto-renew switch */}
          <div className="flex items-center gap-3">
            <Switch
              id="auto_renew_default"
              checked={autoRenewDefault}
              onCheckedChange={(v) => form.setValue('auto_renew_default', v)}
            />
            <Label htmlFor="auto_renew_default" className="text-xs">Auto-renew by default</Label>
          </div>

          {/* Services */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Applicable Services *</Label>
              <span className="text-[10px] text-muted-foreground">{selectedServices.length} selected</span>
            </div>
            <ServicePickerTree
              selectedIds={selectedServices.map((s) => s.service_id)}
              overrides={overrides}
              onChange={handleServicesChange}
              packageDiscountPercent={discountPercent}
            />
            {selectedServices.length === 0 && form.formState.isSubmitted && (
              <p className="text-[10px] text-destructive">Select at least one service</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="text-xs" disabled={upsert.isPending}>
              {upsert.isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Package'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
