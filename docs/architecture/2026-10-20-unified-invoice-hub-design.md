# Unified Invoice Hub — Design

**Status:** draft for approval · **Scope:** full-build / whole-app (DEV; never warehouse prod)
**Author:** brainstormed 2026-10-20

## Intent (the why)

Today invoices are scattered across four tables with inconsistent schemas, there is no single "all invoices" page, and the Dibsy card-payment link is manual and only half-wired. We want: **one invoice hub that holds every invoice**, and on creation each invoice **automatically** gets its PDF, a Dibsy pay link, and a WhatsApp (WATI) message carrying both — so the customer taps and pays by card. Per-type detail tables stay; the hub is the common spine.

## Current state (what exists today)

| Table | Role | Has dibsy? | RLS | Notes |
|---|---|---|---|---|
| `invoices` | **intended unified hub** | yes | **off** | `source`/`source_id`/`source_label`, `direction`, `invoice_type`, links to SO/PO/receival/delivery, `phone_id`, `pdf_url`. **Stranded**: no DB function reads/writes it; only the client-side Dibsy code touches it. No PK, no indexes. |
| `so_invoices` | sales-order invoices | **no** | on | The live AR table — all accounting reads it (18 fns). Indexed, RLS'd. Lacks dibsy fields. |
| `tl_invoices` | service / field invoices (incl. **emergency**) | yes | off | Has `order_id`+`visit_id`, `customer_phone`, `pdf_url`. Created by `create_tl_invoice`. |
| `contract_invoices` | contract invoices | yes | on | Has `sent_at` (send tracking). Created by `generate_contract_invoices`. |

Building blocks already present: the **Dibsy client** (`src/lib/dibsy.ts` — create/get payment, webhook), the **WATI `send-file`** route, and **per-type PDF generators** (`generate-invoice-pdf`, `generate-tl-invoice-pdf`, `generate-contract-invoice-pdf`). Nothing is wired into one spine.

The Dibsy webhook already routes by `metadata` to `tl_invoices`, `contract_invoices`, `customer_subscriptions` (all live) and `invoices` (stranded — the sales/AR card-pay path has no rows to act on).

## Goals

1. **One hub row per invoice**, every type, powering a single "All Invoices" page.
2. **Keep per-type detail tables** (so_invoices / tl_invoices / contract_invoices) for type-specific fields.
3. **Auto Dibsy pay link** generated when an invoice is created.
4. **Auto PDF + WhatsApp send** (WATI) carrying the PDF and the pay link, for every customer-facing invoice.
5. **Reliable settlement**: the Dibsy webhook marks the hub paid and syncs status back to the detail table + accounting.
6. **Future-proof (open for extension)**: any *new* module that issues invoices plugs into the hub without changing the hub schema, the All-Invoices page, the Dibsy link, the PDF/WhatsApp send, or the webhook. Invoice logic is written once; new sources attach to it.

## Non-goals / anti-goals

- **Non-goal:** merging the detail tables into one — they stay.
- **Non-goal:** replacing Dibsy or the WATI integration — reuse both.
- **Anti-goal:** two sources of truth that silently drift (today's bug). The hub must be kept in sync by a trigger, never by "remembering" to write it in each code path.
- **Anti-goal:** breaking the working TL / contract / subscription Dibsy paths during the transition.

## Target architecture (decided parts)

1. **`invoices` becomes the real hub.** One row per invoice holding the common fields: number, customer + phone, amounts (subtotal/discount/tax/total/paid), `payment_status`, `invoice_type`, `source`/`source_id` (the detail row), `division`, `dibsy_payment_id`, `dibsy_checkout_url`, `pdf_url`, `sent_at`. It already has these columns.
2. **Hub is kept in sync by triggers.** Each detail table gets an `AFTER INSERT/UPDATE` trigger that upserts its hub row (keyed by `source` + `source_id`). Automatic, can't be forgotten, single direction (detail → hub).
3. **Hardening first:** PK on `invoices.id`, indexes on the lookup/FK columns, and RLS (even if just the authenticated baseline until the division model is unified).
4. **Automation on create** (fires once the hub row exists): generate the PDF (reuse the per-type generator) → create the Dibsy payment → store link + id → WATI-send the PDF + pay link → stamp `sent_at`. Idempotent: reuse an existing Dibsy link; never double-send.
5. **Webhook → hub:** route by metadata to the hub row, mark paid, sync `payment_status` to the detail table and the accounting path.
6. **All Invoices page** reads the hub with type / status / customer / date filters.

```
detail insert ──trigger──▶ invoices hub row ──▶ PDF ──▶ Dibsy link ──▶ WATI send
                                   ▲                                        │
                                   └──────────── webhook: mark paid ◀───────┘  customer pays by card
```

## Extension contract (adding a future invoice type)

The hub is **polymorphic** — a row is identified by `invoice_type` + `source` + `source_id`, and every downstream step (pay link, PDF dispatch, WhatsApp send, the page, the webhook) reads only the hub's common fields. So a new module that issues invoices plugs in by providing four small things and touching nothing else:

1. **Its own detail table** — whatever type-specific fields it needs.
2. **One sync trigger** — `AFTER INSERT/UPDATE` on that table that upserts the hub row (sets `invoice_type`, `source_id`, customer, phone, amounts, status).
3. **A registered `invoice_type`** — an enum/lookup value so the hub recognises it.
4. **A PDF renderer registered against that type** — a strategy/registry (`pdfRendererFor(invoice_type)`), since the PDF is the only type-specific artifact.

Everything generic — creating the Dibsy link, sending over WhatsApp, marking paid, listing on the All-Invoices page — works **unchanged**, because it operates on the hub, not on the type. No new module ever edits the hub, the page, Dibsy, WATI, or the webhook. That is the whole point of the hub.

## Decisions (resolved 2026-10-20)

1. **Source of truth for accounting — `so_invoices` stays canonical.** AR reporting, payments, and balances keep reading `so_invoices` (and `tl_`/`contract_` for their types). The hub is the unified read + payment/send spine, not the accounting ledger. Lowest risk; no reports repoint.
2. **Send model — fully automatic.** On invoice create, the hub row triggers: generate PDF → create Dibsy pay link → send both to the customer over WhatsApp (WATI) → stamp `sent_at`. No manual Send button. Idempotent — never double-send; reuse an existing link.
3. **Dibsy link timing — default, pending billing confirmation.** Create the Dibsy payment when the hub row is created, for **unpaid, customer-facing** invoices only; reuse an existing link; skip zero-balance. ⚠️ *Still to confirm:* if Dibsy bills per payment object, defer link creation to the auto-send moment instead (still automatic) — confirm their pricing before relying on create-time generation.
4. **Scope — customer-facing invoices.** In: sales (`so_invoices`), service/emergency (`tl_invoices`), contract (`contract_invoices`), subscription. Out: supplier/AP invoices and anything not sent to a paying customer.
5. **Emergency/service invoices — `tl_invoices`, field-created.** The team leader creates/sends them in the field; auto-send carries the PDF + pay link to the customer's WhatsApp.

## What's left to the builder

- Migration: hub hardening (PK, indexes, RLS) + any missing hub columns + the detail→hub sync triggers + **backfill** existing invoices into the hub.
- The create-time automation (PDF + Dibsy + WATI) as a server hook, idempotent.
- Webhook rework to target the hub and sync back.
- The "All Invoices" page.
- Tests (sync trigger correctness, idempotent send, webhook settlement) + a dev-DB end-to-end.

## Rollout

Dev-only on full-build, phased: (1) hub hardening + sync triggers + backfill (read-only, nothing breaks); (2) create-time automation behind a flag; (3) the All-Invoices page; (4) flip auto-send on. Existing TL/contract/subscription paths keep working throughout.
