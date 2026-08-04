# Category Attributes + View/Edit Permission Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a category-level attribute schema for inventory items with a guided cascading picker in Sales / Quotations / Service Links / Consumption. Alongside, land a uniform **3-state** view/create/edit permission split across the app so every gated feature has matching view + create + edit keys.

**Architecture:** Phase 0 lands the 3-state permission helpers + audit + backfill so all downstream permission keys use the new pattern from day one. Phases 1-6 build Category Attributes: DB (3 tables + branch-uniqueness trigger + 2 support functions), definition editor tab, per-item value entry section, `ProductAttributePicker` cascading selector, four surface integrations (SO / Quotations / Service Links / Consumption), 4-point security audit.

**Permission model (3-state semantics):**
- `.view` — read-only (see page, list, detail)
- `.create` — insert new records (New X button, bulk import, form submit-new)
- `.edit` — modify existing records (update, cancel, void, complete, archive, delete, status transitions)
- `.create` and `.edit` are **orthogonal** — one does not imply the other
- Both **imply `.view`** (defensive fallback)
- `system.admin` bypasses everything
- Existing `.manage` keys retained as alias of `.edit` (no role-data rename needed)
- **Backwards compat:** one-shot migration grants `X.create` to every role currently holding `X.edit` so no existing workflow breaks on deploy — Owners can trim `.create` off specific roles afterward

**Tech Stack:** Next.js 15 App Router + TypeScript, Supabase (Postgres + RLS + Storage), TanStack Query v5, shadcn/ui + Tailwind.

## Global Constraints

- **Commit trailers:** every commit includes BOTH `Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>` AND `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`
- **Migrations:** apply via `npx supabase db push` — never ask the user to run SQL manually
- **Type regen:** after every migration that touches tables/functions the app reads, run `npx supabase gen types typescript --linked --schema public > src/types/database.types.ts` and re-append the four helper aliases (`DBTable`, `DBInsert`, `DBUpdate`, `AllTables`) — CLI strips them
- **PROGRESS.md protocol:** on task START, update `## 🔄 In Progress` with `🚀 Starting: **[Task name]**`, commit only PROGRESS.md; on task COMPLETE, add row to `## ✅ Completed`, commit only PROGRESS.md — code commits and PROGRESS.md commits stay isolated
- **Commit policy:** never commit code until the operator confirms "working" — silent gates are `npx tsc --noEmit` (0 new errors in touched files) + `npx supabase db push` (for migrations); everything else waits for operator sign-off
- **No build:** never run `next build` unless the user explicitly asks
- **Dropdown UUID Guard:** every `<Select>` / dropdown displays a human-readable label, never a raw UUID
- **Responsive:** every new UI element works at phone / tablet / laptop / TV breakpoints
- **Layout stability:** every dropdown/tab/status widget reserves height via `min-h-*` so selection swaps don't shift siblings
- **Flow registry:** every new material business flow gets registered in `docs/flows-registry.md` in the same commit that ships the code
- **EOD file:** after each task, append a numbered line to `EOD/EOD-YYYY-MM-DD.md`
- **Dev DB catch-up:** dev DB is currently behind staging on some migrations (see `project_dev_db_pending_migrations` memory) — this plan pushes all migrations to the dev DB first (linked), staging catch-up is a separate follow-up

## File structure

New files this plan creates:

```
supabase/migrations/
  YYYYMMDD000100_attribute_definitions_table.sql        (Task 1.1)
  YYYYMMDD000200_attribute_options_table.sql            (Task 1.2)
  YYYYMMDD000300_item_attributes_table.sql              (Task 1.3)
  YYYYMMDD000400_effective_attributes_function.sql      (Task 1.4)
  YYYYMMDD000500_picker_step_rpc.sql                    (Task 1.5)

src/hooks/
  useAttributes.ts                                      (Task 2.2, 2.4, 3.1, 4.1)

src/components/master-data/attributes/
  AttributesTab.tsx                                     (Task 2.3)
  AttributeFormDialog.tsx                               (Task 2.4)
  AttributeOptionsEditor.tsx                            (Task 2.4)

src/components/shared/
  ProductAttributePicker.tsx                            (Task 4.2)
  AttributeChipStrip.tsx                                (Task 3.3)
```

Modified files:

```
src/lib/permissions.ts                                  (Task 0.3, 2.1)
src/components/master-data/PermissionTree.tsx           (Task 0.2, 0.3, 2.1)
src/hooks/usePermissions.ts                             (Task 0.1)
src/hooks/useInventory.ts                               (delete dead hook — Task 3.1)
src/lib/queryKeys.ts                                    (Task 2.2, 3.1, 4.1)
src/types/database.types.ts                             (regen after each migration)
src/app/(dashboard)/master-data/inventory/page.tsx      (Task 2.3)
src/components/master-data/InventoryItemFormDialog.tsx  (Task 3.2)
src/components/services/inventory/ItemEditDialog.tsx    (Task 3.2)
src/components/services/inventory/ItemsListView.tsx     (Task 3.3)
src/app/(dashboard)/sales/create-so/page.tsx            (Task 5.1)
src/app/(dashboard)/sales/edit-so/[id]/page.tsx         (Task 5.1)
(Task 5.2 — N/A: no quotations/contracts surface on this branch)
(Task 5.3 — N/A: no InventoryTableView on this branch; ItemEditDialog covered in Task 3.2)
src/components/consumption/NewConsumptionDialog.tsx     (Task 5.4)
PROGRESS.md                                             (per-task)
docs/flows-registry.md                                  (Task 6.1)
EOD/EOD-YYYY-MM-DD.md                                   (per-task, silent append)
```

---

# Phase 0 — View / Create / Edit Permission Split (3-state, prep work)

Lands first so every downstream permission key uses the new 3-state pattern.

## Task 0.1: Add `useHasViewPermission` + `useHasCreatePermission` + `useHasEditPermission` helpers

**Files:**
- Modify: `src/hooks/usePermissions.ts`

**Interfaces:**
- Produces: `useHasViewPermission(area)`, `useHasCreatePermission(area)`, `useHasEditPermission(area)` — all `(area: string): boolean`

- [ ] **Step 1: Read current file to confirm location**

```bash
grep -n "useHasPermission" src/hooks/usePermissions.ts
```

- [ ] **Step 2: Append the three helpers below `useHasPermission`**

```typescript
export function useHasEditPermission(area: string): boolean {
  const { data } = usePermissions()
  if (!data) return false
  if (data.isSystemAdmin) return true
  return (
    data.permissions.includes(`${area}.edit`) ||
    data.permissions.includes(`${area}.manage`)
  )
}

export function useHasCreatePermission(area: string): boolean {
  const { data } = usePermissions()
  if (!data) return false
  if (data.isSystemAdmin) return true
  return data.permissions.includes(`${area}.create`)
}

export function useHasViewPermission(area: string): boolean {
  const { data } = usePermissions()
  if (!data) return false
  if (data.isSystemAdmin) return true
  return (
    data.permissions.includes(`${area}.view`) ||
    // create / edit / manage all imply view — defensive against orphan misconfig
    data.permissions.includes(`${area}.create`) ||
    data.permissions.includes(`${area}.edit`) ||
    data.permissions.includes(`${area}.manage`)
  )
}
```

Note: `.create` and `.edit` are **orthogonal** — the create helper does NOT accept `.edit` as a fallback and vice-versa. A role must hold `.create` explicitly to create; the backfill migration (Task 0.5) ensures existing `.edit`-holding roles get `.create` granted on deploy so no workflow breaks.

- [ ] **Step 3: Verify tsc**

Run: `npx tsc --noEmit 2>&1 | grep usePermissions`
Expected: no output

- [ ] **Step 4: Operator smoke + commit** (unchanged shape from before)

```bash
git add src/hooks/usePermissions.ts
git commit -m "$(cat <<'EOF'
feat(permissions): add 3-state useHas{View,Create,Edit}Permission helpers

Codifies the 3-state view/create/edit permission model. .create and .edit
are orthogonal — holding one does not imply the other. Both imply .view
defensively. .manage kept as alias of .edit (no rename needed on existing
role data).

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

PROGRESS.md + EOD append per the standard shape.

---

## Task 0.2: PermissionTree save-time orphan-edit validator

**Files:**
- Modify: `src/components/master-data/PermissionTree.tsx`

**Interfaces:**
- Consumes: existing `PermEntry` / `TreeNode` structure
- Produces: exported `validatePermissionSet(perms: string[]): { valid: boolean; orphans: string[] }` used by the Role save dialog

- [ ] **Step 1: Locate the exports block**

```bash
grep -n "^export function\|^export const\|^export type" src/components/master-data/PermissionTree.tsx
```

- [ ] **Step 2: Add `validatePermissionSet` at the bottom of the file**

```typescript
export function validatePermissionSet(perms: string[]): { valid: boolean; orphans: string[] } {
  const orphans: string[] = []
  const set = new Set(perms)
  if (set.has('system.admin')) return { valid: true, orphans: [] }
  for (const p of perms) {
    // .create, .edit, or .manage must have matching .view
    if (p.endsWith('.create') || p.endsWith('.edit') || p.endsWith('.manage')) {
      const area = p.replace(/\.(create|edit|manage)$/, '')
      const viewKey = `${area}.view`
      // Flag any .create/.edit/.manage without its .view sibling.
      // (Legitimate no-view areas like `system.admin` bypass above.)
      if (!set.has(viewKey)) orphans.push(p)
    }
  }
  return { valid: orphans.length === 0, orphans }
}
```

- [ ] **Step 3: Grep to find the RoleFormDialog (or wherever role saving happens)**

```bash
grep -rn "validatePermissionSet\|permissions:.*string\[\]\|save.*role\|useUpsertRole\|useCreateRole" src/components/master-data src/hooks 2>/dev/null | head -15
```

- [ ] **Step 4: Wire the validator into the role save flow**

Locate the role save mutation (likely `useUpsertRole` in a hooks file) or the RoleFormDialog submit handler. Before dispatching the mutation, call:

```typescript
import { validatePermissionSet } from '@/components/master-data/PermissionTree'

const check = validatePermissionSet(selectedPermissions)
if (!check.valid) {
  toast.error(`Cannot save — these keys grant edit without matching view: ${check.orphans.join(', ')}`)
  return
}
```

- [ ] **Step 5: Verify tsc + smoke**

Run: `npx tsc --noEmit 2>&1 | grep -E "PermissionTree|RoleForm"`
Expected: no output

Ask operator to:
- Open a role, try to save with an `.edit` key toggled on but its matching `.view` off → sees the toast
- Fix by toggling `.view` on → saves cleanly
- Toggle `.view` alone (no edit) → saves cleanly (view without edit is fine)

- [ ] **Step 6: Commit + PROGRESS.md + EOD**

```bash
git add src/components/master-data/PermissionTree.tsx src/components/master-data/RoleFormDialog.tsx
git commit -m "$(cat <<'EOF'
feat(permissions): PermissionTree save-time orphan-edit validator

Refuses to save a role whose selection grants .edit or .manage on any
area without the matching .view key. Prevents historical sloppiness
from spreading.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

PROGRESS.md update + EOD append per the standard shape.

---

## Task 0.3: Audit current permission keys + add missing view/create/edit trios

**Files:**
- Read: `src/lib/permissions.ts`, `src/components/master-data/PermissionTree.tsx`
- Modify: `src/lib/permissions.ts`, `src/components/master-data/PermissionTree.tsx`
- Create: `docs/plans/2026-08-04-permission-audit.md` (audit-table appendix)

**Interfaces:**
- Produces: complete view/create/edit trios across every mutating surface. Non-mutating surfaces (reports, dashboards) get `.view` only. Governance surfaces (approval configuration) get `.view` + `.edit` only (no create/no edit distinction — you either configure workflows or you don't).

- [ ] **Step 1: Enumerate current permission keys**

```bash
grep -nE "^\s*\{\s*key:" src/lib/permissions.ts | head -200
grep -nE "'[a-z_]+\.[a-z_.]+'" src/components/master-data/PermissionTree.tsx | head -200
```

Compile a table in `docs/plans/2026-08-04-permission-audit.md` with columns: `Area | current keys | needs .view | needs .create | needs .edit | classification note`.

- [ ] **Step 2: Classification rules (apply while filling the audit table)**

| Surface type | Keys |
|---|---|
| Mutable data (Master Data records — customers, suppliers, items, categories, warehouses, users, roles, teams, places, services, contracts, credit groups, country codes, repair vendors) | view + create + edit |
| Business documents (POs, SOs, Quotations, Deliveries, Returns, Credit Notes, Debit Notes, Invoices, Landed Costs, Payments) | view + create + edit |
| Warehouse ops with clear new-entity boundaries (Transfers, Adjustments, Inventory Checks, Receivals, Consumption) | view + create + edit |
| Warehouse ops that are only mutations on existing entities (Custody actions, Damaged Stock dispositions) | view + edit only — no `.create` (custody rows are created implicitly by receival / stock movements; damaged rows are created by other flows) |
| Contact Centre | view + create + edit — creating a manual thread / task is a distinct concept from replying |
| Reports / read-only dashboards (Stock Overview, Stock Value, P&L, cash flow) | view only |
| Approval workflow configuration (governance) | view + edit only |
| Dropdown gate keys (`master_data.access`, `purchase.access`, etc.) | unchanged (single-key gate) |
| `system.admin` | unchanged (bypass) |

- [ ] **Step 3: Add every missing key**

For each row in the audit table needing new keys, append entries to the appropriate `PERMISSION_GROUPS` section in `src/lib/permissions.ts` AND mirror in `NAV_TREE` in `PermissionTree.tsx`. Standard label pattern:

```typescript
{ key: `${area}.view`,   label: `View ${Label}`,   description: 'See the page / list / detail' },
{ key: `${area}.create`, label: `Create ${Label}`, description: 'Add new records' },
{ key: `${area}.edit`,   label: `Edit ${Label}`,   description: 'Modify / cancel / delete existing records' },
```

For Custody + Damaged Stock (view + edit only), skip `.create`.

- [ ] **Step 4: Verify tsc**

```bash
npx tsc --noEmit 2>&1 | grep -E "permissions|PermissionTree"
```
Expected: no output.

- [ ] **Step 5: Operator smoke**

Ask operator to reload → `/master-data/users` → Permissions tab. Walk every module, confirm each mutating surface shows the view/create/edit trio and read-only surfaces show only view.

- [ ] **Step 6: Commit + PROGRESS.md + EOD**

```bash
git add src/lib/permissions.ts src/components/master-data/PermissionTree.tsx docs/plans/2026-08-04-permission-audit.md
git commit -m "$(cat <<'EOF'
feat(permissions): 3-state audit — view/create/edit trios across every surface

Every mutating surface now exposes a view/create/edit trio.
Custody + Damaged Stock keep view/edit only (their rows are created
implicitly by upstream flows). Read-only surfaces keep view only.
Approval workflow config keeps view/edit only (governance, no create
distinction). Audit table saved to
docs/plans/2026-08-04-permission-audit.md.

No callsites switched yet — Task 0.5 handles that.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 0.4: Backfill migration — grant `.create` to every role currently holding `.edit`

**Files:**
- Create: `supabase/migrations/YYYYMMDD000050_perm_create_backfill.sql`

**Interfaces:**
- One-shot data migration. Runs BEFORE Task 0.5 lands (so callsites gated on `.create` still work for existing roles).

- [ ] **Step 1: Write the migration**

```sql
-- Grant .create to every custom_role that currently holds .edit or .manage.
-- Preserves all existing workflows on deploy — Owners can trim .create
-- off specific roles afterward via the Permissions tab.
UPDATE public.custom_roles cr
SET permissions = (
  SELECT array_agg(DISTINCT p) FROM (
    SELECT unnest(cr.permissions) AS p
    UNION
    SELECT regexp_replace(unnest(cr.permissions), '\.(edit|manage)$', '.create')
    FROM public.custom_roles cr2
    WHERE cr2.id = cr.id
      AND (
        -- Only emit .create for edit/manage keys, not for random other patterns.
        EXISTS (
          SELECT 1 FROM unnest(cr2.permissions) x
          WHERE x LIKE '%.edit' OR x LIKE '%.manage'
        )
      )
  ) t
  WHERE p IS NOT NULL
);

-- Sanity: log how many keys got added per role for audit.
DO $$
DECLARE
  r RECORD;
  original_count int;
BEGIN
  FOR r IN SELECT id, name, permissions FROM public.custom_roles LOOP
    RAISE NOTICE 'Role % — % keys after backfill', r.name, array_length(r.permissions, 1);
  END LOOP;
END $$;
```

Note: the subquery emits `X.create` for every `X.edit` or `X.manage` present. Custody + Damaged Stock roles will get e.g. `custody.teams.create` even though we never surface that key in the UI — cheap and inert. The Task 0.2 validator won't flag it (the validator only checks orphan-edit, not orphan-create).

- [ ] **Step 2: Apply**

```bash
npx supabase db push
```

- [ ] **Step 3: Verify**

```bash
# Spot-check: pick a non-admin custom_role that had .edit keys, confirm .create keys now present:
# SELECT name, permissions FROM public.custom_roles WHERE NOT is_system_admin LIMIT 5;
```

- [ ] **Step 4: Commit + PROGRESS.md + EOD**

```bash
git add supabase/migrations/YYYYMMDD000050_perm_create_backfill.sql
git commit -m "$(cat <<'EOF'
feat(permissions): backfill .create keys onto existing roles

One-shot data migration. Every custom_role holding X.edit or X.manage
gets a matching X.create key so existing workflows don't break the
moment Task 0.5 gates create-flows on .create. Owners can trim
.create off specific roles afterward via the Permissions tab.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 0.5: Callsite sweep — re-classify every mutating button as create vs edit

**Files:** every surface with a mutating button. Split into sub-tasks per module to keep commits scoped.

**Interfaces:**
- Uses `useHasCreatePermission` and `useHasEditPermission` from Task 0.1

- [ ] **Step 0: Discovery grep — map every gated surface**

```bash
grep -rnE "useHasPermission\(['\"][a-z_]+\.[a-z_.]+" src/ | sort -u
grep -rnE "useHasEditPermission\(['\"][a-z_]+\.[a-z_.]+" src/ | sort -u
```

Cross-reference with the audit table from Task 0.3 to produce a callsite ledger — one line per button/action.

- [ ] **Step 1: Sub-task per module** — commit each independently

Suggested order (each is one commit):

1. **Master Data — records (customers / suppliers / items / brand variants / categories / warehouses / sub-containers / teams / places / services / credit groups / users / roles / repair vendors / country codes)** — `New X` buttons + import buttons gated on `.create`; row-level edit / archive / delete gated on `.edit`
2. **Purchase — orders / returns / debit notes / landed costs** — Create-PO / Create-Return / Create-DN / Create-LC on `.create`; per-row modify / cancel / receive / complete on `.edit`
3. **Sales — orders / quotations / deliveries / returns / credit notes / invoices / payments** — Create-X on `.create`; per-row edit / cancel / void / delivery-complete on `.edit`
4. **Warehouse ops with create — transfers / adjustments / inventory checks / receivals / consumption** — New-X on `.create`; per-row cancel / approve-adjust / complete on `.edit`
5. **Warehouse ops edit-only — custody / damaged stock** — every mutating button on `.edit` (no `.create` split — these were flagged in Task 0.3)
6. **Contact Centre** — new-thread / new-task on `.create`; reply / edit-customer / complete-task on `.edit`

- [ ] **Step 2: Standard gating pattern (per callsite)**

```tsx
import { useHasCreatePermission, useHasEditPermission } from '@/hooks/usePermissions'

const canCreate = useHasCreatePermission('purchase.orders')
const canEdit   = useHasEditPermission('purchase.orders')

// Top of page:
{canCreate && <Button onClick={() => router.push('/purchase/create-po')}>New PO</Button>}

// Row-level:
{canEdit && <Button onClick={() => openEditDialog(row)}>Edit</Button>}
```

Prefer `hide` over `disabled` for the buttons — a disabled button still confuses users. Exception: page-level actions where hiding would remove important affordance context — then disable with a tooltip explaining the missing permission.

- [ ] **Step 3: Verify tsc per sub-task**

```bash
npx tsc --noEmit 2>&1 | grep -E "<module-folder>"
```

- [ ] **Step 4: Operator smoke per sub-task**

For each module, ask operator to log in as a test role holding only `.view` on that module (no create/edit) — confirm every mutating button is hidden. Then grant `.create` only → confirm New-X buttons appear but row-level edit stays hidden. Then grant `.edit` too → full access.

- [ ] **Step 5: Commit per sub-task** with the standard trailers

Phase 0 complete — 3-state permission foundation is in place. Category Attributes now inherits the new pattern.

---

# Phase 1 — Category Attributes DB layer

Five migrations + type regen.

## Task 1.1: Migration — `inventory_attribute_definitions` table + branch-uniqueness trigger

**Files:**
- Create: `supabase/migrations/YYYYMMDD000100_attribute_definitions_table.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Attribute schema per inventory category. Sub-categories inherit from
-- ancestors additively; a key can appear at most once per top-level tree.
CREATE TABLE public.inventory_attribute_definitions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id       uuid NOT NULL REFERENCES public.inventory_categories(id) ON DELETE CASCADE,
  attribute_key     text NOT NULL,
  label_en          text NOT NULL,
  label_ar          text,
  sort_order        int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES public.user_data(id) ON DELETE SET NULL,
  UNIQUE (category_id, attribute_key)
);

CREATE INDEX iad_category_idx ON public.inventory_attribute_definitions (category_id);
CREATE INDEX iad_key_idx      ON public.inventory_attribute_definitions (attribute_key);

ALTER TABLE public.inventory_attribute_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY iad_read  ON public.inventory_attribute_definitions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY iad_write ON public.inventory_attribute_definitions FOR ALL    USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Branch-uniqueness enforcement — walks ancestors + descendants and blocks
-- duplicate attribute_key. Cap depth at 10 to bound the walk.
CREATE OR REPLACE FUNCTION public._check_attribute_key_branch_unique()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_conflict_category text;
BEGIN
  -- Ancestors
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id, name_en, 1 AS depth
    FROM public.inventory_categories
    WHERE id = NEW.category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.name_en, a.depth + 1
    FROM public.inventory_categories c
    JOIN ancestors a ON a.parent_id = c.id
    WHERE a.depth < 10
  )
  SELECT c.name_en INTO v_conflict_category
  FROM ancestors a
  JOIN public.inventory_attribute_definitions d
    ON d.category_id = a.id
   AND d.attribute_key = NEW.attribute_key
   AND d.id <> COALESCE(NEW.id, gen_random_uuid())
  LIMIT 1;

  IF v_conflict_category IS NOT NULL THEN
    RAISE EXCEPTION 'Attribute % already defined at ancestor category "%"',
      NEW.attribute_key, v_conflict_category
      USING ERRCODE = '23505';
  END IF;

  -- Descendants
  WITH RECURSIVE descendants AS (
    SELECT id, parent_id, name_en, 1 AS depth
    FROM public.inventory_categories
    WHERE parent_id = NEW.category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.name_en, d.depth + 1
    FROM public.inventory_categories c
    JOIN descendants d ON c.parent_id = d.id
    WHERE d.depth < 10
  )
  SELECT c.name_en INTO v_conflict_category
  FROM descendants a
  JOIN public.inventory_attribute_definitions d
    ON d.category_id = a.id
   AND d.attribute_key = NEW.attribute_key
   AND d.id <> COALESCE(NEW.id, gen_random_uuid())
  LIMIT 1;

  IF v_conflict_category IS NOT NULL THEN
    RAISE EXCEPTION 'Attribute % already defined at descendant category "%"',
      NEW.attribute_key, v_conflict_category
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER iad_branch_unique_trg
  BEFORE INSERT OR UPDATE OF category_id, attribute_key
  ON public.inventory_attribute_definitions
  FOR EACH ROW EXECUTE FUNCTION public._check_attribute_key_branch_unique();

-- Auto-update updated_at on UPDATE
CREATE TRIGGER iad_touch_updated_at
  BEFORE UPDATE ON public.inventory_attribute_definitions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
```

Note: `public.touch_updated_at()` exists across the codebase — grep to confirm; if it doesn't, inline `updated_at = now()` in the trigger body.

- [ ] **Step 2: Apply**

```bash
npx supabase db push
```

Expected: `Applying migration YYYYMMDD000100_attribute_definitions_table.sql...` then a linked-database update.

- [ ] **Step 3: Verify the branch-uniqueness trigger works**

```bash
# In psql via `npx supabase db shell` or via a temp SQL script:
INSERT INTO inventory_attribute_definitions (category_id, attribute_key, label_en)
VALUES ('<some-category-id>', 'test_key', 'Test');
-- Try inserting again on a descendant:
INSERT INTO inventory_attribute_definitions (category_id, attribute_key, label_en)
VALUES ('<child-of-above>', 'test_key', 'Test 2');
-- Expected: ERROR: Attribute test_key already defined at ancestor category "..."
-- Cleanup:
DELETE FROM inventory_attribute_definitions WHERE attribute_key = 'test_key';
```

- [ ] **Step 4: Regen types**

```bash
npx supabase gen types typescript --linked --schema public > src/types/database.types.ts
```

Re-append the four helper aliases at the bottom (`DBTable`, `DBInsert`, `DBUpdate`, `AllTables`) — the CLI strips them. Refer to any prior migration commit for the exact helper block.

- [ ] **Step 5: Verify tsc**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: no new errors in `inventory_attribute_definitions` references

- [ ] **Step 6: Commit + PROGRESS.md + EOD**

```bash
git add supabase/migrations/YYYYMMDD000100_attribute_definitions_table.sql src/types/database.types.ts
git commit -m "$(cat <<'EOF'
feat(db): inventory_attribute_definitions + branch-uniqueness trigger

Category-level attribute schema. attribute_key must be unique across
each top-level tree (ancestors + descendants). RLS: authenticated
read/write. No division scoping — schemas are global metadata.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 1.2: Migration — `inventory_attribute_options` table

**Files:**
- Create: `supabase/migrations/YYYYMMDD000200_attribute_options_table.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Allowed values per attribute definition. Soft-hide via is_archived.
CREATE TABLE public.inventory_attribute_options (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id  uuid NOT NULL REFERENCES public.inventory_attribute_definitions(id) ON DELETE CASCADE,
  value_en       text NOT NULL,
  value_ar       text,
  sort_order     int NOT NULL DEFAULT 0,
  is_archived    boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX iao_value_en_ci_uidx ON public.inventory_attribute_options (definition_id, lower(value_en));
CREATE INDEX iao_definition_idx ON public.inventory_attribute_options (definition_id);
CREATE INDEX iao_active_idx     ON public.inventory_attribute_options (definition_id) WHERE NOT is_archived;

ALTER TABLE public.inventory_attribute_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY iao_read  ON public.inventory_attribute_options FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY iao_write ON public.inventory_attribute_options FOR ALL    USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
```

- [ ] **Step 2: Apply, regen types, tsc, commit** (same pattern as Task 1.1)

```bash
npx supabase db push
npx supabase gen types typescript --linked --schema public > src/types/database.types.ts
# re-append helper aliases
npx tsc --noEmit 2>&1 | grep inventory_attribute_options
git add supabase/migrations/YYYYMMDD000200_attribute_options_table.sql src/types/database.types.ts
git commit -m "feat(db): inventory_attribute_options table with is_archived soft-hide"
# (full commit message with co-authored-by trailers as before)
```

---

## Task 1.3: Migration — `inventory_item_attributes` table

**Files:**
- Create: `supabase/migrations/YYYYMMDD000300_item_attributes_table.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Per-item picked value. Cleared values delete the row rather than
-- storing NULL — no distinction between "never set" and "cleared".
CREATE TABLE public.inventory_item_attributes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  definition_id  uuid NOT NULL REFERENCES public.inventory_attribute_definitions(id) ON DELETE CASCADE,
  option_id      uuid NOT NULL REFERENCES public.inventory_attribute_options(id) ON DELETE RESTRICT,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid REFERENCES public.user_data(id) ON DELETE SET NULL,
  UNIQUE (item_id, definition_id)
);

CREATE INDEX iia_item_idx       ON public.inventory_item_attributes (item_id);
CREATE INDEX iia_definition_idx ON public.inventory_item_attributes (definition_id);
CREATE INDEX iia_option_idx     ON public.inventory_item_attributes (option_id);

ALTER TABLE public.inventory_item_attributes ENABLE ROW LEVEL SECURITY;

CREATE POLICY iia_read  ON public.inventory_item_attributes FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY iia_write ON public.inventory_item_attributes FOR ALL    USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE TRIGGER iia_touch_updated_at
  BEFORE UPDATE ON public.inventory_item_attributes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
```

- [ ] **Step 2: Apply, regen, tsc, commit** (same pattern as 1.1)

---

## Task 1.4: Migration — `get_effective_attributes(category_id)` function

**Files:**
- Create: `supabase/migrations/YYYYMMDD000400_effective_attributes_function.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Returns the effective attribute schema for a category — union of
-- definitions on (category_id + all ancestors) ordered by sort_order,
-- with a stable tie-break by depth (ancestors first).
CREATE OR REPLACE FUNCTION public.get_effective_attributes(p_category_id uuid)
RETURNS TABLE (
  definition_id   uuid,
  category_id     uuid,
  category_name   text,
  attribute_key   text,
  label_en        text,
  label_ar        text,
  sort_order      int,
  depth           int,
  is_inherited    boolean
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_catalog AS $$
  WITH RECURSIVE tree AS (
    SELECT id, parent_id, name_en, 0 AS depth
    FROM inventory_categories
    WHERE id = p_category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.name_en, t.depth + 1
    FROM inventory_categories c
    JOIN tree t ON t.parent_id = c.id
    WHERE t.depth < 10
  )
  SELECT
    d.id,
    d.category_id,
    t.name_en,
    d.attribute_key,
    d.label_en,
    d.label_ar,
    d.sort_order,
    t.depth,
    (t.depth > 0) AS is_inherited
  FROM inventory_attribute_definitions d
  JOIN tree t ON t.id = d.category_id
  ORDER BY d.sort_order ASC, t.depth ASC;
$$;
```

- [ ] **Step 2: Apply, regen (function types), commit**

- [ ] **Step 3: Verify**

```bash
# Verify against a real category tree:
SELECT * FROM get_effective_attributes('<some-leaf-category-id>');
# Expected: rows with is_inherited=true for ancestor-defined, is_inherited=false for own defs, sorted by sort_order then depth.
```

---

## Task 1.5: Migration — `rpc_attribute_picker_step` RPC

**Files:**
- Create: `supabase/migrations/YYYYMMDD000500_picker_step_rpc.sql`

- [ ] **Step 1: Write the migration**

```sql
-- One round-trip for the ProductAttributePicker: given current picks,
-- returns remaining candidate items, next attribute to ask about, and
-- options for that attribute that at least one candidate holds.
CREATE OR REPLACE FUNCTION public.rpc_attribute_picker_step(
  p_category_id  uuid,
  p_picks        jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_catalog AS $$
DECLARE
  v_result jsonb;
  v_candidate_ids uuid[];
  v_next_def record;
BEGIN
  -- Candidate items: in the category subtree, matching every pick (or NULL for that attr).
  WITH RECURSIVE subtree AS (
    SELECT id FROM inventory_categories WHERE id = p_category_id
    UNION ALL
    SELECT c.id FROM inventory_categories c JOIN subtree s ON c.parent_id = s.id
  ),
  base_items AS (
    SELECT i.id FROM inventory_items i WHERE i.category_id IN (SELECT id FROM subtree)
  ),
  matching_items AS (
    SELECT bi.id
    FROM base_items bi
    WHERE NOT EXISTS (
      -- Item is disqualified if for ANY pick, the item has a value that isn't the picked one.
      -- Items with NO value for the attr are still eligible ("unknown / any").
      SELECT 1 FROM jsonb_each_text(p_picks) pick(k, v)
      JOIN inventory_attribute_definitions def
        ON def.attribute_key = pick.k
       AND def.category_id IN (SELECT id FROM subtree UNION SELECT ancestor_id FROM (
         WITH RECURSIVE a AS (
           SELECT c.parent_id AS ancestor_id, 1 AS depth
           FROM inventory_categories c WHERE c.id = p_category_id
           UNION ALL
           SELECT c.parent_id, a.depth + 1
           FROM inventory_categories c JOIN a ON c.id = a.ancestor_id
           WHERE a.depth < 10
         ) SELECT ancestor_id FROM a WHERE ancestor_id IS NOT NULL
       ) anc)
      JOIN inventory_item_attributes ia
        ON ia.item_id = bi.id
       AND ia.definition_id = def.id
      WHERE ia.option_id::text <> pick.v
    )
  )
  SELECT array_agg(id) INTO v_candidate_ids FROM matching_items;

  IF v_candidate_ids IS NULL THEN v_candidate_ids := ARRAY[]::uuid[]; END IF;

  -- Next attribute: first effective attribute (by sort_order) not yet picked,
  -- IF more than one candidate remains.
  IF COALESCE(array_length(v_candidate_ids, 1), 0) > 1 THEN
    SELECT def_id, def_key, def_label_en, def_label_ar
    INTO v_next_def
    FROM (
      SELECT id AS def_id, attribute_key AS def_key, label_en AS def_label_en, label_ar AS def_label_ar
      FROM get_effective_attributes(p_category_id)
      WHERE NOT (p_picks ? attribute_key)
      ORDER BY sort_order ASC
      LIMIT 1
    ) t;
  END IF;

  v_result := jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id,
        'name_en', i.name_en,
        'name_ar', i.name_ar,
        'sku', i.sku,
        'image_url', i.image_url,
        'brand_variants', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', bv.id,
            'brand', bv.brand,
            'code', bv.code,
            'stock_level', bv.stock_level
          ) ORDER BY bv.brand)
          FROM inventory_item_brand_variants bv
          WHERE bv.item_id = i.id AND bv.status = 'active'
        ), '[]'::jsonb)
      ) ORDER BY i.name_en)
      FROM inventory_items i
      WHERE i.id = ANY(v_candidate_ids)
    ), '[]'::jsonb),
    'next_attribute', CASE WHEN v_next_def.def_id IS NOT NULL THEN jsonb_build_object(
      'id', v_next_def.def_id,
      'key', v_next_def.def_key,
      'label_en', v_next_def.def_label_en,
      'label_ar', v_next_def.def_label_ar
    ) ELSE null END,
    'next_options', CASE WHEN v_next_def.def_id IS NULL THEN '[]'::jsonb ELSE (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', o.id,
        'value_en', o.value_en,
        'value_ar', o.value_ar,
        'item_count', (
          SELECT count(*) FROM inventory_item_attributes ia
          WHERE ia.definition_id = v_next_def.def_id
            AND ia.option_id = o.id
            AND ia.item_id = ANY(v_candidate_ids)
        )
      ) ORDER BY o.sort_order), '[]'::jsonb)
      FROM inventory_attribute_options o
      WHERE o.definition_id = v_next_def.def_id
        AND NOT o.is_archived
        AND EXISTS (
          SELECT 1 FROM inventory_item_attributes ia
          WHERE ia.definition_id = v_next_def.def_id
            AND ia.option_id = o.id
            AND ia.item_id = ANY(v_candidate_ids)
        )
    ) END
  );

  RETURN v_result;
END;
$$;
```

Complex enough that a follow-up perf pass may be needed after real data lands. First implementation ships as-is; measure before caching.

- [ ] **Step 2: Apply, regen (function types), commit**

- [ ] **Step 3: Verify**

Call the RPC with an empty pick set and a real category with a few items + attributes. Confirm:
- `items` returns all items in the category subtree
- `next_attribute` is the first attribute by sort_order
- `next_options` has counts

Then call with one pick set — verify candidates narrow and `next_attribute` advances.

Phase 1 complete — DB layer is done.

---

# Phase 2 — Definition editor

## Task 2.1: Add `master_data.inventory.attributes.{view,create,edit}` permissions

**Files:**
- Modify: `src/lib/permissions.ts`, `src/components/master-data/PermissionTree.tsx`

- [ ] **Step 1: Add the trio in `src/lib/permissions.ts`** (Master Data → Inventory section)

```typescript
{
  label: 'Inventory Attributes',
  permissions: [
    { key: 'master_data.inventory.attributes.view',   label: 'View Category Attributes',   description: 'See the Attributes tab on the Inventory master-data page' },
    { key: 'master_data.inventory.attributes.create', label: 'Create Category Attributes', description: 'Add new attribute definitions and options' },
    { key: 'master_data.inventory.attributes.edit',   label: 'Edit Category Attributes',   description: 'Modify, archive, restore, delete existing attribute definitions and options' },
  ],
},
```

Downstream: the `AttributesTab` "Add attribute" button gates on `useHasCreatePermission('master_data.inventory.attributes')`, and the per-row edit / archive / delete buttons gate on `useHasEditPermission('master_data.inventory.attributes')`.

- [ ] **Step 2: Mirror in PermissionTree.tsx** (under the `md-inventory` node)

- [ ] **Step 3: Verify tsc + smoke**

Ask operator to reload → `/master-data/users` → Permissions tab → Inventory group shows the new "Category Attributes" pair.

- [ ] **Step 4: Commit + PROGRESS.md + EOD**

---

## Task 2.2: Attribute hooks — definitions + options CRUD

**Files:**
- Create: `src/hooks/useAttributes.ts`
- Modify: `src/lib/queryKeys.ts`

- [ ] **Step 1: Add query keys**

In `src/lib/queryKeys.ts`, add:

```typescript
attributes: {
  all: ['inventory-attributes'] as const,
  definitionsForCategory: (categoryId: string) => ['inventory-attributes', 'defs', categoryId] as const,
  effectiveForCategory:   (categoryId: string) => ['inventory-attributes', 'effective', categoryId] as const,
  optionsForDefinition:   (definitionId: string) => ['inventory-attributes', 'options', definitionId] as const,
  itemValues:             (itemId: string) => ['inventory-attributes', 'item', itemId] as const,
  pickerStep:             (categoryId: string, picksKey: string) => ['inventory-attributes', 'picker', categoryId, picksKey] as const,
},
```

- [ ] **Step 2: Create `src/hooks/useAttributes.ts`**

Full file:

```typescript
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'

export type AttributeDefinition = DBTable<'inventory_attribute_definitions'>
export type AttributeOption     = DBTable<'inventory_attribute_options'>
export type ItemAttributeValue  = DBTable<'inventory_item_attributes'>

// ─── Definitions ────────────────────────────────────────────────────────

export function useAttributeDefinitionsForCategory(categoryId: string | null) {
  return useQuery({
    queryKey: queryKeys.attributes.definitionsForCategory(categoryId ?? '__none__'),
    enabled: !!categoryId,
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_attribute_definitions')
        .select('*')
        .eq('category_id', categoryId!)
        .order('sort_order', { ascending: true })
        .limit(200)
      if (error) throw error
      return (data ?? []) as AttributeDefinition[]
    },
  })
}

export type EffectiveAttribute = {
  definition_id: string
  category_id: string
  category_name: string
  attribute_key: string
  label_en: string
  label_ar: string | null
  sort_order: number
  depth: number
  is_inherited: boolean
}

export function useEffectiveAttributes(categoryId: string | null) {
  return useQuery({
    queryKey: queryKeys.attributes.effectiveForCategory(categoryId ?? '__none__'),
    enabled: !!categoryId,
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_effective_attributes', {
        p_category_id: categoryId!,
      })
      if (error) throw error
      return (data ?? []) as EffectiveAttribute[]
    },
  })
}

export function useUpsertAttributeDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id?: string
      category_id: string
      attribute_key: string
      label_en: string
      label_ar?: string | null
      sort_order?: number
    }) => {
      const supabase = createClient()
      const row: DBInsert<'inventory_attribute_definitions'> = {
        id: payload.id,
        category_id: payload.category_id,
        attribute_key: payload.attribute_key,
        label_en: payload.label_en,
        label_ar: payload.label_ar ?? null,
        sort_order: payload.sort_order ?? 0,
      }
      const { data, error } = await supabase
        .from('inventory_attribute_definitions')
        .upsert(row)
        .select('*')
        .single()
      if (error) throw error
      return data as AttributeDefinition
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.attributes.definitionsForCategory(data.category_id) })
      qc.invalidateQueries({ queryKey: queryKeys.attributes.effectiveForCategory(data.category_id) })
      qc.invalidateQueries({ queryKey: queryKeys.attributes.all })
    },
  })
}

export function useDeleteAttributeDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ definitionId }: { definitionId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('inventory_attribute_definitions')
        .delete()
        .eq('id', definitionId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.attributes.all })
    },
  })
}

// ─── Options ────────────────────────────────────────────────────────────

export function useAttributeOptionsForDefinition(definitionId: string | null) {
  return useQuery({
    queryKey: queryKeys.attributes.optionsForDefinition(definitionId ?? '__none__'),
    enabled: !!definitionId,
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_attribute_options')
        .select('*')
        .eq('definition_id', definitionId!)
        .order('sort_order', { ascending: true })
        .limit(500)
      if (error) throw error
      return (data ?? []) as AttributeOption[]
    },
  })
}

export function useUpsertAttributeOption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id?: string
      definition_id: string
      value_en: string
      value_ar?: string | null
      sort_order?: number
      is_archived?: boolean
    }) => {
      const supabase = createClient()
      const row: DBInsert<'inventory_attribute_options'> = {
        id: payload.id,
        definition_id: payload.definition_id,
        value_en: payload.value_en,
        value_ar: payload.value_ar ?? null,
        sort_order: payload.sort_order ?? 0,
        is_archived: payload.is_archived ?? false,
      }
      const { data, error } = await supabase
        .from('inventory_attribute_options')
        .upsert(row)
        .select('*')
        .single()
      if (error) throw error
      return data as AttributeOption
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.attributes.optionsForDefinition(data.definition_id) })
      qc.invalidateQueries({ queryKey: queryKeys.attributes.all })
    },
  })
}

export function useDeleteAttributeOption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ optionId }: { optionId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('inventory_attribute_options')
        .delete()
        .eq('id', optionId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.attributes.all })
    },
  })
}
```

- [ ] **Step 3: Verify tsc**

Run: `npx tsc --noEmit 2>&1 | grep useAttributes`
Expected: no output

- [ ] **Step 4: Commit + PROGRESS.md + EOD**

---

## Task 2.3: Attributes tab in Inventory master-data page

**Files:**
- Create: `src/components/master-data/attributes/AttributesTab.tsx`
- Modify: `src/app/(dashboard)/master-data/inventory/page.tsx`

- [ ] **Step 1: Create the tab component**

`src/components/master-data/attributes/AttributesTab.tsx` renders:
- Header text explaining the tab
- Inherited attributes list (read-only, dimmed, one row per attribute with "↑ from {category_name}" label)
- Local attributes list (editable, drag-to-reorder — use `@dnd-kit/sortable` if not already installed; check first with `grep -r "dnd-kit" package.json` — if not, use a simpler up/down arrow reorder)
- `[+ Add attribute]` button opens `AttributeFormDialog` (Task 2.4)

Component signature:

```typescript
export function AttributesTab({ categoryId }: { categoryId: string }) {
  const { data: effective = [] } = useEffectiveAttributes(categoryId)
  const canEdit = useHasEditPermission('master_data.inventory.attributes')

  const inherited = effective.filter(e => e.is_inherited)
  const local     = effective.filter(e => !e.is_inherited)

  return (
    <div className="space-y-4">
      {inherited.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Inherited attributes</h3>
          <div className="space-y-2">
            {inherited.map(a => (
              <div key={a.definition_id} className="rounded border bg-muted/30 p-3 text-sm">
                <div className="font-medium">{a.label_en}</div>
                <div className="text-xs text-muted-foreground">↑ from {a.category_name}</div>
                {/* Show options inline via a sub-component that fetches useAttributeOptionsForDefinition(a.definition_id) */}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Local attributes</h3>
        {local.length === 0 ? (
          <div className="rounded border border-dashed p-4 text-sm text-muted-foreground text-center">
            No attributes defined at this category
          </div>
        ) : (
          <div className="space-y-2">{/* editable rows */}</div>
        )}
        {canEdit && (
          <Button size="sm" className="mt-3 gap-1.5" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add attribute
          </Button>
        )}
      </section>
    </div>
  )
}
```

Fill in the "editable rows" placeholder with actual JSX rendering each local definition + edit/delete buttons.

- [ ] **Step 2: Add the tab to the Inventory page**

In `src/app/(dashboard)/master-data/inventory/page.tsx`, find where the category detail pane is rendered. Wrap the existing item list in a `<Tabs>` with two triggers:

```tsx
<Tabs defaultValue="items">
  <TabsList>
    <TabsTrigger value="items">Items</TabsTrigger>
    {useHasViewPermission('master_data.inventory.attributes') && (
      <TabsTrigger value="attributes">Attributes</TabsTrigger>
    )}
  </TabsList>
  <TabsContent value="items">{/* existing item list */}</TabsContent>
  <TabsContent value="attributes">
    {selectedCategoryId && <AttributesTab categoryId={selectedCategoryId} />}
  </TabsContent>
</Tabs>
```

- [ ] **Step 3: tsc, operator smoke, commit**

Operator smoke:
- Reload → `/master-data/inventory` → pick a category → the tabs show `Items` + `Attributes`
- Click Attributes → sees the empty state ("No attributes defined at this category")
- Pick a sub-category of a category that has attributes → Attributes tab shows the inherited section

---

## Task 2.4: `AttributeFormDialog` + `AttributeOptionsEditor`

**Files:**
- Create: `src/components/master-data/attributes/AttributeFormDialog.tsx`
- Create: `src/components/master-data/attributes/AttributeOptionsEditor.tsx`

- [ ] **Step 1: Create `AttributeFormDialog.tsx`**

Fields: `attribute_key` (snake_case, auto-slug from label with a manual override), `label_en`, `label_ar`, `sort_order`, and an embedded `<AttributeOptionsEditor>`. On save:
- Validate `attribute_key` is snake_case (regex `/^[a-z][a-z0-9_]*$/`)
- Call `useUpsertAttributeDefinition` — the trigger returns 23505 with a clear message if the key conflicts in the tree. Show that message inline (extract from `error.message`).

- [ ] **Step 2: Create `AttributeOptionsEditor.tsx`**

Renders a list of rows, each with:
- `value_en` input, `value_ar` input, up/down reorder arrows, archive toggle
- `[+ Add option]` button

Each row change fires `useUpsertAttributeOption` on blur (debounced). Archive toggle flips `is_archived`.

- [ ] **Step 3: Wire into `AttributesTab`**

The `[+ Add attribute]` button opens the dialog in create mode; clicking a local attribute row opens it in edit mode with existing values.

- [ ] **Step 4: tsc, operator smoke, commit**

Operator smoke:
- Add a new attribute at "Water Cooler": `attribute_key=legs`, `label_en=Legs`, add options `4`, `6`, `8`
- Save — appears in local attributes list
- Navigate to a sub-category of "Water Cooler" → attribute appears in Inherited section
- Try to add `legs` at the sub-category → save fails with the trigger error message

Phase 2 complete — definition editor is live.

---

# Phase 3 — Item-level values

## Task 3.1: Item-attribute hooks + delete dead hook

**Files:**
- Modify: `src/hooks/useAttributes.ts` (append), `src/hooks/useInventory.ts` (delete dead hook), `src/lib/queryKeys.ts` (remove dead `itemAttributes` key)

- [ ] **Step 1: Grep for callers of the dead hook**

```bash
grep -rn "useUpsertInventoryItemAttributes\|queryKeys.inventory.itemAttributes" src/ 2>/dev/null
```

Expected: only the definitions themselves — no other callers.

- [ ] **Step 2: Delete the dead hook**

Remove `useUpsertInventoryItemAttributes` and its `AnyTable` helper type from `src/hooks/useInventory.ts` (~lines 904-926). Remove `queryKeys.inventory.itemAttributes` from `src/lib/queryKeys.ts`.

- [ ] **Step 3: Append the new item-value hooks to `useAttributes.ts`**

```typescript
// ─── Item values ────────────────────────────────────────────────────────

export function useItemAttributes(itemId: string | null) {
  return useQuery({
    queryKey: queryKeys.attributes.itemValues(itemId ?? '__none__'),
    enabled: !!itemId,
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_item_attributes')
        .select('id, item_id, definition_id, option_id')
        .eq('item_id', itemId!)
      if (error) throw error
      return (data ?? []) as Array<{ id: string; item_id: string; definition_id: string; option_id: string }>
    },
  })
}

export function useUpsertItemAttributes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, values }: {
      itemId: string
      values: Array<{ definition_id: string; option_id: string | null }>
    }) => {
      const supabase = createClient()
      // Delete rows where option_id is null (cleared), upsert rows where option_id is set.
      const toDelete = values.filter(v => v.option_id === null).map(v => v.definition_id)
      const toUpsert = values.filter(v => v.option_id !== null).map(v => ({
        item_id: itemId,
        definition_id: v.definition_id,
        option_id: v.option_id!,
      }))
      if (toDelete.length > 0) {
        const { error } = await supabase
          .from('inventory_item_attributes')
          .delete()
          .eq('item_id', itemId)
          .in('definition_id', toDelete)
        if (error) throw error
      }
      if (toUpsert.length > 0) {
        const { error } = await supabase
          .from('inventory_item_attributes')
          .upsert(toUpsert, { onConflict: 'item_id,definition_id' })
        if (error) throw error
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.attributes.itemValues(vars.itemId) })
    },
  })
}
```

- [ ] **Step 4: tsc + commit**

Verify no stragglers with the grep from Step 1. Commit — one commit deletes the dead hook + adds the new ones.

---

## Task 3.2: Wire Attributes section into item dialogs

**Files:**
- Modify: `src/components/master-data/InventoryItemFormDialog.tsx`, `src/components/services/inventory/ItemEditDialog.tsx`

- [ ] **Step 1: Create a shared `ItemAttributesSection.tsx` component**

Create `src/components/master-data/attributes/ItemAttributesSection.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useEffectiveAttributes, useAttributeOptionsForDefinition, useItemAttributes } from '@/hooks/useAttributes'

export function ItemAttributesSection({
  itemId,
  categoryId,
  onChange,
}: {
  itemId: string | null   // null on new-item flow
  categoryId: string | null
  onChange: (values: Array<{ definition_id: string; option_id: string | null }>) => void
}) {
  const { data: effective = [] } = useEffectiveAttributes(categoryId)
  const { data: existing = [] }  = useItemAttributes(itemId)

  // Local state — map of definition_id → option_id (null for cleared)
  const [values, setValues] = useState<Record<string, string | null>>({})

  useEffect(() => {
    // Hydrate from existing on load / on itemId change
    const initial: Record<string, string | null> = {}
    for (const row of existing) initial[row.definition_id] = row.option_id
    setValues(initial)
  }, [existing, itemId])

  useEffect(() => {
    // Propagate to parent whenever values change
    const payload = effective.map(e => ({
      definition_id: e.definition_id,
      option_id: values[e.definition_id] ?? null,
    }))
    onChange(payload)
  }, [values, effective, onChange])

  if (!categoryId || effective.length === 0) return null

  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Attributes</Label>
      <div className="space-y-2">
        {effective.map(a => (
          <AttributeRow
            key={a.definition_id}
            definitionId={a.definition_id}
            label={a.label_en}
            value={values[a.definition_id] ?? null}
            onValue={v => setValues(prev => ({ ...prev, [a.definition_id]: v }))}
          />
        ))}
      </div>
    </div>
  )
}

function AttributeRow({
  definitionId, label, value, onValue,
}: {
  definitionId: string
  label: string
  value: string | null
  onValue: (v: string | null) => void
}) {
  const { data: options = [] } = useAttributeOptionsForDefinition(definitionId)
  const active = options.filter(o => !o.is_archived || o.id === value)

  return (
    <div className="flex items-center gap-2">
      <Label className="w-32 text-xs">{label}</Label>
      <Select value={value ?? ''} onValueChange={v => onValue(v || null)}>
        <SelectTrigger className="h-8 text-xs flex-1">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {active.map(o => (
            <SelectItem key={o.id} value={o.id} className="text-xs">
              {o.value_en}{o.is_archived ? ' (archived)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value && (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onValue(null)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into `InventoryItemFormDialog.tsx`**

Add a state slot for attribute values, drop the `<ItemAttributesSection>` below the name/photo/pricing block. On dialog save, after the item is upserted, call `useUpsertItemAttributes` with `{ itemId: <newly-created-or-updated-item-id>, values }`.

Category change mid-edit: if `categoryId` changes and the effective schema shrinks/changes, warn before saving via a confirm dialog.

- [ ] **Step 3: Wire into `ItemEditDialog.tsx`** (same pattern)

- [ ] **Step 4: tsc + operator smoke + commit**

Operator smoke:
- Add a new item under "Water Cooler" → the Attributes section appears with `Legs` (from Task 2.4 setup)
- Pick `4` → save → reload → value persisted
- Edit the item → clear the value with `✕` → save → row deleted from `inventory_item_attributes`

---

## Task 3.3: Item-list chip strip

**Files:**
- Create: `src/components/shared/AttributeChipStrip.tsx`
- Modify: `src/components/services/inventory/ItemsListView.tsx`

- [ ] **Step 1: Create `AttributeChipStrip`**

Reads the item's `useItemAttributes` + `useEffectiveAttributes(categoryId)` + `useAttributeOptionsForDefinition(...)` for each. Renders up to 4 chips inline as `Label: Value`. `...` if more.

- [ ] **Step 2: Mount under item name in `ItemsListView`**

Below the item name line. Show nothing if the item has no values.

- [ ] **Step 3: Verify + operator smoke + commit**

Phase 3 complete — items now carry attribute values.

---

# Phase 4 — ProductAttributePicker

## Task 4.1: Picker hook wrapping the RPC

**Files:**
- Modify: `src/hooks/useAttributes.ts` (append)

- [ ] **Step 1: Append `useAttributePickerStep`**

```typescript
export type PickerStepResult = {
  items: Array<{
    id: string
    name_en: string
    name_ar: string | null
    sku: string | null
    image_url: string | null
    brand_variants: Array<{ id: string; brand: string; code: string | null; stock_level: number }>
  }>
  next_attribute: { id: string; key: string; label_en: string; label_ar: string | null } | null
  next_options: Array<{ id: string; value_en: string; value_ar: string | null; item_count: number }>
}

export function useAttributePickerStep(
  categoryId: string | null,
  picks: Record<string, string>,
) {
  const picksKey = JSON.stringify(picks)  // stable key for query cache
  return useQuery({
    queryKey: queryKeys.attributes.pickerStep(categoryId ?? '__none__', picksKey),
    enabled: !!categoryId,
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_attribute_picker_step', {
        p_category_id: categoryId!,
        p_picks: picks,
      })
      if (error) throw error
      return data as unknown as PickerStepResult
    },
  })
}
```

- [ ] **Step 2: tsc, commit**

---

## Task 4.2: `ProductAttributePicker` component

**Files:**
- Create: `src/components/shared/ProductAttributePicker.tsx`

- [ ] **Step 1: Draft the component**

Signature:

```typescript
export function ProductAttributePicker({
  onPick,
  categoryFilter,
  warehouseScope,
}: {
  onPick: (itemId: string, brandVariantId: string) => void
  categoryFilter?: string
  warehouseScope?: string
}) { /* ... */ }
```

State:
- `selectedCategoryId: string | null`
- `picks: Record<string, string>` — attribute_key → option_id

Renders:
1. **Category picker** — if `categoryFilter` is passed, it's fixed; otherwise a cascading category selector (reuse existing `CategoryPicker` if one exists — grep for it)
2. **For each attribute the picker step returns as `next_attribute`**, render a row of buttons (one per option) with counts
3. **Below**, the candidate items panel — grid of item cards with photo, name, brand-variant chips with stock. Clicking a brand-variant chip fires `onPick(itemId, brandVariantId)`
4. **Zero-match banner** — amber, "No items match — clear a pick above"

Behaviors:
- Changing an upper pick clears all lower picks: `setPicks(prev => { const next = {...prev}; delete next[key]; /* also delete any picks with sort_order > this one */ return next })`. Since we don't know sort_order client-side, take the simpler path: on any pick change, clear ALL picks that came after in the sequence. Track the sequence via a `pickHistory: string[]` array. Removing an entry drops it and everything after it.
- On the final step (`next_attribute === null` AND `items.length >= 1`), the picker shows the final item cards prominently. Auto-select if `items.length === 1` AND `brand_variants.length === 1` — otherwise wait for a click.

- [ ] **Step 2: Implement carefully — worth its own commit**

Given the picker's complexity (~200 LOC), this is the biggest single file this plan creates. Take care with:
- The `pickHistory` state — makes "clear lower picks" work without client-side sort_order
- The image_url fallback — reuse `<ItemPhoto>` from `src/components/shared/ItemPhoto.tsx` for consistent placeholder rendering
- Locale switching — labels render `label_en` or `label_ar` based on current locale (grep for the existing locale helper)

- [ ] **Step 3: Standalone operator smoke**

Wire the picker temporarily into `/master-data/inventory` as a preview (behind a debug flag) OR create a `/dev/attribute-picker-preview` scratch route. Operator confirms:
- Category "Water Cooler" → pick shows first attribute (Legs from Task 2.4 setup)
- Pick `4` → step advances (or if only one item matches, shows the item card directly)
- Pick a brand-variant → onPick fires
- Change first pick → downstream picks clear

- [ ] **Step 4: Commit**

Phase 4 complete — picker works standalone.

---

# Phase 5 — Integration (five surface wire-ups)

Each of these is a small task: add the `[Browse tree] [Guided pick]` toggle, mount `ProductAttributePicker` behind it, keep existing pickers as the default.

## Task 5.1: SO Create + Edit

**Files:**
- Modify: `src/app/(dashboard)/sales/create-so/page.tsx`, `src/app/(dashboard)/sales/edit-so/[id]/page.tsx`

- [ ] **Step 1: Find the existing line-add UI**

```bash
grep -n "CascadeInventorySelector\|InventoryItemPicker" src/app/\(dashboard\)/sales/create-so/page.tsx src/app/\(dashboard\)/sales/edit-so/\[id\]/page.tsx
```

- [ ] **Step 2: Add the toggle**

Above the existing picker, add a two-button toggle bar:

```tsx
<div className="inline-flex rounded-md border p-0.5">
  <button
    className={cn('px-3 h-7 text-xs rounded', pickerMode === 'browse' ? 'bg-primary/10 text-primary' : 'text-muted-foreground')}
    onClick={() => setPickerMode('browse')}
  >Browse tree</button>
  <button
    className={cn('px-3 h-7 text-xs rounded', pickerMode === 'guided' ? 'bg-primary/10 text-primary' : 'text-muted-foreground')}
    onClick={() => setPickerMode('guided')}
  >Guided pick</button>
</div>
```

Below, render either the existing `CascadeInventorySelector` or the new `<ProductAttributePicker>` based on `pickerMode`.

Persist `pickerMode` in localStorage keyed by surface: `so-create.pickerMode` / `so-edit.pickerMode`.

- [ ] **Step 3: Operator smoke, commit**

---

## Task 5.2: Quotations line picker — **N/A on this branch (2026-08-04)**

**Status:** Not applicable. Verified on `feature/category-attributes`:
- `src/app/(dashboard)/sales/quotations` — does not exist
- `src/app/(dashboard)/contracts` — does not exist
- No quotation / contract line-item component anywhere in `src/components` (only `master-data/OrderQuotationSettingsAdmin.tsx`, which is settings — not a line picker)

The plan was drafted anticipating these surfaces would land alongside category attributes; they haven't been built yet. Nothing to wire.

- [x] N/A — no target surface exists on this branch. Revisit when Quotations / Contracts modules ship.

---

## Task 5.3: Service Links picker — **N/A on this branch (2026-08-04)**

**Status:** Not applicable. Verified on `feature/category-attributes`:
- `src/components/services/InventoryTableView.tsx` — does not exist
- `src/components/services/` contains only `InventoryTab.tsx` + the `inventory/` subfolder (ItemsListView, ItemEditDialog, ToolsAssetsView, etc.)
- The item edit surface in Master Data → Services → Items is `ItemEditDialog`, which already received attribute wiring in **Task 3.2** (`ItemAttributesSection`)

There is no standalone "service links picker" component on this branch to add a guided-picker toggle to. Coverage of that surface is already delivered via Phase 3.

- [x] N/A — no `InventoryTableView` sink exists; item-level attribute entry already covered by Task 3.2.

---

## Task 5.4: Consumption line picker

**Files:** Modify `src/components/consumption/NewConsumptionDialog.tsx`

- [ ] Same pattern — the picker is currently a `WhItemPicker`. Add toggle above it. Pass `warehouseScope={sourceWarehouseId}` to the `ProductAttributePicker` so the candidate items filter to stock at that WH (the RPC will need a `p_warehouse_id` optional parameter — small migration follow-up if needed, OR filter client-side by walking the returned items' brand_variants for stock at the WH).

**Decision:** for v1, filter client-side (keeps the RPC simple). Client walks `items[*].brand_variants[*]` and filters out items with no brand variant having `stock_level > 0` at the WH. Downside: RPC returns all items, client filters. Acceptable for the item counts we expect (~few hundred per category).

- [ ] Toggle, wire, persistence key `consumption.pickerMode`, operator smoke, commit

Phase 5 complete — integration done.

---

# Phase 6 — Cleanup + audit

## Task 6.1: Flow registry + PROGRESS.md final row

**Files:**
- Modify: `docs/flows-registry.md`, `PROGRESS.md`

- [ ] **Step 1: Add flow entries for the four picker integrations**

Add rows to `docs/flows-registry.md` under the appropriate section:
- "SO line-add via ProductAttributePicker"
- "Quotation line-add via ProductAttributePicker"
- "Service Link via ProductAttributePicker"
- "Consumption line-add via ProductAttributePicker"

Each with Trigger surface / Primary hook / RPC / Ledger writes / Dialog / Related flows filled in.

- [ ] **Step 2: PROGRESS.md — final complete row for the whole module**

Add a single comprehensive row to `## ✅ Completed` covering the whole plan: migrations, hooks, components, integration surfaces, permission split changes.

Commit PROGRESS.md + flow registry alone.

---

## Task 6.2: 4-point security audit

**Files:**
- Modify: `PROGRESS.md` (append to Security Audit Log)

- [ ] **Step 1: Run each of the five checks**

For **Category Attributes + View/Edit Permission Split** combined:

1. **Secrets** — grep touched files for `sk_*` / `Bearer ` / `apiKey=` / `eyJ*`. Expected empty.
2. **RLS** — verify each new table has RLS ON + at least one policy. Verify the trigger function on `inventory_attribute_definitions` uses SECURITY INVOKER (the trigger runs as the invoking user). The two RPCs (`get_effective_attributes`, `rpc_attribute_picker_step`) use SECURITY INVOKER + explicit `search_path`.
3. **Auth gate** — no new API routes; all mutations via authenticated Supabase client; middleware unchanged.
4. **Error handling** — RPC and mutation callsites all throw on error, never silent success.
5. **Layout stability** — Attributes tab uses `min-h-*` guard on the tab content; picker's option row uses `min-h-*`; picker's zero-match banner reserves space above the item list.

- [ ] **Step 2: Add row to Security Audit Log in PROGRESS.md**

`| 2026-MM-DD | **Category Attributes module + view/edit permission split** | ✅ ... | ✅ ... | ✅ ... | ✅ ... | ✅ ... | Notes ... |`

Commit alone.

---

## Task 6.3: Final smoke + merge readiness

- [ ] **Step 1: Operator end-to-end smoke**

Have the operator run the full happy path:
1. Define an attribute at a top-level category, add options
2. Confirm a sub-category inherits
3. Confirm the branch-uniqueness trigger blocks a duplicate at sub-cat
4. Add an item, pick attribute values, save
5. Clear a value, save → confirm row deleted
6. Archive an option → confirm it's hidden from new items but stays on the existing item
7. Open the ProductAttributePicker on Create SO → guided pick a specific item → confirm brand-variant fires onPick
8. Repeat picker smoke on Quotation, Service Link, Consumption surfaces
9. Log in as a role with view-only on `master_data.inventory.attributes.view` → confirm Attributes tab is visible but Add-attribute button and per-row edit buttons are hidden
10. Grant `.create` only → confirm Add-attribute button appears but per-row edit buttons stay hidden
11. Grant `.edit` too → confirm per-row edit / archive / delete buttons appear

- [ ] **Step 2: On operator "working" — merge**

```bash
git checkout deploy/warehouse-shipping
git merge --ff-only feature/category-attributes
git push origin deploy/warehouse-shipping
```

Delete local + remote feature branch after successful push.

---

## Self-review checklist (run before handing off)

- **Spec coverage:**
  - Category Attributes spec Sections 1-7: DB ✓ (Phase 1), editor ✓ (Phase 2), item values ✓ (Phase 3), picker ✓ (Phase 4), integration ✓ (Phase 5), out-of-scope respected ✓
  - View/Create/Edit 3-state Permission Split spec: helpers ✓ (Task 0.1), validator ✓ (Task 0.2), audit + missing-key add ✓ (Task 0.3), backfill migration ✓ (Task 0.4), callsite sweep ✓ (Task 0.5). PermissionTree visual convention (view-then-create-then-edit indent, auto-toggle-on) NOT in this plan — deferred to a follow-up UI polish task; the save-time validator is enough for v1 correctness. **Adding the visual polish now would push Task 0.2 into a bigger scope; keeping the validator as the enforcement layer and leaving the visual convention as a follow-up.**
- **Placeholder scan:** no `TBD` / `TODO` / "implement later" markers. Migration file prefixes use `YYYYMMDD` — filled at implementation time based on current timestamp. Task 5.2 has "Find via grep" — that's a legitimate discovery step, not a placeholder.
- **Type consistency:** `AttributeDefinition` / `AttributeOption` / `EffectiveAttribute` / `PickerStepResult` types used consistently across tasks 2.2, 3.1, 4.1, 4.2. Hook names match: `useEffectiveAttributes`, `useAttributePickerStep`, `useUpsertItemAttributes`. RPC name `rpc_attribute_picker_step` matches across Task 1.5 (definition) and Task 4.1 (call).

---

## Execution handoff

Plan complete and saved to `docs/plans/2026-08-04-category-attributes-plan.md`. Two execution options:

**1. Subagent-driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
**2. Inline execution** — Execute tasks in this session using the executing-plans skill, batch execution with checkpoints

Which approach?
