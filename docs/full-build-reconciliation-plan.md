# Full-Build Reconciliation Plan

> **Status:** Plan / first-pass manifest — **nothing executed yet** (no branches created, no migrations run). Awaiting sign-off on the open decisions in [§9](#9-open-decisions--blocking).
> **Author:** planning session 2026-08-22
> **Branches involved:** `deploy/warehouse-shipping` (live, pruned build) · `feature/full-app-modules` (= `develop`, the stale full build) · a new `full-build/*` family (this plan).

---

## 1. Goal (plain English)

There are two versions of the app:

- **The full app** (`feature/full-app-modules`) — has **every** module, but has sat untouched for ~a month.
- **The shipping app** (`deploy/warehouse-shipping`) — modules we didn't need were **removed**, then it got **a month of improvements** to what was left (inventory, purchase, sales, warehouse, warranty, projects…). Along the way a lot of things were **renamed/reorganized** internally.

**We want one "full build" = all the modules back + all the shipping improvements.** The shipping app stays lean and untouched. We do **not** merge into `deploy/warehouse-shipping` directly.

---

## 2. Why not a direct merge / mass cherry-pick

The improvements aren't a tidy set of commits: shipping is **1316 commits** ahead of the split point (`b7e0690f`, 2026-07-21), with schema renames (`profiles→user_data`, `brand_variants→inventory_item_brand_variants`, dropped compat views) and file moves. Forcing the two together would either re-delete the modules or produce thousands of conflicts.

**So we go the cheap direction that lands the same result:** start from a copy of shipping (inherits all improvements + the current schema for free) and **re-add the modules on top**, adapting each to the renamed schema.

---

## 3. Branch strategy (as agreed)

```
deploy/warehouse-shipping (LIVE — never touched)
        │  duplicate
        ▼
full-build/base ............... the Inventory + PO + SO core (= shipping's current tree)
        │  cut one branch per module (in dependency order)
        ├─▶ full-build/foundations ....... customers/addresses · services · teams
        ├─▶ full-build/orders ............ orders · site-visits · follow-ups
        ├─▶ full-build/calendar-map ...... calendar · map · GPS
        ├─▶ full-build/team-leader ....... TL app · TL invoices
        ├─▶ full-build/contracts-quotations
        ├─▶ full-build/contact-centre .... WhatsApp/Wati · 3CX · offline sync
        └─▶ full-build/admin-misc ........ admin · promotions · subscriptions · notif config
        │  merge each finished module branch back, in order
        ▼
full-build/base  ==  THE FULL BUILD (everything + all improvements)
```

- `full-build/base` is both the **starting point** each module branch is cut from **and** the **integration line** they merge back into (in dependency order). We tag its start so a pristine "core only" point is recoverable.
- Each module branch is independently built, migrated, and operator-smoked before it merges back.
- `feature/full-app-modules` is **read-only source material** — we copy files *out* of it; we never build on it.

---

## 4. The port set (what only exists on the full-app side)

**445 files** live on `feature/full-app-modules` but not on shipping. Regenerate the exact list anytime with:

```bash
git ls-tree -r --name-only feature/full-app-modules -- src supabase/migrations | sort > /tmp/fa.txt
git ls-tree -r --name-only deploy/warehouse-shipping   -- src supabase/migrations | sort > /tmp/sh.txt
comm -23 /tmp/fa.txt /tmp/sh.txt          # = the port set
```

Component folders that are full-app-only (file counts): `contact-center` (38) · `teams` (30) · `services` (29) · `team-leader` (22) · `orders` (22) · `calendar` (16) · `contracts` (15) · `map` (10) · `quotations` (4) · `orders-invoices` (3).

---

## 5. Module manifest (first pass — verify file-by-file at the start of each branch)

Dependency order matters: **foundations first**, contact-centre last.

### 5.1 `full-build/foundations` — customers · services · teams
*Everything else depends on these.*
- **Routes:** `master-data/services` (+ `services/approvals`, `service-customers`), `master-data/teams`.
- **Components:** `services/` (29), `teams/` (30).
- **Hooks:** `useServices`, `useServiceBrands`, `useServiceCustomers`, `useServiceChangeRequests`, `useTeams`, `useTeamSkills`, `useTeamLocations`, `useTeamOvertimeReport`, `useTeamServiceFilter`, `useCustomerAddresses`, `useCustomerLookup`, `useCustomerHistory`, `useBlueplate`.
- **Tables (verify vs DB):** services tree, teams/employees/team-assignments, `customer_addresses` (may partly exist on shipping), Qatar blue-plate. `country_codes` already on shipping.
- **Notes:** `customers`/`customer_addresses` exist on shipping in some form — reconcile, don't duplicate.

### 5.2 `full-build/orders` — orders · site-visits · follow-ups
- **Routes:** `orders/` (5 files).
- **Components:** `orders/` (22).
- **Hooks:** `useOrders`, `useCreateOrder`, `useOrderDetail`, `useEditOrder`, `useOrderActions`, `useOrderLocations`, `useDeductOrderStock`, `useSiteVisits`, `useSiteVisitDetail`, `useCreateFollowUpRequest`, `useFollowUpRequest(s)`, `useParentOrderForFollowUp`.
- **Tables (verify):** `orders`, `order_services`, `order_team_assignments`, `order_log`, `installed_products`, site-visit + follow-up tables.
- **Depends on:** foundations (services, teams, customer addresses).

### 5.3 `full-build/calendar-map` — calendar · map · GPS
- **Routes:** `calendar/` (1), `map/` (1).
- **Components:** `calendar/` (16), `map/` (10).
- **Hooks:** `useCalendarVisits`, `useCalendarSchedule`, `useWeekCapacity`, `useDateAvailability`, `useGpsTracking`, `useTraccar`, `useTeamLocations`, `useOrderLocations`.
- **Tables (verify):** team-location tracking; mostly reads orders/assignments.
- **External:** **Traccar** GPS device tracking (config + endpoint).
- **Depends on:** orders, foundations.

### 5.4 `full-build/team-leader` — TL app · TL invoices
- **Routes:** `team-leader/` (1), `invoices/` (4).
- **Components:** `team-leader/` (22), `orders-invoices/` (3).
- **Hooks:** `useTeamLeaderOrders`, `useTeamLeaderIdentity`, `useVisitPaymentStatus`, `useWarehouseFieldRPs`, `useTlInvoices`, `useInventoryLedger`.
- **Migrations (CONFIRMED missing on shipping — the only 5 full-app-only migration files):**
  `20260716130000_tl_invoice_payments.sql`, `20260717100000_tl_invoice_number_format.sql`, `20260717100100_tl_invoice_number_sinv_prefix.sql`, `20260717110000_tl_invoices_pdf_url.sql`, `20260717120000_get_team_leader_visits_extend.sql`.
- **Tables:** `tl_invoices`, `tl_invoice_payments`, `get_team_leader_visits` RPC.
- **Depends on:** orders. **Overlap:** TL invoices vs shipping's sales invoices (see [§8](#8-overlaps-to-reconcile)).

### 5.5 `full-build/contracts-quotations` — contracts · quotations
- **Routes:** `contracts/` (4), `quotations/` (4).
- **Components:** `contracts/` (15), `quotations/` (4).
- **Hooks:** `useContracts`, `useContractDetail`, `useContractSchedule`, `useUpdateContract`, `useContractQuotations`, `useCreateContractQuotation`, `useQuotations`, `useQuotationDetail`, `useCreateQuotation`.
- **Tables (verify — baseline defines them):** `contracts`, `contract_services`, `contract_milestones`, `contract_payments`, `order_quotations` (+ line items/log).
- **Overlap:** the **MEP quotation** work (`feature/mep`) and the sales-order `status='quotation'`. Decide before building.

### 5.6 `full-build/contact-centre` — WhatsApp/Wati · 3CX · offline sync  ⚠️ biggest + external deps
- **Routes:** `admin/contact-centre/purge`, `master-data/admin/contact-centre-extensions` (main CC is a global sidebar in `components/contact-center`, not a route group — confirm mounting).
- **Components:** `contact-center/` (38).
- **Hooks:** `contact-center/*` (`useLiveConversations`, `useChatMessages`, `useClickToCall`, `useWhatsAppWindow`, `useProviderSuggest`, `useContactCenterState`, `useCustomerData`, `useLiveThread`, `useLivePolledInboundCalls`, `useAddressState`, `useScrollSnapArrows`) + `contact-center/local/*` offline sync (`useLocalConversations/Messages/Orders/Customer`, `useSyncStatus`, `useSyncWorker`, `useTeamPhones`).
- **Tables (verify — largely new):** conversations, messages, customer phones, team phones, sync state.
- **External:** **Wati** (WhatsApp) + **3CX** (dialer) — webhook routes (must be in `WEBHOOK_PREFIXES` + validate their own secret/HMAC per the security checklist), env vars/secrets, Supabase Realtime channels (respect the Supabase Budget rules).
- **⚠️ Was deliberately excluded from the shipping go-live** — confirm it's genuinely in scope for the full build.

### 5.7 `full-build/admin-misc` — admin · promotions · subscriptions · notifications
- **Routes:** `admin/` (2).
- **Hooks:** `useNotificationConfig`, `useProviderSetting`, `usePromotions`, `useSubscriptionPackages`.
- **Notes:** reconcile the `admin` route group against shipping's `master-data` admin surfaces; decide which misc features are still wanted.

---

## 6. Migrations & the target database

The operator's point — **"the current build doesn't have those tables"** — is the crux of the DB work.

- The migration **file** diff is unreliable (shipping rebaselined → only 5 files differ), so **table presence must be verified against the actual target DB per module**, not inferred from files. The TL-invoice set (§5.4) is the one confirmed-missing group.
- For each module branch: (1) list its tables; (2) check which exist on the target DB; (3) **re-author adapted migrations** for the missing ones — including **RLS enable + policies** (security checklist), adapted to renamed tables; (4) apply, following the migration self-check rules; (5) mirror into `supabase/migrations-staging/`.

**Blocking decision — which database does the full build use?** It needs **all** module tables, so it must **not** be the lean prod DB (`optishfnnctrhffpoywg`) — adding field-service/contact-centre tables there would pollute the lean deployment. Options: a dedicated new Supabase project for the full build, or a dedicated staging DB. **Decide before any migration runs** (see [§9](#9-open-decisions--blocking)).

---

## 7. Per-module workflow (repeat for each branch)

1. `git switch full-build/base && git switch -c full-build/<module>`.
2. **Bring files over:** `git checkout feature/full-app-modules -- <the module's paths>` (routes + components + hooks + lib + types + tests).
3. **Cherry-pick refinements** where they apply (e.g. TL: the 5 migrations + the TL card-detail / Orders-Invoices commit series).
4. **Adapt to the renamed schema:** `profiles→user_data`, `brand_variants→…`, dropped compat views, changed hook signatures, permission catalog (`NAV_TREE` in `PermissionTree.tsx`), nav (`NAV_ITEMS` in `nav-config.ts`), `queryKeys`, `route-permissions`. Iterate to `tsc` + `eslint` clean.
5. **Migrations:** re-author + apply the module's missing tables/RPCs to the full-build DB (staging-style first), mirror to `migrations-staging/`.
6. **Wire nav + permissions** so the module appears for the right roles.
7. **Operator smoke** the module end-to-end.
8. **Merge** `full-build/<module>` → `full-build/base`.

---

## 8. Overlaps to reconcile

| Overlap | Detail |
|---|---|
| **Invoices** | full-app `/invoices` (`tl_invoices`, field-service) vs shipping sales invoices (`tl_invoices` vs `public.invoices` — known gotcha). Decide how the two invoice worlds coexist. |
| **Quotations** | full-app `quotations` route + `order_quotations` vs the new **MEP quotations** (`feature/mep`) vs sales-order `status='quotation'`. Unify naming/surfaces. |
| **Services / Teams** | land under the existing `master-data` route group (shared) — reconcile with shipping's master-data, don't fork it. |
| **Admin** | full-app `admin` route group vs shipping's `master-data` admin surfaces. |
| **Customers / Addresses** | exist on shipping already — extend, don't duplicate. |

---

## 9. Open decisions — blocking

1. **Target database for the full build** — dedicated new Supabase project, or a dedicated staging DB? (Blocks all migration work; must not be the lean prod DB.) → **DECIDED 2026-08-22: port code first, choose the DB later.** Migrations are deferred; ported modules compile but stay non-functional at runtime until a DB is chosen.
2. **Contact-Centre in scope?** — it's the biggest module and pulls in external integrations (Wati/WhatsApp, 3CX, Traccar) + secrets + webhooks; it was deliberately excluded from the shipping go-live. → **DECIDED 2026-08-22: in scope, but built LAST** (after every other module is stable).
3. **Branch names** — `full-build/*` family OK, or a different prefix (e.g. the operator's "Inventory-PO-SO" for the base)?
4. **Long-term model** — after this reconciliation, make the **full build the superset trunk** and derive the lean build by *removing* module dirs (deleting is trivial; re-adding is what cost us this exercise). Otherwise the two will drift 1316-deep again.

---

## 10. Immediate next steps

**Decisions locked (2026-08-22):** code-first (migrations deferred until a DB is chosen) · Contact-Centre built last.

**Build order (dependency-ordered):** foundations → orders → calendar-map → team-leader → contracts-quotations → admin-misc → **contact-centre (last)**.

1. ✅ `full-build/base` created as a duplicate of `deploy/warehouse-shipping` (+ tag `full-build/base-start`).
2. Build `full-build/foundations` first — exact file list generated (services / teams / customers).
3. **Interdependency note:** the field-service modules cross-import (a Services component may pull from Orders/Calendar/etc.), so module branches **stack in dependency order** rather than each branching off base in isolation, and a fully `tsc`-clean state only lands once a module's dependencies are also present. Migrations are skipped for now (code-first).

---

## 11. Execution log

**2026-08-22 — foundations ported.** `full-build/base` created off `deploy/warehouse-shipping` (+ tag `full-build/base-start`). `full-build/foundations` built off base: **83 files** imported (services / teams / customers + leaf deps: ServiceCustomerFormDialog, useNotificationConfig/usePromotions/useTraccar, lib/traccar, contact-center/normalise-phone), **import closure achieved**, `profiles → user_data` rename applied in `useTeams.ts`. Commits `3efdd4a5` (import) · `cd576e85` (closure) · `728f2c1a` (rename).

**Finding — the code needs its table TYPES, not just files.** A full `tsc` = **1099 errors, ALL inside the foundation files** (the shipping base is 100% clean). ~950 are `.from('teams'/'services'/…)` returning untyped rows because those tables were pruned out of `src/types/database.types.ts` (base 10,744 lines vs full-app 11,718). The tables' *types* come from the DB via `supabase gen types`.

**Decision (2026-08-22) — "port all code now, verify after DB":**
- **Per module:** import the files + resolve import closure + apply obvious *pure-code* fixes (e.g. table renames), then commit. **Do NOT chase `tsc`** — the untyped-row errors are DB-dependent and expected.
- **Branches stack:** orders off foundations, calendar-map off orders, … (deps present as the stack grows).
- **Final phase (after the DB target is chosen):** create all module tables → `supabase gen types` (clears the ~1099 wholesale) → `tsc` → fix genuine residual (renamed shared symbols, changed signatures) → wire nav + permissions → smoke → the top of the stack IS the full build → merge to base. **Nav/permission wiring + smoke are deferred to this pass.**
- **Coverage guard:** before the final phase, diff the top branch's `src/` against `feature/full-app-modules` — it must be empty (every full-app-only file ported).

### Porting phase COMPLETE (2026-08-22)

All 7 module branches ported + committed, stacked in dependency order on `full-build/base`:

| Branch | Commit | Cumulative src files |
|---|---|---|
| `full-build/foundations` | `728f2c1a` | 83 |
| `full-build/orders` | `e15f5fd9` | 125 |
| `full-build/calendar-map` | `85d6b94a` | 156 |
| `full-build/team-leader` | `374c583f` | 193 (+5 migrations) |
| `full-build/contracts-quotations` | `048e1e52` | 231 |
| `full-build/contact-centre` | `d3488a78` | 315 |
| `full-build/admin-misc` | `c3205ba5` | 440 |

**Coverage: 440/440 full-app-only `src/` files ported (0 remaining) + the 5 TL migration files.** Import closure was clean at every step. The only code adaptation the scans surfaced was `profiles → user_data` (11 files, mechanical, verified against the base's own `useProfiles`/`usePermissions` pattern). Nothing pushed; `deploy/warehouse-shipping` untouched.

### Verify phase (blocked on the DB-target decision — §9.1)
1. Choose the DB target (dedicated project, or a build DB).
2. Create all module tables — re-author migrations (incl. **re-dating the 5 TL migrations**, which predate the `20260805` baseline), enable RLS + policies.
3. `supabase gen types` → regenerate `database.types.ts` (clears the ~1099 untyped-row errors wholesale).
4. `tsc` → fix the genuine residual (renamed shared symbols / changed signatures / removed exports the rename didn't cover).
5. Wire nav (`nav-config.ts` `NAV_ITEMS`) + permission catalog + `route-permissions.ts` — merge the modules' entries.
6. External integrations: Wati/3CX secrets + `WEBHOOK_PREFIXES` in middleware + Realtime channels (Supabase Budget rules).
7. Operator-smoke each module → merge the stack into `full-build/base` = **the full build**.

### DB rebuilt on dev (2026-08-23)
Dev (`wkmvjxxmzstsvahuiwsz`) is now the full-build DB. Backed up first (`dev-FULL-backup.sql`, 21MB).
- The migration folder proved unreliable (live DBs came from a post-prune rebaseline), so the rebuild used the **live schemas** directly.
- Emptied dev's `public` (kept schema + grants) → loaded **new-prod's live schema** (113 tables = current core) → added **61 field-service tables** extracted from dev's pre-reset dump with FKs re-pointed (`profiles→user_data`, `inventory_brand_variants→inventory_item_brand_variants`). Dev = **174 tables**.
- Regenerated `database.types.ts` from dev (14,981 lines; helper aliases re-appended).
- **`tsc`: 1099 → 317 errors** (~71% cleared). Residual 317 = genuine code drift (useTeams 94; service/team/tl-invoice files) → verify-phase fixes.
- Known minor gaps: 1 FK skipped (→ dead `notification_templates`); field-service indexes/policies/triggers/functions NOT loaded (deferred — needed for smoke, not for types); 3 `customer_credit_docs` storage policies dropped in the reset.
- CLI stays linked to dev (staging is paused) — intended; dev is the build DB.

### Full build TYPE-CLEAN (2026-08-23)
The full-build stack (`full-build/admin-misc`, 15 commits on base) compiles with **0 tsc errors (source + tests)** — path **1099 → 0**.
- **Dev = build DB:** 186 tables + 31 field-service RPC functions + field-service views (`calendar_visits`, etc.) + `company_divisions.calendar_schedule_id` FK → `schedules`. Types regenerated from dev at each step.
- **Code adaptation (committed `fd84a5c7`..`132d07c0`):** restored field-service query-keys + shared-hook exports shipping had pruned (reminders, division-schedule, service-inventory-links, `useToolAssetItems`); `profiles→user_data` / `is_system→is_system_admin` / `inventory_brand_variants→inventory_item_brand_variants` embed fixes; `formatCurrency` currency optional; aligned `ChatConversation`/`LocalConversation`; dropped `customers.phone` (absent on new-prod) in the follow-up route; **deleted orphan `WhInventoryCheckDialog`** (unused full-app duplicate of shipping's inventory-check); test fixtures updated to current shapes.

**Still open (the runnable / deployable gap — NOT done):**
1. **Nav + permission wiring** — modules compile but aren't mounted in `NAV_ITEMS` / permission catalog / `route-permissions`, so they won't appear in the menu yet.
2. **External integrations** — Wati/WhatsApp, 3CX, Traccar: secrets/env, `WEBHOOK_PREFIXES` in middleware, Realtime channels.
3. **Operator smoke** each module against dev.
4. **Migration authoring (reproducibility)** — dev's schema changes were applied directly, not as migration files. To rebuild the full-build DB elsewhere, author migrations for the field-service tables/functions/views (source: dev's dump / `dev-FULL-backup.sql`).
5. **Overlaps to reconcile at smoke:** TL invoices vs sales invoices; the `inventory_brand_variants` embed-alias runtime check; the calendar-schedule embed; contract quotations vs MEP quotations.
