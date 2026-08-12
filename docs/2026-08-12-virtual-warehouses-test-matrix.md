# Virtual Warehouses — Test Matrix (morning review)

**Branch:** `feature/virtual-warehouses-custody-repair` (off `deploy/warehouse-shipping`) — **not merged, not pushed.**
**DB:** staging `mwvblpgbgxipvrevkeff` only (new-prod sync held for your OK).
**Migrations:** `20260820000100`–`20260820000900` (applied + mirrored). `…500` cross-division permission; `…600` item-needed request RPC; `…700`+`…710` custody accept received-qty + shrinkage (+ the missing `transfer_shrinkage` enum value); `…800` accept shortfall disposition (write-off | give-back) + `warehouse_transfer_items.returned_qty`; `…900` data fix — de-duplicated self-doubled `item_name` ("X — X" import artifact) across `inventory_items` + the display snapshots (11 items + 15/1/2 snapshot rows).

## Follow-up batch (custody UX, from 2026-08-12 smoke)
- ✅ **Role-editor save fixed** (`df71e416`) — validator only requires a `.view` sibling when the catalog defines one (unblocked 7 & 11).
- ✅ **① consume-from-card** hides fixed source/consumer; **② request** auto-picks the sub by division (`03f9e056`).
- ✅ **③ item-needed request** → notifies the warehouse RP (`37f4024e`).
- ✅ **④ accept with received-qty + shrinkage** (`8d5a14a2`) — also fixed a latent enum bug (`transfer_shrinkage` missing) that would have broken *any* short-received transfer, standard or custody.
- Verified PASS: A20–A22 below. Operator smoke: B12–B13 below.

### Round 2 (2026-08-12 pm smoke — operator-confirmed "all clean")
- ✅ **RP-owned custody cards** (`522fbbda`) — a location's responsible person now sees + acts on their OWN card without a per-warehouse grant (visibility scoped to own location; Request/Return/Consume enabled — all RPCs already authorise the sub RP).
- ✅ **Accept-dialog infinite-loop fixed** (`522fbbda`) — `data ?? []` in an effect dep re-fired endlessly; memoised the items array.
- ✅ **Shortfall disposition** (`62dc5c47` db + `522fbbda` ui) — per short line: **Write off** (shrinkage loss, stock −miss) vs **Give back** (returns to source shelf, total stock unchanged). Default = write-off (back-compat).
- ✅ **Live-inbox refresh preset** (`522fbbda`) — `src/lib/queryOptions.ts`; applied to the custody pending inbox + transfers list so another user's request/dispatch appears without a manual refresh; generic dispatch/receive also invalidate the custody inbox.
- Verified PASS: A23–A27. Operator-confirmed: B14–B17.
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
| A20 | **Role-editor save unblocked** — `validatePermissionSet` only flags a create/edit/manage key when the catalog actually defines its `.view` sibling | ✅ PASS | code review: singular/plural + create-only areas no longer false-flag; real orphans still caught; tsc+eslint clean |
| A21 | **③ item-needed request** inserts one `notifications` row per warehouse RP with a clear message; raises if the warehouse has no RP | ✅ PASS | rolled-back DO block (Birkat Alawamer, 2 RPs → 2 notifications) |
| A22 | **④ accept received-qty + shrinkage** — partial receipt materialises only the received units to the custody sub, writes `transfer_shrinkage` at source, decrements `stock_level` by the miss; full receipt = 0 shrinkage | ✅ PASS | rolled-back DO block: 3 of 5 → dest FIFO 3, transfer_in 3 + transfer_shrinkage 2, stock_level −2, status received; 4 of 4 → shrinkage 0 |
| A23 | **Shortfall RESTOCK** — accept 2 of 3 with `shortfall_action='restock'`: dest sub +2, source sub FIFO re-created +1, `stock_level` unchanged, line `2/0/1` (recv/shrink/return), status received | ✅ PASS | rolled-back DO on the **pushed** fn (WT-2026-00026): stock 14→14, dest 0→2, source 6→7 |
| A24 | **Shortfall WRITEOFF** — accept 2 of 3 with `shortfall_action='writeoff'`: dest +2, `transfer_shrinkage` −1 at source, `stock_level` −1, line `2/1/0` | ✅ PASS | rolled-back DO: stock 14→13, source 6 unchanged, 1 shrinkage move |
| A25 | **Shortfall default** — omitted `shortfall_action` falls back to write-off (back-compat) | ✅ PASS | rolled-back DO: line `1/0` (shrink/return) |
| A26 | **RP consume from own sub** — a non-admin RP (Accountant, `is_custody_admin=f`) posts a custody consumption from their own Team 2 sub | ✅ PASS | rolled-back DO posts + writes `consumer_sub_container_id`; source-auth passes via the sub-RP branch, division guard via `consumption.cross_division` |
| A27 | Accept dialog no longer throws "Maximum update depth" (root cause = unstable `data ?? []` effect dep; memoised) | ✅ PASS | code review + tsc/eslint clean |
| A28 | **Self-doubled item names fixed** — `inventory_items.name_en` held `"X — X"` for 11 items (import artifact), surfacing as doubled labels; de-duped the source + 15/1/2 denormalised snapshot rows (stock summary / transfer items / movements). Only touches exact 2-part byte-equal halves — legit hyphenated names untouched | ✅ PASS | migration `…900`; rolled-back dry-run → 0 doubles left in all 4 tables, view reads `Electrical Control Components / Generic`, 0 legit multi-part names affected; applied + persisted-verified |

---

## B. Needs your smoke → **PENDING** (I can't log in / run the UI as a role)

Log in as admin, `npm run dev` (points at staging via `.env.local`), then:

| # | Flow | Steps | Expected |
|---|---|---|---|
| B1 | ✅ **Warehouse Type picker** *(confirmed)* | Master Data → Warehouses → Add Warehouse | New **Type** field: Physical stock / Custody / Repair. Picking Custody or Repair hides Company/Location/RPs and shows the virtual hint. Create a "Site A" Custody warehouse. |
| B2 | ✅ **Custody Locations admin** *(confirmed)* | Master Data → Admin → **Custody Locations** | One tab per custody warehouse (Teams / Projects / Site A). Add a location (name + division + RP); edit; deactivate. Names never show UUIDs. |
| B3 | ✅ **Custody page tabs** *(confirmed)* | Operations → Custody | One tab per custody warehouse (not the old Teams/Places). Cards group by division. |
| B4 | ✅ **Custody assign → dispatch → accept** *(confirmed)* | From a custody card: Request stock from a warehouse → Dispatch (warehouse RP) → Accept (location RP) | Stock lands on the location; pending banner clears. |
| B5 | ✅ **Custody return** *(confirmed)* | From a card with stock: Return → pick a real warehouse | Stock leaves the location. |
| B6 | **Consumption** *(retest — self-doubled item name fixed in `…900`)* | Operations → Consumption → New | Consumer is **Custody \| Internal**; Custody lists locations **grouped by warehouse**; post one custody + one internal. Numbers read `CE-Custody-…` / `CE-Internal-…`. List/detail + confirm dialog show the right consumer + a **single** item name (no "X — X" doubling). |
| B7 | ✅ **Per-warehouse permissions** *(confirmed)* | Master Data → Roles → edit a **non-admin** role → tick **Projects** View (not Teams) in "Custody Warehouse Access" + grant "Access Custody Page" → assign to a test user → log in as them | Custody page shows **only Projects**; Teams tab hidden. Edit buttons appear only where you granted Edit. |
| B8 | **Repair** | Master Data → Admin → Repair Vendors → add a vendor; then send a damaged return line for repair | Vendor appears; send-for-repair routes the units to that vendor (under the Repair warehouse); return-from-repair works. |
| B9 | **Places → Projects everywhere** | Sweep the UI | No "Places"/"Place" wording remains in custody/consumption surfaces. |
| B10 | **Build / runtime** | `npm run build` (or your normal deploy preview) | Compiles + runs (I held the build per the no-build rule). |
| B11 | **Cross-division consumption grant** | Role editor → the new "Book Consumption Cross-Division" checkbox. Grant it to a non-admin role (e.g. Accountant), revoke it from another. | A user whose role has the key can post a consumption to a custody location in a division they're **not** assigned to; without it they get "You can only book … in your own division." |
| B12 | **③ Item-needed request** | Custody card → Request → pick a source warehouse → in "Need an item that isn't stocked here?" type a name + qty → Send request | The warehouse's responsible person(s) get a bell notification ("… needs 5 × …"); no stock moves; toast confirms. |
| B13 | **④ Accept with received qty** | Custody card with a pending in-transit request → Accept | A receipt dialog lists each dispatched line with a "received /N" box (defaults to N). Enter less than dispatched → it warns the shortfall becomes shrinkage; confirm → stock lands on the location at the received qty; the shortfall leaves stock. |
| B14 | ✅ **RP sees own card** *(confirmed)* | Log in as a location RP (has "Access Custody Page", no warehouse grant) → Operations → Custody | Only their own card shows under that warehouse's tab; other locations hidden. |
| B15 | ✅ **RP acts on own card** *(confirmed)* | On the RP's own card | Request / Return / Consume all work without a per-warehouse grant. |
| B16 | ✅ **Shortfall toggle** *(confirmed)* | Accept with received < dispatched → pick **Write off** or **Give back** | Write off → total stock −miss; Give back → source warehouse stock +miss, total unchanged. |
| B17 | ✅ **Live refresh** *(confirmed)* | Two sessions: make a request / dispatch in one | Transfers list + custody card update within ~20s (or on tab focus) — no manual refresh. |

---

## C. Held for your explicit go

- **New-prod (`optishfnnctrhffpoywg`) migration sync** — the 4 migrations are staging-only per the standing window rule. Say the word and I'll apply the same 4 + M-remap there (it has zero data, so it's low-risk).
- **Merge** `feature/virtual-warehouses-custody-repair` into `deploy/warehouse-shipping` — after B-smoke passes.

## D. Data reference (staging)

- Custody warehouses: **Teams** (`9cc38706…`), **Projects** (`57ef60bb…`, was Places). Repair: `3cd2e1ce…`.
- Custody locations today: Team 2 (Teams/Kitchen), F002 (Projects/Kitchen).
- `consumption_number_counters` was empty → no numbering collision risk.
- Roles with custody/consumption grants: `consumption` (now `consumption.create.custody`); **Owner + Accountant** now hold `consumption.cross_division` (granted by M5 to preserve intent).
