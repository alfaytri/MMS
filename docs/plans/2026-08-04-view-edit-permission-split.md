# View/Edit Permission Split — Design Spec

**Date:** 2026-08-04
**Branch:** `feature/category-attributes` (tags along with the Category Attributes work)
**Author:** Mohamed Ismail (product), Claude (design partner)

---

## Purpose

Establish a uniform two-tier permission model across the whole app:

- **View** — the role can *see* the page and its content, read-only. Buttons that mutate anything are hidden or disabled.
- **Edit** — the role can *change* content (create, update, delete, cancel, archive, etc.). Granted separately from view. **A role with `edit` but not `view` is invalid** and never appears in the UI. Every edit key implicitly requires the matching view key.

Today the app has this pattern *inconsistently* — some feature areas have `.view` + `.manage`, some have single flat keys like `warehouse.access`, some have three-way splits like `consumption.view / consumption.create / consumption.cancel`. This spec locks the rule and defines the audit + patch approach.

This work rides alongside the Category Attributes branch: new attribute permissions ship following this rule from day one, and the whole app gets a sweep to conform.

---

## The rule

Every feature area follows one of these two shapes:

**Shape A — Simple feature area**
```
X.view    — see the page and its data
X.edit    — mutate the page's data
```

**Shape B — Nested / tab-based feature area**
```
X.view          — see the tab
X.edit          — write in this tab
```
(Repeat per tab where independent gating is needed.)

### What counts as "edit"

Every mutation on that feature area: **create, update, delete, cancel, void, archive, restore, upload, remove, reorder**. All fall under one `edit` key per feature area.

### What does NOT fall under view/edit

Some actions belong to a **third bucket** — a specific privileged operation that stands apart from generic mutation:

| Key pattern | Belongs to third bucket? | Why |
|---|---|---|
| `X.approve` | Yes | Approvals are workflow-role driven (`approval_workflow_steps`), not generic edit |
| `X.chain.manage` | Yes | Configures the *approval flow itself*, not the entity |
| `X.bypass` | Yes | Emergency override — deliberately narrow |
| `system.admin` | Yes | Owner-only bypass — deliberately global |
| `system.import` / `system.export` | Yes | Cross-cutting data movement, not per-feature |
| `X.change_credit_group` / `X.change_type` | Yes | Financial classification requiring separate sign-off |
| `warehouse.responsible_person` | Yes | Assignable capability (RP role marker), not "edit" |

The third bucket keeps its existing granular keys. **The rule only enforces the view+edit backbone; specific privileged actions stay separate.**

---

## Terminology — `manage` vs `edit`

The existing app uses `.manage`. Going forward the canonical suffix is `.edit`. `.manage` and `.edit` mean the same thing at the permission-check layer — a helper reads both:

```ts
useHasEditPermission(area)
  // returns true if user has `area.edit` OR `area.manage` OR `system.admin`
```

**No mass rename of stored role permissions.** Existing roles with `.manage` keys keep them; the check helper handles both. New permission keys created from this spec forward use `.edit`.

Reason: renaming would touch the `custom_roles.permissions` array on every role row and every reference across the codebase. Too much churn for a naming preference. The helper closes the gap without breaking anything.

---

## Enforcement — three layers

Every permission-gated feature enforces its keys at **all three layers**. Miss any layer and the gate is porous.

### Layer 1 — Nav visibility

`src/components/layout/nav-config.ts` — every nav item has `permission: 'X.view'`. `NavDropdown.canAccess()` already honors `isSystemAdmin` (fixed in Task 10). No change needed at this layer beyond auditing that every item has a `permission` field pointing at a valid view key.

### Layer 2 — Route access

`src/lib/route-permissions.ts` — every dashboard route has an entry in `ROUTE_PERMISSIONS` gated on the view key. `RoutePermissionGuard` inside `(dashboard)/layout.tsx` enforces at page-load time.

### Layer 3 — UI button/action gating

Every button that triggers a mutation is wrapped in a `useHasEditPermission(area)` check:
- Hidden if the caller has no edit perm (preferred for "New X" / "Add X" style CTAs)
- Disabled with a tooltip if hiding creates layout instability (rarely needed)

Row-level action menus (three-dot popovers) hide their edit items but keep view items ("View details", "Copy ID", etc.).

Route-level check catches the "type the URL directly" case; button-level check catches the "role has view but not edit — don't show mutation buttons" case; nav-level check catches "don't even show them the feature exists."

---

## Applied to Category Attributes

The Category Attributes spec calls for two new keys:

```
master_data.inventory.attributes.view     — see the Attributes tab
master_data.inventory.attributes.manage   — add/edit/archive/delete
```

Under this spec they land as `.view` + `.edit` from day one:

```
master_data.inventory.attributes.view     — see the Attributes tab + inherited attributes list
master_data.inventory.attributes.edit     — add / edit / archive / restore / delete definitions and options
```

Item-level values ride under the existing `master_data.inventory.edit` (or `.manage` — same thing via the helper) because setting an attribute value on an item is editing the item.

---

## Audit — existing keys that need patches

Rough sweep of `src/lib/permissions.ts` for gaps against this spec. Each row becomes a task in the follow-up plan.

### Gap type 1 — flat key with no split

Feature has a single access key with no view/edit distinction:

| Current key | Needs |
|---|---|
| `warehouse.access` | `warehouse.view` + `warehouse.edit`, or explicit clarification that access implies both |
| `master_data.access` | Already just a dropdown gate — kept as-is |
| `purchase_sales.access` | Same — dropdown gate only |
| `operations.access` | Same — dropdown gate only |

Ambient dropdown-gate keys like `X.access` stay flat — they gate whether the top-level nav dropdown is visible, not the sub-features. Each sub-feature has its own view/edit pair.

### Gap type 2 — view without edit

Feature has a view key with no matching edit counterpart (the mutation isn't gated separately):

| Current key | Missing counterpart |
|---|---|
| `custody.teams.view` | No `custody.teams.edit` — assign/return/consume actions today check other keys (`warehouse.access`) |
| `custody.places.view` | Same |
| `damaged_stock.on_hand.view` | No `damaged_stock.on_hand.edit` — send-for-repair / write-off buttons need gating |
| `damaged_stock.out_for_repair.view` | No `damaged_stock.out_for_repair.edit` — assign-vendor / return buttons need gating |
| `contact_centre.view` | Contact Centre write operations are already gated by workflow roles, but no explicit `contact_centre.edit` exists |
| `reports.view` | Editing reports isn't a thing today; `reports.manage` covers export — leave as-is |

### Gap type 3 — edit without view (should never happen)

Sweep the permissions array on every role to make sure no role has an `edit`/`manage` key without the matching `view`. If found, either grant the view or remove the orphan edit.

Enforced by a new lint pass in `src/lib/permissions.ts` at module load: `assertNoOrphanEdit()`.

### Gap type 4 — action keys that should just be edit

Fine-grained action keys where a single `edit` would be cleaner:

| Existing three-way split | Proposed |
|---|---|
| `consumption.view / consumption.create / consumption.cancel` | Keep — `create` and `cancel` are meaningfully separate for consumption (post vs reverse-through-approval-flow). This is intentional granularity. |
| `warehouse.transfer.create / .dispatch / .receive / .approve` | Keep — these map to physical role responsibilities (RP dispatches, receiver receives, IM approves). Not simplifiable. |
| `warehouse.check.count / .create` | Keep — count is a participation permission (many roles can count); create is org-level |
| `follow_ups.request / .confirm` | Keep — two-role workflow (field requests, office confirms) |

Not every three-way split is a gap. Keep the ones that map to distinct organizational roles. Only consolidate when the split reflects developer laziness, not real-world separation.

---

## Enforcement helper — `useHasEditPermission`

New helper in `src/hooks/usePermissions.ts`:

```ts
export function useHasEditPermission(area: string): boolean {
  const { data } = usePermissions()
  if (!data) return false
  if (data.isSystemAdmin) return true
  return (
    data.permissions.includes(`${area}.edit`) ||
    data.permissions.includes(`${area}.manage`)
  )
}
```

And a mirror for view:

```ts
export function useHasViewPermission(area: string): boolean {
  const { data } = usePermissions()
  if (!data) return false
  if (data.isSystemAdmin) return true
  return (
    data.permissions.includes(`${area}.view`) ||
    // Edit implies view — a role with edit but somehow lacking view still sees the surface
    data.permissions.includes(`${area}.edit`) ||
    data.permissions.includes(`${area}.manage`)
  )
}
```

`useHasEditPermission` implies edit ≠ view, which is why `useHasViewPermission` reads BOTH keys — an operator who somehow ended up with edit but not view still sees the surface (defensive against orphan-edit misconfiguration).

Callers use these two helpers everywhere instead of raw `useHasPermission('foo.view')` / `useHasPermission('foo.manage')`.

---

## PermissionTree UX

The `PermissionTree.tsx` role-editor grows a visual convention:

- Each feature area shows the view key FIRST, then the edit key indented under it
- Toggling `edit` on auto-toggles `view` on (edit implies view)
- Toggling `view` off does NOT auto-toggle edit off — the tree flags it with a red "orphan" indicator instead, and a Save-time validator refuses to save orphans

This makes the UX self-documenting: to grant edit, you toggle view first; to revoke view, you have to explicitly clear edit first.

---

## Migration path

**No DB migration.** The permissions live as strings in `custom_roles.permissions text[]`. Adding new keys is data-only (new toggles appear in the role editor). Removing keys is out-of-scope for this pass — we're adding, not renaming.

**No forced data change on existing roles.** Existing roles with `.manage` continue to work through the helper. When an admin next edits a role, they see the new `.edit` toggles in the tree and can adopt them at their pace.

**Change to permission-check callsites.** Every current `useHasPermission('X.manage')` or `useHasPermission('X.view')` callsite is a candidate for switching to `useHasEditPermission('X')` / `useHasViewPermission('X')`. Codemod-safe grep-and-replace — the helpers are drop-in.

---

## Out of scope for this spec

- **Mass rename `.manage` → `.edit`** on stored role permissions or code callsites — helpers close the gap without churn
- **Fine-grained CRUD splits** — no separate `.create` / `.update` / `.delete` breakouts unless organizational reality demands it (case-by-case audit in Gap Type 4)
- **Field-level gating** — this spec is page + button level, not "hide the price field" level. If needed later, that's a separate design
- **Time-boxed permissions** — no "grant edit for 24 hours" logic
- **Delegation** — no "role A delegates edit to role B" logic

---

## Risks

- **Orphan-edit misconfiguration in existing roles** — a role might already have `.manage` without `.view` (matter of historic role-editing sloppiness). The audit at `useHasViewPermission` defends read paths; the PermissionTree Save validator prevents future orphans. Existing orphans get flagged in a one-off report + fixed by admins.
- **Layer 3 (UI button) inconsistency** — enforcement at nav + route is centralised; button gating is per-component. Missing a button check is easy. Mitigation: the audit pass includes a grep sweep for `<Button` inside pages we've audited, spot-checking each for permission wrapping.
- **`X.access` ambiguity** — `X.access` today gates the dropdown visibility. It doesn't grant view of the sub-features — those need their own `.view` keys. Some codebase callsites may treat `.access` as implicit view. The audit clarifies each callsite.

---

## Effort estimate

- 1 hook file update (helpers + PermissionTree hooks)
- 1 permissions.ts change (add missing edit keys per audit table)
- 1 PermissionTree.tsx change (visual convention + save-time validator)
- N per-page button-gating patches — probably 15-25 files across the app
- No migration
- **~1-2 phases, 4-8 tasks total.** Smaller than category attributes, sits neatly alongside it.

---

## Relationship to Category Attributes plan

The two efforts share the branch (`feature/category-attributes`) but are logically independent phases. Suggested phase interleaving in the implementation plan:

1. **Category Attributes Phase 1 — DB**
2. **Permission Split Phase 1 — helpers + PermissionTree**
3. **Category Attributes Phase 2 — definition editor** (uses the new `.view` + `.edit` from day one)
4. **Category Attributes Phase 3 — item-level values**
5. **Permission Split Phase 2 — audit + patch existing keys**
6. **Category Attributes Phase 4 — picker**
7. **Category Attributes Phase 5 — integration**
8. **Category Attributes Phase 6 — cleanup + smoke + security audit**

Or, simpler: **Permission Split first as its own two phases, then Category Attributes uses the settled pattern.** The implementation plan will pick one.

---

## Related plans

- [docs/plans/2026-08-04-category-attributes.md](2026-08-04-category-attributes.md) — the primary work this rides alongside
