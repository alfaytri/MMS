# Unified Invoice Hub — Handoff & Go-Live

**Status:** built & verified on **full-build DEV** (`wkmvjxxmzstsvahuiwsz`) · branch `full-build/admin-misc` · **nothing pushed** · auto-dispatch cron **built but OFF and unscheduled**.
**Updated:** 2026-10-21 (after the owner's go-live decisions) · **Spec:** `…-design.md` · **Plan:** `…-plan.md` · **E2E:** `…-e2e.md`

## What this is
One hub table (`public.invoices`) mirroring every customer invoice — **sales** (`so_invoices`), **service/emergency** (`tl_invoices`), **contract** (`contract_invoices`) — keyed on `(detail_table, detail_id)`. On top of it: a single **All Invoices** page (`/invoices/all`), and an automatic pipeline that (once enabled) gives each invoice a PDF, a Dibsy card-pay link, and a WhatsApp carrying both. Per-type detail tables stay canonical for accounting; the hub is the common spine. A new invoice type plugs in by editing one registry (`src/lib/invoices/registry.ts`); a consistency test fails loudly on drift.

## The pipeline
```
detail INSERT ─trigger─▶ hub row (pending) ─cron─▶ dispatchInvoice ─▶ PDF ─▶ Dibsy link ─▶ WhatsApp (order_invoice template)
                              ▲                                                                       │
                              └──────────────────── webhook: record payment (AR) ◀──── customer pays ─┘
```
- **WhatsApp = your `order_invoice` template** (sent via `sendWatiTemplate`, same as the existing invoice send): the PDF is attached and the live `/pay/{id}` link is a parameter. You choose the template in **Services → Notifications**; nothing is hardcoded.
- **Service (TL):** keeps its existing **instant send on create** (`send-invoice`); that send now marks the hub row `sent`, so the cron never re-sends it. No double-send.
- **Contract:** auto-sent by the cron.
- **Sales:** **manual / excluded** (see Decisions) — the cron does not send sales.
- **Payment:** the Dibsy webhook settles the hub and records the detail payment. For **sales**, it writes a proper `CPAY` AR payment (`payments`, `status 'completed'`, method `pos`, idempotent on the Dibsy payment id) so it isn't recomputed away.

## Decisions made (2026-10-21)
1. **Send via the `order_invoice` template** (PDF attached + pay link) — done.
2. **Service double-send:** keep the instant send; it marks the hub `sent` so the cron skips it — done.
3. **Sales = manual for now.** In your system sales invoices are created `draft` and nothing finalizes them, so there is no "issued" trigger to auto-send on. Sales stays excluded from the cron. **To auto-send sales later you need:** (a) define the "issued" event (a status change or action that means "ready to send"), then flip `sales.dispatchable` + fire on that event; (b) the sales-payment AR recording — **already wired** (decision 4).
4. **Sales payments recorded in AR** — done (the webhook creates the `CPAY` payment).

## Safety (why it's fine to sit with the cron off)
- **Two default-OFF gates:** an admin-only `app_settings.invoice_dispatch_config.enabled` **AND** env `INVOICE_DISPATCH_ENABLED='true'`. Nothing dispatches unless both are on. Cron is **not in `vercel.json`** (manual-invoke only).
- **`tl_invoices` locked down** (opus-reviewed, live-verified): direct writes denied; only service-role + definer functions write it. Hub is SELECT-only for authenticated.
- **Dev test-number redirect** (`INVOICE_DISPATCH_TEST_NUMBER`): the **cron** path sends only to that number. ⚠️ The *instant* service-invoice send does **not** honor it — so for a safe dev live-test, test **through the cron** (I can seed a pending hub row), not by creating a real invoice.

## To enable (dev first)
1. **Assign your PDF (document) WATI template to `order_invoice`** in Services → Notifications. On dev that slot is currently **empty**, so sends there say "template not assigned" until it's set. (Likely already set on prod.)
2. **Live-send test through the cron** to `INVOICE_DISPATCH_TEST_NUMBER` (97472195504) — confirm the WhatsApp + PDF + pay link arrive and render.
3. Flip both gates on and schedule the cron.

## Prod-rollout checklist (do NOT skip)
- **Migrations:** apply `20261153`→`20261157` (in `supabase/migrations/` + `migrations-staging/`) with an **explicit `--project-ref`** — never a bare `db push` (the CLI link points at warehouse staging). `20261153–1155` lack the wrong-DB guard that 1156/1157 have.
- **`INVOICE_DISPATCH_TEST_NUMBER` MUST be UNSET in prod** — if left set, every invoice WhatsApp silently goes to the test number while rows are marked `sent`.
- **`create_tl_invoice` has no caller-auth** (any authenticated user can mint a TL invoice for any phone) → add a permission check before prod; likewise `tl_invoice_payments` is authenticated-writable → move its writes onto an RPC.
- **Sales card-payment method:** recorded as `pos` today (dev has no `card` method). If you want Dibsy/card tracked distinctly, add a payment method and update `SALES_CARD_PAYMENT_METHOD` in the webhook.
- **`payments.reference` has no unique index** — the webhook's check-before-insert + retry closes normal re-delivery, but a true concurrent-delivery race is only fully closed by a unique index (check for existing duplicate references first).
- **Partial/superseded Dibsy links** can double-count on re-delivery of a *partial* settle (full settle is safe) → a per-payment settle key before partial links exist.
- **DEV-ONLY branch:** `full-build/admin-misc` is the whole-app build — **never deploy to warehouse prod**.

## Where things live
Docs: `docs/architecture/2026-10-20-unified-invoice-hub-*.md`. Code: `src/lib/invoices/` (registry, types, dispatch, pdf-registry), `src/app/api/cron/dispatch-invoices/`, `src/app/api/payments/dibsy/webhook/`, `src/app/api/notifications/send-invoice/`, `src/app/(dashboard)/invoices/all/`. Migrations: `supabase/migrations/20261153…20261157`.
