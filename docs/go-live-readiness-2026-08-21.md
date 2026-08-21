# MMS — Go-Live Readiness Report

**Date:** 2026-08-21
**Branch audited:** `deploy/warehouse-shipping`
**Production target:** Supabase `optishfnnctrhffpoywg` (new-prod) · Vercel
**Method:** Five parallel read-only audits — Security & Access, Financial Correctness, External Integrations, Ops/Deploy/Deps, Functional/UX. Every finding is evidence-backed with `file:line` references.

---

## Bottom line

**This is a well-built system.** The database security is genuinely strong (RLS on every table, money tables write-locked, approval chains + guard triggers correct), the core financial engine (PO approval, FIFO, FX gain/loss, returns dual-ledger, bill recompute) is verified correct, there are **no broken workflows and no dead-end pages**, and the type-check is clean (0 errors).

There are **5 go-live blockers** — **2 are operator config steps** (not code) and **3 are focused code fixes**. None require redesign. Beyond those, a short list of "fix before real volume" items and cleanup.

**Scope note:** this branch is a deliberately pruned **back-office ERP**. A prune commit removed **Dibsy (payments), WhatsApp (WATI/WHAPI), and the Contact Centre**; field Work Orders / Quotations-as-a-module / Team-Leader mobile are not shipped here either. The old README still advertises them — that's documentation drift, corrected below.

---

## 🔴 GO-LIVE BLOCKERS (do before real use)

### B1 — Enable `custom_access_token_hook` in new-prod Auth  *(operator, 2 min)*
**What:** A Supabase dashboard toggle, not code. If it's off on `optishfnnctrhffpoywg`, every user's login token ships **without division claims** → the division switcher and **all division-scoped financials/reports silently break** for everyone.
**Do:** new-prod Dashboard → Authentication → Hooks → enable *Customize Access Token (JWT) Claims* → point at `custom_access_token_hook`. Then log in and confirm a fresh token carries the division claim.

### B2 — Set the 5 required env vars in Vercel, pointed at new-prod  *(operator, 5 min)*
**What:** If these are missing or still point at staging, PDFs/reports 500, the admin gate fails, or prod talks to the **wrong database**.
**Required:** `NEXT_PUBLIC_SUPABASE_URL` (must be `optishfnnctrhffpoywg`, not staging `mwvblpgbgxipvrevkeff`), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_BOOTSTRAP_EMAIL`, `NEXT_PUBLIC_ADMIN_BOOTSTRAP_EMAIL` (must equal the previous). Full list in Appendix A.

### B3 — Document/PDF API routes authenticate but don't authorize  *(code)*
**Where:** `src/app/api/sales/invoices/[id]/pdf/route.ts:17-51`, `sales/customers/[id]/statement/pdf/route.ts:14-32`, and **9 sibling routes** (deliveries, warranty-cert, credit-note, quotation, bill, PO, receival-check, receival-receipt, returns).
**What:** They check the login token but then run as `service_role` (which bypasses RLS) **without checking permission or division**. Any logged-in employee — even a low-privilege one scoped to one division — can pull **any** customer's statement / any invoice / any PO as a PDF by changing the ID in the URL. That's a systemic bypass over financial data + PII.
**Fix:** Add one shared authorization helper (mirror the correct `requireReportsPermission` in `src/lib/reports/reports-auth.ts:33`) and call it in each route after auth — assert the relevant `*.view` permission + division visibility.

### B4 — Sales credit-limit approval bypassable via "Save as Quotation → Confirm"  *(code)*
**Where:** `src/hooks/useSaleOrders.ts:829-848` (`useConfirmSO` does a direct `status='confirmed'` write with no credit check); button gated at `sales/orders/page.tsx:380`.
**What:** The credit check only runs at *creation* for `intent='confirm'`. Save an order as a quotation (always allowed, no check), then click **Confirm** — it flips straight to confirmed and auto-creates the AR invoice, **skipping the entire credit-approval chain**. Two clicks defeat the credit control for an over-limit customer.
**Fix:** Route `quotation → confirmed` through a SECURITY DEFINER RPC that re-runs the credit check and forces `pending_approval` + builds the approval chain when over limit (mirroring `create_sale_order`).

### B5 — Customer credit ceiling changeable with no approval  *(code)*
**Where:** `src/hooks/useSaleOrders.ts:354-463` (`useUpdateCustomer` writes `credit_group_id` directly); no guard trigger on `customers` (cross-confirmed by the security audit — `customers` is absent from the guard-trigger list).
**What:** The proper path requires a submitted change + CR + Establishment ID + signed form + approval. But anyone with the customer-edit screen can set `credit_group_id` to a higher-limit group **directly**, instantly raising the ceiling with none of that.
**Fix:** Add a guard trigger on `customers` blocking direct `credit_group_id` changes (force through the existing `submit/approve_credit_group_change` RPC); remove `credit_group_id` from the `useUpdateCustomer` patch.

---

## 🟠 STRONGLY RECOMMENDED BEFORE LAUNCH

### R1 — PDF routes have no `maxDuration` → invoices/POs can 504 on a cold start  *(code, trivial)*
~13 puppeteer document routes set `runtime='nodejs'` but no `maxDuration`. Chromium's cold-start render regularly exceeds the platform default → the function is killed and the user gets an opaque 504 on core documents. **Fix:** add `export const maxDuration = 30` (or 60) to each puppeteer route, or a global `functions` block in `vercel.json`.

### R2 — Stock posting isn't idempotent → a retry/double-click can double-post  *(code)*
`create_and_approve_receival` and `create_and_confirm_delivery` generate a new number every call, so a retried submit posts a **second** receival/delivery — duplicate FIFO layers, doubled stock, doubled COGS. **Fix:** accept a client idempotency token and no-op on repeat; at minimum confirm the submit buttons disable while saving.

### R3 — Shipment tracking can silently fail  *(code — only if 17track is used in prod)*
`client17track.ts:66-72` doesn't check `res.ok`; a 17track API error returns "success, 0 events, no error," and the route clears `sync_error` and returns 200. Separately, no fetch timeout means a hung 17track call leaves a shipment **permanently stuck** (`is_syncing=true`, 409 forever). **Fix:** throw on API error; add `AbortSignal.timeout(~8s)` + a stale-lock reset.

### R4 — Delete the `/sentry-test` page  *(code, 1 min)*
`src/app/(dashboard)/sentry-test/page.tsx` is a temporary page (self-labelled "DELETE") with a button that throws an unhandled error — reachable by any logged-in user. Remove before go-live.

---

## 🟡 FIX SOON AFTER (medium)

- **Turn on Sentry for launch day.** It's fully off until `NEXT_PUBLIC_SENTRY_DSN` (+ `SENTRY_ORG/PROJECT/AUTH_TOKEN`) are set in Vercel — meaning **zero error visibility** on go-live day. Also: handled 500s in API routes are caught and never sent to Sentry (add `Sentry.captureException` in the catch blocks).
- **List pages have no error state.** A failed load (network/RLS/DB) renders the friendly "No records / Create your first…" screen, so an operator can't tell "empty" from "broken." The shared `DataTable` has no error branch. Add one.
- **Direct-write status guards missing** on `stock_adjustments`, `receivals`, and `so_po_returns` — a client can set `status='approved'`/`restocked` directly, marking a document done **without** the inventory side-effect (workflow desync, not stock/money loss). Add guard triggers or route through the RPCs.
- **Purchase Orders list is hard-capped at 50 rows** with client-side filtering — once you pass 50 POs, older ones become invisible in the list and the "Total POs / Total Value" cards understate. Move filters + pagination server-side before real volume. (Server search by PO#/supplier still finds them.)

---

## ⚪ CLEANUP (low / housekeeping)

- **README is stale** — wrong env vars (omits the ones actually required, over-lists the pruned Dibsy/WATI ones), tells you to link the frozen dev DB, says "push to main" (actual: `deploy/warehouse-shipping`), lists the wrong PDF library. Refresh from Appendix A.
- **Confirm live migration parity:** run `npx supabase migration list --linked` against **both** staging and new-prod and confirm identical applied sets. (The `migrations-staging/` folder is a refreshed squashed baseline — no functional gap found — but the repo alone can't prove live alignment.)
- Dead webhook prefixes (`dibsy`, `3cx`) in `middleware.ts:7` — remove (they're standing no-auth allowances for routes that don't exist).
- Add `*.key` to `.gitignore` (has `.env*`, `*.pem`; no secrets are currently tracked).
- Dead/duplicate code: `useApproveSO` (broken, always errors), `money.ts` `roundMoney`/`computeDiscount` (unused), `/purchase/approval-settings` (orphan duplicate of the admin one), stale `route-permissions.ts` entries for pruned modules.
- Minor: `deduct_fifo_layers` cache has no zero-floor; `cancel_delivery_inventory` restocks at the wrong FIFO date; QNAS address lookup is unauthenticated with a where-clause injection vector (low impact, public gov endpoint); login email-enumeration (accepted for internal use); fixed-pixel columns in the PO/SO line-item editors.

---

## 🟢 WHAT'S ALREADY SOLID (verified, no action)

- **Security:** RLS enabled on every table; anon/SECURITY-DEFINER execute locked down (three sweeps); money tables write-locked; admin routes gated on DB role + rate-limited + audited; no hardcoded secrets; no authorization reads user-editable metadata. *(Note: the old memory item "sale_orders has no status guard" is now resolved — a guard was added in `20260819110000`.)*
- **Financial engine:** PO approval chain (advisory locks, four-eyes, Owner-gated force-approve), FX gain/loss (booked rate captured and reused, not recomputed live), returns dual-ledger (balanced, closes only when both sides reach zero), FIFO core (row-locked, over-draw-safe), bill recompute (idempotent) — all correct.
- **Integrations:** 17track webhook HMAC signature check is correct and fail-closed; every Supabase Storage upload checks for errors; PDF routes surface real error messages and always close the browser (no leaked Chromium); brand-logo fetch degrades gracefully.
- **Functional/UX:** every nav entry resolves to a real data-backed page; all core workflows have complete UI paths; mobile navigation exists; loading + empty states present throughout.
- **Build:** `tsc --noEmit` → 0 errors.

---

## ✅ Operator go-live checklist

**Manual steps only you can do (dashboards):**
1. [ ] **B1** — Enable `custom_access_token_hook` in new-prod Supabase Auth, verify a fresh JWT has the division claim.
2. [ ] **B2** — Set the 5 required env vars in Vercel (Appendix A), Supabase vars pointing at `optishfnnctrhffpoywg`.
3. [ ] Turn on Sentry (`NEXT_PUBLIC_SENTRY_DSN` + build tokens) for launch-day visibility.
4. [ ] Run `npx supabase migration list --linked` on staging **and** new-prod; confirm identical applied sets.
5. [ ] Supabase Pro spend-cap ON; confirm daily backups are running (see the separate cost/infra decision).

**Code fixes (I can do these):** B3, B4, B5 (blockers) + R1, R2, R3, R4.

---

## Appendix A — Required env vars (this build)

**Required in Vercel prod (app breaks without them):**
| Var | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Must be `optishfnnctrhffpoywg`, not staging |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | |
| `SUPABASE_SERVICE_ROLE_KEY` | Missing → all PDF/report routes 500 |
| `ADMIN_BOOTSTRAP_EMAIL` | Server admin gate + first-user bootstrap |
| `NEXT_PUBLIC_ADMIN_BOOTSTRAP_EMAIL` | Client admin gate — must equal the above |

**Monitoring (off until set; recommended before launch):** `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`.

**Only if shipment tracking is used in prod:** `SEVENTEEN_TRACK_API_KEY`, `SEVENTEEN_TRACK_WEBHOOK_SECRET`.

**NOT needed for this build (pruned modules):** `DIBSY_*`, `WATI_*`, `WHAPI_*`, `3CX_*`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ENABLED_MODULES` (removed 2026-08-13).

---

## Appendix B — Dependency advisories (6, ranked by real risk here)

`npm audit` = 2 moderate + 4 high, **0 critical**. None anonymously exploitable in a prod request path:
- **xlsx** (proto-pollution/ReDoS, no fix) — only reachable by an **authenticated operator uploading a crafted .xlsx**. LOW. Track; plan to migrate the import parser to `exceljs` (already a dep).
- **sharp** — only via Next Image optimizer; no untrusted-image pipeline configured. LOW.
- **next/postcss** — build-time parsing of the app's own trusted CSS. LOW.
- **exceljs → uuid** — ID generation only (v4), not the vulnerable code path. Negligible.

Post-launch: a single Next 16 upgrade clears next/postcss/sharp; dropping `xlsx` clears the last one.
