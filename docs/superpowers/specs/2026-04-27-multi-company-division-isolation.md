# Multi-Company Division Isolation — Design Spec

**Date:** 2026-04-27
**Status:** Approved for implementation (v2 — post code review)

---

## Problem

All purchase orders, sale orders, and future transactional tables are currently visible to every authenticated user. There is no company or division scoping. The system has multiple companies each with multiple divisions, and data must be isolated accordingly.

---

## Requirements

### Visibility Rules

| User type | What they see |
|---|---|
| Regular user | Only orders where `division_id` is one of their assigned divisions |
| Owner / Accountant (`user_type`) | All orders across all companies and divisions |

### Order Creation

- Single-division user → `division_id` is auto-assigned silently (no UI change)
- Multi-division user → a **Division picker** appears at the top of the create form, grouped by company; required before submit

### Order List Filtering (Owner / Accountant only)

Two independent dropdowns above every order list table:

```
[ All Companies ▾ ]   [ All Divisions ▾ ]
```

- Selecting a company narrows the Division dropdown to that company's divisions only
- Both default to "All"
- Selections are URL-synced (consistent with existing filter pattern)
- Regular users see no filter — RLS already scopes their rows

### User Management

- Admin → Users create/edit form gains a **Divisions** multi-select grouped by company
- Writes to the existing `user_divisions` join table
- A user with no division assigned cannot create orders (validation message directs admin to assign one)

---

## Architecture

### Hierarchy

```
Company A                Company B
  ├── Division A1          ├── Division B1
  └── Division A2          └── Division B2
```

Orders store `division_id` only. Company is always derived via `divisions.company_id` — never stored redundantly on the order.

---

## DB Layer

### New Columns

```sql
-- ON DELETE RESTRICT prevents orphaning financial records.
-- Divisions must be soft-deleted (is_active = false), never hard-deleted
-- while orders reference them.
ALTER TABLE purchase_orders
  ADD COLUMN division_id UUID REFERENCES divisions(id) ON DELETE RESTRICT;

ALTER TABLE sale_orders
  ADD COLUMN division_id UUID REFERENCES divisions(id) ON DELETE RESTRICT;
```

Backfill: set `division_id` from the `created_by` profile's primary division where available. Rows that cannot be backfilled remain NULL and are visible to Owner/Accountant only.

> **Division deletion policy:** Divisions are never hard-deleted while orders exist.
> Set `is_active = false` to retire a division. The application must block hard-delete
> if any orders reference it (enforced by the RESTRICT constraint at DB level).

### Supabase Auth Hook — JWT Custom Claims

To avoid per-row subqueries inside RLS (which cause N×subquery performance collapse under load), `user_type` and the user's `division_ids` are injected into the JWT at sign-in time via a Supabase Auth Hook. RLS reads the token synchronously — zero table lookups per row.

```sql
-- Registered as a Supabase "custom access token" auth hook.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_type    TEXT;
  v_division_ids UUID[];
  claims         JSONB;
BEGIN
  SELECT p.user_type,
         ARRAY_AGG(ud.division_id) FILTER (WHERE ud.division_id IS NOT NULL)
  INTO   v_user_type, v_division_ids
  FROM   profiles p
  LEFT JOIN user_divisions ud ON ud.profile_id = p.id
  WHERE  p.auth_user_id = (event ->> 'user_id')::UUID
  GROUP BY p.user_type;

  claims := event -> 'claims';
  claims := jsonb_set(claims, '{user_type}',    to_jsonb(COALESCE(v_user_type, '')));
  claims := jsonb_set(claims, '{division_ids}', to_jsonb(COALESCE(v_division_ids, '{}'::UUID[])));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
```

The hook must be registered in the Supabase Dashboard under **Authentication → Hooks → Custom Access Token**.

> **JWT refresh:** When a user's divisions or user_type change, call
> `supabase.auth.refreshSession()` client-side so the new claims take effect
> without requiring a sign-out/sign-in.

### Shared RLS Helper Function

One reusable function — all table policies call this, never duplicate logic.
Reads from the JWT (synchronous, no table joins):

```sql
CREATE OR REPLACE FUNCTION public.is_division_visible(row_division_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public        -- prevents search_path hijacking
AS $$
  SELECT (
    -- Owner/Accountant: read user_type directly from JWT claim
    (auth.jwt() ->> 'user_type') IN ('owner', 'accountant')
    OR
    -- Regular user: check if row's division is in their JWT division_ids array
    row_division_id = ANY(
      ARRAY(
        SELECT jsonb_array_elements_text(auth.jwt() -> 'division_ids')
      )::UUID[]
    )
  );
$$;
```

### RLS Policies

Replace existing permissive `USING (true)` policies on `purchase_orders` and `sale_orders`:

```sql
-- Drop old permissive policies first, then:

CREATE POLICY "division_scope_select" ON purchase_orders
  FOR SELECT USING (is_division_visible(division_id));

CREATE POLICY "division_scope_insert" ON purchase_orders
  FOR INSERT WITH CHECK (is_division_visible(division_id));

CREATE POLICY "division_scope_update" ON purchase_orders
  FOR UPDATE USING (is_division_visible(division_id));

CREATE POLICY "division_scope_delete" ON purchase_orders
  FOR DELETE USING (is_division_visible(division_id));
```

Same four policies applied to `sale_orders`.

### Expanding to Future Tables

Adding any new table (e.g. `contracts`) requires only:

```sql
ALTER TABLE contracts
  ADD COLUMN division_id UUID REFERENCES divisions(id) ON DELETE RESTRICT;

CREATE POLICY "division_scope" ON contracts
  FOR ALL USING (is_division_visible(division_id));
```

Two lines. No repeated logic. The JWT hook already carries the claims.

---

## Frontend Layer

### Hook: `useUserDivisionScope()`

**File:** `src/hooks/useUserDivisionScope.ts`

```ts
{
  isSuperViewer: boolean     // true for owner/accountant — show DivisionFilter
  userDivisionIds: string[]  // user's divisions — used only for the division picker on create forms
  companies: Company[]       // all companies (super) or user's own companies
  divisions: Division[]      // all divisions (super) or user's own divisions
}
```

**Important:** Regular users do NOT pass `.in('division_id', userDivisionIds)` to queries.
RLS enforces scoping at the DB level. Passing the array client-side is redundant,
increases payload size, and throws a PostgREST error when the array is empty.
Simply query the table normally — the DB returns only permitted rows.

`userDivisionIds` is exposed only to:
- Drive the **division picker** on create forms (which division to assign)
- Drive the **DivisionFilter** options for super viewers

### Component: `<DivisionFilter />`

**File:** `src/components/shared/DivisionFilter.tsx`

```tsx
<DivisionFilter
  value={{ companyId: string | null, divisionId: string | null }}
  onChange={({ companyId, divisionId }) => void}
/>
```

- Renders **nothing** for regular users (`isSuperViewer === false`)
- Renders two dropdowns (Company + Division) for Owner/Accountant
- Division dropdown is narrowed when a company is selected
- Both support "All" (null)
- Applied as a `WHERE division_id = ?` or `WHERE divisions.company_id = ?` filter in the query when non-null
- Drops into any list page header in two lines

### Division Picker on Create Forms

When `userDivisionIds.length > 1`, a required division selector appears at the top of the PO and SO create forms, grouped by company. Single-division users see nothing new — their sole division is applied automatically.

---

## File Map

| File | Action |
|---|---|
| `supabase/migrations/YYYYMMDD_division_isolation.sql` | New — JWT hook, helper function, columns (RESTRICT), RLS |
| `src/hooks/useUserDivisionScope.ts` | New — shared scope hook |
| `src/components/shared/DivisionFilter.tsx` | New — reusable filter component |
| `src/app/(dashboard)/purchase/orders/page.tsx` | Modify — wire DivisionFilter + query filter |
| `src/app/(dashboard)/sales/orders/page.tsx` | Modify — wire DivisionFilter + query filter |
| `src/app/(dashboard)/purchase/create-po/page.tsx` | Modify — division picker for multi-division users |
| `src/app/(dashboard)/sales/create-so/page.tsx` | Modify — division picker for multi-division users |
| `src/app/(dashboard)/master-data/admin/users/` | Modify — division assignment multi-select |

---

## Sub-project Execution Order

| # | Sub-project | Depends on |
|---|---|---|
| 1 | DB migration (columns + JWT hook + helper + RLS) | — |
| 2 | `useUserDivisionScope` hook + `DivisionFilter` component | Sub-project 1 |
| 3 | PO + SO list pages wired | Sub-project 2 |
| 4 | PO + SO create forms — division picker | Sub-project 2 |
| 5 | User management — division assignment UI | Sub-project 1 |

---

## Edge Cases

| Case | Behaviour |
|---|---|
| User has no divisions assigned | Cannot create orders; list returns empty rows (RLS blocks all) |
| Order has `division_id = NULL` (legacy backfill gap) | Visible to Owner/Accountant only; RLS hides from regular users |
| User is promoted to Owner/Accountant | Must refresh session (`supabase.auth.refreshSession()`) for new JWT claims to take effect |
| Division hard-delete attempted while orders exist | DB raises FK RESTRICT error; UI should surface a clear message |
| Division retired | Set `is_active = false`; orders remain fully intact and visible |
| JWT claims stale (division changed by admin) | Admin UI calls `refreshSession()` after updating user_divisions |

---

## Security Notes

| Risk | Mitigation |
|---|---|
| N+1 per-row subqueries in RLS | Eliminated — JWT claims read synchronously, zero table joins in RLS |
| Financial record orphan on division delete | `ON DELETE RESTRICT` blocks hard-delete at DB level |
| `SECURITY DEFINER` search_path hijacking | `SET search_path = public` on all SECURITY DEFINER functions |
| Client-side filter bypass | Not relied on for security — RLS is the enforcement layer |

---

## Expandability Checklist (for future tables)

When adding a new module (e.g. Contracts):

- [ ] `ALTER TABLE contracts ADD COLUMN division_id UUID REFERENCES divisions(id) ON DELETE RESTRICT;`
- [ ] `CREATE POLICY "division_scope" ON contracts FOR ALL USING (is_division_visible(division_id));`
- [ ] Call `useUserDivisionScope()` in the list page hook
- [ ] Drop `<DivisionFilter>` into the list page header
- [ ] Add division picker to create form (if applicable)
- [ ] Call `supabase.auth.refreshSession()` after any user_divisions change
