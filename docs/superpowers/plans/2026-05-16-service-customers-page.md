# Service Customers Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Service Customers management page under Master Data, backed by the `service_customers` / `service_customer_phones` / `service_customer_addresses` tables, using the Suppliers page pattern (DataTable + form dialog), and update the Contact Centre CRM panel to display addresses when a Wati conversation opens.

**Architecture:** New hook `useServiceCustomers` handles all data fetching and mutations with sequential Supabase inserts (no RPC needed). The form dialog uses `react-hook-form` + `useFieldArray` for dynamic phone/address lists, with separate `primaryPhoneIdx` / `primaryAddressIdx` state to avoid the complexity of radio-among-array-items in zod schemas. The CRM panel is updated by adding an addresses query to the existing `useCustomerData` hook and rendering it in `CrmSection` view mode.

**Tech Stack:** Next.js 15 App Router, React, Supabase (PostgREST client via `(supabase as any)` pattern for untyped tables), TanStack Query v5, react-hook-form, zod, shadcn/ui, Tailwind CSS

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| CREATE | `supabase/migrations/20260516160000_service_customers_phone_id_referral.sql` | Adds `phone_id` to addresses, `referral_source` to customers |
| CREATE | `src/hooks/useServiceCustomers.ts` | Types + list query + create/update mutations |
| CREATE | `src/components/master-data/ServiceCustomerFormDialog.tsx` | Create/edit dialog with multi-phone + multi-address |
| CREATE | `src/app/(dashboard)/master-data/service-customers/page.tsx` | DataTable page |
| MODIFY | `src/components/layout/nav-config.ts` | Add "Service Customers" to Master Data nav |
| MODIFY | `src/hooks/contact-center/useCustomerData.ts` | Add addresses query + export `ServiceCustomerAddress` type |
| MODIFY | `src/components/contact-center/CrmSection.tsx` | Render addresses in view mode |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260516160000_service_customers_phone_id_referral.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260516160000_service_customers_phone_id_referral.sql
-- Adds referral_source to service_customers and phone_id (address-phone link) to service_customer_addresses.

ALTER TABLE public.service_customers
  ADD COLUMN IF NOT EXISTS referral_source TEXT;

ALTER TABLE public.service_customer_addresses
  ADD COLUMN IF NOT EXISTS phone_id UUID
    REFERENCES public.service_customer_phones(id) ON DELETE SET NULL;
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected output ends with: `Remote database is up to date.` (or shows the migration applied).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260516160000_service_customers_phone_id_referral.sql
git commit -m "$(cat <<'EOF'
feat(db): add referral_source to service_customers and phone_id to service_customer_addresses

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `useServiceCustomers` Hook

**Files:**
- Create: `src/hooks/useServiceCustomers.ts`

- [ ] **Step 1: Create the hook file with types and list query**

```ts
// src/hooks/useServiceCustomers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { normalisePhone } from '@/lib/contact-center/normalise-phone'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ServiceCustomerPhone {
  id: string
  customer_id: string
  phone: string
  label: string | null
  is_primary: boolean
}

export interface ServiceCustomerAddress {
  id: string
  customer_id: string
  phone_id: string | null
  address_type: 'blue-plate' | 'google-coords'
  label: string | null
  unit: string | null
  building: string | null
  street: string | null
  zone: string | null
  lat: number | null
  lng: number | null
  is_primary: boolean
  is_geocoded: boolean
  waze_link: string | null
  tags: string[]
  created_at: string
}

export interface ServiceCustomerRow {
  id: string
  name: string
  name_ar: string | null
  customer_type: 'individual' | 'business' | null
  is_blocked: boolean
  referral_source: string | null
  created_at: string
  updated_at: string
  primaryPhone: ServiceCustomerPhone | null
  primaryAddress: ServiceCustomerAddress | null
  allPhones: ServiceCustomerPhone[]
  allAddresses: ServiceCustomerAddress[]
}

// ── Payload types for mutations ────────────────────────────────────────────────

export interface PhoneInput {
  id?: string           // undefined = new entry
  phone: string
  label: string | null
  is_primary: boolean
}

export interface AddressInput {
  id?: string
  address_type: 'blue-plate' | 'google-coords'
  label: string | null
  phoneIndex: number | null  // index into PhoneInput[], resolved to phone_id on save
  unit: string | null
  building: string | null
  street: string | null
  zone: string | null
  lat: string            // string in form, parsed to number on save; '' = null
  lng: string
  is_primary: boolean
}

export interface CreateServiceCustomerPayload {
  name: string
  referral_source: string | null
  phones: PhoneInput[]
  primaryPhoneIdx: number
  addresses: AddressInput[]
  primaryAddressIdx: number
}

export interface UpdateServiceCustomerPayload extends CreateServiceCustomerPayload {
  id: string
  is_blocked?: boolean
  block_reason?: string | null
}

// ── Query: list all service customers ─────────────────────────────────────────

export function useServiceCustomers() {
  return useQuery<ServiceCustomerRow[]>({
    queryKey: ['service-customers'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('service_customers')
        .select(`
          id, name, name_ar, customer_type, is_blocked, referral_source, created_at, updated_at,
          service_customer_phones(id, customer_id, phone, label, is_primary),
          service_customer_addresses(id, customer_id, phone_id, address_type, label, unit, building, street, zone, lat, lng, is_primary, is_geocoded, waze_link, tags, created_at)
        `)
        .order('name')
      if (error) throw error

      return (data as any[]).map((row) => {
        const phones: ServiceCustomerPhone[] = row.service_customer_phones ?? []
        const addresses: ServiceCustomerAddress[] = row.service_customer_addresses ?? []
        return {
          id: row.id,
          name: row.name,
          name_ar: row.name_ar,
          customer_type: row.customer_type,
          is_blocked: row.is_blocked ?? false,
          referral_source: row.referral_source,
          created_at: row.created_at,
          updated_at: row.updated_at,
          primaryPhone: phones.find((p) => p.is_primary) ?? phones[0] ?? null,
          primaryAddress: addresses.find((a) => a.is_primary) ?? addresses[0] ?? null,
          allPhones: phones,
          allAddresses: addresses,
        }
      })
    },
    staleTime: 30 * 1000,
  })
}
```

- [ ] **Step 2: Add `useCreateServiceCustomer` mutation**

Append to the same file:

```ts
// ── Mutation: create ───────────────────────────────────────────────────────────

export function useCreateServiceCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateServiceCustomerPayload): Promise<string> => {
      const supabase = createClient()

      // 1. Insert customer
      const { data: customer, error: custErr } = await (supabase as any)
        .from('service_customers')
        .insert({ name: payload.name.trim(), referral_source: payload.referral_source || null })
        .select('id')
        .single()
      if (custErr) throw new Error(custErr.message)
      const customerId: string = customer.id

      // 2. Insert phones, capture inserted IDs in order
      const phoneRows = payload.phones.map((p, i) => ({
        customer_id: customerId,
        phone: normalisePhone(p.phone),
        label: p.label || null,
        is_primary: i === payload.primaryPhoneIdx,
      }))
      const { data: insertedPhones, error: phoneErr } = await (supabase as any)
        .from('service_customer_phones')
        .insert(phoneRows)
        .select('id')
      if (phoneErr) throw new Error(phoneErr.message)
      const phoneIds: string[] = (insertedPhones as any[]).map((p) => p.id)

      // 3. Insert addresses, resolving phoneIndex → phone_id
      if (payload.addresses.length > 0) {
        const addressRows = payload.addresses.map((a, i) => {
          const lat = a.lat !== '' ? parseFloat(a.lat) : null
          const lng = a.lng !== '' ? parseFloat(a.lng) : null
          return {
            customer_id: customerId,
            phone_id: a.phoneIndex != null ? (phoneIds[a.phoneIndex] ?? null) : null,
            address_type: a.address_type,
            label: a.label || null,
            unit: a.unit || null,
            building: a.building || null,
            street: a.street || null,
            zone: a.zone || null,
            lat,
            lng,
            is_primary: i === payload.primaryAddressIdx,
            is_geocoded: lat != null && lng != null,
            waze_link:
              lat != null && lng != null
                ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
                : null,
          }
        })
        const { error: addrErr } = await (supabase as any)
          .from('service_customer_addresses')
          .insert(addressRows)
        if (addrErr) throw new Error(addrErr.message)
      }

      return customerId
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-customers'] }),
  })
}
```

- [ ] **Step 3: Add `useUpdateServiceCustomer` mutation**

Append to the same file:

```ts
// ── Mutation: update ───────────────────────────────────────────────────────────

export function useUpdateServiceCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: UpdateServiceCustomerPayload): Promise<void> => {
      const supabase = createClient()
      const { id } = payload

      // 1. Update customer core fields
      const { error: custErr } = await (supabase as any)
        .from('service_customers')
        .update({
          name: payload.name.trim(),
          referral_source: payload.referral_source || null,
        })
        .eq('id', id)
      if (custErr) throw new Error(custErr.message)

      // 2. Handle blacklist changes
      if (payload.is_blocked === true) {
        const { data: { user } } = await supabase.auth.getUser()
        await Promise.all([
          (supabase as any).from('service_customers').update({ is_blocked: true }).eq('id', id),
          (supabase as any).from('customer_blocks').insert({
            customer_id: id,
            reason: payload.block_reason?.trim() ?? 'Blacklisted via customer page',
            blocked_by: user?.id ?? null,
          }),
        ])
      } else if (payload.is_blocked === false) {
        await (supabase as any).from('service_customers').update({ is_blocked: false }).eq('id', id)
      }

      // 3. Upsert phones
      //    - First set all existing phones to is_primary = false (avoid unique index conflict)
      await (supabase as any).from('service_customer_phones').update({ is_primary: false }).eq('customer_id', id)

      const resultPhoneIds: string[] = []
      for (let i = 0; i < payload.phones.length; i++) {
        const p = payload.phones[i]
        const normalised = normalisePhone(p.phone)
        if (p.id) {
          // Update existing
          await (supabase as any)
            .from('service_customer_phones')
            .update({ phone: normalised, label: p.label || null, is_primary: false })
            .eq('id', p.id)
          resultPhoneIds.push(p.id)
        } else {
          // Insert new
          const { data: newPhone, error: pErr } = await (supabase as any)
            .from('service_customer_phones')
            .insert({ customer_id: id, phone: normalised, label: p.label || null, is_primary: false })
            .select('id')
            .single()
          if (pErr) throw new Error(pErr.message)
          resultPhoneIds.push(newPhone.id)
        }
      }

      // Set the single primary
      const primaryId = resultPhoneIds[payload.primaryPhoneIdx]
      if (primaryId) {
        await (supabase as any).from('service_customer_phones').update({ is_primary: true }).eq('id', primaryId)
      }

      // 4. Delete all existing addresses, reinsert (safe — orders store address snapshots, not live FKs)
      await (supabase as any).from('service_customer_addresses').delete().eq('customer_id', id)
      if (payload.addresses.length > 0) {
        const addressRows = payload.addresses.map((a, i) => {
          const lat = a.lat !== '' ? parseFloat(a.lat) : null
          const lng = a.lng !== '' ? parseFloat(a.lng) : null
          return {
            customer_id: id,
            phone_id: a.phoneIndex != null ? (resultPhoneIds[a.phoneIndex] ?? null) : null,
            address_type: a.address_type,
            label: a.label || null,
            unit: a.unit || null,
            building: a.building || null,
            street: a.street || null,
            zone: a.zone || null,
            lat,
            lng,
            is_primary: i === payload.primaryAddressIdx,
            is_geocoded: lat != null && lng != null,
            waze_link:
              lat != null && lng != null
                ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
                : null,
          }
        })
        const { error: addrErr } = await (supabase as any)
          .from('service_customer_addresses')
          .insert(addressRows)
        if (addrErr) throw new Error(addrErr.message)
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['service-customers'] })
      qc.invalidateQueries({ queryKey: ['service-customer', vars.id] })
      qc.invalidateQueries({ queryKey: ['service-customer-addresses', vars.id] })
    },
  })
}
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useServiceCustomers.ts
git commit -m "$(cat <<'EOF'
feat(service-customers): add useServiceCustomers hook with list, create, update mutations

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `ServiceCustomerFormDialog` Component

**Files:**
- Create: `src/components/master-data/ServiceCustomerFormDialog.tsx`

This is the largest task. Build it in logical sections.

- [ ] **Step 1: Create file — imports, schema, constants**

```tsx
// src/components/master-data/ServiceCustomerFormDialog.tsx
'use client'

import { useEffect, useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Trash2, MapPin, Phone, ExternalLink } from 'lucide-react'
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

// ── Zod schema ────────────────────────────────────────────────────────────────

const phoneRowSchema = z.object({
  id: z.string().optional(),
  phone: z.string().min(1, 'Phone is required'),
  label: z.enum(['mobile', 'work', 'home']).default('mobile'),
})

const addressRowSchema = z.object({
  id: z.string().optional(),
  address_type: z.enum(['blue-plate', 'google-coords']).default('blue-plate'),
  label: z.string().optional(),
  phoneIndex: z.number().nullable(),   // index into phones array
  // blue-plate
  zone: z.string().optional(),
  street: z.string().optional(),
  building: z.string().optional(),
  unit: z.string().optional(),
  // gps
  lat: z.string().optional(),
  lng: z.string().optional(),
})

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  referral_source: z.string().nullable().optional(),
  phones: z.array(phoneRowSchema).min(1, 'At least one phone is required'),
  addresses: z.array(addressRowSchema),
  // blacklist (edit mode only)
  blacklistOn: z.boolean().optional(),
  blacklistReason: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

export interface ServiceCustomerFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer?: ServiceCustomerRow | null
}
```

- [ ] **Step 2: Add the component function with state and form setup**

Append to the same file:

```tsx
export function ServiceCustomerFormDialog({
  open, onOpenChange, customer,
}: ServiceCustomerFormDialogProps) {
  const isEditing = !!customer
  const create = useCreateServiceCustomer()
  const update = useUpdateServiceCustomer()
  const isPending = create.isPending || update.isPending

  // Separate state for "primary" selection (radio-among-array)
  const [primaryPhoneIdx, setPrimaryPhoneIdx]     = useState(0)
  const [primaryAddressIdx, setPrimaryAddressIdx] = useState(0)

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

  // Populate form when editing
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
      setPrimaryPhoneIdx(phones.findIndex((p) => p.is_primary) >= 0 ? phones.findIndex((p) => p.is_primary) : 0)
      setPrimaryAddressIdx(addresses.findIndex((a) => a.is_primary) >= 0 ? addresses.findIndex((a) => a.is_primary) : 0)
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
```

- [ ] **Step 3: Add submit handler**

Append (still inside the component, before the return):

```tsx
  function onSubmit(values: FormValues) {
    // Validate phones
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
```

- [ ] **Step 4: Add the JSX — dialog shell + basic info section**

Append (still inside the component):

```tsx
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
```

- [ ] **Step 5: Add phones section JSX**

Append (inside the form, after the separator):

```tsx
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
                          <Select value={f.value} onValueChange={f.onChange}>
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
                        if (primaryPhoneIdx >= phoneFields.length - 1) setPrimaryPhoneIdx(0)
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
```

- [ ] **Step 6: Add addresses section JSX**

Append (inside the form, after the second separator):

```tsx
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
                    {/* Row header */}
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
                          if (primaryAddressIdx >= addressFields.length - 1) setPrimaryAddressIdx(0)
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Type toggle */}
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

                    {/* Blue-plate fields */}
                    {addrType === 'blue-plate' && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {(['zone', 'street', 'building', 'unit'] as const).map((f) => (
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
                    )}

                    {/* GPS fields */}
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

                    {/* Linked phone dropdown */}
                    <FormField
                      control={form.control}
                      name={`addresses.${idx}.phoneIndex`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">Linked to phone (optional)</FormLabel>
                          <Select
                            value={f.value != null ? String(f.value) : '__none__'}
                            onValueChange={(v) => f.onChange(v === '__none__' ? null : parseInt(v))}
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
                    zone: '', street: '', building: '', unit: '',
                    lat: '', lng: '',
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" /> Add address
              </Button>
            </div>
```

- [ ] **Step 7: Add blacklist section (edit mode only) and dialog footer**

Append (inside the form, at the end before closing `</form>`):

```tsx
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
```

- [ ] **Step 8: Commit**

```bash
git add src/components/master-data/ServiceCustomerFormDialog.tsx
git commit -m "$(cat <<'EOF'
feat(service-customers): add ServiceCustomerFormDialog with multi-phone/address management

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Service Customers Page + Nav

**Files:**
- Create: `src/app/(dashboard)/master-data/service-customers/page.tsx`
- Modify: `src/components/layout/nav-config.ts`

- [ ] **Step 1: Create the page**

```tsx
// src/app/(dashboard)/master-data/service-customers/page.tsx
'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Pencil } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ServiceCustomerFormDialog } from '@/components/master-data/ServiceCustomerFormDialog'
import { useServiceCustomers, type ServiceCustomerRow } from '@/hooks/useServiceCustomers'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function formatPrimaryAddress(row: ServiceCustomerRow): string {
  const a = row.primaryAddress
  if (!a) return '—'
  if (a.address_type === 'blue-plate') {
    const parts = [
      a.zone     && `Zone ${a.zone}`,
      a.street   && `St ${a.street}`,
      a.building && `Bldg ${a.building}`,
      a.unit     && `Unit ${a.unit}`,
    ].filter(Boolean)
    return parts.length ? parts.join(', ') : a.label ?? '—'
  }
  if (a.lat != null && a.lng != null) return `${a.lat}, ${a.lng}`
  return a.label ?? '—'
}

export default function ServiceCustomersPage() {
  const [search, setSearch]   = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ServiceCustomerRow | null>(null)

  const { data: customers = [], isLoading } = useServiceCustomers()

  const columns = useMemo<ColumnDef<ServiceCustomerRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
        cell: ({ row }) => (
          <div>
            <span className="font-medium text-sm">{row.original.name}</span>
            {row.original.is_blocked && (
              <StatusBadge variant="destructive" className="ml-2 text-[10px]">Blacklisted</StatusBadge>
            )}
          </div>
        ),
      },
      {
        id: 'primary_phone',
        header: 'Primary Phone',
        cell: ({ row }) => (
          <span className="text-sm font-mono text-muted-foreground">
            {row.original.primaryPhone?.phone ?? '—'}
          </span>
        ),
      },
      {
        id: 'primary_address',
        header: 'Primary Address',
        cell: ({ row }) => {
          const a = row.original.primaryAddress
          if (!a) return <span className="text-muted-foreground text-sm">—</span>
          return (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Badge variant="outline" className="text-[10px] shrink-0">
                {a.address_type === 'blue-plate' ? 'BP' : 'GPS'}
              </Badge>
              <span className="truncate max-w-[200px]">{formatPrimaryAddress(row.original)}</span>
            </div>
          )
        },
      },
      {
        accessorKey: 'referral_source',
        header: 'Found Us Via',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground capitalize">
            {row.original.referral_source?.replace('-', ' ') ?? '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Open actions" />}
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setEditing(row.original)
                  setDialogOpen(true)
                }}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    []
  )

  return (
    <PageWrapper>
      <PageHeader
        title="Service Customers"
        description="Manage customers for service orders"
        action={{
          label: 'Add Customer',
          onClick: () => { setEditing(null); setDialogOpen(true) },
        }}
      />

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search by name or phone…"
      />

      <DataTable
        columns={columns}
        data={customers}
        isLoading={isLoading}
        globalFilter={search}
        pageSize={50}
      />

      <ServiceCustomerFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        customer={editing}
      />
    </PageWrapper>
  )
}
```

- [ ] **Step 2: Add nav entry**

Open `src/components/layout/nav-config.ts`. Find the Master Data `groups[1].items` array (the one with `Services`, `Teams & Employees`, `Subscription Packages`). Add `Service Customers` as the first item:

```ts
// BEFORE:
{
  items: [
    { label: 'Services', href: '/master-data/services' },
    { label: 'Teams & Employees', href: '/master-data/teams' },
    { label: 'Subscription Packages', href: '/master-data/subscriptions' },
    { label: 'QuickBooks', href: '/master-data/quickbooks', comingSoon: true },
    { label: 'Notification Trail', href: '/master-data/notifications', comingSoon: true },
  ],
},

// AFTER:
{
  items: [
    { label: 'Service Customers', href: '/master-data/service-customers' },
    { label: 'Services', href: '/master-data/services' },
    { label: 'Teams & Employees', href: '/master-data/teams' },
    { label: 'Subscription Packages', href: '/master-data/subscriptions' },
    { label: 'QuickBooks', href: '/master-data/quickbooks', comingSoon: true },
    { label: 'Notification Trail', href: '/master-data/notifications', comingSoon: true },
  ],
},
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/master-data/service-customers/page.tsx src/components/layout/nav-config.ts
git commit -m "$(cat <<'EOF'
feat(service-customers): add service customers page and nav entry

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update `useCustomerData` — Add Addresses Query

**Files:**
- Modify: `src/hooks/contact-center/useCustomerData.ts`

- [ ] **Step 1: Export `ServiceCustomerAddress` type and add addresses query**

Open `src/hooks/contact-center/useCustomerData.ts`.

**After the existing `CustomerPhone` interface**, add:

```ts
export interface ServiceCustomerAddress {
  id: string
  customer_id: string
  phone_id: string | null
  address_type: 'blue-plate' | 'google-coords'
  label: string | null
  unit: string | null
  building: string | null
  street: string | null
  zone: string | null
  lat: number | null
  lng: number | null
  is_primary: boolean
  is_geocoded: boolean
  waze_link: string | null
  tags: string[]
}
```

**Inside the `useCustomerData` function**, after the `phones` query block, add:

```ts
  const { data: addresses = [] } = useQuery<ServiceCustomerAddress[]>({
    queryKey: ['service-customer-addresses', customerId],
    queryFn: async () => {
      if (!customerId) return []
      const { data, error } = await (supabase as any)
        .from('service_customer_addresses')
        .select('*')
        .eq('customer_id', customerId)
        .order('is_primary', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!customerId,
  })
```

**In the `return` statement**, add `addresses` alongside the existing fields:

```ts
  return {
    customer,
    customerLoading,
    phones,
    addresses,      // ← add this
    products,
    blocks,
    crmMode,
    setCrmMode,
    unknownStep,
    setUnknownStep,
    updateCustomer,
    addPhone,
    removePhone,
    blockCustomer,
    unblockCustomer,
    searchByPhone,
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/contact-center/useCustomerData.ts
git commit -m "$(cat <<'EOF'
feat(contact-centre): add addresses query to useCustomerData hook

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Update `CrmSection` — Show Addresses in View Mode

**Files:**
- Modify: `src/components/contact-center/CrmSection.tsx`

- [ ] **Step 1: Add address rendering helper at the top of the file**

After the existing imports, add:

```ts
import { MapPin, ExternalLink } from 'lucide-react'
import { tryNormalisePhone } from '@/lib/contact-center/normalise-phone'
import type { ServiceCustomerAddress } from '@/hooks/contact-center/useCustomerData'

function formatAddress(a: ServiceCustomerAddress): string {
  if (a.address_type === 'blue-plate') {
    const parts = [
      a.zone     && `Zone ${a.zone}`,
      a.street   && `St ${a.street}`,
      a.building && `Bldg ${a.building}`,
      a.unit     && `Unit ${a.unit}`,
    ].filter(Boolean)
    return parts.length ? parts.join(', ') : a.label ?? 'No details'
  }
  if (a.lat != null && a.lng != null) return `${a.lat}, ${a.lng}`
  return a.label ?? 'GPS address'
}
```

- [ ] **Step 2: Destructure `addresses` from `customerData` in the component**

In the destructuring block at the top of `CrmSection`:

```ts
  const {
    customer, customerLoading, phones, addresses, crmMode, setCrmMode,  // ← add addresses
    unknownStep, setUnknownStep,
    updateCustomer, addPhone, removePhone, blockCustomer, unblockCustomer, searchByPhone,
  } = customerData
```

- [ ] **Step 3: Add addresses display in view mode**

In the `// ── View mode ──` section, after the phones `<div className="space-y-1">` block (the one that maps over `phones`), add:

```tsx
        {/* Resolve Wati phone to stored phone_id once, before the map */}
        {(() => {
          const normWatiPhone = tryNormalisePhone(pendingPhone ?? '')
          const activePhoneId = normWatiPhone
            ? phones.find((p) => p.phone === normWatiPhone)?.id ?? null
            : null
          return <>
        {addresses.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-border/50">
            {addresses.map((a) => {
              const isLinked = a.phone_id != null && a.phone_id === activePhoneId
              const googleMapsUrl =
                a.lat != null && a.lng != null
                  ? `https://maps.google.com/?q=${a.lat},${a.lng}`
                  : null

              return (
                <div
                  key={a.id}
                  className={`flex items-start gap-1.5 text-xs rounded px-1.5 py-1 ${
                    isLinked ? 'bg-primary/10 border border-primary/20' : ''
                  }`}
                >
                  <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      {a.label && (
                        <span className="font-medium">{a.label}</span>
                      )}
                      <Badge variant="outline" className="text-[9px] py-0 px-1">
                        {a.address_type === 'blue-plate' ? 'BP' : 'GPS'}
                      </Badge>
                      {a.is_primary && (
                        <Badge variant="secondary" className="text-[9px] py-0 px-1">primary</Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground truncate">{formatAddress(a)}</p>
                    <div className="flex gap-2 mt-0.5">
                      {googleMapsUrl && (
                        <a
                          href={googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-primary hover:underline"
                        >
                          <ExternalLink className="h-2.5 w-2.5" /> Maps
                        </a>
                      )}
                      {a.waze_link && (
                        <a
                          href={a.waze_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-primary hover:underline"
                        >
                          <ExternalLink className="h-2.5 w-2.5" /> Waze
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {addresses.length === 0 && (
          <p className="text-xs text-muted-foreground pl-0.5 pt-1 border-t border-border/50">No addresses saved</p>
        )}
          </>
        })()}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/contact-center/CrmSection.tsx
git commit -m "$(cat <<'EOF'
feat(contact-centre): display customer addresses in CRM panel view mode

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: PROGRESS.md + Security Audit

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Update PROGRESS.md**

Add to `## ✅ Completed`:

```markdown
- [2026-05-16] **Service Customers Page** — `supabase/migrations/20260516160000_service_customers_phone_id_referral.sql`, `src/hooks/useServiceCustomers.ts`, `src/components/master-data/ServiceCustomerFormDialog.tsx`, `src/app/(dashboard)/master-data/service-customers/page.tsx`, `src/components/layout/nav-config.ts`, `src/hooks/contact-center/useCustomerData.ts`, `src/components/contact-center/CrmSection.tsx` — Full CRUD for service customers with multi-phone/address management, address-to-phone linking, GPS + Blue Plate addresses with Google Maps/Waze links, blacklist toggle, and CRM panel address display
```

Add to `## 🔒 Security Audit Log`:

```markdown
| 2026-05-16 | Service Customers Page | ✅ Secrets | ✅ RLS | ✅ Auth gate | ✅ Error handling | All mutations throw on error; RLS already covers service_customer_* tables; new columns inherit existing policies |
```

- [ ] **Step 2: Commit**

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — service customers page complete

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Verification Checklist

After all tasks, manually verify:

- [ ] Nav: "Service Customers" appears in Master Data sidebar
- [ ] Page loads at `/master-data/service-customers` with empty state
- [ ] "Add Customer" opens the dialog
- [ ] Can create a customer with name + one phone → saved, appears in table
- [ ] Can add multiple phones, mark one primary — table shows the primary
- [ ] Can add a blue-plate address, link it to a phone, mark primary — table shows it
- [ ] Can add a GPS address — Google Maps link appears in the form; Waze link generated on save
- [ ] Search filters by name in the DataTable
- [ ] Edit dialog pre-fills all existing data including phone/address linkage
- [ ] Blacklist toggle (edit mode): toggling on shows reason field; saving adds entry to `customer_blocks` and sets `is_blocked = true`
- [ ] Blacklisted customer shows red "Blacklisted" badge in the table
- [ ] Open Contact Centre → open a Wati conversation for a customer with saved addresses → CRM panel shows addresses below phones
- [ ] Address linked to the conversation's phone number is highlighted in the CRM panel
