# Division Switcher — Design Spec

> Status: **Draft — approved for implementation**
> Ships as two PRs: **PR #1 RLS backfill** first (soaks in main), then **PR #2 Switcher + server-enforced active** on top.
> Owner: Claude + Mohamed Ismail

## 1. Problem

Users who belong to multiple divisions have no way to focus the app on one division at a time. Owner/Accountant super-viewers only have per-page `<DivisionFilter>` controls that are local `useState` — nothing sticky, nothing global. Non-super-viewer employees in 2+ divisions see everything from all their divisions mixed together with no filter at all.

Meanwhile, **most division-scoped tables have no RLS enforcement** of division access. Only `purchase_orders` and `sale_orders` use `is_division_visible()`; every other table (`invoices`, `so_invoices`, `warehouses`, `inventory_stock`, `warehouse_transfers`, `credit_notes`, `sale_deliveries`, `receivals`, …) still has permissive `USING (true)`. A Maintenance-division employee could, via direct API call, read Cleaning-division data — the UI never surfaces it, but the DB doesn't stop them.

## 2. Goal

1. Server-side: enforce that a user can only read/write rows in divisions their JWT `division_ids` claim allows (**PR #1**).
2. Add a top-right profile-menu switcher that scopes the entire app to one division at a time — server-enforced via JWT active-division claim, sticky across devices, follows the user (**PR #2**).

## 3. Non-goals

- **UI redesign** — no changes to top-nav shape or existing page layouts beyond the switcher and a small chip.
- **Historical backfill** — existing rows without `division_id` stay NULL and remain visible to everyone with any access (matches current `is_division_visible()` behavior).
- **Multi-select active divisions** — one at a time or "All".
- **Automatic active-division switching on edit** — if you open an edit page for a division that isn't your active one, we show a subtle badge, not an auto-switch.

## 4. What already exists

| Piece | Where |
|---|---|
| M2M user ↔ division | `user_company_divisions` |
| Divisions | `company_divisions` (`id`, `slug`, `name`, `company_id`, `is_active`, `sort_order`) |
| JWT claims | `custom_access_token_hook` injects `user_type` + `division_ids` |
| Access helper | `public.is_division_visible(uuid)` returns `true` if row division is NULL, or caller is super-viewer, or row division is in caller's `division_ids` |
| Access-based policies | Only on `purchase_orders` and `sale_orders` |
| Client scope hook | `useUserDivisionScope()` — reads JWT, returns `{ isSuperViewer, userDivisionIds, companies, divisions }` |
| Per-page filter (to be deleted) | `DivisionFilter.tsx` — used in 4 places (super-viewer only) |
| Profile menu | `UserMenu.tsx` — top-right avatar dropdown |
| Business tables with `division_id` | `purchase_orders`, `sale_orders`, `invoices`, `so_invoices`, `warehouses`, `inventory_stock`, `warehouse_transfers`, `credit_notes`, `sale_deliveries`, `receivals`, plus more found during PR #1 audit |

## 5. Design

### PR #1 — RLS backfill

**Purpose:** Extend `is_division_visible()` policies to every table with a `division_id` column, so server-side access matches what the UI already enforces via `division_ids` claim. **Ships first, on its own branch, merges to `main` and soaks for a day before PR #2 branches off.**

**Steps:**
1. **Table audit.** Enumerate every table with a `division_id uuid` column. Categorize each as:
   - **Directly gated** — has its own `division_id`; policies use `is_division_visible(division_id)` directly.
   - **Indirectly gated via parent** — no `division_id` itself, but hangs off a parent (e.g. `sale_order_lines` → `sale_orders`); policies use `is_division_visible((SELECT division_id FROM parent WHERE id = row.parent_id))` OR EXISTS subquery. Only add these if there's an actual leak risk; otherwise defer.
3. **Single migration.** `20260731000000_rls_division_scope_backfill.sql`:
   - For each directly-gated table not already covered: drop any conflicting `USING (true)` SELECT/INSERT/UPDATE/DELETE policies (only the ones that would be shadowed), add `division_scope_{select,insert,update,delete}` policies using `is_division_visible(division_id)`.
   - Keep other role/status-based policies intact (e.g. "only Accountants can void invoices" stays as a separate policy).
4. **Write-path sweep.** For every RPC that INSERTs into a gated table:
   - Verify `division_id` is set correctly (either from caller param, or inherited from a related record).
   - Where an INSERT could fire with a NULL or wrong `division_id`, patch it.
5. **Smoke test in dev DB first.** Spin up a test user in one division; verify they can't `.select()` another division's rows via curl/psql; verify all existing UI flows still work as they do today.

**Deployment sequence:**
- Merge PR #1 → deploy → observe for 24h → then start PR #2 branch.

**Rollback plan:** revert the single migration. `is_division_visible()` stays; only the new policies are removed. No data changes.

### PR #2 — Switcher + server-enforced active division

Assumes PR #1 has landed. Adds "active division" as a JWT claim so `is_division_visible()` narrows further to just the active one when set.

#### 5.1 Data model

```sql
-- Migration: add column
ALTER TABLE user_data
  ADD COLUMN active_division_id uuid REFERENCES company_divisions(id) ON DELETE SET NULL;
```

- `NULL` = **All divisions** (super-viewer default; also the state for a brand-new user who hasn't picked).
- Non-NULL = the single division to narrow to.
- Only ever set to a division the user already has access to (enforced by RPC below).

#### 5.2 `is_division_visible()` update

```sql
CREATE OR REPLACE FUNCTION public.is_division_visible(row_division_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH claims AS (
    SELECT
      auth.jwt() ->> 'user_type'                AS user_type,
      NULLIF(auth.jwt() ->> 'active_division_id', '')::uuid AS active_div,
      ARRAY(SELECT jsonb_array_elements_text(auth.jwt() -> 'division_ids'))::uuid[] AS div_ids
  )
  SELECT
    row_division_id IS NULL
    OR CASE
         -- Super-viewer: if they've narrowed to a specific active, honor it.
         WHEN (SELECT user_type FROM claims) IN ('owner', 'accountant') THEN
           (SELECT active_div FROM claims) IS NULL
           OR row_division_id = (SELECT active_div FROM claims)
         -- Regular user: must be in access set, AND if active is set it must match.
         ELSE
           row_division_id = ANY((SELECT div_ids FROM claims))
           AND (
             (SELECT active_div FROM claims) IS NULL
             OR row_division_id = (SELECT active_div FROM claims)
           )
       END;
$$;
```

Rules encoded:
- Unassigned rows (`division_id IS NULL`) stay visible to everyone with any access — matches today.
- Super-viewer with no active → sees all divisions (matches today).
- Super-viewer with active → sees only that division.
- Regular user with no active → sees all their accessible divisions (matches today).
- Regular user with active → sees only that division (must still be in their access set).

#### 5.3 `custom_access_token_hook` update

Read `active_division_id` from `user_data`, inject as a JWT claim:

```sql
-- Inside the existing hook, after collecting v_user_type + v_division_ids:
SELECT active_division_id INTO v_active_division_id
FROM user_data WHERE auth_user_id = (event ->> 'user_id')::UUID;

claims := jsonb_set(
  claims, '{active_division_id}',
  CASE WHEN v_active_division_id IS NOT NULL THEN to_jsonb(v_active_division_id::text) ELSE 'null'::jsonb END
);
```

#### 5.4 `set_active_division()` RPC

```sql
CREATE OR REPLACE FUNCTION public.set_active_division(p_division_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_profile_id uuid;
  v_user_type  text;
  v_allowed    boolean;
BEGIN
  SELECT id INTO v_profile_id FROM user_data WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Caller profile not found'; END IF;

  IF p_division_id IS NULL THEN
    UPDATE user_data SET active_division_id = NULL WHERE id = v_profile_id;
    RETURN;
  END IF;

  -- Super-viewer can pick any active division. Others must have access.
  v_user_type := auth.jwt() ->> 'user_type';
  IF v_user_type IN ('owner', 'accountant') THEN
    v_allowed := EXISTS (SELECT 1 FROM company_divisions WHERE id = p_division_id AND is_active);
  ELSE
    v_allowed := EXISTS (
      SELECT 1 FROM user_company_divisions ucd
      JOIN company_divisions cd ON cd.id = ucd.division_id
      WHERE ucd.profile_id = v_profile_id
        AND ucd.division_id = p_division_id
        AND cd.is_active
    );
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Division % is not accessible to this user', p_division_id;
  END IF;

  UPDATE user_data SET active_division_id = p_division_id WHERE id = v_profile_id;
END;
$$;
```

Client calls this, then refreshes the session to pick up the new JWT claim.

#### 5.5 Client — `<DivisionProvider>` and `useActiveDivision()`

Mounted at `(dashboard)/layout.tsx`. Exposes:

```ts
interface ActiveDivision {
  activeDivisionId: string | null       // null = "All divisions"
  availableDivisions: DivisionOption[]  // from useUserDivisionScope
  isSuperViewer: boolean
  setActiveDivision: (id: string | null) => Promise<void>
  isSwitching: boolean
}
```

**On mount:** hydrate `activeDivisionId` from `localStorage['active_division_id']` for instant paint, then read the authoritative value from the JWT `active_division_id` claim once the session is available. If they differ (e.g. changed on another device), JWT wins and localStorage is updated.

**On `setActiveDivision(id)`:**
1. Write localStorage synchronously (`localStorage.setItem('active_division_id', id ?? '')`).
2. Optimistic update: set `activeDivisionId` state immediately.
3. Call `supabase.rpc('set_active_division', { p_division_id: id })`.
4. Call `supabase.auth.refreshSession()` — critical: this fetches a fresh JWT with the new claim.
5. Call `queryClient.invalidateQueries()` (no arg = invalidate everything). All list hooks refetch; RLS filters server-side; UI updates.
6. On any error in steps 3–5: revert optimistic update, clear localStorage, toast error.

**Guard on hydration:** if the JWT claim references a division the user no longer has access to (they were removed from it), reset to NULL and re-persist.

#### 5.6 Switcher UI

**In `UserMenu.tsx`**, above "Profile":

- **Single-division regular user:** read-only label — `Division: Maintenance`. No dropdown.
- **Multi-division regular user:** dropdown listing their divisions (from `useUserDivisionScope`), grouped by company if multi-company; single-select.
- **Super-viewer:** dropdown with `All Divisions` (default, meaning `activeDivisionId = NULL`) + every active division grouped by company.

**In `TopNav.tsx`**, a compact chip between the notification bell and the avatar:
- Shows the current active division name (or "All Divisions" for super-viewer with none set).
- Clicking the chip opens the same dropdown as the menu switcher (share the component). Optional convenience — the profile menu remains the canonical location.

#### 5.7 Delete `DivisionFilter.tsx`

Once the switcher is live and RLS enforces active-division server-side, the per-page filter is dead code:
- Delete [DivisionFilter.tsx](src/components/shared/DivisionFilter.tsx).
- Delete the `divisionFilter` local state + `<DivisionFilter>` render in:
  - `src/app/(dashboard)/purchase/orders/page.tsx`
  - `src/app/(dashboard)/sales/orders/page.tsx`
- Any hook that previously accepted a `divisionFilter` param loses that param — the query returns whatever RLS lets through.

**Zero changes needed** to the 30 list hooks that today just `.from('table').select(...)`. RLS handles it.

#### 5.8 Create-page defaults

3 surfaces default their `divisionId` state to the active division on mount:
- `src/app/(dashboard)/purchase/create-po/page.tsx`
- `src/app/(dashboard)/sales/create-so/page.tsx`
- `src/components/master-data/WarehouseFormDialog.tsx`

Change pattern (illustrative):
```ts
const { activeDivisionId, availableDivisions } = useActiveDivision()
const [divisionId, setDivisionId] = useState<string>(activeDivisionId ?? '')

useEffect(() => {
  if (!divisionId && availableDivisions.length === 1) {
    setDivisionId(availableDivisions[0].id)
  } else if (!divisionId && activeDivisionId) {
    setDivisionId(activeDivisionId)
  }
}, [activeDivisionId, availableDivisions, divisionId])
```

User can still override the picker for a specific create if they want.

#### 5.9 Edit-page "not active" chip

On edit pages that show a record with `division_id`, if that value differs from the user's active division (and active is not NULL), render a small chip next to the page title:

> `Viewing: Cleaning` *(not your active division)*

Cheap and prevents "why am I not seeing my other data" confusion. One shared `<DivisionMismatchChip>` component, dropped into edit-po, edit-so, credit-note detail, invoice detail, etc.

## 6. Migration order

### PR #1
1. `20260731000000_rls_division_scope_backfill.sql` — audit, drop conflicting permissive policies, add `is_division_visible()` policies to every gated table
2. Any RPC-body patches uncovered by the audit (one migration file, minimal)

### PR #2
3. `20260801000000_user_data_active_division_id.sql` — column
4. `20260801000100_is_division_visible_active_claim.sql` — updated helper
5. `20260801000200_access_token_hook_active_division.sql` — updated hook
6. `20260801000300_set_active_division_rpc.sql` — new RPC

Client changes ship in the same PR as (3)–(6).

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| PR #1 RLS breaks a hidden write path that inserts with wrong `division_id` | Audit sweep on every RPC INSERT. Test on dev DB first. Deploy to staging with real users for 24h before prod. |
| PR #1 breaks a cross-table SELECT/JOIN where child table has no `division_id` | Categorize child tables in step 2 of the audit. Add EXISTS subquery policies for hot ones (`sale_order_lines`, `receival_items`, etc.). Defer cold ones. |
| JWT claim change: existing sessions don't have `active_division_id` claim until they refresh | `is_division_visible()` treats missing claim as NULL → same as today's behavior for that user. No breakage. On next login they get the claim. |
| Refresh-session-on-switch adds ~500ms latency | Optimistic UI + loading state on the switcher. |
| User removed from a division while active on it | On next hydration, guard resets active to NULL. Also: extend the migration in PR #1 to add a trigger on `user_company_divisions` DELETE that nulls out `user_data.active_division_id` if it matches the removed division. |

## 8. Rollout

- PR #1 → staging → smoke test on all major flows → prod → 24h soak.
- PR #2 branches from post-PR-#1 main. → staging → same test → prod.
- If PR #2 breaks: rollback migrations 3–6 in reverse order; delete the client provider mount. Data column (3) can stay — it's harmless if unread.

## 9. Sizing

| PR | Effort |
|---|---|
| PR #1 (RLS backfill + write-path sweep) | ~1 day |
| PR #2 (switcher + server-enforced active) | ~1.5 days |
| **Combined** | ~2.5 working days |

## 10. Open questions

None blocking. Two follow-ups worth tracking (not part of this spec):

- **Reporting pages** (financial dashboard, aging, statements) — do reports honor the active division too, or always show "everything the user has access to"? Recommend: they DO honor the active filter (consistency). Verify each report after PR #2 lands.
- **Cross-division ownership transfer** — no current UI for reassigning a record to another division. Not needed yet.
