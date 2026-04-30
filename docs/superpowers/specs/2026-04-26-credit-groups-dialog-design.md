# Credit Groups — Add Dialog Design Spec

**Date:** 2026-04-26
**Branch:** feature/sale-module
**Scope:** Add `payment_methods` + `max_days` columns to `credit_groups`; replace inline add-row with a Dialog modal matching the provided screenshot mockup.

---

## Goal

Replace the inline table-row add form on the Credit Groups page with a proper modal dialog that captures: group name, allowed payment methods (multi-select toggle grid), max credit amount (QAR), and max days. Edit stays as the current inline row.

---

## Database

### Migration: `supabase/migrations/20260428000001_credit_groups_payment_methods.sql`

```sql
ALTER TABLE credit_groups
  ADD COLUMN IF NOT EXISTS payment_methods TEXT[]    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS max_days        INTEGER;
```

- `payment_methods` — array of method keys, e.g. `'{cash,bank_transfer}'`. Empty array = no restriction configured yet.
- `max_days` — nullable integer. NULL means no day limit.
- No data migration needed — existing rows get `'{}'` and `NULL` by default.

---

## Payment Method Options

| Key | Display Label |
|-----|--------------|
| `cash` | Cash |
| `online` | Online |
| `pay_later` | Pay Later |
| `fawran` | Fawran |
| `bank_transfer` | Bank Transfer |
| `cdc` | CDC (Current-Dated Cheque) |
| `pdc` | PDC (Post-Dated Cheque) |
| `pos` | POS |

Defined as a constant array in a shared location so hooks and UI stay in sync.

---

## TypeScript Changes (`src/hooks/useCreditGroups.ts`)

### Updated `CreditGroup` type

```ts
export type CreditGroup = {
  id:               string
  name:             string
  credit_limit:     number
  payment_methods:  string[]
  max_days:         number | null
  created_at:       string
  updated_at:       string
}
```

### Updated `useCreateCreditGroup` payload

```ts
{ name: string; credit_limit: number; payment_methods: string[]; max_days: number | null }
```

`useUpdateCreditGroup` already accepts `Partial<CreditGroup> & { id }` — no change needed.

---

## New Component: `AddCreditGroupDialog`

**File:** `src/app/(dashboard)/master-data/credit-groups/AddCreditGroupDialog.tsx` — colocated with the page

### Props

```ts
interface AddCreditGroupDialogProps {
  open:         boolean
  onOpenChange: (open: boolean) => void
}
```

### Layout (matching screenshot)

```
┌─────────────────────────────────────────┐
│ Add Credit Group                    [×] │
│ Create a new credit group.              │
│                                         │
│ Name *                                  │
│ [e.g. Premium                        ]  │
│                                         │
│ Payment Methods *                       │
│ ┌──────────────┐  ┌──────────────────┐  │
│ │ Cash         │  │ Online           │  │
│ │ Pay Later    │  │ Fawran           │  │
│ │ ✓ Bank Trans │  │ CDC (Curr. Chq)  │  │
│ │ PDC (Post Chq│  │ POS              │  │
│ └──────────────┘  └──────────────────┘  │
│                                         │
│ Max Amount (QAR)      Max Days          │
│ [              ]      [       ]         │
│                                         │
│              [Cancel] [Add Category]    │
└─────────────────────────────────────────┘
```

### Behaviour

- Toggle buttons: clicking a method key adds/removes it from the selected set. Selected state: blue background + border + ✓ prefix. Unselected: default outline.
- Payment Methods are displayed in a `grid-cols-2` layout.
- Name is required. Payment methods selection is optional — an empty array is valid (means no method restriction configured yet). Max days is optional (null = no limit).
- "Add Category" calls `useCreateCreditGroup`, shows toast on success/error, resets form, closes dialog.
- Form resets to empty state every time the dialog opens.

---

## Page Changes (`src/app/(dashboard)/master-data/credit-groups/page.tsx`)

1. Remove `adding` state and inline add-row (`{adding && <TableRow>…</TableRow>}`) entirely.
2. Add `dialogOpen` state; "Add Credit Group" button sets it to `true`.
3. Render `<AddCreditGroupDialog open={dialogOpen} onOpenChange={setDialogOpen} />` at bottom of page.
4. Add two new columns to the table:

| Column | Content |
|--------|---------|
| **Methods** | Comma-separated display labels; "—" if empty array |
| **Max Days** | Number; "—" if null |

Edit inline row gains two read-only cells for Methods and Max Days (not editable inline — full edit dialog is out of scope for this task).

---

## Constraints

- Edit stays as the current inline row — only name and credit_limit editable inline. Methods and max_days shown read-only in the row.
- No percentage-based discount logic — credit_limit remains a flat QAR amount.
- Payment method keys are lowercase snake_case strings stored in the DB array; display labels are resolved client-side from the constant map.

---

## Files Modified / Created

| File | Action |
|------|--------|
| `supabase/migrations/20260428000001_credit_groups_payment_methods.sql` | Create |
| `src/hooks/useCreditGroups.ts` | Modify — type + create payload |
| `src/app/(dashboard)/master-data/credit-groups/AddCreditGroupDialog.tsx` | Create |
| `src/app/(dashboard)/master-data/credit-groups/page.tsx` | Modify — remove inline add, add dialog + new columns |
