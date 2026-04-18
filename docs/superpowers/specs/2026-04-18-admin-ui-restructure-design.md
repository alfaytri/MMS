# Design Spec: Admin UI Restructure + Users & Roles Redesign

**Date:** 2026-04-18  
**Branch:** develop  
**Status:** Approved

---

## Overview

Four UI changes to the MMS Admin and Master Data sections:

1. **Route migration** — Companies & Divisions + Warehouses move inside the Admin layout
2. **Division cards redesign** — card grid UI replacing the nested table layout
3. **DivisionFormDialog overhaul** — color swatches, company selector in form, logo/stamp file upload
4. **Users & Roles full redesign** — accordion permissions, role cards grid, redesigned Create Role dialog

All work is committed to the `develop` branch.

---

## Part 1: Route Migration — Companies & Warehouses into Admin

### Goal
Companies & Divisions and Warehouses pages must render inside the Admin layout (with the Admin sidebar visible), not as standalone full-width pages.

### How
Move page files to be under the admin route segment so they inherit the admin layout automatically via Next.js layout nesting.

| Before | After |
|---|---|
| `app/(dashboard)/master-data/companies/page.tsx` | `app/(dashboard)/master-data/admin/companies/page.tsx` |
| `app/(dashboard)/master-data/warehouses/page.tsx` | `app/(dashboard)/master-data/admin/warehouses/page.tsx` |

### Link updates
- **AdminSidebar:** Update `Divisions` href from `/master-data/companies` → `/master-data/admin/companies`; `Warehouses` href from `/master-data/warehouses` → `/master-data/admin/warehouses`
- **TopNav (NavDropdown):** Update "Companies & Divisions" link → `/master-data/admin/companies`; "Warehouses" link → `/master-data/admin/warehouses`
- **Old page files:** Delete (no redirects needed — this is an internal app, no external links)

### Admin sidebar item label
Rename sidebar label from "Divisions" to "Companies & Divisions" to match the TopNav label.

---

## Part 2: Division Cards Redesign

### Goal
Replace the nested-table layout (company card → divisions table inside card) with a responsive card grid where each **division** is its own card.

### Page layout: `admin/companies/page.tsx`

```
[Page header: "Companies & Divisions" | "+ Add Company" button]

For each company:
  [Company section header: company name + status badge + Edit button]
  [2-col card grid on md+, 1-col on mobile]
    [Division card] [Division card]
    [Division card] ...
  ["+ Add Division" button below the grid]
```

### Division card anatomy
```
┌─[4px colored left border]──────────────────────────────┐
│  [Building icon / logo preview]  [Division Name]  [AFM] ●  [✎] [🗑] │
│                                  Alfaytri Trading & Services          │
│                                  West Bay, Zone 61, Doha              │
│  [No stamp]                                                           │
└──────────────────────────────────────────────────────────┘
```

**Card details:**
- Left border: 4px solid strip using `division.color`
- Logo area: `Building2` icon (or `<img>` if `logo_url` set), 48×48, muted background
- Division name: `font-semibold text-sm`
- Short name badge: gray `Badge variant="outline"` pill next to name
- Active indicator dot: `h-2 w-2 rounded-full` filled with `division.color` (active) or `bg-muted` (inactive)
- Edit icon (`Pencil`) + Delete icon (`Trash2`): top-right, visible on hover (always visible on mobile)
- Company name: `text-xs text-muted-foreground` below name
- Address: `text-xs text-muted-foreground` with `MapPin` icon if `address_en` present
- Stamp indicator: small badge `"No stamp"` (outline) or `"Has stamp"` (green) based on `stamp_url`

### Delete division
Add delete mutation to `useDivisions`. Wire trash icon to `ConfirmDialog` before deleting.

---

## Part 3: DivisionFormDialog Overhaul

### Goal
Redesign the dialog UI to match the mockup — company selector inside the dialog, color swatches, and logo/stamp file upload areas. All existing DB fields remain the same.

### Layout changes

**Header:** "Add Division" / "Edit Division" + subtitle "Create a new division with branding assets."

**Form sections (top to bottom):**

1. **Company (Legal Entity)** — full-width dropdown (Select component), required. Company list from `useCompanies()`. Move `companyId` from prop to form field. On edit, company is displayed as static text (read-only) — divisions cannot be re-assigned to a different company after creation.

2. **Division Name + Short Name** — 2-column row

3. **Brand Color** — color hex display box (shows current hex code) + 5-row × N-col swatch grid. Predefined palette:
   ```
   Blues:    #2563eb, #0ea5e9, #06b6d4
   Greens:   #10b981, #22c55e, #84cc16
   Yellows:  #eab308, #f59e0b, #f97316
   Reds:     #ef4444, #f43f5e, #ec4899
   Purples:  #a855f7, #8b5cf6, #6366f1
   Grays:    #64748b, #475569, #334155, #1e293b, #0f172a
   ```
   Clicking a swatch sets the color. Also allow typing the hex directly.

4. **Division Name (AR)** — single full-width input with `dir="rtl"` and a RTL placeholder (e.g. `"e.g. صيانة الفايتري"`), optional. This is the Arabic display name for the division, distinct from the already-selected company. The `company_name_en` and `company_name_ar` fields are **not shown in this form** — the company identity comes from the Step 1 dropdown.

5. **Address (EN) + Address (AR)** — 2-column row. AR field has `dir="rtl"`.

6. **Footer Motto** — full-width input, `placeholder="e.g. Quality Service Since 2010"`, optional.

7. **Logo + Stamp** — 2-column row, each column is an upload area:
   - Dashed border box, centered icon + "Upload Logo" / "Upload Stamp" label
   - On click: opens file picker (`accept="image/*"`)
   - On file select: upload to Supabase Storage bucket `division-assets` at path `` `${crypto.randomUUID()}-${filename.replace(/[^a-zA-Z0-9.]/g, '_')}` `` → store returned public URL in `logo_url` / `stamp_url`
   - If URL exists: show thumbnail preview instead of the upload placeholder
   - Supabase Storage bucket `division-assets` must be created (public read, authenticated write)

8. **Footer:** Cancel + "Add Division" / "Update Division" button (orange primary)

### Zod schema update

The existing `divisionSchema` must be updated to reflect these changes:

```ts
const divisionSchema = z.object({
  company_id:       z.string().uuid('Company is required'),   // NEW — moved from prop to form field
  name:             z.string().min(1, 'Name is required'),
  name_ar:          z.string().optional(),                    // NEW — Arabic division name (Step 4)
  short_name:       z.string().optional(),
  slug:             z.string().min(1, 'Slug is required'),
  color:            z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color'),  // tightened
  // company_name_en and company_name_ar REMOVED from form — company identity comes from the dropdown
  address_en:       z.string().optional(),
  address_ar:       z.string().optional(),
  footer_motto:     z.string().max(120, 'Max 120 characters').optional(),  // NEW — length cap
  logo_url:         z.string().url().optional().or(z.literal('')),         // must be URL or empty
  stamp_url:        z.string().url().optional().or(z.literal('')),         // must be URL or empty
  default_currency: z.string().min(1),
  default_tax_rate: z.string(),
  sort_order:       z.string(),
})
```

Key changes from the existing schema:
- `company_id` added as a required UUID field (was a prop, not a form field)
- `name_ar` added for the Arabic division name (new DB column — requires migration)
- `company_name_en` and `company_name_ar` **removed from form** (fields remain in DB but are not edited here — company identity is resolved from the dropdown selection)
- `color` tightened from `z.string().min(1)` to a hex-color regex
- `footer_motto` gains a `max(120)` length cap
- `logo_url` and `stamp_url` changed from plain `z.string().optional()` to `z.string().url().optional().or(z.literal(''))` so a stored URL is validated but an empty string (cleared field) is also accepted

### Props change
`DivisionFormDialog` props: remove required `companyId: string`, make it optional `companyId?: string` (pre-selects company if provided, otherwise user picks from dropdown).

---

## Part 4: Users & Roles Redesign

### 4a — Page header
Replace `<PageHeader>` with a custom header:
- Left: `Shield` icon + "Users & Roles" title (h1)  
- Below title: `"X users · Y roles · Z permissions"` — computed dynamically from `profiles.length`, `roles.length`, `ALL_PERMISSIONS.length`
- Right: `<SearchInput>` (global search filters across the active tab)

### 4b — Tabs with count badges
```tsx
<TabsTrigger value="permissions">
  Permissions <Badge>{ALL_PERMISSIONS.length}</Badge>
</TabsTrigger>
<TabsTrigger value="roles">
  Roles <Badge>{roles?.length}</Badge>
</TabsTrigger>
<TabsTrigger value="users">
  Users <Badge>{profiles?.length}</Badge>
</TabsTrigger>
```

### 4c — Permissions tab redesign

**Info bar:**
```
"79 permissions across 14 modules. Permissions are assigned to roles, not directly to users."
[Expand All]  [Collapse All]
```

**Accordion groups** (one per module in `PERMISSION_GROUPS`):

Each group row (collapsed):
```
[›] [ModuleIcon] Module Name                                    [count badge]
```

Each group row (expanded):
```
[˅] [ModuleIcon] Module Name                                    [count badge]
  [🔒] Permission Label              description text      permission.key
  [🔒] Permission Label              description text      permission.key
```

**`PERMISSION_GROUPS` enhancement in `lib/permissions.ts`:**

Add to each group:
- `icon`: lucide icon component
- `description` per key entry: `{ key: string; label: string; description: string }`

Example:
```ts
{
  module: 'Dashboard',
  icon: BarChart2,
  permissions: [
    { key: 'dashboard.view', label: 'View Dashboard', description: 'Access the main dashboard with KPIs and charts' },
    { key: 'dashboard.export', label: 'Export Dashboard Data', description: 'Export dashboard data as CSV or PDF' },
  ]
}
```

The `ALL_PERMISSIONS` array is derived from the new structure the same way.

**Expand/Collapse state:** `useState<Set<string>>` tracking which module names are open. "Expand All" sets all, "Collapse All" clears.

### 4d — Roles tab redesign

**Layout:**
- Top-right: "+ New Role" button (orange primary)
- Card grid: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`

**Role card anatomy:**
```
┌────────────────────────────────────────────────┐
│ [Administrator badge] [System badge]   [✎] [🗑] │
│ Full system access — all permissions granted    │
│                                                 │
│ [Dashboard 2/2] [Contact 6/6] [Orders 10/10]   │
│ [Contracts 8/8] [Invoices 7/7] ...             │
│                                                 │
│ 78 / 79 permissions                            │
└────────────────────────────────────────────────┘
```

**Role badge color:** Hash-derived from role name using a fixed palette (no DB migration):
```ts
const ROLE_COLORS = ['blue', 'green', 'orange', 'purple', 'teal', 'rose', 'amber', 'indigo']
function roleColor(name: string) {
  const i = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % ROLE_COLORS.length
  return ROLE_COLORS[i]
}
```
System roles: always blue.

**Permission coverage chips:** For each module, compute `assigned / total` where `assigned = role.permissions.filter(p => moduleKeys.includes(p)).length`. Only show modules where `assigned > 0`. Chip format: `"Dashboard 2/2"`.

**Edit/Delete:** System roles (`is_system = true`) show only Edit (grayed out) — no delete. Custom roles show both Edit + Delete (with ConfirmDialog).

### 4e — Create/Edit Role dialog redesign

**Header:** "Create Role" / "Edit Role" + subtitle "Configure role name, description, and permissions."

**Top section (2-col):**
- Role Name input (left)
- Description input (right)

**Permissions section:**
- Header: `"PERMISSIONS (X / 79)"` left + `[Select All]` `[Clear All]` right (small links)
- Scrollable accordion list (max-height: ~55vh, inner scroll)

**Module row (collapsed):**
```
[□] [›] [Icon] Module Name                          0/6
```

**Module row (expanded):**
```
[☑] [˅] [Icon] Module Name                          3/6
       [□] Permission Label     description text
       [☑] Permission Label     description text
```

**Module checkbox behavior:**
- Unchecked: no permissions in this module selected
- Indeterminate: some selected
- Checked: all selected
Clicking module checkbox toggles all permissions in that module.

**Footer:** Cancel + "Create Role" / "Update Role" (orange, disabled when form invalid)

---

## Files Changed

### New files
- `src/app/(dashboard)/master-data/admin/companies/page.tsx`
- `src/app/(dashboard)/master-data/admin/warehouses/page.tsx`
- `supabase/migrations/20260418160000_division_assets_bucket.sql`
- `supabase/migrations/20260418160001_divisions_name_ar.sql` — adds `name_ar text` column to `divisions` table

### Modified files
- `src/components/master-data/AdminSidebar.tsx` — update hrefs + label
- `src/components/layout/nav-config.ts` — update Companies & Warehouses hrefs
- `src/components/master-data/DivisionFormDialog.tsx` — full redesign
- `src/hooks/useDivisions.ts` — add `useDeleteDivision` mutation
- `src/app/(dashboard)/master-data/users/page.tsx` — full redesign
- `src/components/master-data/RoleFormDialog.tsx` — full redesign
- `src/lib/permissions.ts` — enhanced structure with labels + descriptions + icons

### Deleted files
- `src/app/(dashboard)/master-data/companies/page.tsx`
- `src/app/(dashboard)/master-data/warehouses/page.tsx`

---

## Responsive Behavior

| Component | Mobile | Tablet | Desktop |
|---|---|---|---|
| Division cards | 1 column | 2 columns | 2 columns |
| Role cards | 1 column | 2 columns | 3 columns |
| Division form | stacked | 2-col rows | 2-col rows |
| Role dialog | full-screen | centered modal | centered modal |
| Permissions accordion | full-width | full-width | full-width |

---

## Out of Scope

- Supabase Storage bucket policies (beyond creating the bucket with public read)
- Uploading logo/stamp for existing divisions (user does it on edit)
- Changing the actual permission keys or DB schema for roles
- Warehouse page UI redesign (page moves but content stays the same for now)
