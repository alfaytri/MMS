# Unified Invoice Hub — Dev-DB E2E Verification

**Status:** PASS (scoped integration E2E, no external sends) · **Date:** 2026-10-20 · **Target:** whole-app dev DB `wkmvjxxmzstsvahuiwsz` on `full-build/admin-misc` (never warehouse staging / prod)
**Plan:** `2026-10-20-unified-invoice-hub-plan.md` Task 10 · **Design:** `2026-10-20-unified-invoice-hub-design.md`

## Scope

The real-database half of the verification: the pieces unit tests cannot prove. These are the detail → hub sync trigger, the cron's live `SELECT` and its two safety gates, the settlement sync, and the C8 orphan cleanup.

Nothing external was touched. No Dibsy call, no WATI / WhatsApp, no hosted checkout, no card data, no payment, no migration, no `.env.local` edit, no dev-server restart. The only HTTP was a cron `?dryRun=1` POST to the local dev server, which lists pending rows and returns before the dispatch loop.

## Result at a glance

| Step | What was proven | Result |
|---|---|---|
| 1 | A `tl_invoices` INSERT makes a hub row through `trg_tl_invoices_sync_hub`: `pending`, `ar`, total 250 | PASS |
| 2 | Cron `?dryRun=1` (real PostgREST select + gate reporting): 200, the row is listed, both gates OFF, nothing sent | PASS |
| 3 | Detail-first settle (`paid`, 250) is mirrored onto the hub row by the same trigger | PASS |
| 4 | `so_invoices` scoped: not listed by the cron; settlement is the unit-tested defensive path | SCOPED (documentation only) |
| 5 | Deleting the detail row removes its hub row (C8 `AFTER DELETE`); dev DB is byte-identical to the baseline | PASS |
| 6 | `tsc` 0 errors, hub suites 236/236, full vitest = the same 4 known failures, `next build` green | PASS |

## Method and safety

- Every SQL file began with a guard that aborts unless `invoices.detail_table` exists (the dev-DB marker: the hub migrations target the whole-app dev DB only). The repo's CLI link (`supabase/.temp/project-ref`) points at the warehouse **staging** project, so `--project-ref wkmvjxxmzstsvahuiwsz` was always passed explicitly, and a wrapper refused to run any file lacking the guard.
- A baseline was captured first (hub row count, content hashes of the hub and `tl_invoices`, chat counts, `app_settings`), then compared at the end.
- Each write was its own committed transaction, followed by an independent read in a separate call.

## Step 1 — seed and sync (PASS)

One `tl_invoices` row was cloned from the sample `657bc0cf-2537-4ca0-b2cd-12723d6c250c` (the FK columns `created_by` and `payment_method_id` come from it). Overrides: `customer_name` `[E2E-T10] Hub Test`, `customer_phone` `+97472195504` (the dev test number), subtotal 250 / spare parts 0 / discount 0 / total 250, `unpaid`, paid 0, Dibsy columns and `pdf_url` NULL, `order_id` NULL, a tagging note.
`visit_id` is `UNIQUE` (with no FK), so the sample's value could not be reused and a fresh uuid was used. `invoice_number` was assigned by `tl_invoice_number_trigger`.

| | detail (`tl_invoices`) | hub (`invoices`) |
|---|---|---|
| id | `94b075a7-52ce-431d-bfcc-bf99f71d6a42` | `f53dd827-3be0-46a5-a2d5-fa336b146030` |
| key | `invoice_number` `SINV/2026/10/0048` | `detail_table='tl_invoices'`, `detail_id` = the detail id, `direction='ar'` |
| money | total 250, paid 0, `unpaid` | total 250, subtotal 250, paid 0, `unpaid` |
| dispatch | n/a | `dispatch_status='pending'`, `sent_at`, `dibsy_checkout_url`, `pdf_url` all NULL |

Exactly one hub row exists for the detail row; the hub went from 16 rows (all `sent`) to 17 (16 `sent`, 1 `pending`).

## Step 2 — cron dryRun and gates (PASS)

`POST /api/cron/dispatch-invoices?dryRun=1` with `x-cron-secret`. HTTP 200 in 0.8 s. (A request without the secret returns the JSON 401, so the live `src/middleware.ts` lets `/api/cron/` through to the route's own check.) Body:

```json
{"ok":true,"mode":"dryRun","enabled":false,"config_enabled":false,"env_enabled":false,"pending_count":1,"pending":[{"id":"f53dd827-3be0-46a5-a2d5-fa336b146030","detail_table":"tl_invoices","invoice_id":"SINV/2026/10/0048","customer_name":"[E2E-T10] Hub Test"}]}
```

- **Gates:** both are OFF by default. `config_enabled:false` because no `app_settings` row `invoice_dispatch_config` exists; `env_enabled:false` because `INVOICE_DISPATCH_ENABLED` is not set; the AND is `enabled:false`.
- **Live select:** the cron's real query (`dispatch_status='pending'`, `detail_table` in `tl_invoices` / `contract_invoices`, oldest first) returned the new row, so the hub row is visible to the cron.
- **Nothing sent**, checked in the DB right after: the hub row is still `pending` with `dispatch_error`, `sent_at`, `dibsy_checkout_url`, `dibsy_payment_id` and `pdf_url` all NULL and `updated_at` untouched; `chat_conversations` (16,888) and `chat_messages` (214) are unchanged, with no message created in the last 30 minutes; the gate row was never created.

## Step 3 — settlement sync (PASS)

A service-role `UPDATE tl_invoices SET payment_status='paid', paid_amount=250, updated_at=now()` on the detail row only (what the webhook's detail-first settle does), committed. An independent read then showed the hub row `payment_status='paid'`, `paid_amount=250`, `total_amount=250`, still exactly one hub row, detail and hub agreeing. The hub's own `dispatch_status` stayed `pending` (hub-owned, not changed by a detail update); with the gates open the dispatcher would mark such a paid row `skipped` (`dispatch.ts` skip rule: paid / void / nothing remaining), not send it.

## Step 4 — so_invoices (SCOPED, no DB write)

- **(a)** The cron lists no `so_invoices`: its filter is `DISPATCHABLE_DETAIL_TABLES = ['tl_invoices','contract_invoices']` (`route.ts`), the live dryRun listed only the `tl_invoices` row, and dev has 0 `so_invoices` and 0 `so_invoices` hub rows. The cron suite pins it (`only picks up pending tl_invoices / contract_invoices rows`, with a pending sales row in the fixture).
- **(b)** The `so_invoices` settlement in the Dibsy webhook is the defensive direct-sync path (`partially_paid` spelling, no `updated_at`, no AR payment row). It is pinned in the 68-test webhook suite (the three-table mirror matrix and `does not invent an AR payment for a sales invoice`).
- A live `so_invoices` settlement is deferred until sales dispatch is enabled; sales is deliberately excluded in v1, and building an `so_invoices` row needs a sale order, which this run does not create.

## Step 5 — C8 cleanup (PASS)

`DELETE FROM tl_invoices WHERE id = '94b075a7-…'` (no child rows existed, so no FK blocked it), committed. Independent read afterwards:

- detail row gone; hub row gone both by id and by `(detail_table, detail_id)`; 0 orphan hub rows for `tl_invoices` or `contract_invoices`.
- Hub back to 16 rows (12 `contract_invoices` + 4 `tl_invoices`, all `sent`). The content hash of the whole hub table (`33df9663b33d4927faf990bfa092e7ae`) and of `tl_invoices` (`90f362a911726299a036fc5543d847a6`) equals the baseline; chat counts, `app_settings` (3 rows, no gate row), `tl_invoice_lines` (5) and `tl_invoice_payments` (5) are unchanged.
- A second dryRun after the delete returned `pending_count:0`, so the cron no longer sees the removed row (the point of C8).
- Only persistent trace: `tl_invoice_seq` advanced 47 → 48 (a sequence is not transactional), so `SINV/2026/10/0048` will never be issued. A harmless numbering gap on a dev DB.

## Step 6 — build gates (PASS)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, 0 errors (also with `--incremental false`) |
| `npx eslint` | no source file changed (docs only). Extra run over `src/app/api/cron/dispatch-invoices`, `src/lib/invoices`, `src/app/api/payments/dibsy`: clean |
| `npx vitest run` | 95 files / 828 tests: 824 pass, **4 fail, the same 4 pre-existing and unrelated** (permission-catalog drift; none imports hub code): `permissions.test.ts` "ALL_PERMISSIONS contains all keys from all groups" and "includes calendar permission group with required keys"; `notification-routes.test.ts` "every mapped feature permission exists in the live catalog (NAV_TREE)" (`sales.payments.view`) and "every notifyKey used by a type has an Auto-feature mapping" (`notify.sales.so_approval`) |
| Hub suites | 7 files, 236/236: webhook 68, dispatch 59, cron route 43, all-invoices hook 49, pdf-registry 8, types 5, page 4 |
| `npx next build` | green (Next 15.5.23), built in an isolated copy so the live dev server's `.next` was untouched (source tree hash-identical, `node_modules` junction, no `.env.sentry-build-plugin`, Sentry vars unset): compiled in 84 s, lint and types clean, 160/160 static pages; `/api/cron/dispatch-invoices`, `/api/payments/dibsy/webhook` and `/invoices/all` are in the route table |

## Not covered (deferred on purpose)

1. **A live dispatch** (Dibsy pay link minted, WhatsApp sent, hub flips `sent` with `dibsy_checkout_url`, `sent_at` and a `chat_messages` row) is deferred to the go-live live-send test to `97472195504`. It needs `INVOICE_DISPATCH_ENABLED=true` in the server env, `invoice_dispatch_config.enabled=true` (admin-only, so service-role SQL), and `INVOICE_DISPATCH_TEST_NUMBER=97472195504` so that nothing reaches a real customer. `dispatchInvoice` is covered by 59 unit tests with Dibsy and WATI mocked.
2. **A live paid webhook.** Dev has no `DIBSY_WEBHOOK_SECRET` and a test payment cannot be driven to `paid`. The webhook route is covered by its 68 unit tests; this run proves only the database half (detail settle → hub mirror).
3. **A live `so_invoices` settlement** (Step 4).
4. **`contract_invoices`** was not exercised separately; it shares the same sync and delete triggers and the cron filter.
