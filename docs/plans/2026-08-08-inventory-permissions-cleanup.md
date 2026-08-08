# Inventory Permissions Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the inventory permission tree to a consistent View/Manage shape, remove dead legacy keys, keep Pricing separate, and repoint page access — without touching the enforced key strings or catalog RLS.

**Architecture:** Two in-code representations of the permission tree must stay in sync — `PERMISSION_GROUPS` in `src/lib/permissions.ts` (drives `ALL_PERMISSIONS`, auto-derived) and `NAV_TREE` in `src/components/master-data/PermissionTree.tsx` (drives the role-editor UI). Enforcement keys `inventory.catalog.*` / `inventory.pricing.*` are unchanged (RLS + pricing-guard depend on them); only the legacy `master_data.inventory.*` catalog keys are removed and the attribute keys collapse from create/edit → manage. A one-time, idempotent data migration cleans existing `custom_roles.permissions` (text[]).

**Tech Stack:** Next.js (App Router), TypeScript, Supabase Postgres (RLS), Vitest.

## Global Constraints

- **DB target STAGING only** (`mwvblpgbgxipvrevkeff`); apply via `npx supabase db push`; **mirror every migration to `supabase/migrations-staging/`** byte-identical in the same commit.
- **Do NOT rename** the enforced key strings `inventory.catalog.view/manage` and `inventory.pricing.view/manage` — they are wired into RLS policies and the pricing-guard trigger.
- **View = read-only; Manage = create + edit + archive + delete.** Every group is exactly one View + one Manage (Category Attributes too).
- **Two representations stay in sync:** any change to the inventory keys must be applied to BOTH `PERMISSION_GROUPS` (`permissions.ts`) and `NAV_TREE` (`PermissionTree.tsx`).
- **Keys removed:** `master_data.inventory.view`, `master_data.inventory.create`, `master_data.inventory.manage`, `master_data.inventory.attributes.create`, `master_data.inventory.attributes.edit`.
- **Key added:** `master_data.inventory.attributes.manage`.
- **Every commit** ends with BOTH trailers via HEREDOC: `Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>` + `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- Migration must NOT auto-grant `inventory.catalog.manage` based on the dead legacy `.manage` (that write power was intentionally removed in Brands & Origin Task 6; restoring it silently is wrong).

---

### Task 1: Clean the permission tree (definitions + UI + guard test)

**Files:**
- Modify: `src/lib/permissions.ts` (the three inventory sections at lines ~100-124 inside the `Master Data` group's `sections`)
- Modify: `src/components/master-data/PermissionTree.tsx` (the `md-inventory` node at lines ~37-69 in `NAV_TREE`)
- Modify: `src/lib/permissions.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ALL_PERMISSIONS` (auto-derived from `PERMISSION_GROUPS`) now contains `inventory.catalog.view/manage`, `inventory.pricing.view/manage`, `master_data.inventory.attributes.view/manage` and NONE of the removed keys.

- [ ] **Step 1: Write the failing test.** Add to `src/lib/permissions.test.ts`:

```ts
import { ALL_PERMISSIONS } from './permissions'

describe('inventory permissions cleanup', () => {
  const removed = [
    'master_data.inventory.view',
    'master_data.inventory.create',
    'master_data.inventory.manage',
    'master_data.inventory.attributes.create',
    'master_data.inventory.attributes.edit',
  ]
  const present = [
    'inventory.catalog.view',
    'inventory.catalog.manage',
    'inventory.pricing.view',
    'inventory.pricing.manage',
    'master_data.inventory.attributes.view',
    'master_data.inventory.attributes.manage',
  ]
  it.each(removed)('does NOT contain removed legacy key %s', (k) => {
    expect(ALL_PERMISSIONS).not.toContain(k)
  })
  it.each(present)('contains clean key %s', (k) => {
    expect(ALL_PERMISSIONS).toContain(k)
  })
})
```

- [ ] **Step 2: Run it — expect FAIL.** Run: `npx vitest run src/lib/permissions.test.ts`. Expected: the "does NOT contain" cases fail (legacy keys still present) and `.attributes.manage` case fails.

- [ ] **Step 3: Edit `permissions.ts`.** In `PERMISSION_GROUPS`, inside the `Master Data` group's `sections`, REPLACE the three consecutive sections currently labeled `'Inventory'`, `'Inventory Attributes'`, and `'Inventory Catalog (Brands & Origin)'` (the block containing keys `master_data.inventory.view/create/manage`, `master_data.inventory.attributes.*`, and `inventory.catalog.*`/`inventory.pricing.*`) with exactly these three sections, in this order:

```ts
      {
        label: 'Inventory',
        permissions: [
          { key: 'inventory.catalog.view',   label: 'View Inventory',   description: 'Open the Inventory page; view categories, items, brands, and origins' },
          { key: 'inventory.catalog.manage', label: 'Manage Inventory', description: 'Create, edit, archive, and delete categories, sub-levels, items, brands, and origins' },
        ],
      },
      {
        label: 'Inventory Pricing',
        permissions: [
          { key: 'inventory.pricing.view',   label: 'View Inventory Pricing',   description: 'View cost and selling prices on variants' },
          { key: 'inventory.pricing.manage', label: 'Manage Inventory Pricing', description: 'Change cost/selling price on variants (kept behind Accounting)' },
        ],
      },
      {
        label: 'Category Attributes',
        permissions: [
          { key: 'master_data.inventory.attributes.view',   label: 'View Category Attributes',   description: 'See the Attributes tab on the Inventory master-data page' },
          { key: 'master_data.inventory.attributes.manage', label: 'Manage Category Attributes', description: 'Create, edit, archive, and delete attribute definitions and options' },
        ],
      },
```

- [ ] **Step 4: Edit `PermissionTree.tsx`.** In `NAV_TREE`, replace the `md-inventory` node (currently carrying `master_data.inventory.view/create/manage` as its own `permissions` and two `children` `md-inventory-attributes` + `md-inventory-catalog`) with:

```ts
      {
        id: 'md-inventory',
        label: 'Inventory',
        icon: Package,
        permissions: [
          { key: 'inventory.catalog.view',   label: 'View Inventory',   description: 'Open the Inventory page; view categories, items, brands, and origins' },
          { key: 'inventory.catalog.manage', label: 'Manage Inventory', description: 'Create, edit, archive, and delete categories, sub-levels, items, brands, and origins' },
        ],
        children: [
          {
            id: 'md-inventory-pricing',
            label: 'Inventory Pricing',
            icon: Package,
            permissions: [
              { key: 'inventory.pricing.view',   label: 'View Inventory Pricing',   description: 'View cost and selling prices on variants' },
              { key: 'inventory.pricing.manage', label: 'Manage Inventory Pricing', description: 'Change cost/selling price on variants (kept behind Accounting)' },
            ],
          },
          {
            id: 'md-inventory-attributes',
            label: 'Category Attributes',
            icon: Package,
            permissions: [
              { key: 'master_data.inventory.attributes.view',   label: 'View Category Attributes',   description: 'See the Attributes tab on the Inventory master-data page' },
              { key: 'master_data.inventory.attributes.manage', label: 'Manage Category Attributes', description: 'Create, edit, archive, and delete attribute definitions and options' },
            ],
          },
        ],
      },
```

- [ ] **Step 5: Run the test — expect PASS.** Run: `npx vitest run src/lib/permissions.test.ts`. Expected: all cases pass.

- [ ] **Step 6: tsc.** Run: `npx tsc --noEmit`. Expected: clean (no new errors).

- [ ] **Step 7: Commit.**

```bash
git add src/lib/permissions.ts src/components/master-data/PermissionTree.tsx src/lib/permissions.test.ts
git commit -m "$(cat <<'EOF'
feat(perms): clean inventory permission tree to View/Manage

Remove dead legacy master_data.inventory.view/create/manage; collapse
Category Attributes to view/manage; present Inventory / Inventory Pricing /
Category Attributes as three clean sections. Enforced keys
(inventory.catalog.*, inventory.pricing.*) unchanged. permissions.ts +
PermissionTree.tsx kept in sync; ALL_PERMISSIONS guard test added.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Manage-permission helper + attribute checks

**Files:**
- Modify: `src/hooks/usePermissions.ts` (add `useHasManagePermission`)
- Modify: `src/components/master-data/attributes/AttributesTab.tsx:22-23`

**Interfaces:**
- Produces: `useHasManagePermission(area: string): boolean` — true if `system.admin` or `permissions` includes `${area}.manage`.

- [ ] **Step 1: Add the helper to `usePermissions.ts`** (place next to `useHasEditPermission`):

```ts
export function useHasManagePermission(area: string): boolean {
  const { data } = usePermissions()
  if (!data) return false
  if (data.isSystemAdmin) return true
  return data.permissions.includes(`${area}.manage`)
}
```

- [ ] **Step 2: Rewire `AttributesTab.tsx`.** Replace the two lines:

```ts
  const canCreate = useHasCreatePermission('master_data.inventory.attributes')
  const canEdit   = useHasEditPermission('master_data.inventory.attributes')
```

with:

```ts
  const canManage = useHasManagePermission('master_data.inventory.attributes')
  const canCreate = canManage
  const canEdit   = canManage
```

(Keeping the `canCreate` / `canEdit` local names avoids touching their downstream uses in the component. Update the import line to bring in `useHasManagePermission` and drop `useHasCreatePermission` if now unused; keep `useHasEditPermission`/others only if still referenced.)

- [ ] **Step 3: Grep for other consumers of the old attribute action keys.** Run: `grep -rn "attributes.create\|attributes.edit\|useHasCreatePermission('master_data.inventory.attributes')" src/`. Expected: only `AttributesTab.tsx` (now fixed). If any other file references `master_data.inventory.attributes.create/.edit`, repoint it to `useHasManagePermission('master_data.inventory.attributes')` and note it in the report.

- [ ] **Step 4: tsc.** Run: `npx tsc --noEmit`. Expected: clean (no unused-import errors — remove `useHasCreatePermission` import if it became unused).

- [ ] **Step 5: Commit.**

```bash
git add src/hooks/usePermissions.ts src/components/master-data/attributes/AttributesTab.tsx
git commit -m "$(cat <<'EOF'
feat(perms): useHasManagePermission + attributes View/Manage rewire

Category Attributes now gate on .attributes.manage (create+edit collapsed).
AttributesTab derives canCreate/canEdit from a single manage check.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Repoint Inventory page / nav / audit access

**Files:**
- Modify: `src/lib/route-permissions.ts:27`
- Modify: `src/components/layout/nav-config.ts:31`
- Modify: `src/lib/utils/auditPermissionMap.ts:2`

**Interfaces:** none new. After this task, the `master_data.inventory.view` key is referenced nowhere in `src/`.

- [ ] **Step 1: route-permissions.ts.** Change the `/master-data/inventory` entry's `permission` from `'master_data.inventory.view'` to `'inventory.catalog.view'`.

- [ ] **Step 2: nav-config.ts.** Change the `Inventory` nav item's `permission` from `'master_data.inventory.view'` to `'inventory.catalog.view'`.

- [ ] **Step 3: auditPermissionMap.ts.** Replace the entry `'master_data.inventory.view': ['inventory'],` with `'inventory.catalog.view': ['inventory'],`.

- [ ] **Step 4: Verify no stragglers.** Run: `grep -rn "master_data.inventory.view\|master_data.inventory.create\|master_data.inventory.manage\b" src/`. Expected: ZERO matches (all removed). If any remain, fix them (they'd be dead references to deleted keys).

- [ ] **Step 5: tsc.** Run: `npx tsc --noEmit`. Expected: clean.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/route-permissions.ts src/components/layout/nav-config.ts src/lib/utils/auditPermissionMap.ts
git commit -m "$(cat <<'EOF'
feat(perms): repoint Inventory page/nav/audit to inventory.catalog.view

Legacy master_data.inventory.view removed; page route, nav item, and audit
map now gate on inventory.catalog.view.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Data migration — clean existing role grants

**Files:**
- Create: `supabase/migrations/<YYYYMMDDHHMMSS>_inventory_permissions_cleanup.sql`
- Create: `supabase/migrations-staging/<same-name>.sql` (byte-identical mirror)

**Interfaces:** none (data migration).

- [ ] **Step 1: Pre-check current state (live).** Run:

```bash
npx supabase db query --linked -o csv "SELECT name, permissions FROM custom_roles WHERE permissions && ARRAY['master_data.inventory.view','master_data.inventory.create','master_data.inventory.manage','master_data.inventory.attributes.create','master_data.inventory.attributes.edit']::text[] ORDER BY name;"
```

Record which roles hold which removed keys (this is the before-picture for verification in Step 5).

- [ ] **Step 2: Write the migration SQL.** `custom_roles.permissions` is `text[]`. Order-preserving rebuild of kept keys + conditional append of the two replacement grants, only for affected rows, idempotent:

```sql
-- Inventory permissions cleanup: strip dead legacy keys, preserve access.
-- View = look, Manage = do everything. Enforced keys (inventory.catalog.*,
-- inventory.pricing.*) unchanged. Does NOT restore catalog write power that
-- Brands & Origin Task 6 intentionally removed.
UPDATE public.custom_roles AS cr
SET permissions =
  -- kept keys, original order preserved
  COALESCE((
    SELECT array_agg(p ORDER BY ord)
    FROM unnest(cr.permissions) WITH ORDINALITY AS t(p, ord)
    WHERE p <> ALL (ARRAY[
      'master_data.inventory.view',
      'master_data.inventory.create',
      'master_data.inventory.manage',
      'master_data.inventory.attributes.create',
      'master_data.inventory.attributes.edit'
    ]::text[])
  ), '{}'::text[])
  -- preserve Inventory page access
  || CASE
       WHEN 'master_data.inventory.view' = ANY (cr.permissions)
        AND NOT ('inventory.catalog.view' = ANY (cr.permissions))
       THEN ARRAY['inventory.catalog.view']::text[]
       ELSE ARRAY[]::text[]
     END
  -- preserve attribute-management capability
  || CASE
       WHEN ('master_data.inventory.attributes.create' = ANY (cr.permissions)
             OR 'master_data.inventory.attributes.edit' = ANY (cr.permissions))
        AND NOT ('master_data.inventory.attributes.manage' = ANY (cr.permissions))
       THEN ARRAY['master_data.inventory.attributes.manage']::text[]
       ELSE ARRAY[]::text[]
     END
WHERE cr.permissions && ARRAY[
  'master_data.inventory.view',
  'master_data.inventory.create',
  'master_data.inventory.manage',
  'master_data.inventory.attributes.create',
  'master_data.inventory.attributes.edit'
]::text[];
```

Write the identical file to both `supabase/migrations/` and `supabase/migrations-staging/`.

- [ ] **Step 3: Apply to staging.** Run: `npx supabase db push`. Expected: applies the one new migration; ends with success (no error).

- [ ] **Step 4: Dry-run confirms clean.** Run: `npx supabase db push --dry-run`. Expected: "Remote database is up to date."

- [ ] **Step 5: Verify (live).** Run:

```bash
npx supabase db query --linked -o csv "SELECT count(*) AS roles_with_removed_keys FROM custom_roles WHERE permissions && ARRAY['master_data.inventory.view','master_data.inventory.create','master_data.inventory.manage','master_data.inventory.attributes.create','master_data.inventory.attributes.edit']::text[];"
```

Expected: `0`. Then confirm access parity — every role that had `master_data.inventory.view` in Step 1 now has `inventory.catalog.view`, and every role that had an attribute create/edit key now has `.attributes.manage`:

```bash
npx supabase db query --linked -o csv "SELECT name, 'inventory.catalog.view' = ANY(permissions) AS has_catalog_view, 'master_data.inventory.attributes.manage' = ANY(permissions) AS has_attr_manage FROM custom_roles ORDER BY name;"
```

Cross-check against the Step 1 before-picture. If any role that should have gained a key did not, STOP and report.

- [ ] **Step 6: Commit.**

```bash
git add supabase/migrations/*_inventory_permissions_cleanup.sql supabase/migrations-staging/*_inventory_permissions_cleanup.sql
git commit -m "$(cat <<'EOF'
feat(db): clean inventory permission grants on custom_roles

Strip dead legacy inventory keys from all roles; preserve Inventory page
access (grant inventory.catalog.view where master_data.inventory.view was)
and attribute-manage capability. Idempotent; STAGING only + mirror.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Whole-branch verification + docs + morning smoke checklist

**Files:**
- Modify: `PROGRESS.md` (Security Audit Log row + Completed/In Progress)
- Modify/Create: `EOD/EOD-2026-08-08.md`

- [ ] **Step 1: Full silent verification.** Run and confirm each:
  - `npx tsc --noEmit` → clean.
  - `npx vitest run src/lib/permissions.test.ts` → pass.
  - `grep -rn "master_data.inventory.view\|master_data.inventory.create\|master_data.inventory.manage\b\|master_data.inventory.attributes.create\|master_data.inventory.attributes.edit" src/` → ZERO matches.
  - `npx supabase db push --dry-run` → "Remote database is up to date."

- [ ] **Step 2: Update `PROGRESS.md`.** Add a Security Audit Log row (Date 2026-08-08, Module "Inventory Permissions Cleanup") — Secrets ✅ (none), RLS ✅ (no policy changes; catalog RLS still keys off inventory.catalog.manage; attribute RLS unchanged = authenticated + UI-gated, pre-existing), Auth Gate ✅ (page/nav repointed to inventory.catalog.view; no new routes), Error Handling ✅ (n/a — no external calls), Layout Stability ✅ (permission tree only). Note: data migration is additive+strip, idempotent, staging-only. Add a Completed bullet and clear the In Progress marker.

- [ ] **Step 3: Update EOD** `EOD/EOD-2026-08-08.md` — append a task line for the permissions cleanup (plain language).

- [ ] **Step 4: Commit docs.**

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: PROGRESS security audit + status for inventory permissions cleanup

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

(EOD folder is gitignored — write it, no commit.)

- [ ] **Step 5: ⏸ OPERATOR SMOKE (morning — needs a limited-role login; controller cannot do this).** Leave this checklist for the user:
  1. Open the role editor → the Inventory area shows exactly three clean groups: **Inventory** (View/Manage), **Inventory Pricing** (View/Manage), **Category Attributes** (View/Manage). No "Create Inventory"/"Edit Inventory" legacy rows.
  2. A role with only **View Inventory** can open the Inventory page read-only and cannot create/edit.
  3. A role with **Manage Inventory** but not **Manage Pricing** can create/edit/archive a category/item but is blocked (42501) from changing a price.
  4. **Manage Category Attributes** can edit attribute defs; View-only cannot.
  5. An existing non-admin role that previously opened the Inventory page still can (access preserved by the migration).

---

## Notes for the executing agent
- This branch (`feature/inventory-permissions-cleanup`) is based on `feature/inventory-brands-and-origin` (which carries the `inventory.catalog.*` keys + RLS). Do not merge/push — leave for user review.
- Commit each task as its review passes (Tasks 1-4 are non-UI-smoke; the migration commits immediately per policy). Task 5's operator smoke is deferred to the user — commit the docs, but the branch's "done" is gated on the morning smoke.
