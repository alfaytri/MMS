# Payment Methods + TL Invoice Payment Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a DB-managed `payment_methods` master table with an admin UI, then revise the TL invoice dialog to use fixed-amount discounts, load methods from DB, mark Cash invoices as paid instantly, and send a Dibsy payment link + Wati notification for all other methods.

**Architecture:** Approach A — dedicated `tl_invoices` table separate from the AR/AP `invoices` table. New `payment_methods` table seeded with 7 methods. New API route `POST /api/payments/dibsy/create-tl-invoice` handles Dibsy link creation + Wati send. Existing Dibsy webhook extended to handle `tl_invoice_id` in metadata.

**Tech Stack:** Next.js 15.5.15 App Router, Supabase (Postgres + RLS), Tailwind CSS, shadcn/ui, Sonner toasts, Wati WhatsApp API, Dibsy payment gateway.

**RLS note:** Every admin-managed master-data table in this codebase (`brand_groups`, `custom_roles`, `reason_lists`, etc.) uses `FOR ALL TO authenticated USING (true)` — access is enforced at the application layer, not RLS. `payment_methods` and `tl_invoices` follow the same pattern. Do NOT introduce an admin-only RLS check here; it would diverge from the existing convention and the reviewer's proposed `custom_roles @> '["admin"]'` syntax refers to a column that does not exist on `profiles`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260523210000_payment_methods.sql` | Create | `payment_methods` table + seed data + RLS |
| `supabase/migrations/20260523220000_tl_invoices.sql` | Create | `tl_invoices` table + sequence + trigger + RLS |
| `src/components/master-data/AdminSidebar.tsx` | Modify | Add "Payment Methods" sidebar entry |
| `src/components/master-data/PaymentMethodsAdmin.tsx` | Create | List + toggle + add form for payment methods |
| `src/app/(dashboard)/master-data/admin/payment-methods/page.tsx` | Create | Page wrapper for PaymentMethodsAdmin |
| `src/types/team-leader.ts` | Modify | Add `addedServices` to `OrderCompletionData` |
| `src/components/team-leader/dialogs/NormalOrderDialog.tsx` | Modify | Pass `addedServices` in `onComplete` data |
| `src/components/team-leader/TlInvoiceDialog.tsx` | Modify | Fixed-amount discount, DB-loaded payment methods, conditional submit |
| `src/app/api/payments/dibsy/create-tl-invoice/route.ts` | Create | Create Dibsy link + update tl_invoices + send Wati |
| `src/app/api/payments/dibsy/webhook/route.ts` | Modify | Handle `tl_invoice_id` in webhook metadata |
| `src/app/pay/[invoiceId]/page.tsx` | Create | Public customer-facing redirect to Dibsy checkout |
| `src/middleware.ts` | Modify | Exclude `/pay/` from team-leader redirect |
| `PROGRESS.md` | Modify | Task tracking |

---

## Task 1: Migration — `payment_methods` table

**Files:**
- Create: `supabase/migrations/20260523210000_payment_methods.sql`

- [ ] **Step 1: Update PROGRESS.md — starting**

Open `PROGRESS.md`. In `## 🔄 In Progress` add:
```
🚀 Starting: **Payment Methods + TL Invoices Task 1: payment_methods migration**
```

Commit:
```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — starting payment_methods migration

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Create the migration file**

Create `supabase/migrations/20260523210000_payment_methods.sql`:

```sql
-- supabase/migrations/20260523210000_payment_methods.sql
-- Creates the payment_methods master-data table used across all payment dialogs.

CREATE TABLE IF NOT EXISTS payment_methods (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text        NOT NULL,
  slug       text        NOT NULL UNIQUE,
  is_active  boolean     NOT NULL DEFAULT true,
  sort_order integer     NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read payment_methods"
  ON payment_methods FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert payment_methods"
  ON payment_methods FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update payment_methods"
  ON payment_methods FOR UPDATE TO authenticated USING (true);

-- Seed with default methods
INSERT INTO payment_methods (name, slug, sort_order) VALUES
  ('Cash',            'cash',            1),
  ('Online Payment',  'online_payment',  2),
  ('Bank Transfer',   'bank_transfer',   3),
  ('PDC',             'pdc',             4),
  ('CDC',             'cdc',             5),
  ('POS',             'pos',             6),
  ('Pay Later',       'pay_later',       7)
ON CONFLICT (slug) DO NOTHING;
```

- [ ] **Step 3: Apply the migration**

```bash
npx supabase db push
```

Expected output: `Remote database is up to date` or a line showing the migration applied. If it says "linked project not found", run `npx supabase link --project-ref wkmvjxxmzstsvahuiwsz` first, then re-run.

- [ ] **Step 4: Verify in Supabase**

```bash
npx supabase db diff
```

Expected output: no diff (migration applied). Optionally open Supabase Dashboard → Table Editor → confirm `payment_methods` exists with 7 rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260523210000_payment_methods.sql
git commit -m "$(cat <<'EOF'
feat(db): add payment_methods table with 7 seeded methods

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Migration — `tl_invoices` table

**Files:**
- Create: `supabase/migrations/20260523220000_tl_invoices.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260523220000_tl_invoices.sql`:

```sql
-- supabase/migrations/20260523220000_tl_invoices.sql
-- Creates tl_invoices: team-leader field invoices, separate from the AR/AP invoices table.

-- ── Sequence for invoice numbers ──────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS tl_invoice_seq START 1;

-- ── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tl_invoices (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number     text        NOT NULL,
  visit_id           uuid        NOT NULL REFERENCES visits(id),
  order_id           text,
  customer_name      text        NOT NULL,
  customer_phone     text,
  items              jsonb       NOT NULL DEFAULT '[]',
  subtotal           numeric     NOT NULL DEFAULT 0,
  discount_amount    numeric     NOT NULL DEFAULT 0,
  total_amount       numeric     NOT NULL DEFAULT 0,
  payment_method_id  uuid        REFERENCES payment_methods(id),
  payment_status     text        NOT NULL DEFAULT 'unpaid'
                     CHECK (payment_status IN ('unpaid', 'paid')),
  dibsy_payment_id   text,
  dibsy_checkout_url text,
  notes              text,
  created_by         uuid        REFERENCES profiles(id),
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

-- ── Auto-generate invoice_number before insert ────────────────────────────────
CREATE OR REPLACE FUNCTION generate_tl_invoice_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.invoice_number := 'TL-' ||
    EXTRACT(YEAR FROM now())::text || '-' ||
    LPAD(nextval('tl_invoice_seq')::text, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER tl_invoice_number_trigger
  BEFORE INSERT ON tl_invoices
  FOR EACH ROW EXECUTE FUNCTION generate_tl_invoice_number();

-- ── updated_at trigger (reuse existing set_updated_at function) ───────────────
CREATE TRIGGER tl_invoices_set_updated_at
  BEFORE UPDATE ON tl_invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE tl_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read tl_invoices"
  ON tl_invoices FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert tl_invoices"
  ON tl_invoices FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update tl_invoices"
  ON tl_invoices FOR UPDATE TO authenticated USING (true);
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected: migration applied without errors. If `set_updated_at` function doesn't exist, check with:
```bash
npx supabase db diff
```
and if you see an error about `set_updated_at`, replace the second trigger block with an inline version:
```sql
CREATE OR REPLACE FUNCTION set_tl_invoices_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER tl_invoices_set_updated_at
  BEFORE UPDATE ON tl_invoices
  FOR EACH ROW EXECUTE FUNCTION set_tl_invoices_updated_at();
```

- [ ] **Step 3: Verify**

Open Supabase Dashboard → Table Editor → confirm `tl_invoices` table exists with all columns, and that the trigger is listed under the table.

- [ ] **Step 4: Update PROGRESS.md and commit**

Update `PROGRESS.md`:
- `## ✅ Completed`: add `- [2026-05-23] **Payment Methods + TL Invoices Task 1: payment_methods migration** — supabase/migrations/20260523210000_payment_methods.sql — payment_methods table + 7 seeded methods`
- `## 🔄 In Progress`: change to `🚀 Starting: **Task 2: tl_invoices migration**`

```bash
git add supabase/migrations/20260523220000_tl_invoices.sql PROGRESS.md
git commit -m "$(cat <<'EOF'
feat(db): add tl_invoices table with sequence and triggers

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Admin Sidebar + Payment Methods Page

**Files:**
- Modify: `src/components/master-data/AdminSidebar.tsx`
- Create: `src/components/master-data/PaymentMethodsAdmin.tsx`
- Create: `src/app/(dashboard)/master-data/admin/payment-methods/page.tsx`

- [ ] **Step 1: Update PROGRESS.md**

In `## 🔄 In Progress`, update to: `🚀 Starting: **Task 3: Admin Payment Methods page**`

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — starting Admin Payment Methods page

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Add sidebar entry**

In `src/components/master-data/AdminSidebar.tsx`, find the Operations section:

```ts
  {
    label: 'Operations',
    items: [
      { label: 'Reason Lists', href: '/master-data/admin/reason-lists', icon: List },
      { label: 'Approval Settings', href: '/master-data/admin/approval-settings', icon: CheckSquare },
```

Add the Payment Methods entry between Reason Lists and Approval Settings:

```ts
  {
    label: 'Operations',
    items: [
      { label: 'Reason Lists', href: '/master-data/admin/reason-lists', icon: List },
      { label: 'Payment Methods', href: '/master-data/admin/payment-methods', icon: CreditCard },
      { label: 'Approval Settings', href: '/master-data/admin/approval-settings', icon: CheckSquare },
```

`CreditCard` is already imported at the top of the file — no new import needed.

- [ ] **Step 3: Create `PaymentMethodsAdmin.tsx`**

Create `src/components/master-data/PaymentMethodsAdmin.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

type PaymentMethod = {
  id: string
  name: string
  slug: string
  is_active: boolean
  sort_order: number
}

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

export function PaymentMethodsAdmin() {
  const supabase = createClient()
  const qc = useQueryClient()

  const [newName, setNewName] = useState('')
  const newSlug = slugify(newName)

  const { data: methods = [], isLoading } = useQuery<PaymentMethod[]>({
    queryKey: ['payment_methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('id, name, slug, is_active, sort_order')
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('payment_methods')
        .update({ is_active })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, is_active }) => {
      await qc.cancelQueries({ queryKey: ['payment_methods'] })
      const prev = qc.getQueryData<PaymentMethod[]>(['payment_methods'])
      qc.setQueryData<PaymentMethod[]>(['payment_methods'], (old = []) =>
        old.map((m) => (m.id === id ? { ...m, is_active } : m))
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['payment_methods'], ctx.prev)
      toast.error('Failed to update payment method')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment_methods'] })
    },
  })

  const addMutation = useMutation({
    mutationFn: async ({ name, slug }: { name: string; slug: string }) => {
      const maxOrder = methods.reduce((m, r) => Math.max(m, r.sort_order), 0)
      const { error } = await supabase
        .from('payment_methods')
        .insert({ name, slug, sort_order: maxOrder + 1 })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment_methods'] })
      setNewName('')
      toast.success('Payment method added')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to add payment method')
    },
  })

  function handleAdd() {
    const trimmed = newName.trim()
    if (!trimmed) return
    if (methods.some((m) => m.slug === newSlug)) {
      toast.error(`A method with slug "${newSlug}" already exists`)
      return
    }
    addMutation.mutate({ name: trimmed, slug: newSlug })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-lg">
      {/* List */}
      <div className="rounded-lg border divide-y">
        {methods.map((m) => (
          <div
            key={m.id}
            className={cn(
              'flex items-center justify-between px-4 py-3',
              !m.is_active && 'opacity-40'
            )}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">{m.name}</span>
              <Badge variant="outline" className="text-[10px] font-mono">{m.slug}</Badge>
            </div>
            <Switch
              checked={m.is_active}
              onCheckedChange={(checked) =>
                toggleMutation.mutate({ id: m.id, is_active: checked })
              }
            />
          </div>
        ))}
        {methods.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">
            No payment methods yet.
          </p>
        )}
      </div>

      {/* Add form */}
      <div className="rounded-lg border p-4 space-y-3">
        <p className="text-sm font-semibold">Add Payment Method</p>
        <div className="space-y-1.5">
          <Label htmlFor="pm-name">Name</Label>
          <Input
            id="pm-name"
            placeholder="e.g. Cheque"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
          />
          {newName && (
            <p className="text-xs text-muted-foreground">
              Slug: <span className="font-mono">{newSlug}</span>
            </p>
          )}
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={handleAdd}
          disabled={!newName.trim() || addMutation.isPending}
        >
          {addMutation.isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Plus className="h-3.5 w-3.5" />}
          Add Method
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create the page**

Create `src/app/(dashboard)/master-data/admin/payment-methods/page.tsx`:

```tsx
import { PageWrapper } from '@/components/shared/PageWrapper'
import { PaymentMethodsAdmin } from '@/components/master-data/PaymentMethodsAdmin'

export const metadata = { title: 'Payment Methods' }

export default function PaymentMethodsPage() {
  return (
    <PageWrapper title="Payment Methods">
      <PaymentMethodsAdmin />
    </PageWrapper>
  )
}
```

- [ ] **Step 5: Verify in browser**

Start the dev server (`npm run dev`). Navigate to `/master-data/admin/payment-methods`. Confirm:
1. "Payment Methods" appears in the sidebar under Operations.
2. The page loads with the 7 seeded methods listed.
3. Toggling a method off dims it and the change persists on page refresh.
4. Typing a name in the Add form shows the auto-slug. Submitting adds a row.

- [ ] **Step 6: Update PROGRESS.md and commit**

Update `PROGRESS.md`:
- `## ✅ Completed`: add `- [2026-05-23] **Task 2: tl_invoices migration** — supabase/migrations/20260523220000_tl_invoices.sql — tl_invoices table with sequence, triggers, RLS`
- `## 🔄 In Progress`: `🚀 Starting: **Task 3: Admin Payment Methods page**` → mark done, next: Task 4

```bash
git add src/components/master-data/AdminSidebar.tsx \
        src/components/master-data/PaymentMethodsAdmin.tsx \
        "src/app/(dashboard)/master-data/admin/payment-methods/page.tsx" \
        PROGRESS.md
git commit -m "$(cat <<'EOF'
feat(admin): add Payment Methods admin page with toggle and add form

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Revised TlInvoiceDialog

**Files:**
- Modify: `src/types/team-leader.ts`
- Modify: `src/components/team-leader/dialogs/NormalOrderDialog.tsx`
- Modify: `src/components/team-leader/TlInvoiceDialog.tsx`

- [ ] **Step 1: Update PROGRESS.md**

In `## 🔄 In Progress`, update to: `🚀 Starting: **Task 4: Revised TlInvoiceDialog**`

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — starting TlInvoiceDialog revision

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Add `addedServices` to `OrderCompletionData`**

In `src/types/team-leader.ts`, find the `OrderCompletionData` interface and add the optional field:

```ts
export interface OrderCompletionData {
  orderId: string
  visitId: string
  visitType: VisitType
  serviceStatuses: Record<string, 'done' | 'skipped' | 'issue'>
  inventoryUsage: Record<string, InventoryUsageRecord[]>
  photos: Blob[]
  damageReport: { noted: boolean; description?: string; photos?: Blob[] }
  signature?: Blob
  qcScores?: Record<string, number>
  addedServices?: AddedBillableService[]   // ← add this line
}
```

- [ ] **Step 3: Pass `addedServices` from `NormalOrderDialog`**

In `src/components/team-leader/dialogs/NormalOrderDialog.tsx`, find `handleSubmit` and add `addedServices` to the `data` object:

```ts
  function handleSubmit() {
    const data: OrderCompletionData = {
      orderId: visit.source_id,
      visitId: visit.id,
      visitType: visit.type,
      serviceStatuses: statuses,
      inventoryUsage: {},
      photos,
      damageReport: { noted: damages.length > 0, description: damages.map((d) => d.description).join('\n') },
      addedServices,   // ← add this line
    }
    onComplete(visit.id, data)
  }
```

- [ ] **Step 4: Replace TlInvoiceDialog.tsx**

Replace the entire file `src/components/team-leader/TlInvoiceDialog.tsx` with:

```tsx
// src/components/team-leader/TlInvoiceDialog.tsx
'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SignaturePad } from './shared/SignaturePad'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { TlVisit, OrderCompletionData, AddedBillableService } from '@/types/team-leader'

type PaymentMethod = {
  id: string
  name: string
  slug: string
  sort_order: number
}

interface Props {
  visit: TlVisit
  data: OrderCompletionData
  profileId: string
  onDone: (visitId: string) => void
  onClose: () => void
}

export function TlInvoiceDialog({ visit, data, profileId, onDone, onClose }: Props) {
  const addedServices = data.addedServices ?? []
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [paymentMethodId, setPaymentMethodId] = useState<string>('')
  const [discountAmount, setDiscountAmount]   = useState(0)
  const [notes, setNotes]                     = useState('')
  const [signature, setSignature]             = useState<Blob | null>(data.signature ?? null)
  const [submitting, setSubmitting]           = useState(false)

  const supabase = createClient()

  // Load active payment methods on mount
  useEffect(() => {
    supabase
      .from('payment_methods')
      .select('id, name, slug, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .then(({ data: methods, error }) => {
        if (error) { console.error('[TlInvoiceDialog] load payment methods', error); return }
        setPaymentMethods(methods ?? [])
        if (methods && methods.length > 0) setPaymentMethodId(methods[0].id)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedMethod = paymentMethods.find((m) => m.id === paymentMethodId)
  const isCash = selectedMethod?.slug === 'cash'

  // Build allServices: original visit services + added billable services
  const allItems = [
    ...visit.services.map((s) => ({
      id: s.id,
      name: s.name,
      qty: s.qty,
      unit_price: s.unit_price,
      total: s.unit_price * s.qty,
    })),
    ...addedServices.map((s) => ({
      id: s.id,
      name: s.name,
      qty: s.qty,
      unit_price: s.unitPrice,
      total: s.unitPrice * s.qty,
    })),
  ]

  const subtotal    = allItems.reduce((sum, i) => sum + i.total, 0)
  const discount    = Math.min(Math.max(discountAmount, 0), subtotal)
  const totalAmount = subtotal - discount

  async function handleConfirm() {
    if (!signature)        { toast.error('Customer signature required'); return }
    if (!paymentMethodId)  { toast.error('Select a payment method'); return }

    setSubmitting(true)
    try {
      // 1. Optimistic-lock visit update
      const { data: updated, error: visitErr } = await (supabase as any)
        .from('visits')
        .update({ status: 'completed', completed_at: new Date().toISOString(), completed_by: profileId })
        .eq('id', visit.id)
        .not('status', 'in', '("completed","customer-unavailable")')
        .select('id')

      if (visitErr) throw visitErr
      if (!updated || updated.length === 0) {
        toast.error('This visit was already completed by another team')
        onDone(visit.id)
        return
      }

      // 2. Insert tl_invoice (invoice_number auto-generated by DB trigger)
      const { data: invoice, error: invErr } = await (supabase as any)
        .from('tl_invoices')
        .insert({
          visit_id:          visit.id,
          order_id:          visit.order_id ?? null,
          customer_name:     visit.customer_name,
          customer_phone:    visit.customer_phone ?? null,
          items:             allItems.map(({ id: _id, ...rest }) => rest),
          subtotal,
          discount_amount:   discount,
          total_amount:      totalAmount,
          payment_method_id: paymentMethodId,
          payment_status:    isCash ? 'paid' : 'unpaid',
          notes:             notes.trim() || null,
          created_by:        profileId,
        })
        .select('id, invoice_number')
        .single()

      if (invErr) throw invErr

      const invoiceId     = (invoice as { id: string; invoice_number: string }).id
      const invoiceNumber = (invoice as { id: string; invoice_number: string }).invoice_number

      // 3a. Cash — done immediately
      if (isCash) {
        toast.success(`${invoiceNumber} created — marked as paid`)
        onDone(visit.id)
        return
      }

      // 3b. Non-cash — create Dibsy link + send Wati
      const res = await fetch('/api/payments/dibsy/create-tl-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id:     invoiceId,
          amount:         totalAmount,
          order_id:       visit.order_id ?? invoiceNumber,
          customer_phone: visit.customer_phone ?? '',
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        toast.error(`Invoice created but payment link failed: ${err.error}`)
      } else {
        toast.success(`${invoiceNumber} created — payment link sent`)
      }

      onDone(visit.id)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-xl flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
          <DialogTitle>
            Create Invoice
            {visit.order_id && (
              <span className="ml-2 text-muted-foreground font-normal text-sm">— {visit.order_id}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-5 p-4">
            {/* Customer */}
            <div>
              <p className="font-semibold">{visit.customer_name}</p>
              <p className="text-sm text-muted-foreground">{visit.address}</p>
            </div>

            {/* Services breakdown */}
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-2 bg-muted text-xs font-semibold text-muted-foreground uppercase">
                Services Breakdown
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-1.5">Service</th>
                    <th className="text-center px-3 py-1.5">Qty</th>
                    <th className="text-right px-3 py-1.5">Unit</th>
                    <th className="text-right px-3 py-1.5">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {allItems.map((item, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2">{item.name}</td>
                      <td className="text-center px-3 py-2">{item.qty}</td>
                      <td className="text-right px-3 py-2">{item.unit_price.toFixed(2)}</td>
                      <td className="text-right px-3 py-2">{item.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="space-y-1 text-sm rounded-lg border p-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Grand Total</span>
                <span>{subtotal.toFixed(2)} QAR</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount</span>
                  <span>− {discount.toFixed(2)} QAR</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t pt-2 mt-1">
                <span>Amount Due</span>
                <span className="text-primary">{totalAmount.toFixed(2)} QAR</span>
              </div>
            </div>

            {/* Discount input */}
            <div className="space-y-1.5">
              <Label>Discount (QAR)</Label>
              <Input
                type="number"
                min={0}
                max={subtotal}
                step={0.01}
                value={discountAmount === 0 ? '' : discountAmount}
                placeholder="0"
                onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value) || 0))}
                className="h-11"
              />
            </div>

            {/* Payment method */}
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select payment method…" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Invoice Notes (Optional)</Label>
              <Textarea
                placeholder="Add any notes for the invoice…"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <SignaturePad visitId={`${visit.id}-invoice`} value={signature} onChange={setSignature} />
          </div>
        </ScrollArea>

        <div className="px-4 pb-4 pt-2 border-t shrink-0">
          <Button
            className="w-full min-h-11"
            onClick={handleConfirm}
            disabled={!signature || !paymentMethodId || submitting}
          >
            {submitting
              ? 'Processing…'
              : isCash
                ? 'Confirm & Mark Paid'
                : 'Confirm & Send Payment Link'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. The `addedServices` field is optional in `OrderCompletionData` so all other callers of `onComplete` (ContractVisitDialog, BackworkDialog, etc.) that don't set it will still compile cleanly; `TlInvoiceDialog` safely defaults to `[]`.

- [ ] **Step 6: Verify in browser**

Open the Team Leader view → complete a Normal Order visit → click "Complete & Invoice":
1. Discount input appears (numeric, not %).
2. Payment Methods dropdown shows the 7 methods from DB.
3. Totals update as discount is typed.
4. Selecting "Cash" changes button to "Confirm & Mark Paid".
5. Selecting any other method changes button to "Confirm & Send Payment Link".
6. Added services from the completion dialog appear in the invoice items list.

- [ ] **Step 7: Update PROGRESS.md and commit**

Update `PROGRESS.md`:
- `## ✅ Completed`: add `- [2026-05-23] **Task 3: Admin Payment Methods page** — AdminSidebar.tsx, PaymentMethodsAdmin.tsx, payment-methods/page.tsx — sidebar entry + list/toggle/add UI`
- `## 🔄 In Progress`: update to Task 4 done, Task 5 next

```bash
git add src/types/team-leader.ts \
        src/components/team-leader/dialogs/NormalOrderDialog.tsx \
        src/components/team-leader/TlInvoiceDialog.tsx \
        PROGRESS.md
git commit -m "$(cat <<'EOF'
feat(team-leader): revise TlInvoiceDialog — fixed discount, DB payment methods, Dibsy flow

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: API Route — `create-tl-invoice`

**Files:**
- Create: `src/app/api/payments/dibsy/create-tl-invoice/route.ts`

- [ ] **Step 1: Update PROGRESS.md**

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — starting create-tl-invoice API route

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Create the route**

Create `src/app/api/payments/dibsy/create-tl-invoice/route.ts`:

```ts
// src/app/api/payments/dibsy/create-tl-invoice/route.ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createDibsyPayment } from '@/lib/dibsy'

export async function POST(request: Request) {
  let body: {
    invoice_id: string
    amount: number
    order_id: string
    customer_phone: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { invoice_id, amount, order_id, customer_phone } = body

  if (!invoice_id || !amount || !order_id) {
    return NextResponse.json({ error: 'Missing required fields: invoice_id, amount, order_id' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://mms.alfaytri.com'
  const webhookUrl = `${appUrl}/api/payments/dibsy/webhook`
  const redirectUrl = `${appUrl}/pay/${invoice_id}`

  // 1. Create Dibsy payment link
  let payment
  try {
    payment = await createDibsyPayment({
      amount:      { value: amount.toFixed(2), currency: 'QAR' },
      description: `Invoice ${order_id}`,
      redirectUrl,
      webhookUrl,
      metadata:    { tl_invoice_id: invoice_id },
    })
  } catch (err) {
    console.error('[create-tl-invoice] Dibsy error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Dibsy API error' },
      { status: 502 }
    )
  }

  // 2. Store Dibsy info on the invoice (non-blocking on failure)
  const supabase = createAdminClient()
  const { error: dbErr } = await (supabase as any)
    .from('tl_invoices')
    .update({
      dibsy_payment_id:   payment.id,
      dibsy_checkout_url: payment.checkoutUrl,
    })
    .eq('id', invoice_id)

  if (dbErr) {
    console.error('[create-tl-invoice] DB update failed:', dbErr)
    // Don't block — Dibsy link is already created
  }

  // 3. Send Wati notification (non-blocking on failure)
  if (customer_phone) {
    const formattedAmount = `${amount.toFixed(2)} QAR`
    const watiBody = {
      phone:        customer_phone,
      text:         `شكراً لإستخدامكم خدمات الفيتري\n\nمرفق لكم فاتورة الخدمة للطلب رقم ${order_id}\n\nالمبلغ المستحق: ${formattedAmount}`,
      templateName: 'mms_invoice_remaining_payment2',
      parameters: [
        { name: 'bookingnumber',   value: order_id },
        { name: 'received_payment', value: '0.00' },
        { name: 'total_payment',    value: formattedAmount },
        { name: 'due_payment',      value: formattedAmount },
        { name: 'url',              value: `pay/${invoice_id}` },
      ],
      senderName: 'MMS System',
    }

    try {
      const watiRes = await fetch(`${appUrl}/api/wati/send-message`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(watiBody),
      })
      if (!watiRes.ok) {
        const txt = await watiRes.text()
        console.warn('[create-tl-invoice] Wati send failed:', txt)
      }
    } catch (err) {
      console.warn('[create-tl-invoice] Wati call threw:', err)
    }
  } else {
    console.warn('[create-tl-invoice] No customer_phone — Wati notification skipped for invoice', invoice_id)
  }

  return NextResponse.json({ ok: true, checkoutUrl: payment.checkoutUrl })
}
```

- [ ] **Step 3: Verify the route exists and compiles**

```bash
npx tsc --noEmit
```

Expected: no TypeScript errors in the new file. Fix any type errors before proceeding.

- [ ] **Step 4: Manual smoke test (optional)**

With the dev server running, use curl to test the route (replace `TEST_INVOICE_ID` with a real id from `tl_invoices`):

```bash
curl -X POST http://localhost:3000/api/payments/dibsy/create-tl-invoice \
  -H "Content-Type: application/json" \
  -d '{"invoice_id":"TEST_INVOICE_ID","amount":375.00,"order_id":"ORD-2026-0010","customer_phone":"+97455852848"}'
```

Expected: `{"ok":true,"checkoutUrl":"https://checkout.dibsy.one/..."}` or a 502 if Dibsy test credentials aren't configured.

- [ ] **Step 5: Update PROGRESS.md and commit**

Update `PROGRESS.md`:
- `## ✅ Completed`: add Task 4 entry
- `## 🔄 In Progress`: Task 5 → Task 6

```bash
git add src/app/api/payments/dibsy/create-tl-invoice/route.ts PROGRESS.md
git commit -m "$(cat <<'EOF'
feat(api): add create-tl-invoice route — Dibsy link + Wati notification

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Extend Dibsy Webhook

**Files:**
- Modify: `src/app/api/payments/dibsy/webhook/route.ts`

- [ ] **Step 1: Update PROGRESS.md**

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — starting Dibsy webhook extension

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Extend the webhook handler**

Open `src/app/api/payments/dibsy/webhook/route.ts`. The current handler at line 31 does:

```ts
  const subscriptionId = payment.metadata?.subscription_id
  if (!subscriptionId) {
    // Not a subscription payment — acknowledge and ignore
    return NextResponse.json({ ok: true })
  }
```

Replace that early-return block with logic that handles both subscriptions AND tl_invoices:

```ts
  const subscriptionId = payment.metadata?.subscription_id
  const tlInvoiceId    = payment.metadata?.tl_invoice_id

  // Handle tl_invoice payment
  if (tlInvoiceId) {
    if (payment.status === 'paid') {
      const supabase = createAdminClient()
      const { error } = await (supabase as any)
        .from('tl_invoices')
        .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', tlInvoiceId)

      if (error) {
        console.error('[dibsy/webhook] tl_invoices update failed', error)
        return NextResponse.json({ error: 'DB update failed' }, { status: 500 })
      }
      console.log(`[dibsy/webhook] tl_invoice ${tlInvoiceId} → paid (payment ${dibsyPaymentId})`)
    }
    return NextResponse.json({ ok: true })
  }

  if (!subscriptionId) {
    // Unknown payment type — acknowledge and ignore
    return NextResponse.json({ ok: true })
  }
```

The rest of the file (subscription handling) is unchanged.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Update PROGRESS.md and commit**

Update `PROGRESS.md`:
- `## ✅ Completed`: add Task 5 entry
- `## 🔄 In Progress`: Task 6 → Task 7

```bash
git add src/app/api/payments/dibsy/webhook/route.ts PROGRESS.md
git commit -m "$(cat <<'EOF'
feat(api): extend Dibsy webhook to mark tl_invoices as paid

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Public Payment Page + Middleware

**Files:**
- Create: `src/app/pay/[invoiceId]/page.tsx`
- Modify: `src/middleware.ts`

- [ ] **Step 1: Update PROGRESS.md**

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — starting public payment page

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Create the public payment page**

Create `src/app/pay/[invoiceId]/page.tsx`:

```tsx
// src/app/pay/[invoiceId]/page.tsx
// Public customer-facing page — no auth required.
// Redirects to Dibsy checkout if invoice is unpaid, otherwise shows status.
import { redirect, notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'

interface Props {
  params: Promise<{ invoiceId: string }>
}

export default async function PayPage({ params }: Props) {
  const { invoiceId } = await params

  const supabase = createAdminClient()
  const { data: invoice } = await (supabase as any)
    .from('tl_invoices')
    .select('id, invoice_number, order_id, payment_status, dibsy_checkout_url, total_amount')
    .eq('id', invoiceId)
    .maybeSingle()

  if (!invoice) {
    notFound()
  }

  if (invoice.payment_status === 'paid') {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="max-w-sm w-full rounded-xl border p-6 text-center space-y-3">
          <div className="text-4xl">✓</div>
          <h1 className="text-lg font-bold">Invoice Already Settled</h1>
          <p className="text-sm text-muted-foreground">
            Invoice <span className="font-mono font-medium">{invoice.invoice_number}</span>
            {invoice.order_id && ` for order ${invoice.order_id}`} has already been paid.
          </p>
        </div>
      </main>
    )
  }

  if (invoice.dibsy_checkout_url) {
    redirect(invoice.dibsy_checkout_url)
  }

  // Fallback: checkout URL not generated yet
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="max-w-sm w-full rounded-xl border p-6 text-center space-y-3">
        <h1 className="text-lg font-bold">Payment Link Not Ready</h1>
        <p className="text-sm text-muted-foreground">
          The payment link for invoice <span className="font-mono font-medium">{invoice.invoice_number}</span> is not ready yet.
          Please contact us for assistance.
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Update middleware to exclude `/pay/` from team-leader redirect**

In `src/middleware.ts`, find the team-leader redirect block:

```ts
  if (
    isTeamLeader &&
    !path.startsWith('/team-leader') &&
    !path.startsWith('/api/') &&
    !path.startsWith('/_next/')
  ) {
    return NextResponse.redirect(new URL('/team-leader', request.url))
  }
```

Add `/pay/` to the exclusion list:

```ts
  if (
    isTeamLeader &&
    !path.startsWith('/team-leader') &&
    !path.startsWith('/api/') &&
    !path.startsWith('/_next/') &&
    !path.startsWith('/pay/')
  ) {
    return NextResponse.redirect(new URL('/team-leader', request.url))
  }
```

- [ ] **Step 4: Verify the public page works**

With the dev server running:
1. Create a test tl_invoice manually in Supabase with a real `dibsy_checkout_url` (or a dummy one).
2. Navigate to `http://localhost:3000/pay/[that-invoice-id]`.
3. If `payment_status = 'unpaid'` and a checkout URL exists → browser redirects to Dibsy.
4. If `payment_status = 'paid'` → "Invoice Already Settled" screen renders.
5. If invoice ID doesn't exist → Next.js 404 page.

- [ ] **Step 5: Update PROGRESS.md and commit**

```bash
git add src/app/pay/[invoiceId]/page.tsx src/middleware.ts PROGRESS.md
git commit -m "$(cat <<'EOF'
feat: add public /pay/[invoiceId] page and exclude from TL redirect

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Final PROGRESS.md + Security Audit

- [ ] **Step 1: Run security checklist**

```bash
# 1. No secrets hardcoded
grep -r "sk_\|Bearer \|apiKey.*=.*['\"]" src/ --include="*.ts" --include="*.tsx"
# Expected: no matches (Dibsy key is in process.env.DIBSY_SECRET_KEY)

# 2. RLS — verify all new tables have policies
# Covered in migrations: both payment_methods and tl_invoices have ENABLE ROW LEVEL SECURITY + policies

# 3. Auth gate — /pay/[invoiceId] uses admin client internally (no user RLS bypass exposed)
# No new /api routes that bypass middleware (create-tl-invoice is called server-to-server from TlInvoiceDialog)

# 4. Error handling — create-tl-invoice returns 502 on Dibsy fail; Wati and DB update failures are logged but non-blocking
```

- [ ] **Step 2: Final PROGRESS.md update**

Update `PROGRESS.md`:
- `## ✅ Completed`: add entries for Tasks 6 and 7
- `## 🔄 In Progress`: clear (all done)
- `## 🔒 Security Audit Log`: add row:

```
| 2026-05-23 | Payment Methods + TL Invoices | ✅ Secrets | ✅ RLS | ✅ Auth gate | ✅ Error handling | Wati + DB update are best-effort (logged, non-blocking) |
```

- [ ] **Step 3: Commit**

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — Payment Methods + TL Invoices complete

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## End-to-End Test Checklist

Before marking this feature ready for review, manually verify the full flow:

- [ ] Navigate to Admin → Payment Methods: 7 methods visible, toggle works, add works
- [ ] Team Leader: complete a Normal Order visit → "Complete & Invoice" opens revised dialog
- [ ] Dialog: discount input is numeric (QAR), not %; payment method dropdown shows DB methods
- [ ] Select "Cash" → button says "Confirm & Mark Paid" → submit → `tl_invoices.payment_status = 'paid'`
- [ ] Select any non-Cash method → button says "Confirm & Send Payment Link" → submit → Dibsy link created → `tl_invoices.dibsy_checkout_url` is populated → Wati message queued
- [ ] Navigate to `/pay/[invoice-id]` → redirects to Dibsy checkout URL
- [ ] After Dibsy test payment fires webhook → `tl_invoices.payment_status` flips to `'paid'`
- [ ] Navigate to `/pay/[invoice-id]` again → "Invoice Already Settled" screen
