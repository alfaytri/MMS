# Quotation Module — Design Spec
**Date:** 2026-05-10  
**Status:** Approved  
**Approach:** Option A — Fork & adapt order creation components

---

## 1. Overview

A Quotation module that lets agents create, preview, and send quotations to customers via WhatsApp (WATI). Mirrors the order creation UX with a 3-panel layout, replacing the team calendar with a live PDF-style preview. Quotations can be saved as drafts or sent immediately if the WATI 24-hour session window is open.

---

## 2. Data Model

### Existing: `quotations` table (already in DB)
Key fields in use for this phase:
- `id UUID` — internal PK
- `quotation_id TEXT UNIQUE` — human-readable, format `Q/YYYY/MM/NNNN`
- `customer_id UUID → customers`
- `division TEXT` — auto-derived from selected services
- `status quotation_status` — `draft | sent` (full machine exists in DB, wired up later)
- `total_amount NUMERIC`
- `notes TEXT`
- `created_date DATE`
- `sent_date TIMESTAMPTZ` — set on successful WATI send
- `expiry_date DATE` — always `created_date + 30 days`

### New: `quotation_line_items` table (migration required)
```sql
CREATE TABLE quotation_line_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id  UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  service_id    UUID REFERENCES services(id),
  name          TEXT NOT NULL,        -- snapshot at quote time
  path          TEXT[] DEFAULT '{}',  -- breadcrumb e.g. ['Pest Control', 'Cockroach']
  qty           INT NOT NULL DEFAULT 1,
  price         NUMERIC NOT NULL,     -- pulled from services.price at selection time
  duration      INT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### Quotation numbering
Format: `Q/YYYY/MM/NNNN` — generated on mount via DB query on `quotations` table, same pattern as `N/` for orders and `V/` for site visits.

### Division derivation
At save time: read `division` field from the first selected service. Services in the catalog are per-division so mixed-division quotes are not expected in practice.

---

## 3. Routes

| Route | Purpose |
|---|---|
| `/quotations` | List page — collapsible search, card grid |
| `/quotations/create` | 3-panel creation page |

---

## 4. Page Layout — `/quotations/create`

```
┌─────────────────┬──────────────────────────┬────────────────────┐
│ QuotationForm   │  QuotationPdfPreview      │ CustomerHistory    │
│ Panel (340px)   │  (flex-1, scrollable)     │ Panel (320px)      │
│                 │                           │                    │
│ • Phone lookup  │  Live A4-style card       │ • Past orders tab  │
│   modal (same)  │  (see §5)                 │ • Past quotations  │
│ • Service tree  │                           │   tab (new)        │
│   (same browse) │                           │                    │
│ • Notes field   │                           │                    │
│                 │                           │                    │
│ ─────────────── │                           │                    │
│ [Save Draft]    │                           │                    │
│ [Send WhatsApp] │                           │                    │
└─────────────────┴──────────────────────────┴────────────────────┘
```

**Height:** `h-[calc(100vh-56px)]` — same as order creation  
**Mobile:** panels stack vertically; PDF preview collapses below form

---

## 5. PDF Preview — `QuotationPdfPreview`

Renders as a white A4-proportioned card with drop shadow inside the center panel. Updates live as the form state changes.

```
┌─────────────────────────────────────────────────────┐
│  [Division Logo]          QUOTATION                  │
│  Division Name            Q/2026/05/0001             │
│  Division Address         Date: 10 May 2026          │
│                                                      │
│ ─────────────────────────────────────────────────── │
│  Bill To:                                            │
│  {customer_name}                                     │
│  {customer_phone}                                    │
│                                                      │
│  ┌──────────────────────┬──────┬────────┬─────────┐  │
│  │ Service              │ Qty  │ Price  │ Total   │  │
│  ├──────────────────────┼──────┼────────┼─────────┤  │
│  │ Cockroach Treatment  │  1   │ QAR 50 │ QAR 50  │  │
│  │ Rat Control          │  2   │ QAR 80 │ QAR 160 │  │
│  ├──────────────────────┴──────┴────────┼─────────┤  │
│  │                              TOTAL   │ QAR 210 │  │
│  └──────────────────────────────────────┴─────────┘  │
│                                                      │
│  Notes: {notes if any}                               │
│  Valid for 30 days from issue date.                  │
│                                                      │
│  [Division stamp if set]        Thank you            │
└─────────────────────────────────────────────────────┘
```

**Data sources:**
- Division logo/stamp: `divisions.logo_url` / `divisions.stamp_url`
- Currency: `divisions.default_currency` (default `QAR`)
- Division name/address: `divisions.name` / `divisions.address_en`
- Customer name/phone: from customer lookup result
- Line items: live from form state
- Total: sum of `qty × price` per line

**No PDF library needed** — rendered with Tailwind in-browser. Browser Print → Save as PDF works for export.

---

## 6. New Files

| File | Description |
|---|---|
| `supabase/migrations/20260510230000_quotation_line_items.sql` | New table + RLS |
| `src/app/(dashboard)/quotations/page.tsx` | List page |
| `src/app/(dashboard)/quotations/create/page.tsx` | Creation page (3-panel) |
| `src/components/quotations/QuotationFormPanel.tsx` | Left panel — fork of `OrderFormPanel`, strips team/calendar/type/mode/site-visit sections. Reuses `PhoneLookupModal` unchanged. |
| `src/components/quotations/QuotationPdfPreview.tsx` | Center panel — live A4 preview |
| `src/components/quotations/QuotationListCard.tsx` | Card for list view |
| `src/components/quotations/QuotationDetailSheet.tsx` | Right sheet on list row click |
| `src/hooks/useCreateQuotation.ts` | Draft state + save/send mutations |
| `src/hooks/useQuotations.ts` | List fetching with filters |

**Modified files:**
| File | Change |
|---|---|
| `src/components/orders/CustomerHistoryPanel.tsx` | Add "Quotations" tab showing past quotations for the customer |
| `src/app/(dashboard)/layout.tsx` or nav | Add "Quotations" nav link |

---

## 7. Actions

### Save Draft
1. Upsert quotation row with `status = 'draft'`, `expiry_date = created_date + 30`
2. Delete + re-insert `quotation_line_items` for this quotation
3. Toast: "Quotation saved as draft"
4. Redirect to `/quotations`

### Send via WhatsApp
1. Upsert quotation + line items (same as Save Draft)
2. Call Next.js route handler `POST /api/wati/send-quotation`
3. Route handler: `GET /api/v1/getContacts?phoneNumber={phone}` → check `lastReceivedMessageDate` within 24 hours
4. **Window open:** `POST /api/v1/sendSessionMessage` with formatted quotation summary message. Update `status = 'sent'`, `sent_date = now()`. Toast: "Quotation sent via WhatsApp"
5. **Window closed:** Return `{ windowClosed: true }`. Show inline banner in UI: *"WATI window is closed for this customer. Ask them to send a message first, then retry."* Status stays `draft`.
6. WATI credentials: `WATI_API_URL` + `WATI_API_TOKEN` env vars (server-side only)

### WhatsApp message format:
```
Hello {customer_name},

Please find your quotation below:

Quotation No: Q/2026/05/0001
Date: 10 May 2026
Valid Until: 09 Jun 2026

Services:
• Cockroach Treatment x1 — QAR 50
• Rat Control x2 — QAR 160

Total: QAR 210

Thank you for choosing {division_name}.
```

---

## 8. View Quotations — `/quotations`

Mirrors `/orders` page structure exactly.

**Top bar:** "Quotations" title + "New Quotation" button

**Count badges:**
- All Quotations
- Drafts (`status = draft`)
- Sent (`status = sent`)

**Search filters:**
- Division (dropdown)
- Status chips: Draft, Sent
- From Date / To Date
- Customer Phone
- Quotation No

**Card (`QuotationListCard`) shows:**
- Quotation ID (monospace)
- Division badge (colored per division)
- Status badge
- Customer name · phone
- Total amount
- Created date

**`QuotationDetailSheet`** (right slide-over on card click):
- Header: quotation ID, status badge, customer name/phone
- Tabs:
  - **Preview** — `QuotationPdfPreview` in read-only mode
  - **Logs** — entries from `quotation_log` table

---

## 9. Navigation

Add "Quotations" link to the sidebar/top-nav between "Orders" and the next item.

---

## 10. Out of Scope (this phase)

- Quotation → Order conversion (`converted_order_id` FK exists, wired up later)
- `pending_approval` / `approved` / `rejected` status transitions
- PDF file generation / download
- Email sending
- Quotation editing after sent
