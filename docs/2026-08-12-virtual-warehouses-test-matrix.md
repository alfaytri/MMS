# Virtual Warehouses — Test Matrix (morning review)

**Branch:** `feature/virtual-warehouses-custody-repair` (off `deploy/warehouse-shipping`) — **not merged, not pushed.**
**DB:** staging `mwvblpgbgxipvrevkeff` only (new-prod sync held for your OK).
**Migrations:** `20260820000100`–`20260820000500` (applied + mirrored). `…000500` adds the `consumption.cross_division` grantable permission (replaces a fragile role-name guard).
**Spec:** `docs/superpowers/specs/2026-08-12-virtual-warehouses-custody-repair-design.md`

Both phases shipped. Phase 2 (repair) needed **no code** — repair was already sub-container-based; it's verified intact below.

---

## A. Verified by me → **PASS** (method in the last column)

| # | Check | Result | How verified |
|---|---|---|---|
| A1 | `warehouse_kind` CHECK is `general \| repair \| custody` | ✅ PASS | `pg_constraint` def on staging |
| A2 | Teams + Places rows → `custody`; the Places warehouse renamed **Projects** | ✅ PASS | `select name,warehouse_kind from warehouses` → Projects/custody, Teams/custody, Repair/repair |
| A3 | `consumer_type` CHECK is `custody \| internal` on all 3 tables (consumption_entries, consumption_number_counters, cogs_entries) | ✅ PASS | constraint defs |
| A4 | `consumer_team_sub_id` + `consumer_place_sub_id` merged → one `consumer_sub_container_id` (consumption_entries + cogs_entries); old columns dropped | ✅ PASS | `information_schema.columns` |
| A5 | Numbering mints `CE-Custody-…` / `CE-Internal-…` (legacy `team` maps to custody) | ✅ PASS | rolled-back `select generate_consumption_number(...)` |
| A6 | **Custody consumption end-to-end**: posts `CE-Custody`, writes `consumer_sub_container_id` on consumption_entries + cogs_entries, drains FIFO | ✅ PASS | rolled-back DO block impersonating the system-admin Owner |
| A7 | **Internal consumption**: posts `CE-Internal`, `consumer_sub_container_id` NULL | ✅ PASS | same DO block |
| A8 | **Pre-existing bug fixed**: consumer-division guard tested `user_type IN ('owner','accountant')` against an enum with no such labels (would break any non-admin custody consumption) → now role-based | ✅ PASS | reproduced the enum error, rewrote the guard, re-ran DO block clean |
| A9 | `rpc_create_custody_assign` → `custody_assign` pending transfer to the chosen custody sub | ✅ PASS | rolled-back DO block |
| A10 | `rpc_upsert_warehouse_sub_container` creates a custody location | ✅ PASS | rolled-back DO block |
| A11 | `get_custody_master_list` replaces `get_teams/places_master_list`; `rpc_upsert_team_or_place` dropped | ✅ PASS | `pg_proc` signature sweep (old names absent) |
| A12 | No `'team'/'place'/'teams'/'places'` literals remain in the rewritten custody RPCs | ✅ PASS | `pg_get_functiondef` regex sweep = 0 |
| A13 | **Permission remap (M4)**: existing grants migrated; the `consumption` role's `consumption.create.team` → `consumption.create.custody` | ✅ PASS | before/after `custom_roles.permissions` query |
| A14 | **Repair intact**: Repair warehouse present; no repair RPC references dropped literals; a repair vendor auto-provisions a sub-container **under the Repair warehouse** (so send-for-repair routing is unchanged) | ✅ PASS | rolled-back vendor-insert DO block |
| A15 | All 4 migrations applied to staging; `db push` up to date; each mirrored to `supabase/migrations-staging/` | ✅ PASS | `db push` output |
| A16 | `npx tsc --noEmit` = **0 errors** (whole project) | ✅ PASS | final full run |
| A17 | `npx eslint` on every changed/new file = **0 problems** | ✅ PASS | final run |
| A18 | Impeccable design hooks = 0 deterministic issues on every edited component | ✅ PASS | inline hook output |
| A19 | **Cross-division consumption** now gated by a grantable `consumption.cross_division` permission (server-side via `_user_has_permission`), replacing the fragile role-name match | ✅ PASS | M5 on staging: single overload uses the permission, name-match gone, grant landed on Owner + Accountant, admin custody consumption still posts, a keyless user fails the bypass |

---

## B. Needs your smoke → **PENDING** (I can't log in / run the UI as a role)

Log in as admin, `npm run dev` (points at staging via `.env.local`), then:

| # | Flow | Steps | Expected |
|---|---|---|---|
| B1 | **Warehouse Type picker** | Master Data → Warehouses → Add Warehouse | New **Type** field: Physical stock / Custody / Repair. Picking Custody or Repair hides Company/Location/RPs and shows the virtual hint. Create a "Site A" Custody warehouse. |
| B2 | **Custody Locations admin** | Master Data → Admin → **Custody Locations** | One tab per custody warehouse (Teams / Projects / Site A). Add a location (name + division + RP); edit; deactivate. Names never show UUIDs. |
| B3 | **Custody page tabs** | Operations → Custody | One tab per custody warehouse (not the old Teams/Places). Cards group by division. |
| B4 | **Custody assign → dispatch → accept** | From a custody card: Request stock from a warehouse → Dispatch (warehouse RP) → Accept (location RP) | Stock lands on the location; pending banner clears. |
| B5 | **Custody return** | From a card with stock: Return → pick a real warehouse | Stock leaves the location. |
| B6 | **Consumption** | Operations → Consumption → New | Consumer is **Custody \| Internal**; Custody lists locations **grouped by warehouse**; post one custody + one internal. Numbers read `CE-Custody-…` / `CE-Internal-…`. List/detail show the right consumer + icon. |
| B7 | **Per-warehouse permissions** | Master Data → Roles → edit a **non-admin** role → tick **Projects** View (not Teams) in "Custody Warehouse Access" + grant "Access Custody Page" → assign to a test user → log in as them | Custody page shows **only Projects**; Teams tab hidden. Edit buttons appear only where you granted Edit. |
| B8 | **Repair** | Master Data → Admin → Repair Vendors → add a vendor; then send a damaged return line for repair | Vendor appears; send-for-repair routes the units to that vendor (under the Repair warehouse); return-from-repair works. |
| B9 | **Places → Projects everywhere** | Sweep the UI | No "Places"/"Place" wording remains in custody/consumption surfaces. |
| B10 | **Build / runtime** | `npm run build` (or your normal deploy preview) | Compiles + runs (I held the build per the no-build rule). |
| B11 | **Cross-division consumption grant** | Role editor → the new "Book Consumption Cross-Division" checkbox. Grant it to a non-admin role (e.g. Accountant), revoke it from another. | A user whose role has the key can post a consumption to a custody location in a division they're **not** assigned to; without it they get "You can only book … in your own division." |

---

## C. Held for your explicit go

- **New-prod (`optishfnnctrhffpoywg`) migration sync** — the 4 migrations are staging-only per the standing window rule. Say the word and I'll apply the same 4 + M-remap there (it has zero data, so it's low-risk).
- **Merge** `feature/virtual-warehouses-custody-repair` into `deploy/warehouse-shipping` — after B-smoke passes.

## D. Data reference (staging)

- Custody warehouses: **Teams** (`9cc38706…`), **Projects** (`57ef60bb…`, was Places). Repair: `3cd2e1ce…`.
- Custody locations today: Team 2 (Teams/Kitchen), F002 (Projects/Kitchen).
- `consumption_number_counters` was empty → no numbering collision risk.
- Roles with custody/consumption grants: `consumption` (now `consumption.create.custody`); **Owner + Accountant** now hold `consumption.cross_division` (granted by M5 to preserve intent).
