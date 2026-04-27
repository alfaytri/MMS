# Multi-Company Division Isolation — Design Spec

**Date:** 2026-04-27
**Status:** Approved for implementation

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
ALTER TABLE purchase_orders ADD COLUMN division_id UUID REFERENCES divisions(id);
ALTER TABLE sale_orders     ADD COLUMN division_id UUID REFERENCES divisions(id);
```

Backfill: set `division_id` from the `created_by` profile's primary division where available.

### Shared RLS Helper Function

One reusable Postgres function — all table policies call this, never duplicate logic:

```sql
CREATE OR REPLACE FUNCTION is_division_visible(row_division_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE auth_user_id = auth.uid()
        AND user_type IN ('owner', 'accountant')
    )
    OR
    row_division_id IN (
      SELECT ud.division_id
      FROM   user_divisions ud
      JOIN   profiles p ON p.id = ud.profile_id
      WHERE  p.auth_user_id = auth.uid()
    )
  );
$$;
```

### RLS Policies

Replace existing permissive `USING (true)` policies on `purchase_orders` and `sale_orders`:

```sql
-- SELECT
CREATE POLICY "division_scope_select" ON purchase_orders
  FOR SELECT USING (is_division_visible(division_id));

-- INSERT: user must belong to the division they're assigning
CREATE POLICY "division_scope_insert" ON purchase_orders
  FOR INSERT WITH CHECK (is_division_visible(division_id));

-- UPDATE / DELETE: same check
CREATE POLICY "division_scope_update" ON purchase_orders
  FOR UPDATE USING (is_division_visible(division_id));
```

Same four policies applied to `sale_orders`.

### Expanding to Future Tables

Adding any new table (e.g. `contracts`) requires only:

```sql
ALTER TABLE contracts ADD COLUMN division_id UUID REFERENCES divisions(id);
CREATE POLICY "division_scope" ON contracts
  FOR ALL USING (is_division_visible(division_id));
```

---

## Frontend Layer

### Hook: `useUserDivisionScope()`

**File:** `src/hooks/useUserDivisionScope.ts`

```ts
{
  isSuperViewer:    boolean        // true for owner/accountant
  userDivisionIds:  string[]       // assigned division IDs (empty = no access)
  companies:        Company[]      // all companies (super) or user's companies
  divisions:        Division[]     // all divisions (super) or user's divisions
}
```

- Any list page calls this hook to know what to query and whether to show filters
- Regular users: query `.in('division_id', userDivisionIds)`
- Super viewers: no `.in()` filter, show `<DivisionFilter>`

### Component: `<DivisionFilter />`

**File:** `src/components/shared/DivisionFilter.tsx`

```tsx
<DivisionFilter
  value={{ companyId: string | null, divisionId: string | null }}
  onChange={({ companyId, divisionId }) => void}
/>
```

- Renders nothing for regular users
- Renders two dropdowns (Company + Division) for Owner/Accountant
- Division options are filtered by selected company
- Both support "All" (null value)
- Drops into any list page with two lines

### Division Picker on Create Forms

When `userDivisionIds.length > 1`, a required division selector appears at the top of the PO and SO create forms, grouped by company. Single-division users see nothing new.

---

## File Map

| File | Action |
|---|---|
| `supabase/migrations/YYYYMMDD_division_isolation.sql` | New — helper function, columns, RLS |
| `src/hooks/useUserDivisionScope.ts` | New — shared scope hook |
| `src/components/shared/DivisionFilter.tsx` | New — reusable filter component |
| `src/app/(dashboard)/purchase/orders/page.tsx` | Modify — wire DivisionFilter + scoped query |
| `src/app/(dashboard)/sales/orders/page.tsx` | Modify — wire DivisionFilter + scoped query |
| `src/app/(dashboard)/purchase/create-po/page.tsx` | Modify — division picker for multi-division users |
| `src/app/(dashboard)/sales/create-so/page.tsx` | Modify — division picker for multi-division users |
| `src/app/(dashboard)/master-data/admin/users/` | Modify — division assignment multi-select |

---

## Sub-project Execution Order

| # | Sub-project | Depends on |
|---|---|---|
| 1 | DB migration (columns + helper + RLS) | — |
| 2 | `useUserDivisionScope` hook + `DivisionFilter` component | Sub-project 1 |
| 3 | PO + SO list pages wired | Sub-project 2 |
| 4 | PO + SO create forms — division picker | Sub-project 2 |
| 5 | User management — division assignment UI | Sub-project 1 |

---

## Edge Cases

| Case | Behaviour |
|---|---|
| User has no divisions assigned | Cannot create orders; sees empty list with a message |
| Order has `division_id = NULL` (legacy backfill gap) | Visible to Owner/Accountant only; invisible to regular users |
| User is promoted to Owner/Accountant | Immediately sees all orders (RLS uses `user_type` at query time) |
| Division is deleted | `division_id` goes NULL via FK cascade; order becomes owner-only visible |

---

## Expandability Checklist (for future tables)

When adding a new module (e.g. Contracts):

- [ ] `ALTER TABLE contracts ADD COLUMN division_id UUID REFERENCES divisions(id);`
- [ ] Add RLS policy calling `is_division_visible(division_id)`
- [ ] Call `useUserDivisionScope()` in the list page hook
- [ ] Drop `<DivisionFilter>` into the list page header
- [ ] Add division picker to create form if applicable
