# Services Hub — Tree Redesign & Edit Dialog Redesign

**Date:** 2026-04-21
**Scope:** Full redesign of the service tree row anatomy and ServiceEditDialog. Duration Matrix, Doc Preview, and Brand Reliability sliders are deferred to a future plan.

---

## Goal

Replace the minimal hover-action tree with a rich 7-column table-style tree. Replace the current ServiceEditDialog with a fully-featured form covering all DB fields. Add archive (soft-delete) support throughout.

---

## DB Migrations

File: `supabase/migrations/20260421000001_services_additions.sql`

```sql
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS deleted_at        timestamptz,
  ADD COLUMN IF NOT EXISTS catalog_image_url text,
  ADD COLUMN IF NOT EXISTS legacy_service_id text,
  ADD COLUMN IF NOT EXISTS qc_items          jsonb;

CREATE INDEX IF NOT EXISTS idx_services_active
  ON services (tree_type, deleted_at)
  WHERE deleted_at IS NULL;
```

All tree queries gain `.is('deleted_at', null)` so archived rows disappear automatically.

---

## Architecture

**Option B — orchestrator + row sub-component.**

`ServiceTree.tsx` owns the sticky header and recursively maps the tree. Row logic lives in `ServiceTreeRow.tsx`. Form section components live in `ServiceEditSections.tsx` (same file, not split — tightly coupled to form context). `ServiceEditDialog.tsx` owns the form shell and submit logic.

### File Map

| File | Change |
|---|---|
| `supabase/migrations/20260421000001_services_additions.sql` | NEW |
| `src/hooks/useServices.ts` | EDIT — `deleted_at` filter + `useArchiveService` |
| `src/components/services/ServiceTree.tsx` | REWRITE — sticky header + orchestrator |
| `src/components/services/ServiceTreeRow.tsx` | NEW — 7-column row anatomy |
| `src/components/services/ServiceEditSections.tsx` | NEW — form section components |
| `src/components/services/ServiceEditDialog.tsx` | REWRITE — form shell + submit |
| `src/components/services/ServiceTableView.tsx` | EDIT — `onArchive` prop |
| `src/components/services/ContractTableView.tsx` | EDIT — `onArchive` prop |
| `src/app/(dashboard)/master-data/services/page.tsx` | EDIT — `openArchive` handler |

---

## Tree Row Anatomy

### Sticky Header

`sticky top-0 z-10 bg-muted/50 border-b text-[10px] uppercase tracking-wider font-semibold text-muted-foreground`

Columns (left → right), same widths as rows:

| Column | Width |
|---|---|
| Order | `w-10` |
| Service | `w-[260px]` |
| Invoice Text | `w-[200px]` |
| Pricing / Unit | `w-[160px]` |
| Reminders | `w-[100px]` |
| Details | `w-[130px]` |
| Actions | `w-[70px]` |

### Row Styles

- All rows: `flex items-center min-h-[40px] border-b border-border/50 hover:bg-muted/30`
- Branch rows: `bg-muted/20` base
- Click branch row body → expand/collapse
- Click leaf row body → open edit dialog
- All action buttons: `e.stopPropagation()`

### Column Details

**1. Order cell — `w-10` centered**

Two stacked ghost icon buttons `h-4 w-4 p-0`:
- `ArrowUp h-3 w-3` — `disabled` + faded if first sibling
- `ArrowDown h-3 w-3` — `disabled` + faded if last sibling
- Single sibling → render a `—` placeholder instead

**2. Service cell — `w-[260px]`**

`paddingLeft: 12 + level * 20px`

Left to right:
- Chevron slot `w-4 h-4`: `ChevronDown` (expanded) / `ChevronRight` (collapsed) `h-3.5 w-3.5 text-muted-foreground`. Empty spacer for leaves.
- Level badge: `text-[9px] px-1 py-0 h-4` — L1 blue, L2 green, L3 amber
- "Config" badge: `variant="outline"` primary color, `<Settings2 h-2 w-2>` + "Config" — shown when `service_type === 'configurable'`
- Name block (truncate, min-w-0):
  - Top: EN name — `font-semibold` for branches, regular for leaves. `text-xs text-foreground`
  - Bottom: AR name — `text-[10px] text-muted-foreground`

**3. Invoice Text cell — `w-[200px]`**

Leaves only. Two truncated lines:
- EN: `text-[11px] text-foreground`
- AR: `text-[10px] text-muted-foreground`
- Empty → faded `—`

**4. Pricing / Unit cell — `w-[160px]`**

Leaves only, three states:
- `service_type === 'configurable'` → `<Settings2 h-3 w-3 text-primary>` + "Configurable" label
- Has price → two stacked rows: "Reg: {price} QAR" (`text-xs font-semibold`) + unit label (`text-[9px] text-muted-foreground`); if `emergency_price` set → "Emg: {price} QAR" in `text-destructive`
- Empty → faded `—`

**5. Reminders cell — `w-[100px]`**

Leaves only: `<Bell h-3 w-3 text-warning>` + `{n}d` `text-[11px]`. Else faded `—`.

**6. Details cell — `w-[130px]`**

Leaves only — three inline indicators:
- Warranty: `<Shield h-3>` + `{n}m` — solid if set, faded if null
- Duration: `<Clock h-3>` + `{n}m` in `w-[38px]` slot
- Parts badge: `<Badge variant="outline" h-3.5>` `<Wrench h-2>` + "Parts" — `border-success text-success` if `spare_parts === true`, faded gray otherwise

**7. Actions cell — `w-[70px]` right-aligned, `gap-0.5`**

Three ghost icon buttons `h-5 w-5`:
- `Plus h-3.5 w-3.5 text-primary` — add child service
- `Pencil h-3.5 w-3.5 text-muted-foreground` — open edit dialog
- `Archive h-3.5 w-3.5 text-muted-foreground` — open archive confirm

---

## ServiceEditDialog Redesign

### Shell (`ServiceEditDialog.tsx`)

`<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:rounded-lg rounded-none">`

Title: "New Service" / "Edit Service" (with contract/mobile suffix where relevant).

Form submit flow:
1. Validate with Zod
2. Determine `serviceId`: for `mode='edit'` use `node.id`; for `mode='new'` generate `crypto.randomUUID()` client-side and pass it as the explicit `id` in the INSERT payload
3. If `pendingImageFile` set → upload to `service-photos` bucket at `catalog/{serviceId}.{ext}` → get public URL → include `catalog_image_url` in payload
4. If upload fails → `toast.error` + abort (do not save)
5. Call `createService` or `updateService`
6. On success → `toast.success('Service saved')` → close dialog

Unsaved-changes guard: existing `ConfirmDialog` pattern.

### Section Components (`ServiceEditSections.tsx`)

All section components receive `form: UseFormReturn<ServiceFormValues>` + relevant props. They are not exported — only consumed by `ServiceEditDialog.tsx`.

**A. CoreSection**
2-col grid: Name EN (required, red border on invalid) + Name AR (RTL, required).

**B. CatalogImageSection**
- Empty state: dashed border drop zone, `<Upload h-4>` + "Click to upload image (max 5 MB)"
- Populated state: 16×16 thumbnail + outline "Remove" button (`<X h-3>`)
- File held in component state as `File | null` — uploaded on submit, not on pick
- Accepts: `image/jpeg`, `image/png`, `image/webp`. Max 5 MB enforced client-side.

**C. StatusSection**
`Select h-8`: Active / Inactive.

**D. DivisionSection**
`Select h-8 text-xs` — each option: colored dot + division name + short code in parentheses.
Disabled + shows "(inherited)" when `mode === 'new'` and `parentId` is set (child inherits parent division).

**E. ContractSection** — `type === 'contract'` only
- Contract Type: toggle pills (Preventive / Area / General)
- Area → Price Unit text input shown
- General → Discount % field replaces Emergency Price in pricing section

**F. PricingSection**
2-col grid:
- Price (QAR) — number input
- Emergency Price (QAR) — hidden for contract General; label = "Price per Visit (QAR)" for contract Preventive

**G. DurationWarrantySection**
2-col grid:
- Duration (minutes) — number input, nullable
- Warranty (months) — number input, nullable

**H. InvoiceTextSection** — `type !== 'contract'` only
2-col textareas: Invoice Text EN + Invoice Text AR (RTL).

**I. FeatureFieldsSection** — `type !== 'contract'` only
Toggle rows:
- QC Checklist — boolean `Switch`
- Spare Parts Included — boolean `Switch`
- Service Type — "Standard" / "Configurable" button pills (maps to `service_type` enum)
- Legacy Service ID — text input, shown only when `service_type === 'configurable'`
- QC Items — add/remove list of `{ label: string; max_score: number }`. Stored as `qc_items` JSONB. Add button appends a row; each row has a label input + max score number input + remove button.

---

## Archive Flow

### `useArchiveService` hook (in `useServices.ts`)

```ts
mutationFn: async ({ id, treeType, name }: { id: string; treeType: string; name: string }) => {
  await supabase.from('services').update({
    deleted_at: new Date().toISOString(),
    status: 'inactive',
  }).eq('id', id)
  // write activity_log entry: action 'services/service-archived'
  return { treeType }
}
onSuccess: invalidate ['services', treeType]
```

### Archive AlertDialog

Triggered by the `📦` button in the Actions cell.

- Title: "Archive Service"
- Description: `Are you sure you want to archive "{name_en}"? It will be deactivated and hidden from active lists.`
- Footer: Cancel (outline) | Archive (default — destructive variant)
- On confirm → `useArchiveService.mutate(...)` → `toast.success('Service archived')` → dialog closes

---

## Hook Updates (`useServices.ts`)

- `useServiceTree`: add `.is('deleted_at', null)` filter
- Add `useArchiveService` mutation
- Zod schema update: add `catalog_image_url`, `legacy_service_id`, `qc_items`, `duration`, `warranty`, `service_type` fields
- `toDefaults` helper: map all new fields with null defaults

---

## What Is NOT in This Plan

- Duration Matrix (booking_time_matrix) — Phase 2
- Doc Preview panel — Phase 2
- Brand Reliability sliders — Phase 2
- Contract brand multi-select — Phase 2
