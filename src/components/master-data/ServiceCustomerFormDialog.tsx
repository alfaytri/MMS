// src/components/master-data/ServiceCustomerFormDialog.tsx
'use client'

import { useEffect, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Trash2, MapPin, Phone, ExternalLink, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { tryNormalisePhone } from '@/lib/contact-center/normalise-phone'
import {
  useCreateServiceCustomer,
  useUpdateServiceCustomer,
  type ServiceCustomerRow,
  type PhoneInput,
  type AddressInput,
} from '@/hooks/useServiceCustomers'

const REFERRAL_OPTIONS = [
  { value: 'walk-in',    label: 'Walk-in' },
  { value: 'whatsapp',   label: 'WhatsApp' },
  { value: 'referral',   label: 'Referral' },
  { value: 'instagram',  label: 'Instagram' },
  { value: 'other',      label: 'Other' },
]

const PHONE_LABELS = ['mobile', 'work', 'home'] as const

const phoneRowSchema = z.object({
  id: z.string().optional(),
  phone: z.string().min(1, 'Phone is required'),
  label: z.enum(['mobile', 'work', 'home']),
})

const addressRowSchema = z.object({
  id: z.string().optional(),
  address_type: z.enum(['blue-plate', 'google-coords']),
  label: z.string().optional(),
  phoneIndex: z.number().nullable(),
  zone: z.string().optional(),
  street: z.string().optional(),
  building: z.string().optional(),
  unit: z.string().optional(),
  lat: z.string().optional(),
  lng: z.string().optional(),
})

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  referral_source: z.string().nullable().optional(),
  phones: z.array(phoneRowSchema).min(1, 'At least one phone is required'),
  addresses: z.array(addressRowSchema),
  blacklistOn: z.boolean().optional(),
  blacklistReason: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.blacklistOn && !data.blacklistReason?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Reason is required when blacklisting',
      path: ['blacklistReason'],
    })
  }
})

type FormValues = z.infer<typeof formSchema>

export interface ServiceCustomerFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer?: ServiceCustomerRow | null
}

export function ServiceCustomerFormDialog({
  open, onOpenChange, customer,
}: ServiceCustomerFormDialogProps) {
  const isEditing = !!customer
  const create = useCreateServiceCustomer()
  const update = useUpdateServiceCustomer()
  const isPending = create.isPending || update.isPending

  const [primaryPhoneIdx, setPrimaryPhoneIdx]     = useState(0)
  const [primaryAddressIdx, setPrimaryAddressIdx] = useState(0)

  type QnasState = 'idle' | 'loading' | 'found' | 'not_found' | 'error'
  const [qnasStates, setQnasStates]   = useState<Record<string, QnasState>>({})
  const [qnasResults, setQnasResults] = useState<Record<string, { lat: number; lng: number }>>({})

  async function handleVerifyQnas(fieldId: string, zone: string, street: string, building: string) {
    setQnasStates((s) => ({ ...s, [fieldId]: 'loading' }))
    setQnasResults((r) => { const n = { ...r }; delete n[fieldId]; return n })
    try {
      const res = await fetch(
        `/api/qnas/lookup?zone=${encodeURIComponent(zone)}&street=${encodeURIComponent(street)}&building=${encodeURIComponent(building)}`
      )
      const data = await res.json()
      if (!res.ok || data.error) { setQnasStates((s) => ({ ...s, [fieldId]: 'error' })); return }
      if (data.found) {
        setQnasStates((s) => ({ ...s, [fieldId]: 'found' }))
        setQnasResults((r) => ({ ...r, [fieldId]: { lat: data.lat, lng: data.lng } }))
      } else {
        setQnasStates((s) => ({ ...s, [fieldId]: 'not_found' }))
      }
    } catch {
      setQnasStates((s) => ({ ...s, [fieldId]: 'error' }))
    }
  }

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      referral_source: null,
      phones: [{ phone: '', label: 'mobile' }],
      addresses: [],
      blacklistOn: false,
      blacklistReason: '',
    },
  })

  const { fields: phoneFields, append: appendPhone, remove: removePhone } =
    useFieldArray({ control: form.control, name: 'phones' })

  const { fields: addressFields, append: appendAddress, remove: removeAddress } =
    useFieldArray({ control: form.control, name: 'addresses' })

  useEffect(() => {
    if (!open) return
    if (customer) {
      const phones = customer.allPhones
      const addresses = customer.allAddresses
      form.reset({
        name: customer.name,
        referral_source: customer.referral_source,
        phones: phones.map((p) => ({ id: p.id, phone: p.phone, label: (p.label as any) ?? 'mobile' })),
        addresses: addresses.map((a) => ({
          id: a.id,
          address_type: a.address_type,
          label: a.label ?? '',
          phoneIndex: a.phone_id
            ? phones.findIndex((p) => p.id === a.phone_id)
            : null,
          zone: a.zone ?? '',
          street: a.street ?? '',
          building: a.building ?? '',
          unit: a.unit ?? '',
          lat: a.lat != null ? String(a.lat) : '',
          lng: a.lng != null ? String(a.lng) : '',
        })),
        blacklistOn: customer.is_blocked,
        blacklistReason: '',
      })
      const primaryPhoneI = phones.findIndex((p) => p.is_primary)
      setPrimaryPhoneIdx(primaryPhoneI >= 0 ? primaryPhoneI : 0)
      const primaryAddressI = addresses.findIndex((a) => a.is_primary)
      setPrimaryAddressIdx(primaryAddressI >= 0 ? primaryAddressI : 0)
    } else {
      form.reset({
        name: '',
        referral_source: null,
        phones: [{ phone: '', label: 'mobile' }],
        addresses: [],
        blacklistOn: false,
        blacklistReason: '',
      })
      setPrimaryPhoneIdx(0)
      setPrimaryAddressIdx(0)
    }
  }, [open, customer, form])

  function onSubmit(values: FormValues) {
    for (const p of values.phones) {
      if (!tryNormalisePhone(p.phone)) {
        toast.error(`Invalid phone: ${p.phone}`)
        return
      }
    }

    const phones: PhoneInput[] = values.phones.map((p, i) => ({
      id: p.id,
      phone: p.phone,
      label: p.label,
      is_primary: i === primaryPhoneIdx,
    }))

    const addresses: AddressInput[] = values.addresses.map((a, i) => ({
      id: a.id,
      address_type: a.address_type,
      label: a.label || null,
      phoneIndex: a.phoneIndex,
      unit: a.unit || null,
      building: a.building || null,
      street: a.street || null,
      zone: a.zone || null,
      lat: a.lat ?? '',
      lng: a.lng ?? '',
      is_primary: i === primaryAddressIdx,
    }))

    if (isEditing && customer) {
      update.mutate(
        {
          id: customer.id,
          name: values.name,
          referral_source: values.referral_source ?? null,
          phones,
          primaryPhoneIdx,
          addresses,
          primaryAddressIdx,
          is_blocked: values.blacklistOn,
          block_reason: values.blacklistReason || null,
        },
        {
          onSuccess: () => { toast.success('Customer updated'); onOpenChange(false) },
          onError: (err) => toast.error(err.message),
        },
      )
    } else {
      create.mutate(
        {
          name: values.name,
          referral_source: values.referral_source ?? null,
          phones,
          primaryPhoneIdx,
          addresses,
          primaryAddressIdx,
        },
        {
          onSuccess: () => { toast.success('Customer created'); onOpenChange(false) },
          onError: (err) => toast.error(err.message),
        },
      )
    }
  }

  const watchedPhones = form.watch('phones')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Service Customer</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

            {/* ── Basic Info ─────────────────────────────────────── */}
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Basic Info</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Name <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input placeholder="Customer full name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="referral_source"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>How did they find us? <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                      <Select
                        value={field.value ?? ''}
                        onValueChange={(v) => field.onChange(v || null)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select source…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {REFERRAL_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator />

            {/* ── Phones ────────────────────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> Phone Numbers <span className="text-destructive">*</span>
                </p>
              </div>

              {phoneFields.map((field, idx) => (
                <div key={field.id} className="flex items-start gap-2 p-3 rounded-md border bg-muted/30">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <FormField
                      control={form.control}
                      name={`phones.${idx}.phone`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormControl>
                            <Input placeholder="+974XXXXXXXX" className="font-mono text-sm" {...f} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`phones.${idx}.label`}
                      render={({ field: f }) => (
                        <FormItem>
                          <Select value={f.value} onValueChange={(v) => v && f.onChange(v)}>
                            <FormControl>
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {PHONE_LABELS.map((l) => (
                                <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1.5">
                    <button
                      type="button"
                      onClick={() => setPrimaryPhoneIdx(idx)}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${
                        primaryPhoneIdx === idx
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-input text-muted-foreground hover:border-primary'
                      }`}
                    >
                      Primary
                    </button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      disabled={phoneFields.length === 1}
                      onClick={() => {
                        removePhone(idx)
                        const currentAddresses = form.getValues('addresses') ?? []
                        currentAddresses.forEach((addr, aIdx) => {
                          if (addr.phoneIndex === idx) {
                            form.setValue(`addresses.${aIdx}.phoneIndex`, null)
                          } else if (addr.phoneIndex != null && addr.phoneIndex > idx) {
                            form.setValue(`addresses.${aIdx}.phoneIndex`, addr.phoneIndex - 1)
                          }
                        })
                        if (primaryPhoneIdx === idx) {
                          setPrimaryPhoneIdx(0)
                        } else if (primaryPhoneIdx > idx) {
                          setPrimaryPhoneIdx(primaryPhoneIdx - 1)
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}

              {form.formState.errors.phones?.root && (
                <p className="text-xs text-destructive">{form.formState.errors.phones.root.message}</p>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => appendPhone({ phone: '', label: 'mobile' })}
              >
                <Plus className="h-3.5 w-3.5" /> Add phone
              </Button>
            </div>

            <Separator />

            {/* ── Addresses ─────────────────────────────────────── */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> Addresses
              </p>

              {addressFields.map((field, idx) => {
                const addrType = form.watch(`addresses.${idx}.address_type`)
                const lat = form.watch(`addresses.${idx}.lat`) ?? ''
                const lng = form.watch(`addresses.${idx}.lng`) ?? ''
                const googleMapsUrl =
                  lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : null

                return (
                  <div key={field.id} className="p-3 rounded-md border space-y-3 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <FormField
                        control={form.control}
                        name={`addresses.${idx}.label`}
                        render={({ field: f }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input placeholder='Label, e.g. "Home"' className="h-8 text-sm" {...f} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setPrimaryAddressIdx(idx)}
                        className={`text-xs px-2 py-1 rounded border transition-colors shrink-0 ${
                          primaryAddressIdx === idx
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-input text-muted-foreground hover:border-primary'
                        }`}
                      >
                        Primary
                      </button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => {
                          removeAddress(idx)
                          if (primaryAddressIdx === idx) {
                            setPrimaryAddressIdx(0)
                          } else if (primaryAddressIdx > idx) {
                            setPrimaryAddressIdx(primaryAddressIdx - 1)
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <FormField
                      control={form.control}
                      name={`addresses.${idx}.address_type`}
                      render={({ field: f }) => (
                        <FormItem>
                          <div className="flex gap-2">
                            {(['blue-plate', 'google-coords'] as const).map((t) => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => f.onChange(t)}
                                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                                  f.value === t
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'border-input text-muted-foreground hover:border-primary'
                                }`}
                              >
                                {t === 'blue-plate' ? 'Blue Plate' : 'GPS Coordinates'}
                              </button>
                            ))}
                          </div>
                        </FormItem>
                      )}
                    />

                    {addrType === 'blue-plate' && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                          {(['zone', 'street', 'building'] as const).map((f) => (
                            <FormField
                              key={f}
                              control={form.control}
                              name={`addresses.${idx}.${f}`}
                              render={({ field: ff }) => (
                                <FormItem>
                                  <FormLabel className="text-xs capitalize">{f}</FormLabel>
                                  <FormControl>
                                    <Input className="h-8 text-sm" placeholder={f} {...ff} />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                        {(() => {
                          const z = form.watch(`addresses.${idx}.zone`) ?? ''
                          const s = form.watch(`addresses.${idx}.street`) ?? ''
                          const b = form.watch(`addresses.${idx}.building`) ?? ''
                          const canVerify = !!(z && s && b)
                          const qState  = qnasStates[field.id]  ?? 'idle'
                          const qResult = qnasResults[field.id]
                          return (
                            <div className="space-y-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full text-xs"
                                disabled={!canVerify || qState === 'loading'}
                                onClick={() => handleVerifyQnas(field.id, z, s, b)}
                              >
                                {qState === 'loading'
                                  ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Verifying…</>
                                  : 'Verify on Qatar National Address System'}
                              </Button>

                              {qState === 'found' && qResult && (
                                <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 space-y-1.5">
                                  <div className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                                    <CheckCircle2 className="h-4 w-4" /> Address verified
                                  </div>
                                  <p className="text-xs text-green-600">{qResult.lat.toFixed(6)}, {qResult.lng.toFixed(6)}</p>
                                  <div className="flex gap-3">
                                    <a href={`https://www.google.com/maps?q=${qResult.lat},${qResult.lng}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-green-700 hover:underline">
                                      <ExternalLink className="h-3 w-3" /> Google Maps
                                    </a>
                                    <a href={`https://waze.com/ul?ll=${qResult.lat},${qResult.lng}&navigate=yes`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-green-700 hover:underline">
                                      <ExternalLink className="h-3 w-3" /> Waze
                                    </a>
                                  </div>
                                </div>
                              )}

                              {qState === 'not_found' && (
                                <div className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                  <XCircle className="h-4 w-4 shrink-0" /> Address not found in Qatar national database
                                </div>
                              )}

                              {qState === 'error' && (
                                <p className="text-xs text-muted-foreground">Could not reach QNAS service. You can still save the address.</p>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )}

                    {addrType === 'google-coords' && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <FormField
                            control={form.control}
                            name={`addresses.${idx}.lat`}
                            render={({ field: f }) => (
                              <FormItem>
                                <FormLabel className="text-xs">Latitude</FormLabel>
                                <FormControl>
                                  <Input className="h-8 text-sm font-mono" placeholder="25.2854" {...f} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`addresses.${idx}.lng`}
                            render={({ field: f }) => (
                              <FormItem>
                                <FormLabel className="text-xs">Longitude</FormLabel>
                                <FormControl>
                                  <Input className="h-8 text-sm font-mono" placeholder="51.5310" {...f} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                        {googleMapsUrl && (
                          <a
                            href={googleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" /> View on Google Maps
                          </a>
                        )}
                      </div>
                    )}

                    <FormField
                      control={form.control}
                      name={`addresses.${idx}.phoneIndex`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">Linked to phone (optional)</FormLabel>
                          <Select
                            value={f.value != null ? String(f.value) : '__none__'}
                            onValueChange={(v) => f.onChange(v == null || v === '__none__' ? null : parseInt(v, 10))}
                          >
                            <FormControl>
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="__none__">No specific phone</SelectItem>
                              {watchedPhones.map((p, pi) => (
                                <SelectItem key={pi} value={String(pi)}>
                                  {p.phone || `Phone ${pi + 1}`}
                                  {pi === primaryPhoneIdx && ' (primary)'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>
                )
              })}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() =>
                  appendAddress({
                    address_type: 'blue-plate',
                    label: '',
                    phoneIndex: null,
                    zone: '', street: '', building: '',
                    lat: '', lng: '',
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" /> Add address
              </Button>
            </div>

            {/* ── Blacklist (edit only) ──────────────────────────── */}
            {isEditing && (
              <>
                <Separator />
                <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-destructive">Blacklist</p>
                  <FormField
                    control={form.control}
                    name="blacklistOn"
                    render={({ field: f }) => (
                      <FormItem>
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={f.value ?? false}
                            onCheckedChange={f.onChange}
                          />
                          <Label className="text-sm">
                            {f.value ? 'Customer is blacklisted' : 'Blacklist this customer'}
                          </Label>
                          {customer?.is_blocked && !f.value && (
                            <Badge variant="outline" className="text-xs border-destructive text-destructive">
                              Currently blocked
                            </Badge>
                          )}
                        </div>
                      </FormItem>
                    )}
                  />
                  {form.watch('blacklistOn') && (
                    <FormField
                      control={form.control}
                      name="blacklistReason"
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Reason <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Why is this customer being blacklisted?"
                              className="text-sm min-h-[64px] resize-none"
                              {...f}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving…' : isEditing ? 'Update Customer' : 'Create Customer'}
              </Button>
            </DialogFooter>

          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
