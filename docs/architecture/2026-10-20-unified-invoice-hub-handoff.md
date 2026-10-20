# Unified Invoice Hub — Handoff & Go-Live

**Status:** built & verified on **full-build DEV** (`wkmvjxxmzstsvahuiwsz`) · branch `full-build/admin-misc` · **nothing pushed** · the auto-dispatch cron is **built but OFF and unscheduled**.
**Date:** 2026-10-20 · **Spec:** `docs/architecture/2026-10-20-unified-invoice-hub-design.md` · **Plan:** `…-plan.md` · **E2E:** `…-e2e.md`

## What this is
One hub table (`public.invoices`) that mirrors every customer invoice — **sales** (`so_invoices`), **service/emergency** (`tl_invoices`), **contract** (`contract_invoices`) — keyed on `(detail_table, detail_id)`. On top of it: a single **All Invoices** page, and an automatic pipeline that (once enabled) gives each invoice a PDF, a Dibsy card-pay link, and a WhatsApp carrying both. The per-type detail tables stay canonical for accounting; the hub is the common spine.

## The pipeline (how it works)
```
detail INSERT ─trigger─▶ hub row (pending) ─cron─▶ dispatchInvoice ─▶ PDF ─▶ Dibsy link ─▶ WhatsApp
                              ▲                                                                │
                              └───────────────── webhook: mark paid ◀───────── customer pays ─┘
```
- **Sync trigger** (`sync_invoice_hub`, migration 20261154): every detail insert/update mirrors a hub row (`direction='ar'`, `dispatch_status='pending'`).
- **Cron** (`/api/cron/dispatch-invoices`): selects `pending` hub rows for `tl_invoices`+`contract_invoices` only (sales excluded in v1 — see Decision 1), one at a time, behind two gates.
- **dispatchInvoice** (`src/lib/invoices/dispatch.ts`): skip-gates → ensure PDF → ensure Dibsy link (`metadata.hub_invoice_id`) → WhatsApp to the customer (or the dev test number) → mark `sent`. Idempotent; never double-charges (one pay link per row).
- **Webhook** (`/api/payments/dibsy/webhook`): a `paid` Dibsy payment settles the hub + syncs the detail row.
- **Page** (`/invoices/all`): lists every hub invoice with type/status filters, remaining balance, and pay-link/PDF columns. Your existing **"Orders Invoices"** page (`/invoices`) is untouched.
- **Extensibility:** a new invoice type plugs in via one source-of-truth module + its sync-trigger branch; a consistency test fails loudly if the registries drift.

## Safety (why it's safe to have this in the codebase with the cron off)
- **Two gates, both default-OFF:** an admin-only `app_settings.invoice_dispatch_config.enabled` **AND** an env `INVOICE_DISPATCH_ENABLED='true'`. Nothing dispatches unless both are on. The cron is **not in `vercel.json`** (manual-invoke-only).
- **`tl_invoices` locked down** (migration 20261156, opus-reviewed + live-verified): direct writes by `authenticated`/`anon` are denied (`42501`); only the service role + SECURITY DEFINER functions write it. Hub is SELECT-only for authenticated.
- **Dev test-number redirect:** with `INVOICE_DISPATCH_TEST_NUMBER` set, every WhatsApp goes to that number only — a dev live-test can't reach a real customer.
- **Verification:** all 10 plan tasks independently reviewed; the lockdown got a dedicated opus + live-DB review; a dev-DB end-to-end confirmed seed→hub→cron→settle→orphan-cleanup; builds/tsc/lint green.

## ⚠️ Two decisions that are yours (before go-live)
1. **When is a SALES invoice "ready to send"?** `so_invoices` are drafts that get rewritten, so sales is **excluded from auto-dispatch in v1**. Tell us the rule (e.g. "when status leaves draft", or "never auto — sales stays manual") and we wire it: add `so_invoices` to the dispatchable set + a draft gate.
2. **WhatsApp transport + PDF.** Dispatch copies the existing, live **TL-invoice payment send** (direct WATI, template `mms_tl_invoice_payment`). A 2026-06 doc says to use the `api-wati` Edge Function instead — likely stale (the live TL/CC sends use direct WATI), but **confirm with one live send to the test number** before enabling the cron. Also: the pay page currently redirects straight to Dibsy and **does not show the PDF** (design goal 4 wants the PDF carried) — decide whether to add a document-header WATI template or a pay-page PDF link.

## To enable (dev first, then prod) — the gate sequence
1. Set `INVOICE_DISPATCH_TEST_NUMBER=97472195504` (dev) and run **one live send** → confirm the WhatsApp + pay link arrive and render correctly.
2. Resolve Decision 2 (WATI transport confirmed) and Decision 1 (sales rule) if sales should auto-send.
3. Flip both gates on (`INVOICE_DISPATCH_ENABLED=true` + the admin config row) and schedule the cron.

## Prod-rollout checklist (do NOT skip)
- **Migrations:** apply `20261153`→`20261157` (both already in `supabase/migrations/` + `migrations-staging/`) to staging/prod with an **explicit `--project-ref`** — never a bare `db push` (the CLI link points at warehouse staging). Note: 1153–1155 lack the wrong-DB guard that 1156/1157 have.
- **`INVOICE_DISPATCH_TEST_NUMBER` MUST be UNSET in prod** — if left set, every invoice WhatsApp silently goes to the test number while rows are marked `sent`.
- **`create_tl_invoice` has no caller-auth** (any authenticated user can mint a TL invoice for any phone) → add a permission check before prod. Likewise `tl_invoice_payments` is still authenticated-writable → move its writes onto an RPC.
- **Partial/superseded Dibsy links** can double-count on re-delivery (full settle is safe) → add a settle RPC with a unique `(hub, payment_id)` key before partial links exist.
- **Legacy TL path:** `send-invoice`/`create-tl-invoice` mint `tl_invoice_id` links today; route them through the same settle helper before the page shows TL hub amounts broadly.
- Minor: empty `NEXT_PUBLIC_APP_URL` should use `||` (relative-URL guard); add a WATI fetch timeout; the cron's `?dryRun` key is case-sensitive.
- **DEV-ONLY branch:** `full-build/admin-misc` is the whole-app build — **never deploy this to warehouse prod**.

## Where things live
Spec/plan/E2E/this doc: `docs/architecture/2026-10-20-unified-invoice-hub-*.md`. Code: `src/lib/invoices/` (types, dispatch, pdf-registry), `src/app/api/cron/dispatch-invoices/`, `src/app/api/payments/dibsy/webhook/`, `src/app/(dashboard)/invoices/all/`. Migrations: `supabase/migrations/20261153…20261157`.
