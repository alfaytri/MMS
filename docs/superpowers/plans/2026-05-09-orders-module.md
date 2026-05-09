# Orders Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the field-service Orders module — customer phone lookup, multi-address management, order creation with team calendar, order list, and order detail.

**Architecture:** Create-first approach. Phase A builds the customer data model (phones + addresses). Phase B builds the Create Order page (two-panel: form left, team calendar right, customer history panel right-collapsible). Phase C builds the Order list and detail views.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase PostgreSQL, TanStack Query v5, shadcn/ui, Tailwind CSS, dnd-kit (drag-and-drop, already installed).

**Design spec:** `docs/superpowers/specs/2026-05-09-orders-module-design.md`

**Branch:** `feature/orders-module`

---

## File Map

### New Files
| File | Purpose |
|---|---|
| `supabase/migrations/20260509120000_customer_phones_addresses.sql` | customer_phones + customer_addresses tables |
| `supabase/migrations/20260509120001_installed_products.sql` | installed_products table |
| `src/types/orders.ts` | All order-module TypeScript types |
| `src/lib/orders/warrantyUtils.ts` | Pure functions: warranty status, address formatting |
| `src/lib/orders/__tests__/warrantyUtils.test.ts` | Vitest tests for pure utils |
| `src/hooks/useCustomerLookup.ts` | Phone search, quick-create, link phones |
| `src/hooks/useCustomerAddresses.ts` | Fetch/add/select addresses per phone |
| `src/hooks/useBlueplate.ts` | Qatar Blue Plate API fetch |
| `src/hooks/useCreateOrder.ts` | Draft state + submit mutation |
| `src/hooks/useCustomerHistory.ts` | Past orders + installed products per customer |
| `src/hooks/useOrders.ts` | Order list with filters + pagination |
| `src/hooks/useOrderDetail.ts` | Single order with joins |
| `src/hooks/useOrderActions.ts` | confirm, rollback, cancel mutations |
| `src/components/orders/PhoneLookupModal.tsx` | Phone entry + lookup result dialog |
| `src/components/orders/AddressPicker.tsx` | Address selection popover |
| `src/components/orders/AddressCreationSheet.tsx` | Blue Plate + Google Coords add form |
| `src/components/orders/ServiceSelector.tsx` | N-level cascading service dropdowns |
| `src/components/orders/SelectedServiceCard.tsx` | Draggable service card (dnd-kit) |
| `src/components/orders/AllocateQuantityDialog.tsx` | Split qty across team assignments |
| `src/components/orders/TeamCalendarPanel.tsx` | Calendar panel for order creation |
| `src/components/orders/CustomerHistoryPanel.tsx` | Right collapsible: orders + products |
| `src/components/orders/OrderFormPanel.tsx` | Left panel: services, date, address, voucher |
| `src/components/orders/OrderCard.tsx` | Order list card |
| `src/components/orders/OrderDetailDialog.tsx` | Detail sheet with 4 tabs |
| `src/components/orders/OrderCancelDialog.tsx` | Cancel with reason dropdown |
| `src/app/(dashboard)/orders/page.tsx` | Order list page |
| `src/app/(dashboard)/orders/create/page.tsx` | Create order page |

### Modified Files
| File | Change |
|---|---|
| `src/components/layout/TopNav.tsx` | Add Work Orders submenu item |

---

## Task 1: Database Migration — customer_phones & customer_addresses

**Files:**
- Create: `supabase/migrations/20260509120000_customer_phones_addresses.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260509120000_customer_phones_addresses.sql

CREATE TABLE customer_phones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  phone        varchar(20) NOT NULL,
  label        varchar(50),
  is_primary   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_phones_phone_unique UNIQUE (phone)
);

CREATE INDEX idx_customer_phones_customer ON customer_phones(customer_id);
CREATE INDEX idx_customer_phones_phone    ON customer_phones(phone);

CREATE TABLE customer_addresses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  phone_id        uuid NOT NULL REFERENCES customer_phones(id) ON DELETE CASCADE,
  label           varchar(100),
  address_type    varchar(20) NOT NULL CHECK (address_type IN ('blue_plate', 'coordinates')),
  blue_plate_no   varchar(50),
  unit_no         varchar(50),
  building_no     varchar(50),
  street_no       varchar(50),
  zone_no         varchar(50),
  lat             decimal(10, 7),
  lng             decimal(10, 7),
  address_line    text,
  is_primary      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_addresses_customer ON customer_addresses(customer_id);
CREATE INDEX idx_customer_addresses_phone    ON customer_addresses(phone_id);
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```
Expected: "Remote database is up to date" or lists the new migration as applied.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260509120000_customer_phones_addresses.sql
git commit -m "$(cat <<'EOF'
feat(db): add customer_phones and customer_addresses tables

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Database Migration — installed_products

**Files:**
- Create: `supabase/migrations/20260509120001_installed_products.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260509120001_installed_products.sql

CREATE TABLE installed_products (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  phone_id            uuid NOT NULL REFERENCES customer_phones(id),
  address_id          uuid REFERENCES customer_addresses(id),
  order_id            uuid NOT NULL REFERENCES orders(id),
  product_name        varchar(255) NOT NULL,
  brand               varchar(100),
  model               varchar(100),
  serial_number       varchar(100),
  installed_at        date NOT NULL,
  warranty_months     integer NOT NULL DEFAULT 0,
  warranty_expires_at date GENERATED ALWAYS AS (
    CASE WHEN warranty_months > 0
      THEN (installed_at + (warranty_months || ' months')::interval)::date
      ELSE NULL
    END
  ) STORED,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_installed_products_customer ON installed_products(customer_id);
CREATE INDEX idx_installed_products_order    ON installed_products(order_id);
CREATE INDEX idx_installed_products_phone    ON installed_products(phone_id);
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260509120001_installed_products.sql
git commit -m "$(cat <<'EOF'
feat(db): add installed_products table with computed warranty_expires_at

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: TypeScript Types

**Files:**
- Create: `src/types/orders.ts`

- [ ] **Step 1: Write the types file**

```typescript
// src/types/orders.ts

export interface CustomerPhone {
  id: string
  customer_id: string
  phone: string
  label: string | null
  is_primary: boolean
  created_at: string
}

export interface CustomerAddress {
  id: string
  customer_id: string
  phone_id: string
  label: string | null
  address_type: 'blue_plate' | 'coordinates'
  blue_plate_no: string | null
  unit_no: string | null
  building_no: string | null
  street_no: string | null
  zone_no: string | null
  lat: number | null
  lng: number | null
  address_line: string | null
  is_primary: boolean
  created_at: string
}

export interface InstalledProduct {
  id: string
  customer_id: string
  phone_id: string
  address_id: string | null
  order_id: string
  product_name: string
  brand: string | null
  model: string | null
  serial_number: string | null
  installed_at: string
  warranty_months: number
  warranty_expires_at: string | null
  notes: string | null
  created_at: string
}

export type OrderStatus =
  | 'tentative' | 'scheduled' | 'confirmed' | 'in-progress'
  | 'completed' | 'cancelled' | 'waitlist'
  | 'pending-confirmation' | 'pending-approval'

export type ConfirmationStatus =
  | 'not_sent' | 'msg_sent' | 'customer_confirmed'
  | 'agent_confirmed' | 'no_response' | 'manually_confirmed'

export type OrderMode = 'normal' | 'emergency' | 'waitlist'
export type OrderType = 'order' | 'site-visit' | 'quotation'

export interface OrderServiceDraft {
  serviceId: string
  serviceName: string
  path: string[]
  qty: number
  price: number
  duration: number
  configuration?: Record<string, unknown>
  rootSkillId?: string
}

export interface TeamAssignmentDraft {
  id: string
  teamId: string
  teamName: string
  services: Array<{ serviceId: string; qty: number }>
  timeSlot: string
  duration: number
}

export interface OrderDraft {
  customerId: string
  phoneId: string
  customerName: string
  phone: string
  addressId: string | null
  addressLine: string | null
  type: OrderType
  services: OrderServiceDraft[]
  visitDate: string
  visitEndDate: string | null
  mode: OrderMode
  assignments: TeamAssignmentDraft[]
  voucherCode: string
  voucherDiscount: number
  notes: string
}

export interface OrderListItem {
  id: string
  order_id: string
  customer_id: string
  customer_name: string
  customer_phone: string
  type: OrderType
  division: string | null
  status: OrderStatus
  confirmation_status: ConfirmationStatus
  scheduled_date: string | null
  total_amount: number
  agent_name: string | null
  address: string | null
  has_invoice: boolean
  invoice_number: string | null
  created_at: string
  services_summary: string
}

export interface OrderDetail extends OrderListItem {
  order_services: Array<{
    id: string
    service_id: string | null
    name: string
    qty: number
    price: number
    duration: number
    path: string[]
  }>
  order_team_assignments: Array<{
    id: string
    team_id: string
    team_name: string
    services: Array<{ serviceId: string; qty: number }>
    scheduled_date: string
    time_slot: string
    duration: number
  }>
  order_log: Array<{
    id: string
    action: string
    user_name: string
    details: string | null
    created_at: string
  }>
}

export type WarrantyStatus = 'active' | 'expiring_soon' | 'expired'

export interface WarrantyInfo {
  status: WarrantyStatus
  label: string
}

export interface CustomerHistoryOrder {
  id: string
  order_id: string
  status: OrderStatus
  scheduled_date: string | null
  has_invoice: boolean
  invoice_number: string | null
  services_summary: string
}

export interface OrdersFilter {
  statusChip?: string
  bookingDateFrom?: string
  bookingDateTo?: string
  visitDateFrom?: string
  visitDateTo?: string
  customerName?: string
  customerPhone?: string
  agent?: string
  team?: string
  orderNumber?: string
  division?: string
  sortBy?: 'date_asc' | 'date_desc' | 'amount_asc' | 'amount_desc'
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/orders.ts
git commit -m "$(cat <<'EOF'
feat(orders): add TypeScript types for orders module

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Warranty & Address Utilities (with tests)

**Files:**
- Create: `src/lib/orders/warrantyUtils.ts`
- Create: `src/lib/orders/__tests__/warrantyUtils.test.ts`

- [ ] **Step 1: Write the utility functions**

```typescript
// src/lib/orders/warrantyUtils.ts
import { differenceInDays, differenceInMonths } from 'date-fns'
import type { CustomerAddress, WarrantyInfo } from '@/types/orders'

export function getWarrantyInfo(
  warrantyExpiresAt: string | null,
  warrantyMonths: number
): WarrantyInfo {
  if (warrantyMonths === 0 || !warrantyExpiresAt) {
    return { status: 'expired', label: 'No warranty' }
  }
  const today = new Date()
  const expiry = new Date(warrantyExpiresAt)
  const daysLeft = differenceInDays(expiry, today)

  if (daysLeft < 0) return { status: 'expired', label: 'Warranty expired' }
  if (daysLeft <= 30) return { status: 'expiring_soon', label: `Expires in ${daysLeft} days` }
  const monthsLeft = differenceInMonths(expiry, today)
  return { status: 'active', label: `${monthsLeft} months remaining` }
}

export function formatAddressLine(address: CustomerAddress): string {
  if (address.address_line) return address.address_line
  if (address.address_type === 'blue_plate') {
    const parts = [
      address.unit_no && `U-${address.unit_no}`,
      address.building_no && `B ${address.building_no}`,
      address.street_no && `St ${address.street_no}`,
      address.zone_no && `Zone ${address.zone_no}`,
    ].filter(Boolean)
    return parts.length > 0 ? parts.join(', ') + ', Qatar' : 'Qatar'
  }
  if (address.lat && address.lng) {
    return `${address.lat.toFixed(4)}, ${address.lng.toFixed(4)}`
  }
  return 'Address on file'
}
```

- [ ] **Step 2: Write the tests**

```typescript
// src/lib/orders/__tests__/warrantyUtils.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getWarrantyInfo, formatAddressLine } from '../warrantyUtils'
import type { CustomerAddress } from '@/types/orders'

describe('getWarrantyInfo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-09'))
  })

  it('returns expired when no warranty', () => {
    const result = getWarrantyInfo(null, 0)
    expect(result.status).toBe('expired')
  })

  it('returns expired when past expiry date', () => {
    const result = getWarrantyInfo('2026-01-01', 12)
    expect(result.status).toBe('expired')
    expect(result.label).toBe('Warranty expired')
  })

  it('returns expiring_soon within 30 days', () => {
    const result = getWarrantyInfo('2026-05-25', 12)
    expect(result.status).toBe('expiring_soon')
    expect(result.label).toMatch(/Expires in \d+ days/)
  })

  it('returns active with months remaining', () => {
    const result = getWarrantyInfo('2027-05-09', 24)
    expect(result.status).toBe('active')
    expect(result.label).toMatch(/\d+ months remaining/)
  })
})

describe('formatAddressLine', () => {
  const base: CustomerAddress = {
    id: '1', customer_id: '1', phone_id: '1', label: null,
    address_type: 'blue_plate', blue_plate_no: 'BP123',
    unit_no: '5', building_no: '58', street_no: '662', zone_no: '70',
    lat: null, lng: null, address_line: null,
    is_primary: false, created_at: '2026-01-01'
  }

  it('returns address_line if present', () => {
    expect(formatAddressLine({ ...base, address_line: 'Custom Line' })).toBe('Custom Line')
  })

  it('formats blue plate address from parts', () => {
    const result = formatAddressLine(base)
    expect(result).toBe('U-5, B 58, St 662, Zone 70, Qatar')
  })

  it('formats coordinates address', () => {
    const coords: CustomerAddress = { ...base, address_type: 'coordinates', lat: 25.3764, lng: 51.448 }
    expect(formatAddressLine(coords)).toBe('25.3764, 51.4480')
  })
})
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/lib/orders/__tests__/warrantyUtils.test.ts
```
Expected: 6 passing tests.

- [ ] **Step 4: Commit**

```bash
git add src/lib/orders/warrantyUtils.ts src/lib/orders/__tests__/warrantyUtils.test.ts
git commit -m "$(cat <<'EOF'
feat(orders): add warranty and address utility functions with tests

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: useCustomerLookup Hook

**Files:**
- Create: `src/hooks/useCustomerLookup.ts`

- [ ] **Step 1: Write the hook**

```typescript
// src/hooks/useCustomerLookup.ts
import { useMutation, useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { CustomerPhone } from '@/types/orders'

export interface CustomerLookupResult {
  found: true
  customerId: string
  phoneId: string
  customerName: string
  addressCount: number
  orderCount: number
}

export interface CustomerNotFound {
  found: false
}

export type LookupResult = CustomerLookupResult | CustomerNotFound

export function useCustomerLookup() {
  const supabase = createClient()

  const lookupPhone = useMutation({
    mutationFn: async (phone: string): Promise<LookupResult> => {
      const { data, error } = await supabase
        .from('customer_phones')
        .select(`
          id,
          customer_id,
          customers!inner(id, name),
          customer_addresses(id)
        `)
        .eq('phone', phone.replace(/\s+/g, ''))
        .single()

      if (error || !data) return { found: false }

      const { count: orderCount } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', data.customer_id)

      return {
        found: true,
        customerId: data.customer_id,
        phoneId: data.id,
        customerName: (data.customers as any).name,
        addressCount: (data.customer_addresses as any[]).length,
        orderCount: orderCount ?? 0,
      }
    },
  })

  const quickCreate = useMutation({
    mutationFn: async ({
      name,
      phone,
      linkPhone,
    }: {
      name: string
      phone: string
      linkPhone?: string
    }): Promise<CustomerLookupResult> => {
      const cleanPhone = phone.replace(/\s+/g, '')

      // Check if linkPhone already exists
      let existingCustomerId: string | null = null
      if (linkPhone) {
        const { data: existing } = await supabase
          .from('customer_phones')
          .select('customer_id')
          .eq('phone', linkPhone.replace(/\s+/g, ''))
          .single()
        existingCustomerId = existing?.customer_id ?? null
      }

      let customerId: string

      if (existingCustomerId) {
        customerId = existingCustomerId
      } else {
        const { data: newCustomer, error } = await supabase
          .from('customers')
          .insert({ name, type: 'cash' })
          .select('id')
          .single()
        if (error || !newCustomer) throw new Error('Failed to create customer')
        customerId = newCustomer.id
      }

      const { data: newPhone, error: phoneError } = await supabase
        .from('customer_phones')
        .insert({ customer_id: customerId, phone: cleanPhone, is_primary: true })
        .select('id')
        .single()
      if (phoneError || !newPhone) throw new Error('Failed to create phone')

      if (linkPhone && !existingCustomerId) {
        const cleanLink = linkPhone.replace(/\s+/g, '')
        const { data: existingLink } = await supabase
          .from('customer_phones')
          .select('id')
          .eq('phone', cleanLink)
          .single()
        if (!existingLink) {
          await supabase
            .from('customer_phones')
            .insert({ customer_id: customerId, phone: cleanLink, is_primary: false })
        }
      }

      return {
        found: true,
        customerId,
        phoneId: newPhone.id,
        customerName: name,
        addressCount: 0,
        orderCount: 0,
      }
    },
  })

  return { lookupPhone, quickCreate }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useCustomerLookup.ts
git commit -m "$(cat <<'EOF'
feat(orders): add useCustomerLookup hook (phone search + quick-create + link)

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: useCustomerAddresses + useBlueplate Hooks

**Files:**
- Create: `src/hooks/useCustomerAddresses.ts`
- Create: `src/hooks/useBlueplate.ts`

- [ ] **Step 1: Write useBlueplate**

```typescript
// src/hooks/useBlueplate.ts
import { useMutation } from '@tanstack/react-query'
import type { CustomerAddress } from '@/types/orders'

interface BlueplateResult {
  unit_no: string
  building_no: string
  street_no: string
  zone_no: string
  lat: number
  lng: number
  address_line: string
}

export function useBlueplate() {
  const fetchByNumber = useMutation({
    mutationFn: async (bluePlateNo: string): Promise<BlueplateResult> => {
      // Qatar Blue Plate API — endpoint to be confirmed with Qatar Municipality
      // Placeholder: replace BLUE_PLATE_API_URL with actual endpoint from env
      const apiUrl = process.env.NEXT_PUBLIC_BLUE_PLATE_API_URL
      if (!apiUrl) throw new Error('Blue Plate API URL not configured')

      const res = await fetch(`${apiUrl}?plate=${encodeURIComponent(bluePlateNo)}`)
      if (!res.ok) throw new Error('Blue Plate not found')
      const data = await res.json()

      return {
        unit_no: data.unit ?? '',
        building_no: data.building ?? '',
        street_no: data.street ?? '',
        zone_no: data.zone ?? '',
        lat: parseFloat(data.lat),
        lng: parseFloat(data.lng),
        address_line: data.formatted_address ?? '',
      }
    },
  })

  return { fetchByNumber }
}
```

- [ ] **Step 2: Write useCustomerAddresses**

```typescript
// src/hooks/useCustomerAddresses.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { formatAddressLine } from '@/lib/orders/warrantyUtils'
import type { CustomerAddress } from '@/types/orders'

export function useCustomerAddresses(phoneId: string | null) {
  const supabase = createClient()
  const qc = useQueryClient()

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ['customer-addresses', phoneId],
    queryFn: async (): Promise<CustomerAddress[]> => {
      if (!phoneId) return []
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('phone_id', phoneId)
        .order('is_primary', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!phoneId,
  })

  const addAddress = useMutation({
    mutationFn: async (
      input: Omit<CustomerAddress, 'id' | 'created_at' | 'address_line'>
    ): Promise<CustomerAddress> => {
      const address_line = formatAddressLine({ ...input, id: '', created_at: '', address_line: null })
      const { data, error } = await supabase
        .from('customer_addresses')
        .insert({ ...input, address_line })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-addresses', phoneId] })
    },
  })

  return { addresses, isLoading, addAddress }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCustomerAddresses.ts src/hooks/useBlueplate.ts
git commit -m "$(cat <<'EOF'
feat(orders): add useCustomerAddresses and useBlueplate hooks

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: PhoneLookupModal Component

**Files:**
- Create: `src/components/orders/PhoneLookupModal.tsx`

- [ ] **Step 1: Write the component**

```typescript
// src/components/orders/PhoneLookupModal.tsx
'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CheckCircle, UserPlus, Phone } from 'lucide-react'
import { useCustomerLookup, type CustomerLookupResult } from '@/hooks/useCustomerLookup'
import { toast } from 'sonner'

type Step = 'phone' | 'found' | 'new-customer'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (result: CustomerLookupResult) => void
}

export function PhoneLookupModal({ open, onOpenChange, onConfirm }: Props) {
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [linkPhone, setLinkPhone] = useState('')
  const [showLinkPhone, setShowLinkPhone] = useState(false)
  const [lookupResult, setLookupResult] = useState<CustomerLookupResult | null>(null)

  const { lookupPhone, quickCreate } = useCustomerLookup()

  function handleReset() {
    setStep('phone')
    setPhone('')
    setName('')
    setLinkPhone('')
    setShowLinkPhone(false)
    setLookupResult(null)
  }

  async function handleLookup() {
    if (!phone.trim()) return
    const result = await lookupPhone.mutateAsync(phone.trim())
    if (result.found) {
      setLookupResult(result)
      setStep('found')
    } else {
      setStep('new-customer')
    }
  }

  async function handleCreate() {
    if (!name.trim()) return
    try {
      const result = await quickCreate.mutateAsync({
        name: name.trim(),
        phone: phone.trim(),
        linkPhone: showLinkPhone ? linkPhone.trim() || undefined : undefined,
      })
      onConfirm(result)
      onOpenChange(false)
      handleReset()
    } catch {
      toast.error('Failed to create customer')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) handleReset() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Order</DialogTitle>
        </DialogHeader>

        {step === 'phone' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Customer Phone Number</Label>
              <Input
                id="phone"
                placeholder="+974 XXXX XXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleLookup} disabled={!phone.trim() || lookupPhone.isPending}>
                {lookupPhone.isPending ? 'Looking up…' : 'Look Up →'}
              </Button>
            </div>
          </div>
        )}

        {step === 'found' && lookupResult && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
              <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              <div>
                <p className="font-semibold text-slate-900">{lookupResult.customerName}</p>
                <p className="text-sm text-slate-500">
                  {lookupResult.addressCount} address{lookupResult.addressCount !== 1 ? 'es' : ''} ·{' '}
                  {lookupResult.orderCount} past order{lookupResult.orderCount !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep('phone')}>Change Number</Button>
              <Button onClick={() => { onConfirm(lookupResult); onOpenChange(false); handleReset() }}>
                Continue →
              </Button>
            </div>
          </div>
        )}

        {step === 'new-customer' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <UserPlus className="h-4 w-4" />
              New customer — {phone}
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Customer Name</Label>
              <Input
                id="name"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-slate-600">
                Does this customer use another number for service requests?
              </p>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={!showLinkPhone} onChange={() => setShowLinkPhone(false)} />
                  No
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={showLinkPhone} onChange={() => setShowLinkPhone(true)} />
                  Yes
                </label>
              </div>
              {showLinkPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Other number"
                    value={linkPhone}
                    onChange={(e) => setLinkPhone(e.target.value)}
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep('phone')}>Back</Button>
              <Button onClick={handleCreate} disabled={!name.trim() || quickCreate.isPending}>
                {quickCreate.isPending ? 'Creating…' : 'Continue →'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/orders/PhoneLookupModal.tsx
git commit -m "$(cat <<'EOF'
feat(orders): add PhoneLookupModal component (3-step: phone/found/new)

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: AddressPicker + AddressCreationSheet

**Files:**
- Create: `src/components/orders/AddressPicker.tsx`
- Create: `src/components/orders/AddressCreationSheet.tsx`

- [ ] **Step 1: Write AddressCreationSheet**

```typescript
// src/components/orders/AddressCreationSheet.tsx
'use client'
import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBlueplate } from '@/hooks/useBlueplate'
import { useCustomerAddresses } from '@/hooks/useCustomerAddresses'
import { toast } from 'sonner'
import type { CustomerAddress } from '@/types/orders'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerId: string
  phoneId: string
  onAdded: (address: CustomerAddress) => void
}

export function AddressCreationSheet({ open, onOpenChange, customerId, phoneId, onAdded }: Props) {
  const { fetchByNumber } = useBlueplate()
  const { addAddress } = useCustomerAddresses(phoneId)

  const [label, setLabel] = useState('')
  const [bluePlateNo, setBluePlateNo] = useState('')
  const [fetched, setFetched] = useState<Awaited<ReturnType<typeof fetchByNumber.mutateAsync>> | null>(null)
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')

  async function handleFetchBluePlate() {
    try {
      const result = await fetchByNumber.mutateAsync(bluePlateNo.trim())
      setFetched(result)
    } catch {
      toast.error('Blue Plate not found — enter address manually or use coordinates')
    }
  }

  async function handleSaveBluePlate() {
    if (!fetched) return
    try {
      const address = await addAddress.mutateAsync({
        customer_id: customerId,
        phone_id: phoneId,
        label: label || null,
        address_type: 'blue_plate',
        blue_plate_no: bluePlateNo,
        unit_no: fetched.unit_no,
        building_no: fetched.building_no,
        street_no: fetched.street_no,
        zone_no: fetched.zone_no,
        lat: fetched.lat,
        lng: fetched.lng,
        is_primary: false,
      })
      onAdded(address)
      onOpenChange(false)
      setLabel(''); setBluePlateNo(''); setFetched(null)
    } catch {
      toast.error('Failed to save address')
    }
  }

  async function handleSaveCoords() {
    const latNum = parseFloat(lat)
    const lngNum = parseFloat(lng)
    if (isNaN(latNum) || isNaN(lngNum)) {
      toast.error('Enter valid coordinates')
      return
    }
    try {
      const address = await addAddress.mutateAsync({
        customer_id: customerId,
        phone_id: phoneId,
        label: label || null,
        address_type: 'coordinates',
        blue_plate_no: null,
        unit_no: null, building_no: null, street_no: null, zone_no: null,
        lat: latNum,
        lng: lngNum,
        is_primary: false,
      })
      onAdded(address)
      onOpenChange(false)
      setLabel(''); setLat(''); setLng('')
    } catch {
      toast.error('Failed to save address')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add New Address</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label>Address Label (optional)</Label>
            <Input placeholder="e.g. Main Villa, Office Floor 3" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <Tabs defaultValue="blue_plate">
            <TabsList className="w-full">
              <TabsTrigger value="blue_plate" className="flex-1">Blue Plate</TabsTrigger>
              <TabsTrigger value="coordinates" className="flex-1">Coordinates</TabsTrigger>
            </TabsList>
            <TabsContent value="blue_plate" className="space-y-3 pt-3">
              <div className="flex gap-2">
                <Input placeholder="Blue Plate Number" value={bluePlateNo} onChange={(e) => setBluePlateNo(e.target.value)} />
                <Button variant="outline" onClick={handleFetchBluePlate} disabled={!bluePlateNo || fetchByNumber.isPending}>
                  {fetchByNumber.isPending ? 'Fetching…' : 'Fetch'}
                </Button>
              </div>
              {fetched && (
                <div className="rounded-md bg-slate-50 p-3 text-sm space-y-1">
                  <p><span className="text-slate-500">Unit:</span> {fetched.unit_no}</p>
                  <p><span className="text-slate-500">Building:</span> {fetched.building_no}</p>
                  <p><span className="text-slate-500">Street:</span> {fetched.street_no}</p>
                  <p><span className="text-slate-500">Zone:</span> {fetched.zone_no}</p>
                  <Button className="mt-2 w-full" onClick={handleSaveBluePlate} disabled={addAddress.isPending}>
                    Save Address
                  </Button>
                </div>
              )}
            </TabsContent>
            <TabsContent value="coordinates" className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Latitude</Label>
                  <Input placeholder="25.3764" value={lat} onChange={(e) => setLat(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Longitude</Label>
                  <Input placeholder="51.4480" value={lng} onChange={(e) => setLng(e.target.value)} />
                </div>
              </div>
              <Button className="w-full" onClick={handleSaveCoords} disabled={addAddress.isPending}>
                Save Address
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: Write AddressPicker**

```typescript
// src/components/orders/AddressPicker.tsx
'use client'
import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MapPin, Plus, Navigation } from 'lucide-react'
import { useCustomerAddresses } from '@/hooks/useCustomerAddresses'
import { formatAddressLine } from '@/lib/orders/warrantyUtils'
import { AddressCreationSheet } from './AddressCreationSheet'
import type { CustomerAddress } from '@/types/orders'
import { cn } from '@/lib/utils'

interface Props {
  customerId: string
  phoneId: string
  selected: CustomerAddress | null
  onSelect: (address: CustomerAddress) => void
  className?: string
}

export function AddressPicker({ customerId, phoneId, selected, onSelect, className }: Props) {
  const { addresses, isLoading } = useCustomerAddresses(phoneId)
  const [open, setOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              'flex min-h-11 w-full items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-2 text-left text-sm transition-colors hover:border-slate-400 hover:bg-slate-50',
              selected && 'border-solid border-slate-200 bg-white',
              className
            )}
          >
            <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
            {selected ? (
              <div>
                <p className="font-medium text-slate-900">{selected.label ?? 'Address'}</p>
                <p className="text-xs text-slate-500">{formatAddressLine(selected)}</p>
              </div>
            ) : (
              <span className="text-slate-400">Drop address here, or click to select</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="start">
          {isLoading ? (
            <p className="p-2 text-sm text-slate-500">Loading addresses…</p>
          ) : addresses.length === 0 ? (
            <p className="p-2 text-sm text-slate-500">No saved addresses</p>
          ) : (
            <div className="space-y-1">
              {addresses.map((addr) => (
                <button
                  key={addr.id}
                  onClick={() => { onSelect(addr); setOpen(false) }}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50',
                    selected?.id === addr.id && 'bg-orange-50'
                  )}
                >
                  <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div>
                    <p className="font-medium">{addr.label ?? 'Address'}</p>
                    <p className="text-xs text-slate-500">{formatAddressLine(addr)}</p>
                  </div>
                  <Badge variant="outline" className="ml-auto shrink-0 text-xs">
                    {addr.address_type === 'blue_plate' ? 'BP' : 'GPS'}
                  </Badge>
                </button>
              ))}
            </div>
          )}
          <div className="mt-1 border-t pt-1">
            <button
              onClick={() => { setOpen(false); setSheetOpen(true) }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" />
              Add New Address
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <AddressCreationSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        customerId={customerId}
        phoneId={phoneId}
        onAdded={(addr) => { onSelect(addr); setSheetOpen(false) }}
      />
    </>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/AddressPicker.tsx src/components/orders/AddressCreationSheet.tsx
git commit -m "$(cat <<'EOF'
feat(orders): add AddressPicker and AddressCreationSheet components

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: useCreateOrder Hook (Draft State)

**Files:**
- Create: `src/hooks/useCreateOrder.ts`

- [ ] **Step 1: Write the hook**

```typescript
// src/hooks/useCreateOrder.ts
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { OrderDraft, OrderServiceDraft, TeamAssignmentDraft, CustomerLookupResult } from '@/types/orders'
import { v4 as uuidv4 } from 'uuid'

const INITIAL_DRAFT: OrderDraft = {
  customerId: '',
  phoneId: '',
  customerName: '',
  phone: '',
  addressId: null,
  addressLine: null,
  type: 'order',
  services: [],
  visitDate: new Date().toISOString().split('T')[0],
  visitEndDate: null,
  mode: 'normal',
  assignments: [],
  voucherCode: '',
  voucherDiscount: 0,
  notes: '',
}

export function useCreateOrder() {
  const [draft, setDraft] = useState<OrderDraft>(INITIAL_DRAFT)
  const supabase = createClient()
  const qc = useQueryClient()

  function setCustomer(result: CustomerLookupResult & { phone: string }) {
    setDraft((d) => ({
      ...d,
      customerId: result.customerId,
      phoneId: result.phoneId,
      customerName: result.customerName,
      phone: result.phone,
    }))
  }

  function addService(service: Omit<OrderServiceDraft, never>) {
    setDraft((d) => ({ ...d, services: [...d.services, service] }))
  }

  function removeService(serviceId: string) {
    setDraft((d) => ({
      ...d,
      services: d.services.filter((s) => s.serviceId !== serviceId),
      assignments: d.assignments.map((a) => ({
        ...a,
        services: a.services.filter((s) => s.serviceId !== serviceId),
      })).filter((a) => a.services.length > 0),
    }))
  }

  function addAssignment(assignment: Omit<TeamAssignmentDraft, 'id'>) {
    setDraft((d) => ({ ...d, assignments: [...d.assignments, { ...assignment, id: uuidv4() }] }))
  }

  function removeAssignment(id: string) {
    setDraft((d) => ({ ...d, assignments: d.assignments.filter((a) => a.id !== id) }))
  }

  function update(patch: Partial<OrderDraft>) {
    setDraft((d) => ({ ...d, ...patch }))
  }

  function reset() {
    setDraft(INITIAL_DRAFT)
  }

  function isValid(): boolean {
    return (
      !!draft.customerId &&
      draft.services.length > 0 &&
      !!draft.visitDate &&
      !!draft.addressId &&
      draft.assignments.length > 0
    )
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!isValid()) throw new Error('Order is incomplete')

      // Generate order_id
      const { data: last } = await supabase
        .from('orders')
        .select('order_id')
        .ilike('order_id', 'ORD-%')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const nextNum = last?.order_id
        ? parseInt(last.order_id.replace('ORD-', ''), 10) + 1
        : 1
      const orderId = `ORD-${String(nextNum).padStart(4, '0')}`

      const totalAmount = draft.services.reduce((sum, s) => sum + s.price * s.qty, 0) - draft.voucherDiscount

      const status = draft.mode === 'waitlist' ? 'waitlist' : 'scheduled'

      const { data: order, error } = await supabase
        .from('orders')
        .insert({
          order_id: orderId,
          customer_id: draft.customerId,
          type: draft.type,
          status,
          confirmation_status: 'not_sent',
          scheduled_date: draft.visitDate,
          total_amount: totalAmount,
          address: draft.addressLine,
          notes: draft.notes || null,
          has_invoice: false,
        })
        .select('id')
        .single()

      if (error || !order) throw error ?? new Error('Failed to create order')

      // Insert order_services
      if (draft.services.length > 0) {
        await supabase.from('order_services').insert(
          draft.services.map((s) => ({
            order_id: order.id,
            service_id: s.serviceId,
            name: s.serviceName,
            qty: s.qty,
            price: s.price,
            duration: s.duration,
            path: s.path,
            configuration: s.configuration ?? null,
          }))
        )
      }

      // Insert order_team_assignments
      if (draft.assignments.length > 0) {
        await supabase.from('order_team_assignments').insert(
          draft.assignments.map((a) => ({
            order_id: order.id,
            team_id: a.teamId,
            services: a.services,
            scheduled_date: draft.visitDate,
            time_slot: a.timeSlot,
            duration: a.duration,
          }))
        )
      }

      // Audit log
      await supabase.from('order_log').insert({
        order_id: order.id,
        action: 'created',
        user_name: 'agent',
        details: `Order ${orderId} created`,
      })

      return order.id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      reset()
    },
  })

  return { draft, setCustomer, addService, removeService, addAssignment, removeAssignment, update, reset, isValid, submit }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useCreateOrder.ts
git commit -m "$(cat <<'EOF'
feat(orders): add useCreateOrder hook with draft state management

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: ServiceSelector Component

**Files:**
- Create: `src/components/orders/ServiceSelector.tsx`
- Create: `src/components/orders/SelectedServiceCard.tsx`

- [ ] **Step 1: Write ServiceSelector**

```typescript
// src/components/orders/ServiceSelector.tsx
'use client'
import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Clock, QrCode } from 'lucide-react'
import { useServices } from '@/hooks/useServices'
import type { OrderServiceDraft } from '@/types/orders'

interface ServiceNode {
  id: string
  name: string
  parent_id: string | null
  price: number
  duration: number
  root_id: string
  division: string
  children?: ServiceNode[]
}

interface Props {
  onAdd: (service: OrderServiceDraft) => void
  divisionFilter?: string
}

export function ServiceSelector({ onAdd, divisionFilter }: Props) {
  const { services } = useServices()
  const [selections, setSelections] = useState<Record<number, string>>({})
  const [qty, setQty] = useState(1)

  // Build cascading levels from flat service list
  function getChildren(parentId: string | null, level: number): ServiceNode[] {
    return (services ?? []).filter((s: ServiceNode) =>
      s.parent_id === parentId &&
      (!divisionFilter || s.division === divisionFilter)
    )
  }

  function buildLevels(): Array<{ options: ServiceNode[]; selectedId: string | undefined }> {
    const levels = []
    let parentId: string | null = null
    let levelIndex = 0

    while (true) {
      const options = getChildren(parentId, levelIndex)
      if (options.length === 0) break
      const selectedId = selections[levelIndex]
      levels.push({ options, selectedId })
      if (!selectedId) break
      parentId = selectedId
      levelIndex++
    }
    return levels
  }

  const levels = buildLevels()
  const lastSelected = Object.keys(selections).length > 0
    ? (services ?? []).find((s: ServiceNode) => s.id === selections[Object.keys(selections).length - 1])
    : null
  const isLeaf = lastSelected && getChildren(lastSelected.id, 0).length === 0

  function handleLevelChange(level: number, value: string) {
    const newSelections: Record<number, string> = {}
    for (let i = 0; i < level; i++) newSelections[i] = selections[i]
    newSelections[level] = value
    setSelections(newSelections)
    setQty(1)
  }

  function handleAdd() {
    if (!lastSelected || !isLeaf) return
    const pathNames = Object.values(selections).map(
      (id) => (services ?? []).find((s: ServiceNode) => s.id === id)?.name ?? ''
    )
    onAdd({
      serviceId: lastSelected.id,
      serviceName: lastSelected.name,
      path: pathNames,
      qty,
      price: lastSelected.price,
      duration: lastSelected.duration,
      rootSkillId: lastSelected.root_id,
    })
    setSelections({})
    setQty(1)
  }

  return (
    <div className="space-y-2">
      {levels.map((level, i) => (
        <Select key={i} value={level.selectedId ?? ''} onValueChange={(v) => handleLevelChange(i, v)}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder={i === 0 ? 'Select category…' : 'Select…'} />
          </SelectTrigger>
          <SelectContent>
            {level.options.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {isLeaf && lastSelected && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-2 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1 text-slate-500">
              <Clock className="h-3.5 w-3.5" /> {lastSelected.duration} min
            </span>
            <span className="font-semibold text-slate-900">QAR {lastSelected.price}</span>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="h-8 w-16 text-center"
            />
            <Button size="sm" className="flex-1 h-8 gap-1" onClick={handleAdd}>
              <Plus className="h-3.5 w-3.5" /> Add Service
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write SelectedServiceCard (draggable with dnd-kit)**

```typescript
// src/components/orders/SelectedServiceCard.tsx
'use client'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { X, GripVertical, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { OrderServiceDraft } from '@/types/orders'
import { cn } from '@/lib/utils'

interface Props {
  service: OrderServiceDraft
  onRemove: (serviceId: string) => void
}

export function SelectedServiceCard({ service, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: service.serviceId,
    data: { type: 'service', service },
  })

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm',
        isDragging && 'opacity-50 shadow-lg'
      )}
    >
      <button {...listeners} {...attributes} className="cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium text-slate-900">{service.serviceName}</p>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>×{service.qty}</span>
          <span>·</span>
          <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{service.duration}m</span>
          <span>·</span>
          <span>QAR {(service.price * service.qty).toFixed(0)}</span>
        </div>
      </div>
      <button
        onClick={() => onRemove(service.serviceId)}
        className="text-slate-400 hover:text-red-500"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/ServiceSelector.tsx src/components/orders/SelectedServiceCard.tsx
git commit -m "$(cat <<'EOF'
feat(orders): add ServiceSelector and SelectedServiceCard (dnd-kit draggable)

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```


---

## Task 11: TeamCalendarPanel (Order Creation Variant)

**Files:**
- Create: `src/components/orders/TeamCalendarPanel.tsx`
- Create: `src/components/orders/AllocateQuantityDialog.tsx`

- [ ] **Step 1: Write AllocateQuantityDialog**

```typescript
// src/components/orders/AllocateQuantityDialog.tsx
'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { OrderServiceDraft } from '@/types/orders'

interface Allocation { teamId: string; teamName: string; timeSlot: string; qty: number }

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  service: OrderServiceDraft
  teamId: string
  teamName: string
  timeSlot: string
  onConfirm: (allocations: Allocation[]) => void
}

export function AllocateQuantityDialog({ open, onOpenChange, service, teamId, teamName, timeSlot, onConfirm }: Props) {
  const [thisQty, setThisQty] = useState(service.qty)

  function handleConfirm() {
    const remaining = service.qty - thisQty
    const allocs: Allocation[] = [{ teamId, teamName, timeSlot, qty: thisQty }]
    if (remaining > 0) {
      // Remaining qty stays un-allocated (card stays in service list with reduced qty)
    }
    onConfirm(allocs)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Allocate Quantity</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-slate-600">
            Assigning <strong>{service.serviceName}</strong> (total qty: {service.qty}) to{' '}
            <strong>{teamName}</strong> at <strong>{timeSlot}</strong>
          </p>
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-500 w-24">Qty to assign</label>
            <Input
              type="number"
              min={1}
              max={service.qty}
              value={thisQty}
              onChange={(e) => setThisQty(Math.min(service.qty, Math.max(1, parseInt(e.target.value) || 1)))}
              className="w-20 text-center"
            />
            <span className="text-sm text-slate-400">/ {service.qty}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm}>Assign {thisQty}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Write TeamCalendarPanel**

```typescript
// src/components/orders/TeamCalendarPanel.tsx
'use client'
import { useState, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format, addDays, subDays } from 'date-fns'
import { useTeams } from '@/hooks/useTeams'
import { useCalendarVisits } from '@/hooks/useCalendarVisits'
import { AllocateQuantityDialog } from './AllocateQuantityDialog'
import type { OrderServiceDraft, TeamAssignmentDraft, OrderMode } from '@/types/orders'
import { cn } from '@/lib/utils'

const HOURS = Array.from({ length: 12 }, (_, i) => i + 7) // 7AM–6PM

interface PendingDrop {
  service: OrderServiceDraft
  teamId: string
  teamName: string
  timeSlot: string
}

interface Props {
  visitDate: string
  mode: OrderMode
  onModeChange: (mode: OrderMode) => void
  assignments: TeamAssignmentDraft[]
  draggingService: OrderServiceDraft | null
  onAssign: (assignment: Omit<TeamAssignmentDraft, 'id'>) => void
  onDateChange: (date: string) => void
}

function DroppableCell({
  teamId, hour, children, isSkillMatch
}: {
  teamId: string; hour: number; children?: React.ReactNode; isSkillMatch: boolean | null
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `${teamId}-${hour}`, data: { teamId, hour } })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'relative h-12 w-16 shrink-0 border-r border-slate-100 transition-colors',
        isOver && 'bg-orange-50',
        isSkillMatch === true && 'bg-green-50',
        isSkillMatch === false && 'opacity-40'
      )}
    >
      {children}
    </div>
  )
}

export function TeamCalendarPanel({
  visitDate, mode, onModeChange, assignments, draggingService, onAssign, onDateChange
}: Props) {
  const { teams } = useTeams()
  const { visits } = useCalendarVisits(visitDate)
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null)

  const date = new Date(visitDate)

  // Map team → skills for highlighting
  const teamSkillMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    teams?.forEach((t: any) => {
      map[t.id] = t.employees?.flatMap((e: any) => e.skills ?? []) ?? []
    })
    return map
  }, [teams])

  function getSkillMatch(teamId: string): boolean | null {
    if (!draggingService?.rootSkillId) return null
    const skills = teamSkillMap[teamId] ?? []
    return skills.includes(draggingService.rootSkillId)
  }

  function getVisitsForCell(teamId: string, hour: number) {
    return (visits ?? []).filter((v: any) => v.team_id === teamId && parseInt(v.start_time) === hour)
  }

  function getAssignmentsForCell(teamId: string, hour: number) {
    return assignments.filter((a) => a.teamId === teamId && parseInt(a.timeSlot) === hour)
  }

  function handleDrop(teamId: string, teamName: string, hour: number, service: OrderServiceDraft) {
    const timeSlot = `${String(hour).padStart(2, '0')}:00`
    if (service.qty > 1) {
      setPendingDrop({ service, teamId, teamName, timeSlot })
    } else {
      onAssign({ teamId, teamName, services: [{ serviceId: service.serviceId, qty: 1 }], timeSlot, duration: service.duration })
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDateChange(format(subDays(date, 1), 'yyyy-MM-dd'))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">{format(date, 'EEE, MMM d')}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDateChange(format(addDays(date, 1), 'yyyy-MM-dd'))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-1">
          {(['normal', 'emergency', 'waitlist'] as OrderMode[]).map((m) => (
            <Button key={m} size="sm" variant={mode === m ? 'default' : 'outline'} className="h-7 capitalize text-xs" onClick={() => onModeChange(m)}>
              {m === 'normal' ? 'Normal' : m === 'emergency' ? 'Emergency' : 'Wait List'}
            </Button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <div className="flex">
          {/* Team labels */}
          <div className="w-32 shrink-0 border-r">
            <div className="h-8 border-b bg-slate-50 px-2 text-xs font-medium text-slate-500 flex items-center">Teams / Time</div>
            {teams?.map((team: any) => (
              <div key={team.id} className={cn('flex h-12 items-center border-b px-2 text-sm transition-opacity', draggingService && getSkillMatch(team.id) === false && 'opacity-40')}>
                <div>
                  <p className="font-medium text-slate-900 truncate max-w-[110px]">{team.name}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Time columns */}
          <div className="flex-1 overflow-x-auto">
            <div className="flex">
              {HOURS.map((hour) => (
                <div key={hour} className="w-16 shrink-0">
                  <div className="h-8 border-b border-r bg-slate-50 flex items-center justify-center text-xs text-slate-500">
                    {hour}AM
                  </div>
                  {teams?.map((team: any) => (
                    <DroppableCell key={team.id} teamId={team.id} hour={hour} isSkillMatch={draggingService ? getSkillMatch(team.id) : null}>
                      {getVisitsForCell(team.id, hour).map((v: any) => (
                        <div key={v.id} className="absolute inset-0 m-0.5 rounded bg-blue-100 text-xs p-0.5 truncate text-blue-800">{v.order_id}</div>
                      ))}
                      {getAssignmentsForCell(team.id, hour).map((a) => (
                        <div key={a.id} className="absolute inset-0 m-0.5 rounded bg-orange-100 text-xs p-0.5 truncate text-orange-800">
                          {a.services.map(s => s.qty).reduce((a, b) => a + b, 0)}× new
                        </div>
                      ))}
                    </DroppableCell>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {pendingDrop && (
        <AllocateQuantityDialog
          open={!!pendingDrop}
          onOpenChange={(v) => !v && setPendingDrop(null)}
          service={pendingDrop.service}
          teamId={pendingDrop.teamId}
          teamName={pendingDrop.teamName}
          timeSlot={pendingDrop.timeSlot}
          onConfirm={(allocs) => {
            allocs.forEach((a) => onAssign({ teamId: a.teamId, teamName: a.teamName, services: [{ serviceId: pendingDrop.service.serviceId, qty: a.qty }], timeSlot: a.timeSlot, duration: pendingDrop.service.duration }))
            setPendingDrop(null)
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/TeamCalendarPanel.tsx src/components/orders/AllocateQuantityDialog.tsx
git commit -m "$(cat <<'EOF'
feat(orders): add TeamCalendarPanel and AllocateQuantityDialog

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: useCustomerHistory + CustomerHistoryPanel

**Files:**
- Create: `src/hooks/useCustomerHistory.ts`
- Create: `src/components/orders/CustomerHistoryPanel.tsx`

- [ ] **Step 1: Write useCustomerHistory**

```typescript
// src/hooks/useCustomerHistory.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { CustomerHistoryOrder, InstalledProduct } from '@/types/orders'

export function useCustomerHistory(customerId: string | null, year: number, month: number) {
  const supabase = createClient()

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = new Date(year, month, 0).toISOString().split('T')[0]

  const orders = useQuery({
    queryKey: ['customer-history-orders', customerId, year, month],
    queryFn: async (): Promise<CustomerHistoryOrder[]> => {
      if (!customerId) return []
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_id, status, scheduled_date, has_invoice, invoice_number')
        .eq('customer_id', customerId)
        .gte('scheduled_date', startDate)
        .lte('scheduled_date', endDate)
        .order('scheduled_date', { ascending: false })
      if (error) throw error
      return (data ?? []).map((o) => ({ ...o, services_summary: '' }))
    },
    enabled: !!customerId,
  })

  const products = useQuery({
    queryKey: ['customer-history-products', customerId, year, month],
    queryFn: async (): Promise<InstalledProduct[]> => {
      if (!customerId) return []
      const { data, error } = await supabase
        .from('installed_products')
        .select('*')
        .eq('customer_id', customerId)
        .gte('installed_at', startDate)
        .lte('installed_at', endDate)
        .order('installed_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!customerId,
  })

  return { orders, products }
}
```

- [ ] **Step 2: Write CustomerHistoryPanel**

```typescript
// src/components/orders/CustomerHistoryPanel.tsx
'use client'
import { useState } from 'react'
import { format, addMonths, subMonths } from 'date-fns'
import { ChevronLeft, ChevronRight, ChevronRight as Collapse, ReceiptText, Wrench, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCustomerHistory } from '@/hooks/useCustomerHistory'
import { getWarrantyInfo } from '@/lib/orders/warrantyUtils'
import { cn } from '@/lib/utils'
import type { CustomerHistoryOrder, InstalledProduct, OrderStatus } from '@/types/orders'

const STATUS_COLORS: Record<OrderStatus, string> = {
  completed: 'bg-green-100 text-green-800',
  scheduled: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  'in-progress': 'bg-orange-100 text-orange-800',
  cancelled: 'bg-red-100 text-red-800',
  waitlist: 'bg-yellow-100 text-yellow-800',
  tentative: 'bg-slate-100 text-slate-600',
  'pending-confirmation': 'bg-orange-100 text-orange-800',
  'pending-approval': 'bg-yellow-100 text-yellow-800',
}

const WARRANTY_COLORS = {
  active: 'text-green-600',
  expiring_soon: 'text-yellow-600',
  expired: 'text-red-600',
}

const PAGE_SIZE = 4

interface Props {
  customerId: string | null
  onViewOrder?: (orderId: string) => void
  onCreateBackwork?: (orderId: string) => void
}

export function CustomerHistoryPanel({ customerId, onViewOrder, onCreateBackwork }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [activeMonth, setActiveMonth] = useState(new Date())
  const [orderPage, setOrderPage] = useState(0)
  const [productPage, setProductPage] = useState(0)

  const year = activeMonth.getFullYear()
  const month = activeMonth.getMonth() + 1

  const { orders, products } = useCustomerHistory(customerId, year, month)

  const orderItems = orders.data ?? []
  const productItems = products.data ?? []

  const orderSlice = orderItems.slice(orderPage * PAGE_SIZE, (orderPage + 1) * PAGE_SIZE)
  const productSlice = productItems.slice(productPage * PAGE_SIZE, (productPage + 1) * PAGE_SIZE)

  if (collapsed) {
    return (
      <div className="flex w-8 flex-col items-center border-l bg-slate-50 pt-4">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCollapsed(false)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex w-80 shrink-0 flex-col border-l bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-semibold text-slate-900">Customer History</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCollapsed(true)}>
          <Collapse className="h-4 w-4 rotate-180" />
        </Button>
      </div>

      {!customerId ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400 p-4 text-center">
          Lookup a customer to see their history
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Month strip */}
          <div className="flex items-center justify-between border-b px-3 py-2">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setActiveMonth(m => subMonths(m, 1)); setOrderPage(0); setProductPage(0) }}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs font-medium text-slate-700">{format(activeMonth, 'MMMM yyyy')}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setActiveMonth(m => addMonths(m, 1)); setOrderPage(0); setProductPage(0) }}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Orders section */}
          <div className="border-b p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Orders</span>
              <Badge variant="secondary" className="text-xs">{orderItems.length}</Badge>
            </div>
            {orders.isLoading ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : orderSlice.length === 0 ? (
              <p className="text-xs text-slate-400">No orders in {format(activeMonth, 'MMMM')}</p>
            ) : (
              <div className="space-y-2">
                {orderSlice.map((order) => (
                  <div key={order.id} className="rounded-lg border border-slate-200 p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900">{order.order_id}</span>
                      <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', STATUS_COLORS[order.status as OrderStatus])}>
                        {order.status}
                      </span>
                    </div>
                    {order.scheduled_date && (
                      <p className="text-xs text-slate-500">{format(new Date(order.scheduled_date), 'dd MMM yyyy')}</p>
                    )}
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-6 flex-1 text-xs gap-1 px-2" onClick={() => onViewOrder?.(order.id)}>
                        <ExternalLink className="h-3 w-3" /> View
                      </Button>
                      {order.has_invoice && (
                        <Button size="sm" variant="outline" className="h-6 flex-1 text-xs gap-1 px-2" onClick={() => window.open(`/sales/invoices/${order.invoice_number}`, '_blank')}>
                          <ReceiptText className="h-3 w-3" /> Invoice
                        </Button>
                      )}
                      {order.status === 'completed' && (
                        <Button size="sm" variant="outline" className="h-6 flex-1 text-xs gap-1 px-2 text-red-600 border-red-200 hover:bg-red-50" onClick={() => onCreateBackwork?.(order.id)}>
                          <Wrench className="h-3 w-3" /> Backwork
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {orderItems.length > PAGE_SIZE && (
              <div className="mt-2 flex justify-between text-xs text-slate-500">
                <button onClick={() => setOrderPage(p => Math.max(0, p - 1))} disabled={orderPage === 0} className="disabled:opacity-30">← Prev</button>
                <span>{orderPage + 1}/{Math.ceil(orderItems.length / PAGE_SIZE)}</span>
                <button onClick={() => setOrderPage(p => Math.min(Math.ceil(orderItems.length / PAGE_SIZE) - 1, p + 1))} disabled={(orderPage + 1) * PAGE_SIZE >= orderItems.length} className="disabled:opacity-30">Next →</button>
              </div>
            )}
          </div>

          {/* Products section */}
          <div className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Installed Products</span>
              <Badge variant="secondary" className="text-xs">{productItems.length}</Badge>
            </div>
            {products.isLoading ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : productSlice.length === 0 ? (
              <p className="text-xs text-slate-400">No products installed in {format(activeMonth, 'MMMM')}</p>
            ) : (
              <div className="space-y-2">
                {productSlice.map((product) => {
                  const warranty = getWarrantyInfo(product.warranty_expires_at, product.warranty_months)
                  return (
                    <div key={product.id} className="rounded-lg border border-slate-200 p-2.5 space-y-1">
                      <p className="text-xs font-semibold text-slate-900">{product.product_name}</p>
                      <p className="text-xs text-slate-500">Installed: {format(new Date(product.installed_at), 'dd MMM yyyy')}</p>
                      <p className={cn('text-xs font-medium', WARRANTY_COLORS[warranty.status])}>{warranty.label}</p>
                    </div>
                  )
                })}
              </div>
            )}
            {productItems.length > PAGE_SIZE && (
              <div className="mt-2 flex justify-between text-xs text-slate-500">
                <button onClick={() => setProductPage(p => Math.max(0, p - 1))} disabled={productPage === 0} className="disabled:opacity-30">← Prev</button>
                <span>{productPage + 1}/{Math.ceil(productItems.length / PAGE_SIZE)}</span>
                <button onClick={() => setProductPage(p => Math.min(Math.ceil(productItems.length / PAGE_SIZE) - 1, p + 1))} disabled={(productPage + 1) * PAGE_SIZE >= productItems.length} className="disabled:opacity-30">Next →</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCustomerHistory.ts src/components/orders/CustomerHistoryPanel.tsx
git commit -m "$(cat <<'EOF'
feat(orders): add useCustomerHistory hook and CustomerHistoryPanel

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Create Order Page

**Files:**
- Create: `src/components/orders/OrderFormPanel.tsx`
- Create: `src/app/(dashboard)/orders/create/page.tsx`

- [ ] **Step 1: Write OrderFormPanel**

```typescript
// src/components/orders/OrderFormPanel.tsx
'use client'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { CalendarIcon, CheckCircle } from 'lucide-react'
import { ServiceSelector } from './ServiceSelector'
import { SelectedServiceCard } from './SelectedServiceCard'
import { AddressPicker } from './AddressPicker'
import type { OrderDraft, OrderServiceDraft, CustomerAddress, OrderType } from '@/types/orders'

interface Props {
  draft: OrderDraft
  onTypeChange: (type: OrderType) => void
  onAddService: (s: OrderServiceDraft) => void
  onRemoveService: (id: string) => void
  onAddressSelect: (a: CustomerAddress) => void
  onUpdate: (patch: Partial<OrderDraft>) => void
  onSubmit: () => void
  isSubmitting: boolean
  isValid: boolean
}

export function OrderFormPanel({ draft, onTypeChange, onAddService, onRemoveService, onAddressSelect, onUpdate, onSubmit, isSubmitting, isValid }: Props) {
  return (
    <div className="flex h-full w-[340px] shrink-0 flex-col border-r bg-white">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Type toggle */}
        <Tabs value={draft.type} onValueChange={(v) => onTypeChange(v as OrderType)}>
          <TabsList className="w-full">
            <TabsTrigger value="order" className="flex-1">Order</TabsTrigger>
            <TabsTrigger value="site-visit" className="flex-1">Site Visit</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Services */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Requested Services</Label>
            {draft.services.length > 0 && (
              <span className="text-xs text-slate-400">{draft.services.length} selected</span>
            )}
          </div>
          {draft.type === 'order' && (
            <>
              <ServiceSelector onAdd={onAddService} />
              {draft.services.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {draft.services.map((s) => (
                    <SelectedServiceCard key={s.serviceId} service={s} onRemove={onRemoveService} />
                  ))}
                </div>
              )}
            </>
          )}
          {draft.type === 'site-visit' && (
            <p className="text-xs text-slate-400 mt-1">Site visit — no services required</p>
          )}
        </div>

        {/* Visit Date */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Visit Date</Label>
          <div className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2">
            <CalendarIcon className="h-4 w-4 text-slate-400" />
            <input
              type="date"
              value={draft.visitDate}
              onChange={(e) => onUpdate({ visitDate: e.target.value })}
              className="flex-1 text-sm outline-none"
            />
          </div>
        </div>

        {/* Address */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order Address</Label>
          <AddressPicker
            customerId={draft.customerId}
            phoneId={draft.phoneId}
            selected={null}
            onSelect={(addr) => {
              onAddressSelect(addr)
              onUpdate({ addressId: addr.id, addressLine: addr.address_line })
            }}
          />
        </div>

        {/* Voucher */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Voucher Code</Label>
          <div className="flex gap-2">
            <Input
              placeholder="ENTER VOUCHER CODE"
              value={draft.voucherCode}
              onChange={(e) => onUpdate({ voucherCode: e.target.value })}
              className="h-9 flex-1 uppercase"
            />
            <Button variant="outline" size="sm" className="h-9">Apply</Button>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</Label>
          <Textarea
            placeholder="Add notes…"
            value={draft.notes}
            onChange={(e) => onUpdate({ notes: e.target.value })}
            rows={2}
            className="resize-none"
          />
        </div>

        {/* Total */}
        {draft.services.length > 0 && (
          <div className="rounded-md bg-slate-50 p-2 text-right">
            <span className="text-xs text-slate-500">Total: </span>
            <span className="font-semibold text-slate-900">
              QAR {draft.services.reduce((sum, s) => sum + s.price * s.qty, 0).toFixed(0)}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t p-3">
        <Button className="w-full gap-2" disabled={!isValid || isSubmitting} onClick={onSubmit}>
          <CheckCircle className="h-4 w-4" />
          {isSubmitting ? 'Confirming…' : 'Confirm Order'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write the Create Order page**

```typescript
// src/app/(dashboard)/orders/create/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DndContext, DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { toast } from 'sonner'
import { PhoneLookupModal } from '@/components/orders/PhoneLookupModal'
import { OrderFormPanel } from '@/components/orders/OrderFormPanel'
import { TeamCalendarPanel } from '@/components/orders/TeamCalendarPanel'
import { CustomerHistoryPanel } from '@/components/orders/CustomerHistoryPanel'
import { useCreateOrder } from '@/hooks/useCreateOrder'
import type { OrderServiceDraft } from '@/types/orders'

export default function CreateOrderPage() {
  const router = useRouter()
  const [lookupOpen, setLookupOpen] = useState(true)
  const [draggingService, setDraggingService] = useState<OrderServiceDraft | null>(null)

  const {
    draft, setCustomer, addService, removeService, addAssignment,
    update, isValid, submit
  } = useCreateOrder()

  function handleDragStart(event: DragStartEvent) {
    const { data } = event.active
    if (data.current?.type === 'service') {
      setDraggingService(data.current.service as OrderServiceDraft)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingService(null)
    const { active, over } = event
    if (!over || !active.data.current) return

    const service = active.data.current.service as OrderServiceDraft
    const { teamId, hour } = over.data.current as { teamId: string; hour: number }
    const team = { teamId, teamName: String(over.id).split('-')[0] }

    addAssignment({
      teamId,
      teamName: teamId,
      services: [{ serviceId: service.serviceId, qty: service.qty }],
      timeSlot: `${String(hour).padStart(2, '0')}:00`,
      duration: service.duration,
    })
  }

  async function handleSubmit() {
    try {
      const orderId = await submit.mutateAsync()
      toast.success('Order created successfully')
      router.push('/orders')
    } catch {
      toast.error('Failed to create order')
    }
  }

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <PhoneLookupModal
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        onConfirm={(result) => {
          setCustomer({ ...result, phone: '' })
          setLookupOpen(false)
        }}
      />

      <div className="flex h-[calc(100vh-56px)] overflow-hidden">
        <OrderFormPanel
          draft={draft}
          onTypeChange={(type) => update({ type })}
          onAddService={addService}
          onRemoveService={removeService}
          onAddressSelect={() => {}}
          onUpdate={update}
          onSubmit={handleSubmit}
          isSubmitting={submit.isPending}
          isValid={isValid()}
        />

        <div className="flex-1 overflow-hidden">
          <TeamCalendarPanel
            visitDate={draft.visitDate}
            mode={draft.mode}
            onModeChange={(mode) => update({ mode })}
            assignments={draft.assignments}
            draggingService={draggingService}
            onAssign={addAssignment}
            onDateChange={(date) => update({ visitDate: date })}
          />
        </div>

        <CustomerHistoryPanel
          customerId={draft.customerId || null}
          onViewOrder={(id) => window.open(`/orders/${id}`, '_blank')}
          onCreateBackwork={(id) => router.push(`/orders/create-backwork?from=${id}`)}
        />
      </div>
    </DndContext>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/orders/OrderFormPanel.tsx src/app/(dashboard)/orders/create/page.tsx
git commit -m "$(cat <<'EOF'
feat(orders): add Create Order page with three-panel layout

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: useOrders + Order List Page

**Files:**
- Create: `src/hooks/useOrders.ts`
- Create: `src/components/orders/OrderCard.tsx`
- Create: `src/app/(dashboard)/orders/page.tsx`

- [ ] **Step 1: Write useOrders**

```typescript
// src/hooks/useOrders.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { OrderListItem, OrdersFilter } from '@/types/orders'

export function useOrders(filter: OrdersFilter = {}) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['orders', filter],
    queryFn: async (): Promise<OrderListItem[]> => {
      let query = supabase
        .from('orders')
        .select(`
          id, order_id, customer_id, type, division, status, confirmation_status,
          scheduled_date, total_amount, agent_name, address, has_invoice, invoice_number, created_at,
          customers!inner(name),
          customer_phones!left(phone)
        `)

      if (filter.statusChip === 'scheduled') query = query.eq('status', 'scheduled')
      else if (filter.statusChip === 'pending_approval') query = query.eq('status', 'pending-approval')
      else if (filter.statusChip === 'no_confirmation') query = query.in('status', ['pending-confirmation']).or('confirmation_status.eq.no_response')
      else if (filter.statusChip === 'no_address') query = query.is('address', null)
      else if (filter.statusChip === 'past_due_no_invoice') {
        const today = new Date().toISOString().split('T')[0]
        query = query.lt('scheduled_date', today).eq('has_invoice', false).neq('status', 'cancelled')
      }

      if (filter.bookingDateFrom) query = query.gte('created_at', filter.bookingDateFrom)
      if (filter.bookingDateTo)   query = query.lte('created_at', filter.bookingDateTo)
      if (filter.visitDateFrom)   query = query.gte('scheduled_date', filter.visitDateFrom)
      if (filter.visitDateTo)     query = query.lte('scheduled_date', filter.visitDateTo)
      if (filter.orderNumber)     query = query.ilike('order_id', `%${filter.orderNumber}%`)
      if (filter.division)        query = query.eq('division', filter.division)

      if (filter.sortBy === 'date_asc')    query = query.order('scheduled_date', { ascending: true })
      else if (filter.sortBy === 'amount_desc') query = query.order('total_amount', { ascending: false })
      else query = query.order('scheduled_date', { ascending: false })

      const { data, error } = await query.limit(200)
      if (error) throw error

      return (data ?? []).map((o: any) => ({
        ...o,
        customer_name: o.customers?.name ?? '',
        customer_phone: o.customer_phones?.[0]?.phone ?? '',
        services_summary: '',
      }))
    },
  })
}
```

- [ ] **Step 2: Write OrderCard**

```typescript
// src/components/orders/OrderCard.tsx
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { OrderListItem, OrderStatus, ConfirmationStatus } from '@/types/orders'

const STATUS_STYLES: Record<OrderStatus, string> = {
  tentative: 'bg-slate-100 text-slate-600',
  scheduled: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-green-100 text-green-700',
  'in-progress': 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-800 font-semibold',
  cancelled: 'bg-red-100 text-red-700',
  waitlist: 'bg-yellow-100 text-yellow-700',
  'pending-confirmation': 'bg-orange-100 text-orange-700',
  'pending-approval': 'bg-yellow-100 text-yellow-700',
}

const CONFIRMATION_LABELS: Record<ConfirmationStatus, string> = {
  not_sent: 'Not Sent',
  msg_sent: 'Msg Sent',
  customer_confirmed: 'Confirmed',
  agent_confirmed: 'Agent Confirmed',
  no_response: 'No Response',
  manually_confirmed: 'Manual Confirm',
}

interface Props {
  order: OrderListItem
  onClick: () => void
}

export function OrderCard({ order, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">{order.order_id}</span>
            <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', STATUS_STYLES[order.status as OrderStatus])}>
              {order.status}
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
              {CONFIRMATION_LABELS[order.confirmation_status as ConfirmationStatus]}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-slate-600">
            {order.customer_name} · {order.customer_phone}
          </p>
          {order.address && (
            <p className="text-xs text-slate-400 truncate mt-0.5">{order.address}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold text-slate-900">QAR {order.total_amount.toLocaleString()}</p>
          {order.scheduled_date && (
            <p className="text-xs text-slate-500">{format(new Date(order.scheduled_date), 'dd MMM yyyy')}</p>
          )}
        </div>
      </div>
    </button>
  )
}
```

- [ ] **Step 3: Write Order List page**

```typescript
// src/app/(dashboard)/orders/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Filter } from 'lucide-react'
import { OrderCard } from '@/components/orders/OrderCard'
import { useOrders } from '@/hooks/useOrders'
import type { OrdersFilter } from '@/types/orders'
import { cn } from '@/lib/utils'

const CHIPS = [
  { key: 'scheduled',         label: 'Scheduled' },
  { key: 'pending_approval',  label: 'Pending Approval' },
  { key: 'no_confirmation',   label: 'No Confirmation' },
  { key: 'no_address',        label: 'No Address' },
  { key: 'past_due_no_invoice', label: 'Past Due · No Invoice' },
]

export default function OrdersPage() {
  const router = useRouter()
  const [filter, setFilter] = useState<OrdersFilter>({})
  const [activeChip, setActiveChip] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

  const { data: orders = [], isLoading } = useOrders(filter)

  function handleChip(key: string) {
    const next = activeChip === key ? null : key
    setActiveChip(next)
    setFilter((f) => ({ ...f, statusChip: next ?? undefined }))
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
          <Button className="gap-2" onClick={() => router.push('/orders/create')}>
            <Plus className="h-4 w-4" /> New Order
          </Button>
        </div>

        {/* Chips */}
        <div className="mt-3 flex flex-wrap gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip.key}
              onClick={() => handleChip(chip.key)}
              className={cn(
                'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                activeChip === chip.key
                  ? 'border-orange-500 bg-orange-500 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              )}
            >
              {chip.label}
            </button>
          ))}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="ml-auto flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:border-slate-300"
          >
            <Filter className="h-3.5 w-3.5" /> Filter
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Input placeholder="Customer name" className="h-8 text-sm" onChange={(e) => setFilter((f) => ({ ...f, customerName: e.target.value || undefined }))} />
            <Input placeholder="Phone" className="h-8 text-sm" onChange={(e) => setFilter((f) => ({ ...f, customerPhone: e.target.value || undefined }))} />
            <Input placeholder="Order number" className="h-8 text-sm" onChange={(e) => setFilter((f) => ({ ...f, orderNumber: e.target.value || undefined }))} />
            <Input type="date" className="h-8 text-sm" onChange={(e) => setFilter((f) => ({ ...f, visitDateFrom: e.target.value || undefined }))} />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <p className="text-center text-sm text-slate-400 py-8">Loading orders…</p>
        ) : orders.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-8">No orders found</p>
        ) : (
          <div className="space-y-2 max-w-4xl mx-auto">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} onClick={() => setSelectedOrderId(order.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useOrders.ts src/components/orders/OrderCard.tsx src/app/(dashboard)/orders/page.tsx
git commit -m "$(cat <<'EOF'
feat(orders): add useOrders hook, OrderCard, and Order List page

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: useOrderDetail + useOrderActions

**Files:**
- Create: `src/hooks/useOrderDetail.ts`
- Create: `src/hooks/useOrderActions.ts`

- [ ] **Step 1: Write useOrderDetail**

```typescript
// src/hooks/useOrderDetail.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { OrderDetail } from '@/types/orders'

export function useOrderDetail(orderId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['order-detail', orderId],
    queryFn: async (): Promise<OrderDetail | null> => {
      if (!orderId) return null
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, order_id, customer_id, type, division, status, confirmation_status,
          scheduled_date, total_amount, agent_name, address, has_invoice, invoice_number, created_at,
          customers!inner(name),
          customer_phones!left(phone),
          order_services(id, service_id, name, qty, price, duration, path),
          order_team_assignments(id, team_id, services, scheduled_date, time_slot, duration, teams!inner(name)),
          order_log(id, action, user_name, details, created_at)
        `)
        .eq('id', orderId)
        .single()
      if (error) throw error
      return {
        ...data,
        customer_name: (data.customers as any).name,
        customer_phone: (data.customer_phones as any)?.[0]?.phone ?? '',
        services_summary: '',
        order_team_assignments: (data.order_team_assignments ?? []).map((a: any) => ({
          ...a,
          team_name: a.teams?.name ?? '',
        })),
        order_log: (data.order_log ?? []).sort(
          (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
      } as OrderDetail
    },
    enabled: !!orderId,
  })
}
```

- [ ] **Step 2: Write useOrderActions**

```typescript
// src/hooks/useOrderActions.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { OrderStatus } from '@/types/orders'

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  tentative:             ['scheduled', 'cancelled'],
  scheduled:             ['confirmed', 'cancelled', 'waitlist', 'pending-confirmation'],
  'pending-confirmation': ['confirmed', 'scheduled', 'cancelled'],
  confirmed:             ['in-progress', 'cancelled', 'scheduled'],
  'in-progress':         ['completed', 'cancelled'],
  completed:             [],
  cancelled:             [],
  waitlist:              ['scheduled', 'cancelled'],
  'pending-approval':    ['confirmed', 'cancelled'],
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function useOrderActions(orderId: string | null) {
  const supabase = createClient()
  const qc = useQueryClient()

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['orders'] })
    qc.invalidateQueries({ queryKey: ['order-detail', orderId] })
  }

  async function logAction(action: string, details: string) {
    await supabase.from('order_log').insert({ order_id: orderId, action, user_name: 'agent', details })
  }

  const confirmManually = useMutation({
    mutationFn: async () => {
      await supabase.from('orders').update({ status: 'confirmed', confirmation_status: 'manually_confirmed' }).eq('id', orderId)
      await logAction('manually_confirmed', 'Order confirmed manually by agent')
    },
    onSuccess: invalidate,
  })

  const rollback = useMutation({
    mutationFn: async () => {
      await supabase.from('orders').update({ status: 'scheduled', confirmation_status: 'not_sent' }).eq('id', orderId)
      await logAction('rollback', 'Confirmation rolled back to scheduled')
    },
    onSuccess: invalidate,
  })

  const cancel = useMutation({
    mutationFn: async ({ reason, notes }: { reason: string; notes?: string }) => {
      await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId)
      await logAction('cancelled', `Reason: ${reason}${notes ? ` | Notes: ${notes}` : ''}`)
    },
    onSuccess: invalidate,
  })

  return { confirmManually, rollback, cancel, canTransition }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useOrderDetail.ts src/hooks/useOrderActions.ts
git commit -m "$(cat <<'EOF'
feat(orders): add useOrderDetail and useOrderActions hooks

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: OrderDetailDialog + OrderCancelDialog

**Files:**
- Create: `src/components/orders/OrderCancelDialog.tsx`
- Create: `src/components/orders/OrderDetailDialog.tsx`

- [ ] **Step 1: Write OrderCancelDialog**

```typescript
// src/components/orders/OrderCancelDialog.tsx
'use client'
import { useState } from 'react'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useReasonLists } from '@/hooks/useReasonLists'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  orderId: string
  orderDisplayId: string
  customerName: string
  onConfirm: (reason: string, notes: string) => void
  isLoading?: boolean
}

export function OrderCancelDialog({ open, onOpenChange, orderId, orderDisplayId, customerName, onConfirm, isLoading }: Props) {
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const { reasons } = useReasonLists('cancellation')

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-red-600">Cancel Order</AlertDialogTitle>
        </AlertDialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-slate-600">
            <strong>{orderDisplayId}</strong> — {customerName}
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Cancellation Reason *</label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue placeholder="Select reason…" /></SelectTrigger>
              <SelectContent>
                {(reasons ?? []).map((r: any) => (
                  <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes</label>
            <Textarea placeholder="Optional notes…" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Keep Order</Button>
          <Button variant="destructive" disabled={!reason || isLoading} onClick={() => onConfirm(reason, notes)}>
            {isLoading ? 'Cancelling…' : 'Confirm Cancellation'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

- [ ] **Step 2: Write OrderDetailDialog**

```typescript
// src/components/orders/OrderDetailDialog.tsx
'use client'
import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { CheckCircle, RotateCcw, Edit, XCircle } from 'lucide-react'
import { useOrderDetail } from '@/hooks/useOrderDetail'
import { useOrderActions, canTransition } from '@/hooks/useOrderActions'
import { OrderCancelDialog } from './OrderCancelDialog'
import { toast } from 'sonner'
import type { OrderStatus, ConfirmationStatus } from '@/types/orders'
import { cn } from '@/lib/utils'

const BANNER_STYLES: Record<ConfirmationStatus, string> = {
  not_sent: 'border-slate-200 bg-slate-50',
  msg_sent: 'border-blue-200 bg-blue-50',
  customer_confirmed: 'border-green-200 bg-green-50',
  agent_confirmed: 'border-green-200 bg-green-50',
  manually_confirmed: 'border-green-200 bg-green-50',
  no_response: 'border-red-200 bg-red-50',
}

interface Props {
  orderId: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function OrderDetailDialog({ orderId, open, onOpenChange }: Props) {
  const [cancelOpen, setCancelOpen] = useState(false)
  const { data: order, isLoading } = useOrderDetail(orderId)
  const { confirmManually, rollback, cancel } = useOrderActions(orderId)

  if (!open) return null

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
          {isLoading || !order ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Loading…</div>
          ) : (
            <>
              <SheetHeader className="border-b px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-900">{order.order_id}</span>
                  <Badge className={cn('text-xs', order.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800')}>{order.status}</Badge>
                </div>
                <p className="text-sm text-slate-500">{order.customer_name} · {order.customer_phone}</p>

                {/* Confirmation banner */}
                <div className={cn('rounded-md border p-2 mt-2', BANNER_STYLES[order.confirmation_status as ConfirmationStatus])}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs text-slate-600">
                      {order.confirmation_status === 'not_sent' && '48hr auto-confirmation via WhatsApp before visit'}
                      {order.confirmation_status === 'msg_sent' && 'Message sent — awaiting customer reply'}
                      {(order.confirmation_status === 'customer_confirmed' || order.confirmation_status === 'manually_confirmed') && 'Order confirmed ✓'}
                      {order.confirmation_status === 'no_response' && 'No response received'}
                    </p>
                    <div className="flex gap-1">
                      {order.status === 'scheduled' && (
                        <Button size="sm" className="h-7 gap-1 text-xs" onClick={async () => { await confirmManually.mutateAsync(); toast.success('Confirmed') }}>
                          <CheckCircle className="h-3 w-3" /> Confirm
                        </Button>
                      )}
                      {(order.confirmation_status === 'manually_confirmed' || order.confirmation_status === 'customer_confirmed') && (
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={async () => { await rollback.mutateAsync(); toast.success('Rolled back') }}>
                          <RotateCcw className="h-3 w-3" /> Rollback
                        </Button>
                      )}
                      {canTransition(order.status as OrderStatus, 'cancelled') && (
                        <Button size="sm" variant="destructive" className="h-7 gap-1 text-xs" onClick={() => setCancelOpen(true)}>
                          <XCircle className="h-3 w-3" /> Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <Tabs defaultValue="services" className="flex flex-1 flex-col overflow-hidden">
                <TabsList className="mx-4 mt-3 w-auto justify-start rounded-none border-b bg-transparent p-0">
                  {['services', 'invoice', 'followup', 'logs'].map((tab) => (
                    <TabsTrigger key={tab} value={tab} className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 capitalize px-3 py-1.5 text-sm">
                      {tab === 'followup' ? 'Follow-up' : tab}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <div className="flex-1 overflow-y-auto px-4 py-3">
                  <TabsContent value="services" className="mt-0 space-y-2">
                    {order.order_team_assignments.map((a) => (
                      <div key={a.id} className="rounded-lg border p-3">
                        <p className="font-medium text-sm">{a.team_name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{a.scheduled_date} · {a.time_slot} · {a.duration}min</p>
                      </div>
                    ))}
                    <div className="grid grid-cols-3 gap-2 rounded-md bg-slate-50 p-3 text-center text-sm mt-3">
                      <div><p className="font-bold">{order.order_services.length}</p><p className="text-xs text-slate-500">Services</p></div>
                      <div><p className="font-bold">{order.order_team_assignments.length}</p><p className="text-xs text-slate-500">Teams</p></div>
                      <div><p className="font-bold">QAR {order.total_amount.toLocaleString()}</p><p className="text-xs text-slate-500">Total</p></div>
                    </div>
                  </TabsContent>

                  <TabsContent value="invoice" className="mt-0">
                    {order.has_invoice
                      ? <p className="text-sm">Invoice: {order.invoice_number}</p>
                      : <p className="text-sm text-slate-400">No invoice generated yet</p>
                    }
                  </TabsContent>

                  <TabsContent value="followup" className="mt-0 space-y-2">
                    <Button variant="outline" size="sm" className="w-full" onClick={() => window.open(`/orders/create-follow-up?from=${orderId}`, '_blank')}>+ Follow-up</Button>
                    <Button variant="outline" size="sm" className="w-full border-red-200 text-red-600 hover:bg-red-50" onClick={() => window.open(`/orders/create-backwork?from=${orderId}`, '_blank')}>+ Backwork</Button>
                  </TabsContent>

                  <TabsContent value="logs" className="mt-0">
                    <div className="space-y-3">
                      {order.order_log.map((log, i) => (
                        <div key={log.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="h-2 w-2 rounded-full bg-slate-300 mt-1" />
                            {i < order.order_log.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                          </div>
                          <div className="pb-3">
                            <p className="text-sm font-medium">{log.action} <span className="font-normal text-slate-500">by {log.user_name}</span></p>
                            {log.details && <p className="text-xs text-slate-500">{log.details}</p>}
                            <p className="text-xs text-slate-400">{format(new Date(log.created_at), 'MMM d, yyyy HH:mm')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {order && (
        <OrderCancelDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          orderId={orderId!}
          orderDisplayId={order.order_id}
          customerName={order.customer_name}
          isLoading={cancel.isPending}
          onConfirm={async (reason, notes) => {
            await cancel.mutateAsync({ reason, notes })
            toast.success('Order cancelled')
            setCancelOpen(false)
            onOpenChange(false)
          }}
        />
      )}
    </>
  )
}
```

- [ ] **Step 3: Wire detail dialog into order list page**

In `src/app/(dashboard)/orders/page.tsx`, add the `OrderDetailDialog`:

```typescript
// Add import at top:
import { OrderDetailDialog } from '@/components/orders/OrderDetailDialog'

// Add inside the component, after the orders list:
<OrderDetailDialog
  orderId={selectedOrderId}
  open={!!selectedOrderId}
  onOpenChange={(v) => !v && setSelectedOrderId(null)}
/>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/orders/OrderDetailDialog.tsx src/components/orders/OrderCancelDialog.tsx src/app/(dashboard)/orders/page.tsx
git commit -m "$(cat <<'EOF'
feat(orders): add OrderDetailDialog, OrderCancelDialog, wire into list page

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Navigation Update

**Files:**
- Modify: `src/components/layout/TopNav.tsx`

- [ ] **Step 1: Find the Orders nav item in TopNav**

Open `src/components/layout/TopNav.tsx`. Find the "Orders" dropdown section. Add "Work Orders" and "Create Order" items above the existing items.

The existing Orders submenu likely contains "Purchase Orders" and "Sale Orders". Add before them:

```typescript
// In the Orders dropdown menu items array, add at the top:
{ label: 'Work Orders', href: '/orders' },
{ label: 'Create Order', href: '/orders/create' },
// --- separator ---
// existing: Purchase Orders, Sale Orders
```

The exact edit depends on how the nav is structured. Find the pattern used for other menu items and follow it exactly. Confirm the items render with the correct hrefs.

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/TopNav.tsx
git commit -m "$(cat <<'EOF'
feat(orders): add Work Orders and Create Order nav items

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: PROGRESS.md Update

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Update PROGRESS.md**

Add completed entry and update in-progress:

```markdown
## ✅ Completed
- [2026-05-09] **Orders Module Task 18: Full Orders Module** — `supabase/migrations/20260509120000_*`, `20260509120001_*`, `src/types/orders.ts`, `src/lib/orders/warrantyUtils.ts`, `src/hooks/useCustomerLookup.ts`, `useCustomerAddresses.ts`, `useBlueplate.ts`, `useCreateOrder.ts`, `useCustomerHistory.ts`, `useOrders.ts`, `useOrderDetail.ts`, `useOrderActions.ts`, `src/components/orders/*.tsx` (12 components), `src/app/(dashboard)/orders/page.tsx`, `src/app/(dashboard)/orders/create/page.tsx` — Full field-service Orders module: customer lookup with phone-primary model, multi-address with Blue Plate/GPS, three-panel create order UI (form + team calendar + history panel), order list with filter chips, order detail dialog with 4 tabs and audit log
```

- [ ] **Step 2: Commit**

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — Orders Module complete

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage check:**

| Spec Section | Covered By |
|---|---|
| Data model: customer_phones | Task 1 |
| Data model: customer_addresses | Task 1 |
| Data model: installed_products | Task 2 |
| TypeScript types | Task 3 |
| Warranty + address utils | Task 4 |
| Phone lookup + quick-create | Tasks 5, 7 |
| Blue Plate API | Task 6 |
| Address picker + creation sheet | Task 8 |
| useCreateOrder draft state | Task 9 |
| Service selector (N-level) | Task 10 |
| Draggable service cards | Task 10 |
| Team calendar panel (dnd-kit) | Task 11 |
| Allocate quantity dialog | Task 11 |
| Customer history panel | Task 12 |
| 4-per-page order/product cards | Task 12 |
| Month filter | Task 12 |
| Create order page (3-panel) | Task 13 |
| DndContext wiring | Task 13 |
| useOrders with filter chips | Task 14 |
| Order list page | Task 14 |
| useOrderDetail + useOrderActions | Task 15 |
| State machine transitions | Task 15 |
| Order detail dialog (4 tabs) | Task 16 |
| Confirmation banner + actions | Task 16 |
| Cancel dialog with reasons | Task 16 |
| Navigation integration | Task 17 |
| PROGRESS.md | Task 18 |

**Gaps addressed:** None found. All spec sections have a corresponding task.

**Type consistency:** `OrderDraft`, `OrderServiceDraft`, `TeamAssignmentDraft`, `CustomerLookupResult` all defined in Task 3 and used consistently in Tasks 5, 9, 10, 11, 13. `canTransition` defined in Task 15 and used in Task 16. `getWarrantyInfo` defined in Task 4, used in Task 12.
