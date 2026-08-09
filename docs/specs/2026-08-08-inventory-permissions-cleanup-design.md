# Inventory Permissions Cleanup — Design Spec

**Date:** 2026-08-08
**Branch:** `feature/inventory-permissions-cleanup` (off `feature/inventory-brands-and-origin` — NOT off `deploy/warehouse-shipping`, because the `inventory.catalog.*` / `inventory.pricing.*` keys this cleanup edits exist only on the unmerged brands branch)
**DB target:** STAGING (`mwvblpgbgxipvrevkeff`) only; migrations mirrored to `supabase/migrations-staging/`
**Related:** [[Inventory Brands & Origin]] (added `inventory.catalog.*` / `inventory.pricing.*` in Task 6); permission model in `src/lib/permissions.ts`

## Problem

The role editor's inventory area is messy and misleading. Three overlapping groups exist:

1. **Inventory** — `master_data.inventory.view / .create / .manage`. Only `.view` is live (gates the `/master-data/inventory` route + nav). `.create` and `.manage` are **dead** — no code or DB rule enforces them (the label already says "legacy .manage"). They read as if they control catalog writes, but they don't.
2. **Category Attributes** — `master_data.inventory.attributes.view / .create / .edit`. A distinct sub-feature (custom spec fields on categories). Enforced **UI-only** via `usePermissions` hooks; its table RLS is `auth.role() = 'authenticated'` (not permission-keyed).
3. **Inventory Catalog (Brands & Origin)** — `inventory.catalog.view / .manage` + `inventory.pricing.view / .manage`. The **real** enforcement: `inventory.catalog.manage` gates all catalog writes via RLS; `inventory.pricing.manage` gates price changes via a trigger.

Whoever assigns roles cannot tell which permission actually controls creating a category or item. The user wants a clean page with a single **View = look only** / **Manage = do everything (create / edit / archive / delete)** shape, the legacy dead keys removed, and pricing kept as its own gate.

## Goals

- One consistent **View / Manage** shape across every inventory permission group.
- Remove the dead legacy keys (`master_data.inventory.create`, `master_data.inventory.manage`).
- **Manage Inventory** (`inventory.catalog.manage`) is the single gate that controls creating categories, sub-levels, items, brands, and origins — this is the "control who can create" the user asked for.
- Keep **Pricing** a separate gate (Accounting separation).
- No role silently loses page access; no dead keys left in stored role permission arrays.

## Non-goals (YAGNI)

- No finer-grained create-vs-edit-vs-delete split, no per-entity or per-depth or per-subtree permissions. (Explicitly declined by the user — Manage covers all writes.)
- **No renaming of the enforced key strings** `inventory.catalog.*` / `inventory.pricing.*`. They are wired into RLS policies and the pricing-guard trigger; renaming would force rewriting every one of those rules for zero functional gain. The page is cleaned at the tree/label level; internal ids stay stable.
- No change to catalog RLS or the pricing guard (they already key off `inventory.catalog.manage` / `inventory.pricing.manage`, which stay).
- No change to attribute-table RLS (stays `authenticated`; UI gating is the model there — pre-existing, out of scope).

## Target permission structure

```
Inventory
  • View Inventory      → inventory.catalog.view      open the Inventory page; view categories, items, brands, origins
  • Manage Inventory    → inventory.catalog.manage    create / edit / archive / delete: categories, sub-levels, items, brands, origins

Inventory Pricing
  • View Pricing        → inventory.pricing.view      see cost / selling prices
  • Manage Pricing      → inventory.pricing.manage    change cost / selling prices (kept behind Accounting)

Category Attributes
  • View Attributes     → master_data.inventory.attributes.view     see the Attributes tab
  • Manage Attributes   → master_data.inventory.attributes.manage    create / edit / archive / delete attribute definitions + options
```

**Removed:** the entire legacy **Inventory** group (`master_data.inventory.view`, `.create`, `.manage`) and the attribute keys `.attributes.create` + `.attributes.edit` (collapsed into a new `.attributes.manage`).

Net: **3 groups, 6 permissions**, all View/Manage, no dead keys, no overlap.

## Design

### 1. Permission definitions (`src/lib/permissions.ts` + `src/components/master-data/PermissionTree.tsx`)

Both files currently declare the tree independently and must stay in sync (they are today). Changes to both:

- Delete the legacy **Inventory** group (all three `master_data.inventory.*` non-attribute keys).
- Rename the **Inventory Catalog (Brands & Origin)** group's display to **Inventory**, keeping keys `inventory.catalog.view` / `inventory.catalog.manage`. Present the pricing pair as its own top-level **Inventory Pricing** group (keys unchanged). Final tree = three top-level groups: **Inventory**, **Inventory Pricing**, **Category Attributes**.
- **Category Attributes** group: replace `.attributes.create` + `.attributes.edit` with a single `.attributes.manage`; keep `.attributes.view`.
- `ALL_PERMISSIONS` loses `master_data.inventory.view/.create/.manage`, `master_data.inventory.attributes.create`, `master_data.inventory.attributes.edit`; gains `master_data.inventory.attributes.manage`. (The `inventory.catalog.*` / `inventory.pricing.*` keys are unchanged.)
- **Labels/descriptions** rewritten to the clean wording above; "archive" named explicitly in the Manage descriptions.

> Optional (flagged, not required): collapse the duplicated tree so `PermissionTree.tsx` derives from `permissions.ts` instead of restating it. Deferred — keeping them in sync is enough for this change and avoids scope creep.

### 2. Repoint page / nav / audit access

Currently `master_data.inventory.view` gates the Inventory page and nav; removing it would lock everyone out. Repoint to `inventory.catalog.view`:

- `src/lib/route-permissions.ts` — `/master-data/inventory` → `inventory.catalog.view`.
- `src/components/layout/nav-config.ts` — Inventory nav item → `inventory.catalog.view`.
- `src/lib/utils/auditPermissionMap.ts` — map `inventory.catalog.view` → `['inventory']` (replacing the `master_data.inventory.view` entry).

### 3. Rewire attribute checks (`src/components/master-data/attributes/AttributesTab.tsx`)

Today: `canCreate = useHasCreatePermission('master_data.inventory.attributes')` (checks `.create` only), `canEdit = useHasEditPermission(...)` (checks `.edit || .manage`).

In a View/Manage world both create and edit are "Manage". `useHasEditPermission` already returns true for `.manage`, but `useHasCreatePermission` checks only `.create` and would break. Resolution:

- Add a `useHasManagePermission(area)` helper to `src/hooks/usePermissions.ts` returning `permissions.includes(`${area}.manage`)` (plus `system.admin` bypass). (`useHasEditPermission` already covers `.manage`; adding an explicit manage helper reads clearer and future-proofs create-side callers.)
- In `AttributesTab.tsx`, set both `canCreate` and `canEdit` from `useHasManagePermission('master_data.inventory.attributes')`.
- Grep for any other consumer of `.attributes.create` / `.attributes.edit` (e.g. `CategoryRow` uses only `.attributes.view` — unaffected) and repoint if found.

No attribute-table RLS change (write policy is `authenticated`, UI-gated).

### 4. Data migration — clean existing role grants

A single migration (`supabase/migrations/YYYYMMDDHHMMSS_inventory_permissions_cleanup.sql`, mirrored to staging folder) that rewrites the `permissions` text[] on `custom_roles`:

For every role:
- If it holds `master_data.inventory.view` → also grant `inventory.catalog.view` (preserve page access). **View-only, non-destructive.**
- If it holds `master_data.inventory.attributes.create` OR `.edit` → grant `master_data.inventory.attributes.manage` (preserve the attribute-management capability, which was live/UI-enforced).
- **Strip** the removed keys: `master_data.inventory.view`, `.create`, `.manage`, `master_data.inventory.attributes.create`, `.attributes.edit`.

**Deliberately NOT done:** auto-granting `inventory.catalog.manage` to roles that held the dead `master_data.inventory.manage`. That key never enforced anything (catalog writes were locked to `inventory.catalog.manage` in Brands & Origin Task 6, which intentionally granted it to admin roles only). Auto-granting would silently restore write power that was deliberately removed. Catalog-manage grants remain a deliberate admin action in the role UI.

Idempotent (safe to re-run): only adds keys not present, only removes keys if present. System-admin roles (Owner / exploit) carry `system.admin` and bypass checks regardless, but their arrays are cleaned too for tidiness.

### 5. `validatePermissionSet` interaction

The role editor's `validatePermissionSet` requires each `.manage` to have a `.view` sibling in the same role. The clean View/Manage pairs satisfy this. The migration's rule (grant `inventory.catalog.view` wherever page access existed) keeps stored arrays consistent; and any role granted `inventory.catalog.manage` via the UI will be forced to include `inventory.catalog.view` by the validator. No validator change needed.

## Enforcement summary (after cleanup)

| Capability | Gate | Enforced where |
|---|---|---|
| Open Inventory page / nav | `inventory.catalog.view` | route middleware + nav |
| Create/edit/archive/delete categories, levels, items, brands, origins | `inventory.catalog.manage` | **DB RLS** (unchanged) |
| Change cost/selling price | `inventory.pricing.manage` | **DB trigger** (unchanged) |
| View / manage category attributes | `master_data.inventory.attributes.view` / `.manage` | UI hooks (attribute RLS stays `authenticated`) |

Catalog reads remain RLS SELECT-open to any authenticated user (page access is the gate) — unchanged, pre-existing behavior.

## Testing

- **Unit** (`src/lib/permissions.test.ts`): `ALL_PERMISSIONS` contains the 6 clean keys and NONE of the removed keys; add assertions for `master_data.inventory.attributes.manage` and absence of the legacy keys.
- **tsc** clean; targeted grep confirms no source references the removed keys.
- **Migration verification** (live-DB CSV): after apply, no `custom_roles.permissions` array contains a removed key; every role that had `master_data.inventory.view` now has `inventory.catalog.view`; every role that had an attribute create/edit key now has `.attributes.manage`.
- **⏸ Operator smoke:** (a) a role with only **View Inventory** opens the page read-only and cannot create/edit; (b) a role with **Manage Inventory** but not **Manage Pricing** can create/edit/archive a category/item but is blocked (42501) from changing a price; (c) **Manage Attributes** can edit attribute defs, View-only cannot; (d) an existing non-admin role that previously opened the page still can.

## Risks & rollback

- **Risk:** a role loses page access if the view-grant rule misses it. Mitigation: migration is additive for `.view`; verification query confirms parity before/after.
- **Risk:** the duplicated tree in `permissions.ts` vs `PermissionTree.tsx` drifts. Mitigation: edit both in the same commit; unit test guards `ALL_PERMISSIONS`.
- **Rollback:** revert the code commit; the data migration is additive+strip — a reverse migration can re-add stripped keys from git history if ever needed (staging-only, low stakes).

## Files touched

- `src/lib/permissions.ts`, `src/components/master-data/PermissionTree.tsx`
- `src/lib/route-permissions.ts`, `src/components/layout/nav-config.ts`, `src/lib/utils/auditPermissionMap.ts`
- `src/hooks/usePermissions.ts` (add `useHasManagePermission`), `src/components/master-data/attributes/AttributesTab.tsx`
- `src/lib/permissions.test.ts`
- `supabase/migrations/<ts>_inventory_permissions_cleanup.sql` (+ `supabase/migrations-staging/` mirror)
