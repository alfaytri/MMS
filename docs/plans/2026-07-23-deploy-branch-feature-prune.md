# Deploy Branch — Prune Non-Shipping Features

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (or `superpowers:subagent-driven-development`) to work through the tasks below. Every step uses checkbox syntax for tracking.

**Goal:** On branch `deploy/warehouse-shipping` (already created at `50a769e2`), delete every feature the app is NOT shipping so `next build` produces a clean, typed, error-free bundle. The full codebase remains intact on `feature/purchase-warehouse-core` for future work — this branch is throwaway and rebuilt whenever deployment refreshes.

**Absolute rules — non-negotiable:**

1. **Do NOT restore any dropped DB tables.** The DB state on staging is what ships. If code queries a missing table, DELETE the code, not the query.
2. **Do NOT use `as any` / `unknown as X` casts** to silence type errors. Every fix is either a real type or a real deletion. If a file cannot be made type-clean without a cast, the file gets deleted.
3. **Do NOT add feature flags, ignoreBuildErrors, or tsconfig excludes** to hide errors. Delete the code instead.
4. **Do NOT commit until the user confirms** an entire wave (Wave 1 through Wave 5). Ping the user between waves for a confirm.
5. **Do NOT branch or merge.** Work entirely on `deploy/warehouse-shipping`.

**What ships (KEEP everything under these routes/features):**

Top nav from the user's screenshots is authoritative:

* **Root:** Dashboard (`src/app/(dashboard)/page.tsx`)
* **Master Data:** Inventory, Warehouses, Users & Roles, Audit Trail, Admin (`src/app/(dashboard)/master-data/{inventory,warehouses,users,audit-trail,admin}` — but NOT `master-data/teams`, NOT `master-data/admin/work-schedule`)
* **Reports:** Financial Dashboard, Product Profitability (`src/app/(dashboard)/reports/`)
* **Purchase & Sales — everything in the dropdown:**
  * Vendors & Clients: Suppliers, Customers
  * Purchase: Purchase Orders, Approvals, Receivals, Bills, Returns, Debit Notes, Aging Report
  * Sales: Sale Orders, Approvals, Invoices, Returns, Deliveries, Credit Notes, Customer Statement, Aging Report
  * Logistics & Reports: Shipments, Landed Costs, Dead Stock Report
* **Cross-cutting keep:** login/auth, layout shell, error boundaries, all shared UI components used by the above.

**What does NOT ship (candidates for deletion):**

* Customer-facing Orders (services orders, follow-up orders, site visits)
* Contracts + Quotations
* Services module (as a feature module — services table gone)
* Contact Centre (WATI, Whapi, 3cx integrations, sidebar, threads)
* Team Leader (TL invoices, TL orders)
* Teams / Employees / Vehicles / Schedules UI
* Map (traccar vehicle tracking)
* Payment portal (Dibsy `/pay` pages)
* Calendar (team calendar)
* API routes tied to any of the above

**Tech stack context:** Next.js 15 App Router. Deleting a folder under `src/app/` removes the corresponding route. TypeScript catches every dangling import via strict build. `next build` is the final oracle.

---

## Global Constraints

* Every commit includes both authors:
  ```
  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```
* Commit after **each wave**, only when user confirms. Wave = a logical group below.
* Verification cadence: `npx tsc --noEmit --skipLibCheck 2>&1 | grep -c "error TS"` after every deletion sub-step. Target 0 by end of Wave 5.
* Final oracle: `npx next build`. Must return exit 0 with a clean bundle.
* Migrations: **none.** This is a code-only prune.
* Do NOT touch `src/types/database.types.ts` — it reflects staging reality and is the source of truth.

---

## File Structure

**Deleted routes:**

* `src/app/(dashboard)/orders/`
* `src/app/(dashboard)/contracts/`
* `src/app/(dashboard)/quotations/`
* `src/app/(dashboard)/team-leader/`
* `src/app/(dashboard)/map/`
* `src/app/(dashboard)/calendar/`
* `src/app/(dashboard)/master-data/teams/`
* `src/app/(dashboard)/master-data/admin/work-schedule/` (if it exists as a sub-route)
* `src/app/(dashboard)/master-data/admin/contact-centre-extensions/` (contact centre)
* `src/app/pay/`

**Deleted API routes:**

* `src/app/api/3cx/`
* `src/app/api/contact-center/`
* `src/app/api/follow-up-requests/`
* `src/app/api/notifications/send-booking-confirmations/` (booking confirmations for the orders feature — verify by reading the file first)
* `src/app/api/orders/`
* `src/app/api/payments/dibsy/`
* `src/app/api/quotations/`
* `src/app/api/team-leader/`
* `src/app/api/traccar/`
* `src/app/api/wati/`
* `src/app/api/webhooks/` (only if it's the Wati/3cx-related webhooks — verify)
* `src/app/api/whapi/`

**Deleted component trees:**

* `src/components/contact-center/`
* `src/components/contracts/`
* `src/components/pay/`
* `src/components/orders/`
* `src/components/quotations/`
* `src/components/services/` (the services-module UI, NOT the services/inventory shared code — check imports)
* `src/components/team-leader/`
* `src/components/teams/`
* `src/components/master-data/AddressCreationSheet.tsx` etc. — verify one-by-one; keep anything used by the KEEP-list

**Deleted hooks:**

* `src/hooks/contact-center/`
* `src/hooks/useTeams.ts`, `useContracts.ts`, `useUpdateContract.ts`, `useCreateContractQuotation.ts`
* `src/hooks/useCreateOrder.ts`, `useOrderDetail.ts`, `useOrders.ts`, `useParentOrderForFollowUp.ts`
* `src/hooks/useQuotations.ts`, `useQuotationDetail.ts`
* `src/hooks/useServices.ts`, `useServiceCustomers.ts`, `useServiceInventoryLinks.ts` (if exists)
* `src/hooks/useCustomerLookup.ts` (uses `service_customer_phones`)
* `src/hooks/useProfileForContactCenter.ts` etc. — anything contact-center-specific

**Deleted lib:**

* `src/lib/3cx/`
* `src/lib/contact-center/`
* `src/lib/orders/`
* `src/lib/quotations/`
* `src/lib/contracts/` (if exists)
* `src/lib/dibsy.ts`

**Modified (nav + orchestrator cleanup):**

* `src/components/layout/TopNav.tsx` (or similar — the top-nav dropdowns)
* `src/components/layout/Sidebar.tsx` (if exists)
* `src/app/(dashboard)/layout.tsx` (remove ContactCenterSidebar, InboundCallStrip mounts)
* `src/middleware.ts` (remove `/pay`, `/api/wati/`, `/api/whapi/`, `/api/3cx/` from WEBHOOK_PREFIXES or public-route lists)
* `src/contexts/ContactCenterContext.tsx` (delete)
* Any file with `import { ContactCenterProvider }` — remove the wrapper
* Any file listing menu items that reference deleted routes

**Untouched:**

* `src/types/database.types.ts` — source of truth, do not edit
* `supabase/migrations/**` — schema is what it is
* All files backing Purchase & Sales / Master Data (Inventory, Warehouses, Users, Audit Trail, Admin) / Reports / Dashboard root

---

# Wave 1 — Delete top-level route trees

Goal: nuke the entire route trees for non-shipping features. This alone eliminates most of the TS errors because the code is gone.

### Task 1: Delete dashboard route trees

- [ ] **Step 1: Verify current branch**

  Run: `git branch --show-current`
  Expected: `deploy/warehouse-shipping`. If different, STOP.

- [ ] **Step 2: Delete dashboard route trees**

  ```bash
  rm -rf "src/app/(dashboard)/orders" \
         "src/app/(dashboard)/contracts" \
         "src/app/(dashboard)/quotations" \
         "src/app/(dashboard)/team-leader" \
         "src/app/(dashboard)/map" \
         "src/app/(dashboard)/calendar" \
         "src/app/(dashboard)/master-data/teams" \
         "src/app/pay"
  ```

- [ ] **Step 3: Check for admin sub-routes to delete**

  Run: `ls src/app/\(dashboard\)/master-data/admin/`
  If `work-schedule` or `contact-centre-extensions` appear, delete them:
  ```bash
  rm -rf "src/app/(dashboard)/master-data/admin/work-schedule"
  rm -rf "src/app/(dashboard)/master-data/admin/contact-centre-extensions"
  ```
  Leave the rest.

- [ ] **Step 4: Delete API route trees**

  ```bash
  rm -rf src/app/api/3cx \
         src/app/api/contact-center \
         src/app/api/follow-up-requests \
         src/app/api/orders \
         src/app/api/payments/dibsy \
         src/app/api/quotations \
         src/app/api/team-leader \
         src/app/api/traccar \
         src/app/api/wati \
         src/app/api/whapi
  ```

  For the ambiguous ones — read each first:
  * `src/app/api/webhooks/` — check what's inside. If it's Wati/3cx/Whapi callbacks: delete. If it's for shipments/Purchase: keep.
  * `src/app/api/notifications/send-booking-confirmations/` — read the route.ts. If it references `orders`, `services`, or `service_customers`: delete. Otherwise keep.

- [ ] **Step 5: Sanity — no leftover empty dirs**

  ```bash
  find "src/app/(dashboard)" -type d -empty -delete
  find src/app/api -type d -empty -delete
  ```

- [ ] **Step 6: Run typecheck — count errors**

  ```bash
  npx tsc --noEmit --skipLibCheck 2>&1 | grep -c "error TS"
  ```
  Record the number. It should be down from 2233. Expected: <1000 after Wave 1.

- [ ] **Step 7: Do not commit yet.** Continue to Wave 2.

---

# Wave 2 — Delete component + hook trees

Goal: nuke the components and hooks that back the deleted routes. Cannot be imported by anything alive because the callers are already gone.

### Task 2: Delete component trees

- [ ] **Step 1: Delete component directories**

  ```bash
  rm -rf src/components/contact-center \
         src/components/contracts \
         src/components/pay \
         src/components/orders \
         src/components/quotations \
         src/components/team-leader \
         src/components/teams
  ```

- [ ] **Step 2: Services components — verify shared vs feature**

  `src/components/services/` may contain both feature-services (services module) and inventory-adjacent shared code. Read filenames:

  ```bash
  ls src/components/services/
  ```

  If everything looks feature-specific (ServiceTree, ServiceEdit, PromotionsTab, ContractTreeRow), delete the whole folder.
  If some files are actually inventory helpers (rare), move them to `src/components/inventory/` first, then delete the rest.

  Default: `rm -rf src/components/services/`.

- [ ] **Step 3: Master-data one-offs**

  Read `src/components/master-data/` — a few files are contact-centre / services specific:
  * `AddressCreationSheet.tsx` (services)
  * `ServiceCustomerFormDialog.tsx` (services)
  * `EditUserDialog.tsx` — check if it has contact-centre extension fields; if so, strip them out surgically (do NOT delete the whole file — Users & Roles ships).
  * `AddUserDialog.tsx` — same as above.

  Delete the service-only ones. For dialog files that MIX shipping + non-shipping features (contact-centre extension inside Edit User): remove the contact-centre block, keep the rest.

- [ ] **Step 4: Delete hook trees**

  ```bash
  rm -rf src/hooks/contact-center
  rm  src/hooks/useTeams.ts \
      src/hooks/useContracts.ts \
      src/hooks/useUpdateContract.ts \
      src/hooks/useCreateContractQuotation.ts \
      src/hooks/useCreateOrder.ts \
      src/hooks/useOrderDetail.ts \
      src/hooks/useOrders.ts \
      src/hooks/useParentOrderForFollowUp.ts \
      src/hooks/useQuotations.ts \
      src/hooks/useQuotationDetail.ts \
      src/hooks/useServices.ts \
      src/hooks/useCustomerLookup.ts
  ```

  For ambiguous hooks (grep first):
  * `src/hooks/useServiceCustomers.ts` — references `service_customer_phones`. Delete.
  * `src/hooks/useSaleDeliveries.ts` — this IS the Sales → Deliveries feature. KEEP.

- [ ] **Step 5: Delete lib**

  ```bash
  rm -rf src/lib/3cx src/lib/contact-center src/lib/orders src/lib/quotations
  rm  src/lib/dibsy.ts
  ```

  If `src/lib/contracts/` exists: check contents, likely delete.

- [ ] **Step 6: Typecheck**

  ```bash
  npx tsc --noEmit --skipLibCheck 2>&1 | grep -c "error TS"
  ```

  Expected: <200 remaining, mostly from the orchestrator files that still import deleted paths.

- [ ] **Step 7: Do not commit yet.** Continue to Wave 3.

---

# Wave 3 — Fix orchestrator imports

Goal: kill every import that still references a deleted path. This is where the last few hundred errors live.

### Task 3: Clean top-nav + layout

- [ ] **Step 1: Locate the top-nav component**

  ```bash
  grep -rln "Purchase & Sales\|Master Data.*dropdown" src/components/layout src/components/nav src/app 2>/dev/null | head
  ```

  Look for the file that renders the top-nav dropdowns. It's likely `src/components/layout/TopNav.tsx` or similar.

- [ ] **Step 2: Remove menu items pointing at deleted routes**

  From the top-nav's menu structure, remove entries for: Orders, Contracts, Quotations, Team-Leader, Map, Calendar, Teams, Contact Centre, Pay portal.

  Keep exactly what appears in the user's screenshots:
  * Master Data → Inventory, Warehouses, Users & Roles, Audit Trail, Admin
  * Reports → Financial Dashboard, Product Profitability
  * Purchase & Sales → the full list from the screenshot

- [ ] **Step 3: Layout — remove Contact Centre mounts**

  Read `src/app/(dashboard)/layout.tsx` and remove:
  * `<ContactCenterProvider>` wrapper
  * `<ContactCenterSidebar />` / `<ContactCenterSidebarV2 />`
  * `<InboundCallStrip />`
  * Any related state/context

  Delete `src/contexts/ContactCenterContext.tsx` after the layout is clean.

- [ ] **Step 4: Middleware**

  Read `src/middleware.ts`. Remove any entries referring to `/pay`, `/api/wati/`, `/api/whapi/`, `/api/3cx/`, `/api/payments/dibsy/`, `/api/team-leader/`, `/api/quotations/`, `/api/orders/`. These will be in `WEBHOOK_PREFIXES` or public-route arrays.

- [ ] **Step 5: Delete any remaining top-level orchestrator files**

  Grep for imports from deleted paths:
  ```bash
  npx tsc --noEmit --skipLibCheck 2>&1 | grep -oE "Cannot find module '[^']+'" | sort -u | head -30
  ```

  For each, decide: is the importer part of shipping features?
  * If YES: remove the import line + any usage.
  * If NO: delete the importer too.

- [ ] **Step 6: Typecheck**

  ```bash
  npx tsc --noEmit --skipLibCheck 2>&1 | grep -c "error TS"
  ```

  Expected: <50 remaining.

- [ ] **Step 7: Ask user for a checkpoint**

  Message the user:
  > "Waves 1–3 done. Route trees + component/hook trees + orchestrator cleaned. Type error count went from 2233 to N (report). About to commit and continue to Wave 4 (chip through remaining errors). Confirm to proceed."

- [ ] **Step 8: Commit Waves 1–3 together after user confirms**

  ```bash
  git add -A
  git commit -m "$(cat <<'EOF'
  prune(deploy): remove non-shipping features from deploy branch

  Deletes the feature areas that this deploy branch does not ship, per the
  top-nav specification from the user's screenshots. Root work stays intact
  on feature/purchase-warehouse-core; this branch is throwaway and reflects
  only what deploys.

  Deleted routes / features:
    • Customer Orders (services orders, follow-up orders, site visits)
    • Contracts + Quotations
    • Services module UI
    • Contact Centre (WATI, Whapi, 3cx, sidebar, threads)
    • Team Leader (TL orders, TL invoices)
    • Teams / Employees / Vehicles / Schedules
    • Map (traccar)
    • Calendar
    • Payment portal (Dibsy /pay pages)

  All corresponding API routes, hooks, components, and lib helpers gone.
  Top-nav trimmed. Layout no longer mounts Contact Centre. Middleware
  cleaned of deleted-route entries.

  No DB tables touched. No `as any` casts introduced. No ignoreBuildErrors
  hacks. The build was made clean by removing dead code, not by hiding it.

  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

# Wave 4 — Chip through remaining errors

Goal: fix the last handful of files that still don't compile. Each remaining error should be one of three cases:

1. **Real bug in a shipping file** — a stale schema reference in a page that IS shipping. Fix by renaming the column or using the correct current table.
2. **Import from a deleted path** — the importer is a shipping file. Remove the import + any related code that used it.
3. **Small helper used only by deleted features** — the helper itself is dead. Delete it.

### Task 4: Fix or delete each remaining error

- [ ] **Step 1: Full error list**

  ```bash
  npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | tee scratchpad/remaining-errors.txt
  wc -l scratchpad/remaining-errors.txt
  ```

- [ ] **Step 2: Group by file**

  ```bash
  awk -F'(' '{print $1}' scratchpad/remaining-errors.txt | sort | uniq -c | sort -rn
  ```

  Work through each file top-down. For each:

- [ ] **Step 3: Per-file triage — pick one of:**

  * **(a) Real fix.** If the file is a shipping file with a schema-drift error, fix the specific reference. Example: `.from('service_customer_phones')` → `.from('customer_phones')`. Change columns to their current names based on `database.types.ts`. No `as any`. If a column is genuinely gone, remove that UI element / column from the file entirely.

  * **(b) Delete importer.** If the erroring file is dead (was only used by deleted routes), delete the file. Verify: `grep -rn "from '@/path/to/file'" src/ | head`. If no live importers, delete.

  * **(c) Cascade delete.** If deleting the importer breaks a further consumer, delete that too. Follow the chain until no live route depends on the removed files.

- [ ] **Step 4: After each file fixed / deleted, re-run**

  ```bash
  npx tsc --noEmit --skipLibCheck 2>&1 | grep -c "error TS"
  ```

  Expected: monotonically decreasing.

- [ ] **Step 5: Repeat until zero errors.**

- [ ] **Step 6: Ask user for Wave 4 checkpoint**

  > "Wave 4 done. TypeScript is clean. About to run `next build` for final verification. Confirm to proceed."

- [ ] **Step 7: Commit Wave 4**

  ```bash
  git add -A
  git commit -m "$(cat <<'EOF'
  prune(deploy): fix / delete remaining schema-drift errors

  Chips through the last N type errors post-prune. Each was either:
    • a shipping file with a stale column name (fixed to current schema); or
    • dead code that survived Wave 3 because it wasn't in a deleted tree
      (deleted here).

  No `as any` casts, no ignoreBuildErrors.

  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

# Wave 5 — Final build

Goal: `npx next build` returns exit 0 with a real production bundle.

### Task 5: Build

- [ ] **Step 1: Clean prior build cache**

  ```bash
  rm -rf .next
  ```

- [ ] **Step 2: Run production build**

  ```bash
  npx next build 2>&1 | tee scratchpad/build.log | tail -50
  ```

  Expected: `Compiled successfully`, `Linting and checking validity of types` passes, and the summary of routes at the end shows only shipping pages.

- [ ] **Step 3: Handle lint warnings**

  ESLint warnings (unused vars, etc.) are OK — they don't fail the build. TS errors would fail. If a TS error surfaces here that `tsc --noEmit` missed (rare), fix it and re-run.

- [ ] **Step 4: Sanity — the routes list**

  From the build output's page list, verify every printed route is in the ship list. If a deleted route still shows, something in Wave 1 was missed — hunt it down.

- [ ] **Step 5: Ask user for final confirmation**

  > "next build passed. Deploy branch is ready. Routes list:
  > <paste the routes summary from build output>
  > Confirm to commit final state."

- [ ] **Step 6: Commit if any last cleanup was done**

  If Waves 1–4 already committed everything, this step is a no-op. Otherwise commit.

---

# Testing Strategy

**No automated tests exist for these deletions.** Verification is:

1. `tsc --noEmit --skipLibCheck` → 0 errors
2. `next build` → exit 0
3. Manual: user reviews the routes list from the build output and confirms only shipping routes appear
4. Post-deploy: smoke-test each item in the top nav (Master Data → Inventory, Reports → Financial Dashboard, Purchase & Sales → each item) to confirm they still load

---

# Risks & Rollback

| Risk | Mitigation |
|---|---|
| Deleting a component that was silently used by a shipping page. | Typecheck catches it — `Cannot find module` error surfaces in Wave 3 / Wave 4. Fix by re-adding the import target OR removing the usage on the shipping page. Never restore by copying from `feature/purchase-warehouse-core` — if a shipping page needs it, that's a separate design decision. |
| A migration on `feature/purchase-warehouse-core` (not yet in develop) has a hidden dep on a deleted table. | Not this branch's problem. `deploy/warehouse-shipping` is throwaway; the migration lives on the source branch. |
| Cross-file import chains not caught by typecheck (e.g. dynamic `import()`). | Rare in this codebase. If it happens, `next build` will surface a "cannot resolve" error at bundle time. Fix by removing the dynamic import call. |
| Someone accidentally commits deletions to `feature/purchase-warehouse-core` instead of the deploy branch. | Wave 1 Step 1 checks `git branch --show-current`. Abort if wrong. |
| The user later wants to ship one of the deleted features. | Bring it back from `feature/purchase-warehouse-core` in a new deploy branch OR merge selectively. Deletions never propagate back to the develop / feature branches. |

**Rollback:** `git reset --hard 50a769e2` on this branch → full pre-prune state. Every deletion is reversible from source-branch history. This branch is throwaway by design.

---

# Self-Review Checklist

- ✅ **Absolute rules encoded up-front** — no restores, no `as any`, no `ignoreBuildErrors`, no branch/merge, no commits without user confirm.
- ✅ **Deletion targets grouped by concern** — routes / API / components / hooks / lib / orchestrator / middleware.
- ✅ **Ambiguous files flagged for verify-before-delete** — `webhooks/`, `notifications/send-booking-confirmations/`, `master-data/EditUserDialog.tsx`.
- ✅ **Every wave ends with a typecheck** — monotonic decrease is the acceptance signal.
- ✅ **User checkpoint between Waves 3 → 4 and 4 → 5** so a fresh session can pick up mid-plan.
- ✅ **Final oracle is `next build`, not tsc alone** — matches how the user validates.
- ✅ **Nothing depends on the DB** — this is a pure code prune. Safe to run offline.
