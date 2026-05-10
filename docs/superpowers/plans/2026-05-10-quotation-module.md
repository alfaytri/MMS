# Quotation Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full Quotation module — 3-panel create page with live PDF preview, Save Draft / Send via WhatsApp actions, and a View Quotations list page.

**Architecture:** Fork `OrderFormPanel` into `QuotationFormPanel` (strips team/calendar sections), replace the center `TeamCalendarPanel` with a new `QuotationPdfPreview` component, and extend `CustomerHistoryPanel` with a Quotations tab. WATI sending goes through a Next.js API route to keep the token server-side.

**Tech Stack:** Next.js (App Router), Supabase (Postgres + RLS), React Query, shadcn/ui, Tailwind CSS, WATI WhatsApp Business API.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `supabase/migrations/20260510230000_quotation_line_items.sql` | New table + RLS |
| Create | `src/types/quotations.ts` | All quotation-specific TypeScript types |
| Create | `src/hooks/useCreateQuotation.ts` | Draft state, ID generation, save/send mutations |
| Create | `src/hooks/useQuotations.ts` | List fetching with filters + count badges |
| Create | `src/hooks/useQuotationDetail.ts` | Single quotation + line items + logs |
| Create | `src/components/quotations/QuotationPdfPreview.tsx` | Live A4-style PDF preview component |
| Create | `src/components/quotations/QuotationFormPanel.tsx` | Left panel — customer + services + actions |
| Create | `src/components/quotations/QuotationListCard.tsx` | Card for the list view |
| Create | `src/components/quotations/QuotationDetailSheet.tsx` | Slide-over sheet with Preview + Logs tabs |
| Create | `src/app/(dashboard)/quotations/create/page.tsx` | 3-panel creation page |
| Create | `src/app/(dashboard)/quotations/page.tsx` | List page |
| Create | `src/app/api/wati/send-quotation/route.ts` | WATI check-window + send API route |
| Modify | `src/components/orders/CustomerHistoryPanel.tsx` | Add Quotations tab |
| Modify | `src/components/layout/nav-config.ts` | Add Quotations nav links |

---

## Task 1: DB Migration — quotation_line_items + sequence + save_quotation RPC

**Files:**
- Create: `supabase/migrations/20260510230000_quotation_line_items.sql`

> **Why an RPC?** Client-side ID generation (select-last + increment) has a race condition under concurrent use. A DB sequence is atomic. Wrapping save in an RPC makes quotation + line items one transaction — a dropped network call can't leave orphaned data.

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260510230000_quotation_line_items.sql

-- ── 1. Line items table ──────────────────────────────────────────────────────
CREATE TABLE quotation_line_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id  UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  service_id    UUID REFERENCES services(id),
  name          TEXT NOT NULL,
  path          TEXT[] NOT NULL DEFAULT '{}',
  qty           INT  NOT NULL DEFAULT 1,
  price         NUMERIC NOT NULL,
  duration      INT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_qli_quotation ON quotation_line_items(quotation_id);

ALTER TABLE quotation_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access" ON quotation_line_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 2. Atomic ID generation ───────────────────────────────────────────────────
-- Uses a DB sequence so concurrent sessions never produce the same number.
CREATE SEQUENCE IF NOT EXISTS quotation_number_seq;

CREATE OR REPLACE FUNCTION generate_quotation_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_num   INT  := nextval('quotation_number_seq');
  v_year  TEXT := to_char(NOW(), 'YYYY');
  v_month TEXT := to_char(NOW(), 'MM');
BEGIN
  RETURN 'Q/' || v_year || '/' || v_month || '/' || lpad(v_num::TEXT, 4, '0');
END;
$$;

-- ── 3. Transactional save RPC ────────────────────────────────────────────────
-- Upserts the quotation row and replaces all line items in one transaction.
-- Prevents orphaned line items if the client disconnects mid-save.
CREATE OR REPLACE FUNCTION save_quotation(
  p_quotation_id  TEXT,
  p_customer_id   UUID,
  p_division      TEXT,
  p_status        quotation_status,
  p_total_amount  NUMERIC,
  p_notes         TEXT,
  p_expiry_date   DATE,
  p_sent_date     TIMESTAMPTZ,
  p_line_items    JSONB   -- [{service_id, name, path, qty, price, duration}]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quot_id UUID;
BEGIN
  INSERT INTO quotations (
    quotation_id, customer_id, division, status,
    total_amount, notes, created_date, expiry_date, sent_date
  ) VALUES (
    p_quotation_id, p_customer_id, p_division, p_status,
    p_total_amount, NULLIF(p_notes, ''),
    CURRENT_DATE, p_expiry_date, p_sent_date
  )
  ON CONFLICT (quotation_id) DO UPDATE SET
    status       = EXCLUDED.status,
    total_amount = EXCLUDED.total_amount,
    notes        = EXCLUDED.notes,
    expiry_date  = EXCLUDED.expiry_date,
    sent_date    = EXCLUDED.sent_date
  RETURNING id INTO v_quot_id;

  -- Replace line items atomically inside the same transaction
  DELETE FROM quotation_line_items WHERE quotation_id = v_quot_id;

  INSERT INTO quotation_line_items (
    quotation_id, service_id, name, path, qty, price, duration
  )
  SELECT
    v_quot_id,
    NULLIF(item->>'service_id', '')::UUID,
    item->>'name',
    ARRAY(SELECT jsonb_array_elements_text(item->'path')),
    (item->>'qty')::INT,
    (item->>'price')::NUMERIC,
    NULLIF(item->>'duration', '')::INT
  FROM jsonb_array_elements(COALESCE(p_line_items, '[]'::jsonb)) AS item;

  RETURN v_quot_id;
END;
$$;
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected output: `Remote database is up to date` or migration applied successfully.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260510230000_quotation_line_items.sql
git commit -m "feat(db): quotation_line_items table, ID sequence, save_quotation RPC

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Types — src/types/quotations.ts

**Files:**
- Create: `src/types/quotations.ts`

- [ ] **Step 1: Create types file**

```typescript
// src/types/quotations.ts

export interface QuotationLineDraft {
  serviceId: string
  name: string
  path: string[]
  qty: number
  price: number       // from services.price — read-only
  duration: number | null
  division: string    // services.division slug
}

export interface QuotationDraft {
  quotationId: string
  customerId: string
  phoneId: string
  customerName: string
  phone: string
  division: string    // derived from first service's division
  services: QuotationLineDraft[]
  notes: string
}

export type QuotationStatus = 'draft' | 'sent'

export interface QuotationListItem {
  id: string
  quotation_id: string
  customer_name: string
  customer_phone: string
  division: string
  status: QuotationStatus
  total_amount: number
  created_date: string
}

export interface QuotationDetail {
  id: string
  quotation_id: string
  customer_id: string
  customer_name: string
  customer_phone: string
  division: string
  status: QuotationStatus
  total_amount: number
  notes: string | null
  created_date: string
  expiry_date: string | null
  sent_date: string | null
  line_items: QuotationLineItem[]
  logs: QuotationLog[]
}

export interface QuotationLineItem {
  id: string
  service_id: string | null
  name: string
  path: string[]
  qty: number
  price: number
  duration: number | null
}

export interface QuotationLog {
  id: string
  action: string
  user_name: string
  details: string | null
  created_at: string
}

export interface QuotationsFilter {
  division?: string
  statuses?: QuotationStatus[]
  dateFrom?: string
  dateTo?: string
  customerPhone?: string
  quotationNumber?: string
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/quotations.ts
git commit -m "feat(quotations): add TypeScript types

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: useCreateQuotation hook

**Files:**
- Create: `src/hooks/useCreateQuotation.ts`

Manages all draft state. ID generation uses the `generate_quotation_id()` DB function (atomic via sequence). Saving calls the `save_quotation` RPC so quotation + line items are committed in one transaction.

- [ ] **Step 1: Create hook**

```typescript
// src/hooks/useCreateQuotation.ts
'use client'
import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { QuotationDraft, QuotationLineDraft } from '@/types/quotations'
import type { CustomerLookupResult } from '@/hooks/useCustomerLookup'
import type { OrderServiceDraft } from '@/types/orders'

const INITIAL: QuotationDraft = {
  quotationId: '',
  customerId: '',
  phoneId: '',
  customerName: '',
  phone: '',
  division: '',
  services: [],
  notes: '',
}

export function computeTotal(services: QuotationLineDraft[]): number {
  return services.reduce((sum, s) => sum + s.price * s.qty, 0)
}

export function useCreateQuotation() {
  const [draft, setDraft] = useState<QuotationDraft>(INITIAL)
  const supabase = createClient()
  const qc = useQueryClient()

  // Generate Q/YYYY/MM/NNNN via DB sequence — race-condition-free
  useEffect(() => {
    ;(supabase as any)
      .rpc('generate_quotation_id')
      .then(({ data }: { data: string | null }) => {
        if (data) setDraft((d) => ({ ...d, quotationId: data }))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setCustomer(result: CustomerLookupResult) {
    setDraft((d) => ({
      ...d,
      customerId: result.customerId,
      phoneId: result.phoneId,
      customerName: result.customerName,
      phone: result.phone,
    }))
  }

  function addService(service: OrderServiceDraft) {
    const line: QuotationLineDraft = {
      serviceId: service.serviceId,
      name: service.serviceName,
      path: service.path,
      qty: service.qty,
      price: service.price,
      duration: service.duration ?? null,
      division: (service as any).division ?? '',
    }
    setDraft((d) => {
      const services = [...d.services, line]
      const division = d.division || line.division
      return { ...d, services, division }
    })
  }

  function removeService(serviceId: string) {
    setDraft((d) => {
      const services = d.services.filter((s) => s.serviceId !== serviceId)
      const division = services[0]?.division ?? ''
      return { ...d, services, division }
    })
  }

  function updateQty(serviceId: string, qty: number) {
    setDraft((d) => ({
      ...d,
      services: d.services.map((s) =>
        s.serviceId === serviceId ? { ...s, qty: Math.max(1, qty) } : s,
      ),
    }))
  }

  function update(partial: Partial<Pick<QuotationDraft, 'notes'>>) {
    setDraft((d) => ({ ...d, ...partial }))
  }

  function isValid(): boolean {
    return !!draft.customerId && draft.services.length > 0
  }

  // Single RPC call — quotation row + line items committed atomically
  async function saveToDb(status: 'draft' | 'sent'): Promise<string> {
    const total = computeTotal(draft.services)
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + 30)

    const { data: quotUuid, error } = await (supabase as any).rpc('save_quotation', {
      p_quotation_id: draft.quotationId,
      p_customer_id:  draft.customerId,
      p_division:     draft.division,
      p_status:       status,
      p_total_amount: total,
      p_notes:        draft.notes || '',
      p_expiry_date:  expiry.toISOString().split('T')[0],
      p_sent_date:    status === 'sent' ? new Date().toISOString() : null,
      p_line_items:   JSON.stringify(
        draft.services.map((s) => ({
          service_id: s.serviceId || null,
          name:       s.name,
          path:       s.path,
          qty:        s.qty,
          price:      s.price,
          duration:   s.duration ?? null,
        })),
      ),
    })
    if (error) throw error
    qc.invalidateQueries({ queryKey: ['quotations'] })
    return quotUuid as string
  }

  const saveDraft = useMutation({
    mutationFn: () => saveToDb('draft'),
  })

  const sendViaWhatsApp = useMutation({
    mutationFn: async () => {
      await saveToDb('sent')
      const total = computeTotal(draft.services)
      const expiryDate = new Date()
      expiryDate.setDate(expiryDate.getDate() + 30)
      const res = await fetch('/api/wati/send-quotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone:        draft.phone,
          customerName: draft.customerName,
          quotationId:  draft.quotationId,
          divisionName: draft.division,
          services: draft.services.map((s) => ({
            name:  s.name,
            qty:   s.qty,
            price: s.price,
          })),
          total,
          expiryDate: expiryDate.toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
          }),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to send')
      return json as { windowClosed?: boolean }
    },
  })

  return {
    draft,
    setCustomer,
    addService,
    removeService,
    updateQty,
    update,
    isValid,
    saveDraft,
    sendViaWhatsApp,
    total: computeTotal(draft.services),
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useCreateQuotation.ts
git commit -m "feat(quotations): useCreateQuotation hook — atomic ID + RPC save

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: QuotationPdfPreview component

**Files:**
- Create: `src/components/quotations/QuotationPdfPreview.tsx`

Renders a live A4-style white card inside the center panel. Fetches division details (logo, address, currency) from `divisions` table using the division slug in the draft.

- [ ] **Step 1: Create component**

```tsx
// src/components/quotations/QuotationPdfPreview.tsx
'use client'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import type { QuotationDraft } from '@/types/quotations'
import { computeTotal } from '@/hooks/useCreateQuotation'

interface DivisionRecord {
  id: string
  name: string
  name_ar: string | null
  address_en: string | null
  logo_url: string | null
  stamp_url: string | null
  default_currency: string | null
}

function useDivisionBySlug(slug: string | null) {
  const supabase = createClient()
  return useQuery<DivisionRecord | null>({
    queryKey: ['division-by-slug', slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('divisions')
        .select('id, name, name_ar, address_en, logo_url, stamp_url, default_currency')
        .eq('slug', slug)
        .single()
      if (error) return null
      return data as DivisionRecord
    },
  })
}

interface Props {
  draft: QuotationDraft
  total: number
}

export function QuotationPdfPreview({ draft, total }: Props) {
  const { data: division } = useDivisionBySlug(draft.division || null)
  const currency = division?.default_currency ?? 'QAR'
  const today = format(new Date(), 'dd MMM yyyy')

  const expiryDate = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return format(d, 'dd MMM yyyy')
  })()

  const isEmpty = !draft.customerId && draft.services.length === 0

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto bg-slate-100 p-6">
      <div
        className="w-full max-w-2xl rounded bg-white shadow-xl"
        style={{ minHeight: '297mm' }}
      >
        <div className="p-10 space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              {division?.logo_url ? (
                <img
                  src={division.logo_url}
                  alt={division.name}
                  className="h-12 w-auto object-contain"
                />
              ) : (
                <div className="text-lg font-bold text-slate-900">
                  {division?.name ?? '—'}
                </div>
              )}
              {division?.address_en && (
                <p className="text-xs text-slate-500">{division.address_en}</p>
              )}
            </div>
            <div className="text-right space-y-0.5">
              <p className="text-2xl font-bold tracking-tight text-slate-900 uppercase">
                Quotation
              </p>
              <p className="text-sm font-mono text-slate-700">
                {draft.quotationId || '—'}
              </p>
              <p className="text-xs text-slate-500">Date: {today}</p>
              <p className="text-xs text-slate-500">Valid Until: {expiryDate}</p>
            </div>
          </div>

          <div className="border-t border-slate-200" />

          {/* Bill To */}
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Bill To
            </p>
            {draft.customerName ? (
              <>
                <p className="text-sm font-semibold text-slate-900">
                  {draft.customerName}
                </p>
                <p className="text-sm text-slate-500">{draft.phone}</p>
              </>
            ) : (
              <p className="text-sm text-slate-300 italic">
                Customer will appear here after selection
              </p>
            )}
          </div>

          {/* Line Items Table */}
          <div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border border-slate-200">
                  <th className="text-left px-3 py-2 font-semibold text-slate-700">
                    Service
                  </th>
                  <th className="text-center px-3 py-2 font-semibold text-slate-700 w-16">
                    Qty
                  </th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-700 w-28">
                    Price
                  </th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-700 w-28">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {draft.services.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-8 text-center text-slate-300 italic border border-slate-100"
                    >
                      Add services from the left panel
                    </td>
                  </tr>
                ) : (
                  draft.services.map((s, i) => (
                    <tr
                      key={`${s.serviceId}-${i}`}
                      className="border border-slate-100 even:bg-slate-50/50"
                    >
                      <td className="px-3 py-2 text-slate-800">
                        <p className="font-medium">{s.name}</p>
                        {s.path.length > 1 && (
                          <p className="text-[11px] text-slate-400">
                            {s.path.slice(0, -1).join(' › ')}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-700">
                        {s.qty}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {currency} {s.price.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700 font-medium">
                        {currency} {(s.price * s.qty).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border border-slate-200 bg-slate-50">
                  <td
                    colSpan={3}
                    className="px-3 py-2 text-right font-bold text-slate-900 uppercase text-sm"
                  >
                    Total
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-slate-900">
                    {currency} {total.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Notes */}
          {draft.notes && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Notes
              </p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {draft.notes}
              </p>
            </div>
          )}

          <p className="text-xs text-slate-400 italic">
            Valid for 30 days from issue date.
          </p>

          {/* Footer */}
          <div className="flex items-end justify-between pt-8 border-t border-slate-100">
            {division?.stamp_url ? (
              <img
                src={division.stamp_url}
                alt="stamp"
                className="h-16 w-auto object-contain opacity-80"
              />
            ) : (
              <div />
            )}
            <p className="text-sm text-slate-400">Thank you for choosing us.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/quotations/QuotationPdfPreview.tsx
git commit -m "feat(quotations): QuotationPdfPreview — live A4 preview component

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: QuotationFormPanel

**Files:**
- Create: `src/components/quotations/QuotationFormPanel.tsx`

Left panel — forked from `OrderFormPanel` with team/calendar/mode/type/site-visit sections stripped. Keeps phone lookup modal, service tree browser (`ServiceSelector`), notes field, and the two action buttons.

- [ ] **Step 1: Read the existing OrderFormPanel to understand ServiceSelector usage**

Open `src/components/orders/OrderFormPanel.tsx`. Note:
- How `ServiceSelector` is imported and what props it takes (`onAdd`, `division` filter, etc.)
- How `SelectedServiceCard` is used to display + remove selected services
- The overall JSX structure for the left panel

- [ ] **Step 2: Create QuotationFormPanel**

```tsx
// src/components/quotations/QuotationFormPanel.tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { PhoneLookupModal } from '@/components/orders/PhoneLookupModal'
import { ServiceSelector } from '@/components/orders/ServiceSelector'
import { SelectedServiceCard } from '@/components/orders/SelectedServiceCard'
import { Send, Save, User } from 'lucide-react'
import type { QuotationDraft } from '@/types/quotations'
import type { CustomerLookupResult } from '@/hooks/useCustomerLookup'
import type { OrderServiceDraft } from '@/types/orders'

interface Props {
  draft: QuotationDraft
  onCustomerSelect: (result: CustomerLookupResult) => void
  onAddService: (service: OrderServiceDraft) => void
  onRemoveService: (serviceId: string) => void
  onUpdateQty: (serviceId: string, qty: number) => void
  onNotesChange: (notes: string) => void
  onSaveDraft: () => void
  onSendWhatsApp: () => void
  isSaving: boolean
  isSending: boolean
  isValid: boolean
  whatsAppWindowClosed: boolean
}

export function QuotationFormPanel({
  draft,
  onCustomerSelect,
  onAddService,
  onRemoveService,
  onUpdateQty,
  onNotesChange,
  onSaveDraft,
  onSendWhatsApp,
  isSaving,
  isSending,
  isValid,
  whatsAppWindowClosed,
}: Props) {
  const [lookupOpen, setLookupOpen] = useState(!draft.customerId)

  const hasCustomer = !!draft.customerId

  return (
    <>
      <PhoneLookupModal
        open={lookupOpen}
        onOpenChange={setLookupOpen}
        onConfirm={(result) => {
          onCustomerSelect(result)
          setLookupOpen(false)
        }}
      />

      <div className="flex h-full w-full flex-col border-r bg-white sm:w-[340px] shrink-0">
        {/* Customer */}
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              {hasCustomer ? (
                <>
                  <p className="font-semibold text-slate-900 text-sm">
                    {draft.customerName}
                  </p>
                  <p className="text-xs text-slate-500">{draft.phone}</p>
                </>
              ) : (
                <p className="text-sm text-slate-400 italic">
                  No customer selected
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-8"
              onClick={() => setLookupOpen(true)}
            >
              <User className="h-3 w-3" />
              {hasCustomer ? 'Change' : 'Select Customer'}
            </Button>
          </div>
        </div>

        {/* Service tree browser */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Services
            </Label>
            <ServiceSelector onAdd={onAddService} />
          </div>

          {/* Selected services */}
          {draft.services.length > 0 && (
            <div className="space-y-2">
              {draft.services.map((s, i) => (
                <SelectedServiceCard
                  key={`${s.serviceId}-${i}`}
                  service={{
                    serviceId: s.serviceId,
                    serviceName: s.name,
                    path: s.path,
                    qty: s.qty,
                    price: s.price,
                    duration: s.duration ?? 0,
                    fromTime: null,
                    toTime: null,
                  }}
                  onRemove={() => onRemoveService(s.serviceId)}
                  onQtyChange={(qty) => onUpdateQty(s.serviceId, qty)}
                  onTimeChange={() => {}}
                  hideTimeControls
                />
              ))}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Notes
            </Label>
            <Textarea
              placeholder="Optional notes for the customer…"
              className="resize-none text-sm min-h-[80px]"
              value={draft.notes}
              onChange={(e) => onNotesChange(e.target.value)}
            />
          </div>
        </div>

        {/* WATI window closed warning */}
        {whatsAppWindowClosed && (
          <div className="mx-4 mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            WATI window is closed for this customer. Ask them to send a message
            first, then retry.
          </div>
        )}

        {/* Actions */}
        <div className="border-t px-4 py-3 space-y-2">
          <Button
            className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white min-h-11"
            onClick={onSendWhatsApp}
            disabled={!isValid || isSending || isSaving}
          >
            <Send className="h-4 w-4" />
            {isSending ? 'Sending…' : 'Send via WhatsApp'}
          </Button>
          <Button
            variant="outline"
            className="w-full gap-2 min-h-11"
            onClick={onSaveDraft}
            disabled={!isValid || isSaving || isSending}
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving…' : 'Save Draft'}
          </Button>
        </div>
      </div>
    </>
  )
}
```

> **Note:** If `ServiceSelector` is not directly importable from `@/components/orders/ServiceSelector`, open `OrderFormPanel.tsx` and find the exact import path and props. Use `hideTimeControls` prop on `SelectedServiceCard` if the prop exists; otherwise just don't pass `onTimeChange`-dependent UI — the card will render without time controls since there's no assignment in quotations.

- [ ] **Step 3: Commit**

```bash
git add src/components/quotations/QuotationFormPanel.tsx
git commit -m "feat(quotations): QuotationFormPanel — left panel with service selection

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: WATI API Route

**Files:**
- Create: `src/app/api/wati/send-quotation/route.ts`

Server-side route — checks WATI 24-hr window then sends or returns `{ windowClosed: true }`. Keeps `WATI_API_TOKEN` server-side.

- [ ] **Step 1: Create route handler**

```typescript
// src/app/api/wati/send-quotation/route.ts
import { NextRequest, NextResponse } from 'next/server'

interface SendQuotationBody {
  phone: string
  customerName: string
  quotationId: string
  divisionName: string
  services: Array<{ name: string; qty: number; price: number }>
  total: number
  expiryDate: string
}

function buildMessage(body: SendQuotationBody): string {
  const serviceLines = body.services
    .map((s) => `• ${s.name} x${s.qty} — QAR ${(s.price * s.qty).toLocaleString()}`)
    .join('\n')

  return [
    `Hello ${body.customerName},`,
    '',
    'Please find your quotation below:',
    '',
    `Quotation No: ${body.quotationId}`,
    `Valid Until: ${body.expiryDate}`,
    '',
    'Services:',
    serviceLines,
    '',
    `Total: QAR ${body.total.toLocaleString()}`,
    '',
    `Thank you for choosing ${body.divisionName}.`,
  ].join('\n')
}

export async function POST(req: NextRequest) {
  const WATI_URL = process.env.WATI_API_URL
  const WATI_TOKEN = process.env.WATI_API_TOKEN

  if (!WATI_URL || !WATI_TOKEN) {
    return NextResponse.json(
      { error: 'WATI credentials not configured' },
      { status: 500 },
    )
  }

  const body: SendQuotationBody = await req.json()

  // Normalize phone — WATI expects digits only, no + prefix
  const phone = body.phone.replace(/\D/g, '')

  // 1. Check conversation window
  const contactRes = await fetch(
    `${WATI_URL}/api/v1/getContacts?pageSize=1&pageNumber=1&name=${phone}`,
    { headers: { Authorization: `Bearer ${WATI_TOKEN}` } },
  )

  if (!contactRes.ok) {
    return NextResponse.json(
      { error: 'Failed to reach WATI API' },
      { status: 502 },
    )
  }

  const contactData = await contactRes.json()
  const contact = contactData?.contact_list?.[0]

  const windowOpen = (() => {
    if (!contact?.lastReceivedMessageDate) return false
    const last = new Date(contact.lastReceivedMessageDate)
    const diff = Date.now() - last.getTime()
    return diff < 24 * 60 * 60 * 1000 // within 24 hours
  })()

  if (!windowOpen) {
    return NextResponse.json({ windowClosed: true })
  }

  // 2. Send session message
  const message = buildMessage(body)
  const sendRes = await fetch(
    `${WATI_URL}/api/v1/sendSessionMessage/${phone}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WATI_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messageText: message }),
    },
  )

  if (!sendRes.ok) {
    const err = await sendRes.text()
    return NextResponse.json(
      { error: `WATI send failed: ${err}` },
      { status: 502 },
    )
  }

  return NextResponse.json({ sent: true })
}
```

- [ ] **Step 2: Add env vars to .env.local (if not present)**

```bash
# Add to .env.local — do NOT commit this file
WATI_API_URL=https://live-mt-server.wati.io/YOUR_ACCOUNT_ID
WATI_API_TOKEN=your_wati_bearer_token_here
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/wati/send-quotation/route.ts
git commit -m "feat(quotations): WATI send-quotation API route

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Quotations create page

**Files:**
- Create: `src/app/(dashboard)/quotations/create/page.tsx`

Wires the 3-panel layout: `QuotationFormPanel` (left) + `QuotationPdfPreview` (center) + `CustomerHistoryPanel` (right, existing). Handles WATI window-closed state.

- [ ] **Step 1: Create page**

```tsx
// src/app/(dashboard)/quotations/create/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { QuotationFormPanel } from '@/components/quotations/QuotationFormPanel'
import { QuotationPdfPreview } from '@/components/quotations/QuotationPdfPreview'
import { CustomerHistoryPanel } from '@/components/orders/CustomerHistoryPanel'
import { useCreateQuotation } from '@/hooks/useCreateQuotation'

export default function CreateQuotationPage() {
  const router = useRouter()
  const [windowClosed, setWindowClosed] = useState(false)

  const {
    draft,
    setCustomer,
    addService,
    removeService,
    updateQty,
    update,
    isValid,
    saveDraft,
    sendViaWhatsApp,
    total,
  } = useCreateQuotation()

  async function handleSaveDraft() {
    try {
      await saveDraft.mutateAsync()
      toast.success('Quotation saved as draft')
      router.push('/quotations')
    } catch {
      toast.error('Failed to save quotation')
    }
  }

  async function handleSendWhatsApp() {
    setWindowClosed(false)
    try {
      const result = await sendViaWhatsApp.mutateAsync()
      if (result?.windowClosed) {
        setWindowClosed(true)
        return
      }
      toast.success('Quotation sent via WhatsApp')
      router.push('/quotations')
    } catch {
      toast.error('Failed to send quotation')
    }
  }

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden sm:flex-row">
      <QuotationFormPanel
        draft={draft}
        onCustomerSelect={setCustomer}
        onAddService={addService}
        onRemoveService={removeService}
        onUpdateQty={updateQty}
        onNotesChange={(notes) => update({ notes })}
        onSaveDraft={handleSaveDraft}
        onSendWhatsApp={handleSendWhatsApp}
        isSaving={saveDraft.isPending}
        isSending={sendViaWhatsApp.isPending}
        isValid={isValid()}
        whatsAppWindowClosed={windowClosed}
      />

      <div className="flex-1 overflow-hidden">
        <QuotationPdfPreview draft={draft} total={total} />
      </div>

      <CustomerHistoryPanel
        customerId={draft.customerId || null}
        onViewOrder={(id) => window.open(`/orders/${id}`, '_blank')}
        onCreateBackwork={(id) => window.open(`/orders/create-backwork?from=${id}`, '_blank')}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(dashboard)/quotations/create/page.tsx"
git commit -m "feat(quotations): create quotation page — 3-panel layout

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: useQuotations + useQuotationDetail hooks

**Files:**
- Create: `src/hooks/useQuotations.ts`
- Create: `src/hooks/useQuotationDetail.ts`

- [ ] **Step 1: Create useQuotations**

```typescript
// src/hooks/useQuotations.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { QuotationListItem, QuotationsFilter } from '@/types/quotations'

export interface QuotationCounts {
  all: number
  draft: number
  sent: number
}

export function useQuotations(filter: QuotationsFilter = {}) {
  const supabase = createClient()

  return useQuery<QuotationListItem[]>({
    queryKey: ['quotations', filter],
    queryFn: async () => {
      let q = (supabase as any)
        .from('quotations')
        .select(`
          id, quotation_id, division, status, total_amount, created_date,
          customers(name, customer_phones(phone))
        `)
        .order('created_at', { ascending: false })

      if (filter.statuses?.length) q = q.in('status', filter.statuses)
      if (filter.division)         q = q.eq('division', filter.division)
      if (filter.dateFrom)         q = q.gte('created_date', filter.dateFrom)
      if (filter.dateTo)           q = q.lte('created_date', filter.dateTo)
      if (filter.quotationNumber)  q = q.ilike('quotation_id', `%${filter.quotationNumber}%`)

      const { data, error } = await q
      if (error) throw error

      return (data ?? []).map((r: any) => ({
        id: r.id,
        quotation_id: r.quotation_id,
        customer_name: r.customers?.name ?? '—',
        customer_phone: r.customers?.customer_phones?.[0]?.phone ?? '—',
        division: r.division ?? '—',
        status: r.status,
        total_amount: r.total_amount ?? 0,
        created_date: r.created_date ?? '',
      })) as QuotationListItem[]
    },
  })
}

export function useQuotationCounts() {
  const supabase = createClient()

  return useQuery<QuotationCounts>({
    queryKey: ['quotation-counts'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('quotations')
        .select('status')
      if (error) throw error
      const rows: Array<{ status: string }> = data ?? []
      return {
        all:   rows.length,
        draft: rows.filter((r) => r.status === 'draft').length,
        sent:  rows.filter((r) => r.status === 'sent').length,
      }
    },
  })
}
```

- [ ] **Step 2: Create useQuotationDetail**

```typescript
// src/hooks/useQuotationDetail.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { QuotationDetail } from '@/types/quotations'

export function useQuotationDetail(quotationId: string | null) {
  const supabase = createClient()

  return useQuery<QuotationDetail>({
    queryKey: ['quotation-detail', quotationId],
    enabled: !!quotationId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('quotations')
        .select(`
          id, quotation_id, customer_id, division, status,
          total_amount, notes, created_date, expiry_date, sent_date,
          customers(name, customer_phones(phone)),
          quotation_line_items(id, service_id, name, path, qty, price, duration),
          quotation_log(id, action, created_at, details,
            users:user_id(full_name))
        `)
        .eq('id', quotationId)
        .single()
      if (error) throw error

      return {
        id: data.id,
        quotation_id: data.quotation_id,
        customer_id: data.customer_id,
        customer_name: data.customers?.name ?? '—',
        customer_phone: data.customers?.customer_phones?.[0]?.phone ?? '—',
        division: data.division ?? '',
        status: data.status,
        total_amount: data.total_amount ?? 0,
        notes: data.notes ?? null,
        created_date: data.created_date ?? '',
        expiry_date: data.expiry_date ?? null,
        sent_date: data.sent_date ?? null,
        line_items: (data.quotation_line_items ?? []).map((li: any) => ({
          id: li.id,
          service_id: li.service_id,
          name: li.name,
          path: li.path ?? [],
          qty: li.qty,
          price: li.price,
          duration: li.duration ?? null,
        })),
        logs: (data.quotation_log ?? []).map((l: any) => ({
          id: l.id,
          action: l.action,
          user_name: l.users?.full_name ?? 'System',
          details: l.details ?? null,
          created_at: l.created_at,
        })),
      } as QuotationDetail
    },
  })
}
```

> **Note:** If `quotation_log` table or columns differ from the query above, check the `supabase/migrations` files for the exact column names and adjust the select accordingly.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useQuotations.ts src/hooks/useQuotationDetail.ts
git commit -m "feat(quotations): useQuotations and useQuotationDetail hooks

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: QuotationListCard + QuotationDetailSheet

**Files:**
- Create: `src/components/quotations/QuotationListCard.tsx`
- Create: `src/components/quotations/QuotationDetailSheet.tsx`

- [ ] **Step 1: Create QuotationListCard**

```tsx
// src/components/quotations/QuotationListCard.tsx
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { QuotationListItem } from '@/types/quotations'

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  sent:  'bg-blue-100 text-blue-700 border-blue-200',
}

interface Props {
  quotation: QuotationListItem
  onClick: () => void
}

export function QuotationListCard({ quotation, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="w-full min-h-11 rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-orange-300 hover:bg-orange-50 space-y-2"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono font-semibold text-slate-900 text-sm">
          {quotation.quotation_id}
        </span>
        <span className="rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[11px] font-semibold text-orange-700">
          {quotation.division}
        </span>
        <span
          className={cn(
            'rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase',
            STATUS_STYLES[quotation.status] ?? 'bg-slate-100 text-slate-600 border-slate-200',
          )}
        >
          {quotation.status}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
        <span className="font-medium">{quotation.customer_name}</span>
        <span className="text-slate-400">{quotation.customer_phone}</span>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>QAR {quotation.total_amount.toLocaleString()}</span>
        {quotation.created_date && (
          <span>{format(new Date(quotation.created_date), 'dd MMM yyyy')}</span>
        )}
      </div>
    </button>
  )
}
```

- [ ] **Step 2: Create QuotationDetailSheet**

```tsx
// src/components/quotations/QuotationDetailSheet.tsx
'use client'
import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { useQuotationDetail } from '@/hooks/useQuotationDetail'
import { QuotationPdfPreview } from './QuotationPdfPreview'
import { cn } from '@/lib/utils'
import type { QuotationDraft } from '@/types/quotations'

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent:  'bg-blue-100 text-blue-800',
}

interface Props {
  quotationId: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function QuotationDetailSheet({ quotationId, open, onOpenChange }: Props) {
  const { data: q, isLoading } = useQuotationDetail(quotationId)

  // Build a read-only QuotationDraft for the preview
  const previewDraft: QuotationDraft | null = q
    ? {
        quotationId: q.quotation_id,
        customerId: q.customer_id,
        phoneId: '',
        customerName: q.customer_name,
        phone: q.customer_phone,
        division: q.division,
        services: q.line_items.map((li) => ({
          serviceId: li.service_id ?? '',
          name: li.name,
          path: li.path,
          qty: li.qty,
          price: li.price,
          duration: li.duration,
          division: q.division,
        })),
        notes: q.notes ?? '',
      }
    : null

  const previewTotal = q?.line_items.reduce(
    (sum, li) => sum + li.price * li.qty,
    0,
  ) ?? 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
        {isLoading || !q ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            Loading…
          </div>
        ) : (
          <>
            <SheetHeader className="border-b px-4 py-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-900 font-mono">
                  {q.quotation_id}
                </span>
                <Badge
                  className={cn(
                    'text-xs capitalize',
                    STATUS_STYLES[q.status] ?? 'bg-slate-100 text-slate-600',
                  )}
                >
                  {q.status}
                </Badge>
              </div>
              <p className="text-sm text-slate-500">
                {q.customer_name} · {q.customer_phone}
              </p>
            </SheetHeader>

            <Tabs defaultValue="preview" className="flex flex-1 flex-col overflow-hidden">
              <TabsList className="mx-4 mt-3 w-auto justify-start rounded-none border-b bg-transparent p-0">
                {(['preview', 'logs'] as const).map((tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 capitalize px-3 py-1.5 text-sm"
                  >
                    {tab === 'preview' ? 'Preview' : 'Logs'}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="flex-1 overflow-y-auto">
                <TabsContent value="preview" className="mt-0 h-full">
                  {previewDraft && (
                    <QuotationPdfPreview
                      draft={previewDraft}
                      total={previewTotal}
                    />
                  )}
                </TabsContent>

                <TabsContent value="logs" className="mt-0 px-4 py-3">
                  {q.logs.length === 0 ? (
                    <p className="text-sm text-slate-400">No log entries yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {q.logs.map((log, i) => (
                        <div key={log.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="h-2 w-2 rounded-full bg-slate-300 mt-1" />
                            {i < q.logs.length - 1 && (
                              <div className="w-px flex-1 bg-slate-200 mt-1" />
                            )}
                          </div>
                          <div className="pb-3">
                            <p className="text-sm font-medium">
                              {log.action}{' '}
                              <span className="font-normal text-slate-500">
                                by {log.user_name}
                              </span>
                            </p>
                            {log.details && (
                              <p className="text-xs text-slate-500">{log.details}</p>
                            )}
                            <p className="text-xs text-slate-400">
                              {format(new Date(log.created_at), 'MMM d, yyyy HH:mm')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/quotations/QuotationListCard.tsx src/components/quotations/QuotationDetailSheet.tsx
git commit -m "feat(quotations): QuotationListCard and QuotationDetailSheet

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Quotations list page

**Files:**
- Create: `src/app/(dashboard)/quotations/page.tsx`

- [ ] **Step 1: Create list page**

```tsx
// src/app/(dashboard)/quotations/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Search, X, ChevronDown, ChevronUp } from 'lucide-react'
import { QuotationListCard } from '@/components/quotations/QuotationListCard'
import { QuotationDetailSheet } from '@/components/quotations/QuotationDetailSheet'
import { useQuotations, useQuotationCounts } from '@/hooks/useQuotations'
import { cn } from '@/lib/utils'
import type { QuotationsFilter, QuotationStatus } from '@/types/quotations'

const ALL_STATUSES: { value: QuotationStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent',  label: 'Sent'  },
]

interface SearchState {
  statuses: QuotationStatus[]
  dateFrom: string
  dateTo: string
  customerPhone: string
  quotationNumber: string
}

const EMPTY: SearchState = {
  statuses: [],
  dateFrom: '',
  dateTo: '',
  customerPhone: '',
  quotationNumber: '',
}

function toFilter(s: SearchState): QuotationsFilter {
  return {
    ...(s.statuses.length     && { statuses: s.statuses }),
    ...(s.dateFrom            && { dateFrom: s.dateFrom }),
    ...(s.dateTo              && { dateTo: s.dateTo }),
    ...(s.customerPhone       && { customerPhone: s.customerPhone }),
    ...(s.quotationNumber     && { quotationNumber: s.quotationNumber }),
  }
}

export default function QuotationsPage() {
  const router = useRouter()
  const [filter, setFilter] = useState<QuotationsFilter>({})
  const [search, setSearch] = useState<SearchState>(EMPTY)
  const [searchOpen, setSearchOpen] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: quotations = [], isLoading } = useQuotations(filter)
  const { data: counts } = useQuotationCounts()

  function toggleStatus(val: QuotationStatus) {
    setSearch((s) => ({
      ...s,
      statuses: s.statuses.includes(val)
        ? s.statuses.filter((v) => v !== val)
        : [...s.statuses, val],
    }))
  }

  const BADGES = [
    { label: 'All Quotations', count: counts?.all,   onClick: () => { setSearch(EMPTY); setFilter({}) } },
    { label: 'Drafts',         count: counts?.draft, onClick: () => { const s = { ...EMPTY, statuses: ['draft' as QuotationStatus] }; setSearch(s); setFilter(toFilter(s)) } },
    { label: 'Sent',           count: counts?.sent,  onClick: () => { const s = { ...EMPTY, statuses: ['sent' as QuotationStatus] };  setSearch(s); setFilter(toFilter(s)) } },
  ]

  return (
    <div className="flex h-full flex-col">

      {/* Top bar */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-2xl font-bold text-slate-900">Quotations</h1>
        <Button className="gap-2" onClick={() => router.push('/quotations/create')}>
          <Plus className="h-4 w-4" /> New Quotation
        </Button>
      </div>

      {/* Search panel */}
      <div className="border-b bg-slate-50">
        <button
          onClick={() => setSearchOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-6 py-3 text-sm font-semibold text-slate-700 hover:text-slate-900"
        >
          <Search className="h-4 w-4 text-slate-400" />
          <span>Search</span>
          {searchOpen
            ? <ChevronUp className="ml-auto h-4 w-4 text-slate-400" />
            : <ChevronDown className="ml-auto h-4 w-4 text-slate-400" />}
        </button>

        {searchOpen && (
          <div className="px-6 pb-5 space-y-4">

            {/* Count badges */}
            <div className="flex flex-wrap gap-2">
              {BADGES.map((b) => (
                <button
                  key={b.label}
                  onClick={b.onClick}
                  className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-orange-400 hover:text-orange-600"
                >
                  {b.label}
                  {b.count !== undefined && (
                    <span className="rounded bg-orange-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                      {b.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Status chips */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Status
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_STATUSES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleStatus(s.value)}
                    className={cn(
                      'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      search.statuses.includes(s.value)
                        ? 'border-orange-500 bg-orange-500 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                    )}
                  >
                    {s.label}
                    {search.statuses.includes(s.value) && <X className="h-3 w-3" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Date + text filters */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  From Date
                </Label>
                <Input
                  type="date"
                  className="h-9 text-sm cursor-pointer"
                  value={search.dateFrom}
                  onClick={(e) => { try { (e.target as HTMLInputElement).showPicker() } catch {} }}
                  onChange={(e) => setSearch((s) => ({ ...s, dateFrom: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  To Date
                </Label>
                <Input
                  type="date"
                  className="h-9 text-sm cursor-pointer"
                  value={search.dateTo}
                  onClick={(e) => { try { (e.target as HTMLInputElement).showPicker() } catch {} }}
                  onChange={(e) => setSearch((s) => ({ ...s, dateTo: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Customer Phone
                </Label>
                <Input
                  placeholder="Search phone…"
                  className="h-9 text-sm"
                  value={search.customerPhone}
                  onChange={(e) => setSearch((s) => ({ ...s, customerPhone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Quotation No
                </Label>
                <Input
                  placeholder="Q/2026/05/…"
                  className="h-9 text-sm"
                  value={search.quotationNumber}
                  onChange={(e) => setSearch((s) => ({ ...s, quotationNumber: e.target.value }))}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-9"
                onClick={() => { setSearch(EMPTY); setFilter({}) }}
              >
                <X className="h-3.5 w-3.5" /> Clear Search
              </Button>
              <Button
                size="sm"
                className="gap-1.5 h-9"
                onClick={() => setFilter(toFilter(search))}
              >
                <Search className="h-3.5 w-3.5" /> Search
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <p className="py-12 text-center text-sm text-slate-400">Loading…</p>
        ) : quotations.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            No quotations found
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {quotations.map((q) => (
              <QuotationListCard
                key={q.id}
                quotation={q}
                onClick={() => setSelectedId(q.id)}
              />
            ))}
          </div>
        )}
      </div>

      <QuotationDetailSheet
        quotationId={selectedId}
        open={!!selectedId}
        onOpenChange={(v) => { if (!v) setSelectedId(null) }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(dashboard)/quotations/page.tsx"
git commit -m "feat(quotations): quotations list page

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 11: CustomerHistoryPanel — add Quotations tab

**Files:**
- Modify: `src/components/orders/CustomerHistoryPanel.tsx`

Add a "Quotations" section that shows the customer's past quotations. Read the existing file first to understand the current structure, then add the quotations list after the orders section.

- [ ] **Step 1: Read the current CustomerHistoryPanel**

Open `src/components/orders/CustomerHistoryPanel.tsx`. Note the existing section structure and how `customerId` is used to fetch data.

- [ ] **Step 2: Add useCustomerQuotations hook inline**

At the top of `CustomerHistoryPanel.tsx` (or in a new import), add a hook to fetch the customer's quotations:

```typescript
// Add this import at top of CustomerHistoryPanel.tsx
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// Add this hook inside the file (before the component)
function useCustomerQuotations(customerId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['customer-quotations', customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('quotations')
        .select('id, quotation_id, status, total_amount, created_date, division')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return data ?? []
    },
  })
}
```

- [ ] **Step 3: Add Quotations section to the panel JSX**

Find the section where orders are listed and add a quotations section after it. Use the same collapsible/card pattern:

```tsx
{/* Add after the existing orders section */}
<div className="border-t">
  <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
    Quotations
  </p>
  {customerQuotations?.map((q: any) => (
    <div
      key={q.id}
      className="flex items-center justify-between px-4 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0"
    >
      <div>
        <p className="text-xs font-mono font-semibold text-slate-700">
          {q.quotation_id}
        </p>
        <p className="text-[11px] text-slate-400 capitalize">{q.status}</p>
      </div>
      <p className="text-xs font-medium text-slate-700">
        QAR {(q.total_amount ?? 0).toLocaleString()}
      </p>
    </div>
  ))}
  {(!customerQuotations || customerQuotations.length === 0) && (
    <p className="px-4 py-2 text-xs text-slate-400">No quotations yet</p>
  )}
</div>
```

> Integrate `const { data: customerQuotations } = useCustomerQuotations(customerId)` into the component body.

- [ ] **Step 4: Commit**

```bash
git add src/components/orders/CustomerHistoryPanel.tsx
git commit -m "feat(quotations): add quotations tab to CustomerHistoryPanel

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 12: Navigation — add Quotations links

**Files:**
- Modify: `src/components/layout/nav-config.ts`

- [ ] **Step 1: Read nav-config.ts**

Open `src/components/layout/nav-config.ts`. Find the section where Orders links are defined (around line 57 per codebase notes: `{ label: 'View Orders', href: '/orders' }`).

- [ ] **Step 2: Add Quotations entries**

After the Orders group entries, add:

```typescript
{ label: 'View Quotations', href: '/quotations' },
{ label: 'Create Quotation', href: '/quotations/create' },
```

Place them in the same nav group as Orders, or create a new "Quotations" group if the nav structure uses groups. Match the exact existing pattern (object shape, group structure) from the file.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/nav-config.ts
git commit -m "feat(quotations): add Quotations to navigation

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

- [x] **DB migration** — `quotation_line_items` table created with RLS (Task 1)
- [x] **Types** — `QuotationDraft`, `QuotationListItem`, `QuotationDetail`, `QuotationsFilter` (Task 2)
- [x] **Create hook** — ID generation, `setCustomer`, `addService`, `removeService`, `updateQty`, `saveDraft`, `sendViaWhatsApp` (Task 3)
- [x] **PDF Preview** — division logo/address, customer block, services table with qty/price/total, notes, validity, stamp (Task 4)
- [x] **Form panel** — phone lookup modal, service selector, selected service cards, notes, Save Draft + Send via WhatsApp buttons, WATI window-closed banner (Task 5)
- [x] **WATI route** — window check via `getContacts`, `sendSessionMessage`, env vars server-side (Task 6)
- [x] **Create page** — 3-panel wiring, window-closed state managed (Task 7)
- [x] **List + detail hooks** — `useQuotations`, `useQuotationCounts`, `useQuotationDetail` (Task 8)
- [x] **List card + detail sheet** — `QuotationListCard`, `QuotationDetailSheet` with Preview + Logs tabs (Task 9)
- [x] **List page** — count badges, status chips, date filters, phone + number search, card grid (Task 10)
- [x] **CustomerHistoryPanel** — quotations section added (Task 11)
- [x] **Navigation** — View Quotations + Create Quotation links added (Task 12)
