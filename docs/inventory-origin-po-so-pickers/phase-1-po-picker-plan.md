# Phase 1 — Origin-aware PO picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the PO line inventory picker show a variant's **origin (country)** wherever it shows brand + code, so operators can tell apart otherwise-identical brand rows and buy against the exact (item, brand, origin) leaf.

**Architecture:** The PO pickers already resolve to a concrete `brand_variant_id` and default the line cost from that leaf; the `country_codes(name, flag, iso)` join is already fetched by `useInventoryBrandVariants` but never rendered. So this is a **display/selection** change, not a money-path rewrite. A single pure helper (`variantPickerLabel`) turns a variant's brand/origin fields into the label parts a picker row shows (mirroring the catalog's `OriginVariantRow` rules); the popover rows, the post-select breadcrumb, and the search-result rows consume it. The inline "add brand/variant" form is upgraded from free-text brand to the catalog's `BrandCombobox` + `OriginCombobox` so new leaves carry `brand_id` + `country_id`.

**Tech Stack:** Next.js (App Router — see the "This is NOT the Next.js you know" note in AGENTS.md), React 19, TypeScript, TanStack Query, Supabase (PostgREST), Tailwind, shadcn/ui (cmdk `Command` + `Popover`), Vitest + @testing-library/react.

## Global Constraints

Every task implicitly includes these:

- **No DB migration expected** — data + display only. If one proves necessary, it goes to **staging only** (`mwvblpgbgxipvrevkeff`) via `npx supabase db push` AND is byte-mirrored into `supabase/migrations-staging/` in the same commit.
- **Dropdown UUID guard:** brand + origin must render human names (`brands.name`, `country_codes.name`), never ids/UUIDs. When a value can't resolve to a label yet, show a placeholder ("Select…"/"Loading…"), never a raw id.
- **Layout stability:** adding origin text must not shift the compact multi-row line editor. Reuse the existing row containers; do not introduce new fixed heights that change row height.
- **Cache keys:** picker variant reads must keep using `useInventoryBrandVariants` (key `brandVariantsV2ByItem`) so a catalog price/origin edit reflects in the picker. Do not fork a new query.
- **Permissions:** viewing prices/origin in the picker needs no new permission. Only catalog price *edits* are gated (`inventory.pricing.manage`) — out of scope here.
- **Commit policy:** commits end with BOTH trailers via HEREDOC (see the commit template in Task 1). **Pure/code tasks** (Task 1) commit once their checks are green. **UI-visible tasks** (Tasks 2–4) are implemented and type-checked but **NOT committed until the operator confirms "works"** (project rule). Task 5 is verification (no code, no commit).
- **No `next build` / `next dev` unless the user asks.** Verify with `npx tsc --noEmit` and `npx vitest run` only.
- **Branch:** `feature/inventory-origin-po-so-pickers` (already checked out).

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/inventory/variantPickerLabel.ts` (create) | Pure helper: variant brand/origin fields → `{ primary, origin }` label parts. | 1 |
| `src/lib/inventory/variantPickerLabel.test.ts` (create) | Vitest unit tests for the helper (all three item shapes + fallbacks). | 1 |
| `src/hooks/useInventory.ts` (modify) | Export a shared `BrandVariantWithJoins` type (`BrandVariant` + optional `brands`/`country_codes` joins). No behavioural change. | 2 |
| `src/components/purchase/CascadeInventorySelector.tsx` (modify) | Render origin in the "Brand / Variant" popover rows (both pooled and non-pooled) and in the post-select breadcrumb. | 2 |
| `src/hooks/useBrandVariantAncestry.ts` (modify) | Add `country_codes(name)` to the ancestry query + type, so origin shows in the breadcrumb after a page reload / PO edit. | 2 |
| `src/components/purchase/CascadeInlineForms.tsx` (modify) | Rewrite `CascadeNewVariantForm` to pick brand + origin via `BrandCombobox`/`OriginCombobox`; create leaves with `brand_id` + `country_id`. | 3 |
| `src/components/purchase/InventoryItemLookup.tsx` (modify) | Add brand + origin to search-result rows and select the joins. (Component currently has **no consumers** — preparatory for Phase 2.) | 4 |
| `src/components/purchase/PoReceiveTab.tsx` (verify) | Confirm PO-driven receival books FIFO against the line's `brand_variant_id`. Expected already correct — fix only if not. | 5 |

---

## Task 1: `variantPickerLabel` pure helper (TDD)

Foundation for Tasks 2 and 4. Mirrors the catalog's `OriginVariantRow` label rules: brand wins as the primary label; an origin-only leaf shows its country as the primary; a leaf with neither shows "Generic". Keeping it pure makes it the single source of truth for row labels across the cascade popover and the search rows (and, in Phase 2, the SO picker).

**Files:**
- Create: `src/lib/inventory/variantPickerLabel.ts`
- Test: `src/lib/inventory/variantPickerLabel.test.ts`

**Interfaces:**
- Produces:
  - `type VariantLabelInput = { brand_name?: string | null; brand?: string | null; country_name?: string | null }`
  - `type VariantPickerLabel = { primary: string; origin: string | null }`
  - `const GENERIC_VARIANT_LABEL = 'Generic'`
  - `function variantPickerLabel(v: VariantLabelInput): VariantPickerLabel`
  - Rule: `origin` in the return is non-null **only when a brand is the primary label** (so the origin segment isn't repeated when origin is already the primary).

- [ ] **Step 1: Write the failing test**

Create `src/lib/inventory/variantPickerLabel.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { variantPickerLabel, GENERIC_VARIANT_LABEL } from './variantPickerLabel'

describe('variantPickerLabel', () => {
  it('branded + origin: brand is primary, origin kept as a segment', () => {
    expect(variantPickerLabel({ brand_name: 'Bosch', country_name: 'Germany' }))
      .toEqual({ primary: 'Bosch', origin: 'Germany' })
  })

  it('prefers the joined brand_name over the denormalized brand text', () => {
    expect(variantPickerLabel({ brand_name: 'Bosch', brand: 'BOSCH LEGACY', country_name: 'Germany' }))
      .toEqual({ primary: 'Bosch', origin: 'Germany' })
  })

  it('falls back to the denormalized brand text when the join is absent', () => {
    expect(variantPickerLabel({ brand: 'Bosch', country_name: 'Germany' }))
      .toEqual({ primary: 'Bosch', origin: 'Germany' })
  })

  it('origin-only: origin becomes primary, no duplicate origin segment', () => {
    expect(variantPickerLabel({ brand_name: null, country_name: 'Italy' }))
      .toEqual({ primary: 'Italy', origin: null })
  })

  it('generic (no brand, no origin): shows the Generic label', () => {
    expect(variantPickerLabel({ brand_name: null, brand: '', country_name: null }))
      .toEqual({ primary: GENERIC_VARIANT_LABEL, origin: null })
  })

  it('treats a literal "generic" brand text as no brand', () => {
    expect(variantPickerLabel({ brand: 'generic', country_name: 'China' }))
      .toEqual({ primary: 'China', origin: null })
  })

  it('trims and ignores whitespace-only values', () => {
    expect(variantPickerLabel({ brand_name: '  ', brand: '  ', country_name: '  ' }))
      .toEqual({ primary: GENERIC_VARIANT_LABEL, origin: null })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/inventory/variantPickerLabel.test.ts`
Expected: FAIL — "Failed to resolve import './variantPickerLabel'" (module not created yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/inventory/variantPickerLabel.ts`:

```ts
// Pure display-label logic for the PO/SO inventory pickers. Given a brand
// variant's brand + origin fields, produce the parts a picker row shows: a
// bold PRIMARY label and an optional ORIGIN segment. Kept pure + framework-free
// so it can be unit-tested and reused across the cascade popover, the search
// rows, and (Phase 2) the SO picker. Mirrors OriginVariantRow's catalog rules:
// brand wins as the primary label; an origin-only leaf shows its country as the
// primary; a leaf with neither shows "Generic".

export type VariantLabelInput = {
  /** Joined brands.name — the authoritative brand label. */
  brand_name?: string | null
  /** Denormalized brand text column — fallback when the join is absent. */
  brand?: string | null
  /** Joined country_codes.name — the origin. */
  country_name?: string | null
}

export type VariantPickerLabel = {
  /** Bold primary label: brand, else origin, else "Generic". */
  primary: string
  /**
   * Origin segment for the muted secondary line. Non-null ONLY when a brand is
   * the primary label — so origin isn't repeated when it's already the primary.
   */
  origin: string | null
}

export const GENERIC_VARIANT_LABEL = 'Generic'

/** Resolve the human brand label, or null for origin-only / generic leaves. */
function resolveBrandLabel(v: VariantLabelInput): string | null {
  const joined = v.brand_name?.trim()
  if (joined) return joined
  const text = v.brand?.trim()
  if (!text || text.toLowerCase() === 'generic') return null
  return text
}

export function variantPickerLabel(v: VariantLabelInput): VariantPickerLabel {
  const brand = resolveBrandLabel(v)
  const origin = v.country_name?.trim() || null
  if (brand) return { primary: brand, origin }
  if (origin) return { primary: origin, origin: null }
  return { primary: GENERIC_VARIANT_LABEL, origin: null }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/inventory/variantPickerLabel.test.ts`
Expected: PASS — 7 passing tests.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit** (pure/code task — safe to commit once green)

```bash
git add src/lib/inventory/variantPickerLabel.ts src/lib/inventory/variantPickerLabel.test.ts
git commit -m "$(cat <<'EOF'
feat(purchase): add variantPickerLabel helper for origin-aware picker rows

Pure brand/origin → label-parts helper shared by the PO cascade popover and
search rows. Mirrors the catalog OriginVariantRow rules (brand primary; origin
primary when brandless; "Generic" otherwise).

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Origin in the Cascade variant popover + breadcrumb

Render origin in the "Brand / Variant" popover rows (both the non-pooled fallback row and the per-division pooled rows) and in the post-select breadcrumb. Add a shared `BrandVariantWithJoins` type so the component can read the already-fetched joins without changing the hook (zero blast radius). Extend `useBrandVariantAncestry` so origin survives a page reload / PO edit.

**Files:**
- Modify: `src/hooks/useInventory.ts` (add `BrandVariantWithJoins` export near the existing `BrandVariant` type, ~line 9)
- Modify: `src/components/purchase/CascadeInventorySelector.tsx`
- Modify: `src/hooks/useBrandVariantAncestry.ts`

**Interfaces:**
- Consumes: `variantPickerLabel`, `GENERIC_VARIANT_LABEL` from Task 1.
- Produces:
  - `export type BrandVariantWithJoins = BrandVariant & { brands?: { name: string } | null; country_codes?: { name: string; flag: string | null; iso: string } | null }` (in `useInventory.ts`) — also consumed by Task 3.
  - `BrandVariantAncestry` gains `country_codes: { name: string } | null`.

- [ ] **Step 1: Add the shared joined type to `useInventory.ts`**

After the existing `export type BrandVariant = DBTable<'inventory_item_brand_variants'>` line (~line 9), add:

```ts
/**
 * A brand variant as returned by the joined picker/catalog queries
 * (`select('*, brands(name), country_codes(name, flag, iso)')`). The joins are
 * optional so a plain DBTable row stays assignable — used by the PO cascade
 * popover and the inline "add variant" form.
 */
export type BrandVariantWithJoins = BrandVariant & {
  brands?: { name: string } | null
  country_codes?: { name: string; flag: string | null; iso: string } | null
}
```

- [ ] **Step 2: Extend `useBrandVariantAncestry.ts`**

Add `country_codes(name)` to the select and the type. In `src/hooks/useBrandVariantAncestry.ts`:

Change the `BrandVariantAncestry` type to include origin (add the field after `reserved_qty`):

```ts
export type BrandVariantAncestry = {
  id: string
  brand: string
  code: string | null
  cost_price: number | null
  stock_level: number | null
  reserved_qty: number | null
  country_codes: { name: string } | null
  inventory_items: {
    id: string
    name_en: string
    name_ar: string | null
    unit: string
    inventory_categories: {
      id: string
      name_en: string
      name_ar: string | null
    }
  }
}
```

Change the select string to add the origin join (add `country_codes ( name )` after the scalar columns line):

```ts
        .select(`
          id, brand, code, cost_price, stock_level, reserved_qty,
          country_codes ( name ),
          inventory_items!inner (
            id, name_en, name_ar, unit,
            inventory_categories!inner (
              id, name_en, name_ar
            )
          )
        `)
```

- [ ] **Step 3: Import the helper + type in `CascadeInventorySelector.tsx`**

Add to the top imports:

```ts
import { variantPickerLabel } from '@/lib/inventory/variantPickerLabel'
```

And add `BrandVariantWithJoins` to the existing `@/hooks/useInventory` import (it already imports `useInventoryItemsByCategory, useInventoryBrandVariants, type InventoryCategory, type InventoryItem, type BrandVariant`):

```ts
import {
  useInventoryItemsByCategory,
  useInventoryBrandVariants,
  type InventoryCategory,
  type InventoryItem,
  type BrandVariant,
  type BrandVariantWithJoins,
} from '@/hooks/useInventory'
```

- [ ] **Step 4: Cast the variant list + add origin state**

Change the variants query destructure (currently `const { data: variants = [], isLoading: varsLoading } = useInventoryBrandVariants(...)`) to cast into the joined type:

```ts
  const { data: variantRows = [], isLoading: varsLoading } =
    useInventoryBrandVariants(selectedItem?.id ?? null)
  const variants = variantRows as BrandVariantWithJoins[]
```

Add an origin state next to the existing `selectedVariantBrand` / `selectedVariantStock` states:

```ts
  const [selectedVariantOrigin, setSelectedVariantOrigin] = useState<string | null>(null)
```

- [ ] **Step 5: Capture origin in `handleVariantSelect` + widen its param**

Change the `handleVariantSelect` signature param type to `BrandVariantWithJoins` (replaces the narrow inline type — `BrandVariant` already carries `stock_level`/`reserved_qty`/`cost_price`/`selling_price`/`code`/`brand`, so all existing reads still type-check):

```ts
  async function handleVariantSelect(variant: BrandVariantWithJoins) {
```

Inside, after the existing `setSelectedVariantStock(...)` call, add:

```ts
    setSelectedVariantOrigin(variant.country_codes?.name ?? null)
```

- [ ] **Step 6: Reset origin in `handleClear` and widen `handleVariantCreated`**

In `handleClear`, after `setSelectedVariantBrand(null)`, add:

```ts
    setSelectedVariantOrigin(null)
```

Change `handleVariantCreated`'s param type to the joined type:

```ts
  function handleVariantCreated(variant: BrandVariantWithJoins) {
    handleVariantSelect(variant)
    setIsVarCreating(false)
  }
```

- [ ] **Step 7: Add origin to the breadcrumb**

In the `if (value) { ... }` block, after `const code = selectedVariantCode ?? ancestry?.code ?? null`, add:

```ts
    const origin = selectedVariantOrigin ?? ancestry?.country_codes?.name ?? null
```

Then, in the `breadcrumbParts` assembly, after `if (brand) breadcrumbParts.push(brand)`, add:

```ts
    if (origin) breadcrumbParts.push(origin)
```

(Order becomes: category · item · code · brand · origin. Existing parts are not reordered — minimal churn, no layout shift.)

- [ ] **Step 8: Render origin in the NON-pooled fallback row**

In the `variants.flatMap((v) => { ... })` callback, compute the label once at the top of the callback (before the `if (pools.length === 0)` branch):

```ts
                      variants.flatMap((v) => {
                        const pools = variantPools?.get(v.id) ?? []
                        const label = variantPickerLabel({
                          brand_name: v.brands?.name ?? null,
                          brand: v.brand,
                          country_name: v.country_codes?.name ?? null,
                        })
```

Replace the non-pooled `CommandItem` (the `if (pools.length === 0) { return [( ... )] }` block) with:

```tsx
                        if (pools.length === 0) {
                          const sub = [label.origin, v.code].filter(Boolean).join(' · ')
                          return [(
                            <CommandItem
                              key={v.id}
                              value={`${label.primary} ${v.country_codes?.name ?? ''} ${v.code ?? ''}`}
                              onSelect={() => handleVariantSelect(v)}
                              className="text-xs"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{label.primary}</div>
                                {sub && <div className="text-muted-foreground truncate">{sub}</div>}
                              </div>
                            </CommandItem>
                          )]
                        }
```

- [ ] **Step 9: Render origin in the POOLED rows**

Replace the `return pools.map((pool: VariantDivisionPool) => { ... })` body with a version that weaves origin into the muted segment line via a filtered-join (no orphan `·` separators):

```tsx
                        return pools.map((pool: VariantDivisionPool) => {
                          const isShared =
                            !!activeDivisionId &&
                            pool.division_id !== null &&
                            pool.division_id !== activeDivisionId
                          const divisionLabel = pool.division_name ?? '—'
                          const available = Math.max(0, pool.qty - pool.reserved)
                          const subParts = [
                            label.origin,
                            v.code,
                            !isShared ? divisionLabel : null,
                          ].filter(Boolean) as string[]
                          return (
                            <CommandItem
                              key={`${v.id}:${pool.division_id ?? 'nodiv'}`}
                              value={`${label.primary} ${v.country_codes?.name ?? ''} ${v.code ?? ''} ${divisionLabel}`}
                              onSelect={() => handleVariantSelect(v)}
                              className="text-xs"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="font-medium truncate">{label.primary}</span>
                                  {isShared && (
                                    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 px-1.5 py-0 text-[9px] font-medium whitespace-nowrap">
                                      Shared from {divisionLabel}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground truncate">
                                  {subParts.length > 0 && <span className="truncate">{subParts.join(' · ')}</span>}
                                  {subParts.length > 0 && <span>·</span>}
                                  <span className={cn(available > 0 ? 'text-success font-medium' : '')}>
                                    {available.toLocaleString()} avail
                                  </span>
                                </div>
                              </div>
                            </CommandItem>
                          )
                        })
```

- [ ] **Step 10: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. (If `v.brands`/`v.country_codes` error, confirm Step 4's cast to `BrandVariantWithJoins` is in place.)

- [ ] **Step 11: ⏸ OPERATOR SMOKE — then commit only after "works"**

The operator (human login required — the agent cannot type passwords) opens a PO draft → adds a line → picks a category/item that has **multiple origins of the same brand**, and confirms:
- the popover rows now read **Brand → origin → code → avail** (or origin-primary for brandless leaves, "Generic" for neither);
- selecting a row still defaults the unit cost from that leaf;
- the confirmed breadcrumb shows the origin;
- an **origin-only** item and a **generic** item are both still selectable with no dead-end;
- no raw UUIDs anywhere; no row-height shift when selecting.

On "works", commit:

```bash
git add src/hooks/useInventory.ts src/components/purchase/CascadeInventorySelector.tsx src/hooks/useBrandVariantAncestry.ts
git commit -m "$(cat <<'EOF'
feat(purchase): show variant origin in the PO cascade picker + breadcrumb

Render country/origin in the Brand/Variant popover rows (pooled + non-pooled)
and the post-select breadcrumb, via the shared variantPickerLabel helper. Reads
the already-joined brands/country_codes off useInventoryBrandVariants (new
BrandVariantWithJoins type, no hook change) and extends useBrandVariantAncestry
so origin survives a PO reload. Display-only; the cost-default path is unchanged.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Origin-aware inline "Add brand / variant" form

Rewrite `CascadeNewVariantForm` so a newly-created leaf carries `brand_id` + `country_id` (not free text), reusing the catalog's `BrandCombobox` + `OriginCombobox`. On success it hands the created variant back with the resolved brand/origin **names** attached so the breadcrumb (Task 2) shows origin immediately.

**Files:**
- Modify: `src/components/purchase/CascadeInlineForms.tsx`

**Interfaces:**
- Consumes: `BrandVariantWithJoins` (Task 2), `BrandCombobox`, `OriginCombobox`, `useCountryCodes`, `useCreateBrandVariant`.
- Produces: `CascadeNewVariantForm`'s `onCreated` signature becomes `(variant: BrandVariantWithJoins) => void` (was `(variant: BrandVariant) => void`). Its only caller is `handleVariantCreated` in `CascadeInventorySelector`, already widened in Task 2.

- [ ] **Step 1: Confirm the only consumer**

Run: `npx grep -rn "CascadeNewVariantForm" src/` (or use the editor search).
Expected: definition + export in `CascadeInlineForms.tsx`, and one import/usage in `CascadeInventorySelector.tsx`. If any other consumer appears, widening `onCreated` may need their attention — report before editing.

- [ ] **Step 2: Update imports in `CascadeInlineForms.tsx`**

Replace the `@/hooks/useInventory` import block so it drops `useAllBrandNames` (no longer used) and pulls in the joined type:

```ts
import {
  useCreateInventoryCategory,
  useCreateInventoryItem,
  useCreateBrandVariant,
  type InventoryCategory,
  type InventoryItem,
  type BrandVariant,
  type BrandVariantWithJoins,
} from '@/hooks/useInventory'
```

Add these imports below the existing ones:

```ts
import { BrandCombobox } from '@/components/services/inventory/BrandCombobox'
import { OriginCombobox } from '@/components/services/inventory/OriginCombobox'
import { useCountryCodes } from '@/hooks/useCountryCodes'
```

- [ ] **Step 3: Rewrite the `NewVariantFormProps` type + `CascadeNewVariantForm` body**

Replace the whole `// ── CascadeNewVariantForm ──` section (the `NewVariantFormProps` interface through the end of `CascadeNewVariantForm`) with:

```tsx
interface NewVariantFormProps {
  itemId: string
  onCreated: (variant: BrandVariantWithJoins) => void
  onCancel: () => void
}

export function CascadeNewVariantForm({ itemId, onCreated, onCancel }: NewVariantFormProps) {
  const [brand,        setBrand]        = useState<{ id: string; name: string } | null>(null)
  const [countryId,    setCountryId]    = useState<number | null>(null)
  const [code,         setCode]         = useState('')
  const [costPrice,    setCostPrice]    = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const create = useCreateBrandVariant()
  const { data: countryCodes = [] } = useCountryCodes()

  // Require at least a brand OR an origin — prevents an accidental empty
  // (generic, no-origin) leaf from being created inline. A truly generic leaf
  // is a rare case and can be added from the catalog.
  const canSave = (brand !== null || countryId !== null) && !create.isPending

  function handleSubmit() {
    if (!canSave) return
    create.mutate(
      {
        item_id:       itemId,
        // brand is NOT NULL; '' satisfies it and the BEFORE-INSERT trigger
        // overwrites it from brands.name once brand_id is set.
        brand:         '',
        brand_id:      brand?.id ?? null,
        country_id:    countryId,
        code:          code.trim() || null,
        cost_price:    Number(costPrice)    || 0,
        selling_price: Number(sellingPrice) || 0,
      },
      {
        onSuccess: (variant) => {
          toast.success('Brand/variant created')
          // The insert's .select() row lacks the joined names — attach the
          // brand/origin labels we already hold so the picker breadcrumb shows
          // origin immediately (before the list refetch lands).
          const countryName = countryId != null
            ? countryCodes.find((c) => c.id === countryId)?.name ?? null
            : null
          onCreated({
            ...(variant as BrandVariant),
            brands:        brand ? { name: brand.name } : null,
            country_codes: countryName ? { name: countryName, flag: null, iso: '' } : null,
          })
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); handleSubmit() }
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }

  return (
    <div className="p-3 space-y-2" onKeyDown={onKeyDown}>
      <p className="text-xs font-medium">New Brand / Variant</p>
      {/* Brand + Origin — parallel side-by-side searchable comboboxes (never
          flyout), matching the catalog BrandVariantEditDialog pattern. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <BrandCombobox value={brand?.id ?? null} onChange={setBrand} />
        <OriginCombobox value={countryId} onChange={setCountryId} />
      </div>
      <Input
        className="h-7 text-xs w-full"
        placeholder="Variant code / SKU (optional)"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          min="0"
          step="0.01"
          className="h-7 text-xs"
          placeholder="Cost price"
          value={costPrice}
          onChange={(e) => setCostPrice(e.target.value)}
        />
        <Input
          type="number"
          min="0"
          step="0.01"
          className="h-7 text-xs"
          placeholder="Selling price"
          value={sellingPrice}
          onChange={(e) => setSellingPrice(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs flex-1"
          disabled={!canSave}
          onClick={handleSubmit}
        >
          {create.isPending ? 'Saving…' : 'Save'}
        </Button>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
```

Note: the old free-text `<datalist>` + `useAllBrandNames` approach is removed — `BrandCombobox` reads the proper `brands` table and satisfies the dropdown-UUID guard by construction.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. Confirm `useAllBrandNames` is no longer imported anywhere it was removed (dead import would fail lint, not tsc — also run `npx eslint src/components/purchase/CascadeInlineForms.tsx`).

- [ ] **Step 5: ⏸ OPERATOR SMOKE — then commit only after "works"**

Operator opens a PO line → selects category/item → in "Brand / Variant" clicks **+ Add new brand / variant** and confirms:
- brand picker (searchable, from the brands table) + origin picker (searchable country list) render side by side;
- creating with **brand + origin** adds the leaf and auto-selects it, cost/selling default correctly, and the breadcrumb shows the origin;
- **brand-only** and **origin-only** creations both succeed;
- Save stays disabled until a brand or origin is chosen;
- the narrow popover doesn't clip the combobox triggers (they truncate).

On "works", commit:

```bash
git add src/components/purchase/CascadeInlineForms.tsx
git commit -m "$(cat <<'EOF'
feat(purchase): origin-aware inline add-variant form on the PO picker

Replace the free-text brand input with the catalog BrandCombobox + OriginCombobox
so inline-created leaves carry brand_id + country_id. Returns the created variant
with resolved brand/origin names so the picker breadcrumb shows origin at once.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Origin + brand in `InventoryItemLookup` search rows

Add brand + origin to the flat search-result rows and select the joins. **This component currently has zero consumers** (grep in Task 4 Step 1 confirms) — the change is preparatory for the Phase 2 SO/quotation wiring the spec references. Keep it self-contained (no shared-type changes).

**Files:**
- Modify: `src/components/purchase/InventoryItemLookup.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (kept independent so it can't break a live path).
- Produces: no exported API change — `InventoryItemLookupProps` and `onChange`'s `InventoryLookupResult` are unchanged; origin is a row-local display field.

- [ ] **Step 1: Confirm no live consumer (documents the "preparatory" status)**

Run: `npx grep -rn "InventoryItemLookup" src/`
Expected: only the definition/export in `InventoryItemLookup.tsx`. If a consumer exists, note it — the operator smoke for this task then has a real surface; otherwise verification is tsc-only.

- [ ] **Step 2: Widen the query select + typed row mapping**

In the `useEffect` search block, change the `.select(...)` to include the joins and map brand + a row-local origin. Replace the query + `setResults(...)` block with:

```tsx
      const { data } = await supabase
        .from('inventory_item_brand_variants')
        .select('id, code, cost_price, selling_price, brands(name), country_codes(name), inventory_items!inner(name_en, name_ar, sku, unit)')
        .or(`inventory_items.name_en.ilike.%${safe}%,code.ilike.%${safe}%`)
        .eq('inventory_items.status', 'active')
        .limit(20)

      // brands/country_codes aren't in the generated types yet — map through an
      // explicit row shape rather than `any`.
      const rows = (data ?? []) as unknown as Array<{
        id: string
        code: string | null
        cost_price: number | null
        selling_price: number | null
        brands: { name: string } | null
        country_codes: { name: string } | null
        inventory_items: { name_en: string; name_ar: string | null; sku: string; unit: string }
      }>

      setResults(
        rows.map((r) => ({
          brand_variant_id: r.id,
          item_name: r.inventory_items.name_en,
          item_name_ar: r.inventory_items.name_ar,
          sku: r.code ?? r.inventory_items.sku,
          unit: r.inventory_items.unit,
          cost_price: r.cost_price ?? 0,
          selling_price: r.selling_price ?? 0,
          category_name: null,
          category_name_ar: null,
          brand: r.brands?.name ?? null,
          origin: r.country_codes?.name ?? null,
        }))
      )
```

- [ ] **Step 3: Add a row-local result type carrying origin**

`InventoryLookupResult` (from `usePurchaseOrders`) has no `origin` field and shouldn't grow one just for this unused component. Add a local type and use it for `results` state. Replace `const [results, setResults] = useState<InventoryLookupResult[]>([])` with:

```tsx
  type LookupRow = InventoryLookupResult & { origin: string | null }
  const [results, setResults] = useState<LookupRow[]>([])
```

(`onChange(item)` still receives a value assignable to `InventoryLookupResult` — the extra `origin` key is structurally harmless.)

- [ ] **Step 4: Render brand + origin in the result rows**

Replace the result row's inner text block:

```tsx
              <div className="text-left">
                <div className="font-medium">{item.item_name}</div>
                {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
              </div>
```

with:

```tsx
              <div className="text-left">
                <div className="font-medium">{item.item_name}</div>
                {(() => {
                  const meta = [item.brand, item.origin, item.sku].filter(Boolean).join(' · ')
                  return meta ? <div className="text-xs text-muted-foreground">{meta}</div> : null
                })()}
              </div>
```

- [ ] **Step 5: Type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/components/purchase/InventoryItemLookup.tsx`
Expected: no new errors.

- [ ] **Step 6: ⏸ OPERATOR SMOKE (only if Step 1 found a consumer) — then commit**

If a live surface consumes it, the operator searches inventory and confirms rows read **item → brand · origin · sku** and picking one still resolves the variant. If there is **no consumer**, verification is tsc/lint-only and the controller may commit after those pass (there is no user-visible surface to gate on — note this in the commit).

```bash
git add src/components/purchase/InventoryItemLookup.tsx
git commit -m "$(cat <<'EOF'
feat(purchase): show brand + origin in InventoryItemLookup search rows

Select the brands/country_codes joins and render brand · origin · sku per row.
Preparatory — the component has no live consumer yet (Phase 2 SO wiring).

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Verify PO-driven receival books FIFO on the chosen (brand, origin) leaf

Verification, **no code change expected**. `PoReceiveTab` already seeds each row with `brand_variant_id: li.brand_variant_id ?? null` and submits `brand_variant_id: r.brand_variant_id`, so the receival — and the FIFO layer it creates — is keyed to the PO line's exact variant. This task confirms that end-to-end and only edits code if a gap is found.

**Files:**
- Verify: `src/components/purchase/PoReceiveTab.tsx` (read-only unless a gap is found)

- [ ] **Step 1: Trace the write path (static)**

Confirm in `PoReceiveTab.tsx`:
- `rows` init (`useState`) sets `brand_variant_id: li.brand_variant_id ?? null` from each `po_line_items` row;
- `submit()` pushes `brand_variant_id: r.brand_variant_id` for both the received and same-product-free items;
- non-PO free items pass `po_line_item_id: null` with their own `brand_variant_id` (unaffected by this change).

Expected: all three hold — no edit needed.

- [ ] **Step 2: Confirm the RPC books FIFO on `brand_variant_id`**

The receival mutation is `useCreateReceival`. Confirm (read `src/hooks/useReceivals.ts` and the receival RPC it calls) that FIFO layers are inserted with `brand_variant_id` taken from the receival item — i.e. the picked leaf, not a re-resolved brand/item. This is the money-path spine the spec says is already correct; the task is to *confirm*, not change it.

- [ ] **Step 3: ⏸ OPERATOR SMOKE — live confirmation (no commit)**

Operator creates a PO with a line on a **branded + origin** leaf, then receives some qty. Then confirm the FIFO layer landed on the right variant with a live read (staging), e.g.:

```bash
npx supabase db query --linked -o csv "select f.brand_variant_id, v.brand, cc.name as origin, f.qty, f.remaining_qty from fifo_cost_layers f join inventory_item_brand_variants v on v.id = f.brand_variant_id left join country_codes cc on cc.id = v.country_id order by f.created_at desc limit 5"
```

Expected: the newest layer's `brand_variant_id` equals the picked leaf, with the expected brand + origin. If it does, Task 5 is done (no code, no commit). If it does NOT, stop and open a focused fix task — this would be a money-path bug outside the display scope of Phase 1.

---

## Self-Review (completed against the spec)

- **Spec coverage:** every acceptance criterion maps to a task — origin visible + cost defaults (T2), brandless/generic still selectable (T1 helper + T2 rows), list distinguishes origins (T2), inline add carries brand_id + country_id (T3), receival lands on the chosen leaf (T5), no raw UUIDs (comboboxes + helper render names), tsc + operator smoke (each task). `InventoryItemLookup` from the spec's component table is covered by T4 (flagged unused).
- **Placeholder scan:** none — every code step carries complete code.
- **Type consistency:** `BrandVariantWithJoins` is defined once in `useInventory.ts` (T2 Step 1) and consumed by T2 (selector) and T3 (inline form); `variantPickerLabel`'s `{ primary, origin }` shape is used identically in T2's pooled and non-pooled rows; `handleVariantSelect` / `handleVariantCreated` params are both widened to `BrandVariantWithJoins`.
- **Scope note for the user (one delta beyond the 4-file spec table):** the plan adds **origin to the post-select breadcrumb** (T2 Steps 6–7 + the `useBrandVariantAncestry` change). The approved spec's component table listed only the popover rows; the breadcrumb addition completes the origin-visibility loop (otherwise origin is shown at pick time but vanishes once the line is confirmed) at ~10 lines + a one-line query change, single-consumer, zero blast radius. Flag this to the user at execution handoff so they can keep or drop it.

---

## Execution Handoff

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, controller commits after each review (pure task) or after operator "works" (UI tasks). Uses `superpowers:subagent-driven-development`.
2. **Inline Execution** — execute tasks in this session with checkpoints. Uses `superpowers:executing-plans`.

---

# Revision R — Brand → Origin cascade picker (supersedes Task 2's combined list on the purchase path)

> Approved 2026-08-09 (see the spec's "Revision 2026-08-09" section). Replaces the shipped combined "Brand / Variant" list with a two-step **Brand → Origin** cascade mirroring the Category → Subcategory → Type selects. **Purchase path only** (`filterByActiveDivision === false`); the sales-side pooled rendering is left untouched (Phase 2). Same subagent-driven execution + operator-smoke gate as the rest of Phase 1.

## Task 6: `variantsToBrandGroups` pure helper (TDD)

Groups an item's joined variants into brand groups (reusing the tested `groupVariants`), returning the **original typed variant objects** as each group's origins so the picker can pass a leaf straight to `handleVariantSelect`. Generic in the variant type — no React/hook imports.

**Files:**
- Create: `src/lib/inventory/variantBrandGroups.ts`
- Test: `src/lib/inventory/variantBrandGroups.test.ts`

**Interfaces:**
- Consumes: `groupVariants`, `type VariantLite` from `./groupVariants`.
- Produces:
  - `type BrandVariantLike = { id: string; brand_id: string | null; country_id: number | null; brands?: { name: string } | null; country_codes?: { name: string } | null }`
  - `type PickerBrandGroup<T> = { brandKey: string; brandLabel: string; origins: T[] }`
  - `function variantsToBrandGroups<T extends BrandVariantLike>(variants: T[]): PickerBrandGroup<T>[]` — brand order + origin order come from `groupVariants` (Unbranded last, null-origin last); origins are the original `T` objects, not `VariantLite`.

- [ ] **Step 1: Write the failing test** — create `src/lib/inventory/variantBrandGroups.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { variantsToBrandGroups } from './variantBrandGroups'

type V = {
  id: string
  brand_id: string | null
  country_id: number | null
  brands?: { name: string } | null
  country_codes?: { name: string } | null
  code?: string | null
}

const mk = (o: Partial<V> & { id: string }): V => ({
  brand_id: null, country_id: null, brands: null, country_codes: null, ...o,
})

describe('variantsToBrandGroups', () => {
  it('groups by brand and keeps origin objects (full variant passthrough)', () => {
    const daikinEg = mk({ id: 'v1', brand_id: 'b1', brands: { name: 'DAIKIN' }, country_id: 1, country_codes: { name: 'Egypt' }, code: 'A' })
    const daikinDe = mk({ id: 'v2', brand_id: 'b1', brands: { name: 'DAIKIN' }, country_id: 2, country_codes: { name: 'Germany' }, code: 'B' })
    const lg = mk({ id: 'v3', brand_id: 'b2', brands: { name: 'LG' }, code: 'C' })
    const groups = variantsToBrandGroups([daikinDe, lg, daikinEg])
    const daikin = groups.find((g) => g.brandLabel === 'DAIKIN')!
    expect(daikin.origins.map((o) => o.id)).toEqual(['v1', 'v2']) // Egypt before Germany (A-Z)
    expect(daikin.origins[0].code).toBe('A')                       // original object preserved
    const lgGroup = groups.find((g) => g.brandLabel === 'LG')!
    expect(lgGroup.origins).toHaveLength(1)
  })

  it('labels brandless leaves "Unbranded" and sorts that group last', () => {
    const groups = variantsToBrandGroups([
      mk({ id: 'g1' }),                                              // no brand, no origin
      mk({ id: 'b1', brand_id: 'bx', brands: { name: 'Bosch' } }),
    ])
    expect(groups.map((g) => g.brandLabel)).toEqual(['Bosch', 'Unbranded'])
  })

  it('single generic leaf -> one Unbranded group with one origin', () => {
    const groups = variantsToBrandGroups([mk({ id: 'only' })])
    expect(groups).toHaveLength(1)
    expect(groups[0].brandLabel).toBe('Unbranded')
    expect(groups[0].origins).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/inventory/variantBrandGroups.test.ts` → FAIL (cannot resolve module).

- [ ] **Step 3: Write the implementation** — create `src/lib/inventory/variantBrandGroups.ts`:

```ts
import { groupVariants, type VariantLite } from './groupVariants'

// Minimal shape the picker groups on — the joined brand/country names plus the
// scalar FK ids. Kept structural (no hook import) so this stays pure.
export type BrandVariantLike = {
  id: string
  brand_id: string | null
  country_id: number | null
  brands?: { name: string } | null
  country_codes?: { name: string } | null
}

export type PickerBrandGroup<T> = {
  brandKey: string
  brandLabel: string
  origins: T[]
}

/**
 * Group joined variants by brand for the PO cascade, delegating the grouping +
 * ordering (Unbranded last, null-origin last) to the tested `groupVariants`,
 * then mapping each group's origins back to the ORIGINAL typed variant objects
 * (groupVariants only carries the VariantLite projection) so the caller can
 * pass a leaf straight to `handleVariantSelect`.
 */
export function variantsToBrandGroups<T extends BrandVariantLike>(variants: T[]): PickerBrandGroup<T>[] {
  const byId = new Map(variants.map((v) => [v.id, v]))
  const lite: VariantLite[] = variants.map((v) => ({
    id:           v.id,
    brand_id:     v.brand_id ?? null,
    brand_name:   v.brands?.name ?? null,
    country_id:   v.country_id ?? null,
    country_name: v.country_codes?.name ?? null,
  }))
  return groupVariants(lite).map((g) => ({
    brandKey:   g.brandKey,
    brandLabel: g.brandLabel,
    origins:    g.origins.map((o) => byId.get(o.id)!),
  }))
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/lib/inventory/variantBrandGroups.test.ts` → PASS (3).

- [ ] **Step 5: Type-check + commit** (pure task — commit when green). `npx tsc --noEmit` clean, then:

```bash
git add src/lib/inventory/variantBrandGroups.ts src/lib/inventory/variantBrandGroups.test.ts
git commit -m "$(cat <<'EOF'
feat(purchase): variantsToBrandGroups helper for the Brand-Origin picker

Groups an item's joined variants by brand (via the tested groupVariants),
returning the original typed variant objects as each group's origins so the PO
cascade can pass a leaf straight to handleVariantSelect.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Brand → Origin cascade in `CascadeInventorySelector` (purchase path)

Replace the shipped combined "Brand / Variant" popover with a **Brand** select + a conditionally-revealed **Origin** select, **only when `filterByActiveDivision === false`**. When `true` (sales), keep the existing combined-list popover byte-for-byte (Phase 2 territory). Resolution still flows through the unchanged `handleVariantSelect` (cost default untouched); the breadcrumb (Task 2) is unchanged.

**Files:**
- Modify: `src/components/purchase/CascadeInventorySelector.tsx`

**Interfaces:**
- Consumes: `variantsToBrandGroups`, `type PickerBrandGroup` (Task 6); existing `handleVariantSelect`, `handleVariantCreated`, `variants` (`BrandVariantWithJoins[]`), `CascadeNewVariantForm`.

- [ ] **Step 1: Imports + new state.** Add `useEffect` to the React import (`import { useState, useEffect, useMemo } from 'react'`). Add `import { variantsToBrandGroups } from '@/lib/inventory/variantBrandGroups'`. Add state next to `selectedVariantOrigin`:

```ts
  const [brandOpen, setBrandOpen] = useState(false)
  const [originOpen, setOriginOpen] = useState(false)
  const [selectedBrandKey, setSelectedBrandKey] = useState<string | null>(null)
```

- [ ] **Step 2: Derived brand groups + active group + single-variant auto-resolve.** After `const variants = variantRows as BrandVariantWithJoins[]`:

```ts
  const brandGroups = useMemo(() => variantsToBrandGroups(variants), [variants])
  // Single-brand item -> that brand is the active group (nothing to pick);
  // multi-brand -> the group the operator picked.
  const activeBrandGroup = useMemo(
    () => (brandGroups.length === 1 ? brandGroups[0] : brandGroups.find((g) => g.brandKey === selectedBrandKey) ?? null),
    [brandGroups, selectedBrandKey],
  )
  // Origin select appears only when the active brand has >1 origin to choose
  // among — mirrors Subcategory/Type appearing only when the parent has children.
  const showOrigin = !filterByActiveDivision && !!activeBrandGroup && activeBrandGroup.origins.length > 1
```

Add the auto-resolve effect (place in the component body below the derived values; it references `handleVariantSelect`):

```ts
  // Purchase path: an item with exactly one variant resolves immediately (the
  // "only one option -> don't make them pick it" rule). Guarded by `value` so it
  // fires once and never loops (resolving sets value -> the breadcrumb renders).
  useEffect(() => {
    if (filterByActiveDivision || value || varsLoading) return
    if (!selectedItem || !selectedCategory) return
    if (variants.length === 1) void handleVariantSelect(variants[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants, value, varsLoading, selectedItem, selectedCategory, filterByActiveDivision])
```

- [ ] **Step 3: Handlers + `handleClear` resets.** Add near `handleVariantSelect`:

```ts
  function handleBrandSelect(group: import('@/lib/inventory/variantBrandGroups').PickerBrandGroup<BrandVariantWithJoins>) {
    setSelectedBrandKey(group.brandKey)
    setBrandOpen(false)
    if (group.origins.length === 1) {
      void handleVariantSelect(group.origins[0])   // single leaf -> resolve now
    } else {
      setTimeout(() => setOriginOpen(true), 0)      // reveal Origin
    }
  }

  function handleOriginSelect(leaf: BrandVariantWithJoins) {
    setOriginOpen(false)
    void handleVariantSelect(leaf)
  }
```

In `handleClear`, after `setSelectedVariantOrigin(null)`:

```ts
    setSelectedBrandKey(null)
    setBrandOpen(false)
    setOriginOpen(false)
```

- [ ] **Step 4: Branch Row 2 — purchase cascade vs sales combined list.** Convert the Row 2 container so the **Item popover is kept once (shared)** and the brand region is branched. The current `<div className="grid grid-cols-1 sm:grid-cols-2 gap-2"> … Item … Brand/Variant … </div>` becomes:

```tsx
      {/* Row 2 — Item + Brand/Origin. Purchase (filterByActiveDivision=false) uses a
          Brand->Origin cascade mirroring Row 1; sales keeps the combined list (Phase 2). */}
      <div className={cn('gap-2', filterByActiveDivision ? 'grid grid-cols-1 sm:grid-cols-2' : 'flex flex-col sm:flex-row')}>
        <div className={filterByActiveDivision ? undefined : 'flex-1 min-w-0'}>
          {/* … EXISTING Item <Popover> … (unchanged, shared — do NOT duplicate) … */}
        </div>

        {filterByActiveDivision ? (
          <div>
            {/* … EXISTING Brand / Variant <Popover> … (unchanged: combined list with
                variantPickerLabel + pooled/non-pooled rows — preserves the sales path) … */}
          </div>
        ) : (
          <>
            {/* Brand select (purchase cascade) */}
            <div className="flex-1 min-w-0">
              <Popover open={brandOpen} onOpenChange={(open) => { setBrandOpen(open); if (!open) setIsVarCreating(false) }}>
                <PopoverTrigger
                  className={cn(triggerCls, !selectedItem && 'pointer-events-none opacity-50')}
                  render={(props) => <button type="button" disabled={!selectedItem} {...props} />}
                >
                  <span className="truncate">
                    {varsLoading ? 'Loading…' : (activeBrandGroup?.brandLabel ?? 'Brand…')}
                  </span>
                  <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="start">
                  {isVarCreating ? (
                    <CascadeNewVariantForm
                      itemId={selectedItem!.id}
                      onCreated={handleVariantCreated}
                      onCancel={() => setIsVarCreating(false)}
                    />
                  ) : (
                    <>
                      <Command>
                        <CommandInput placeholder="Search brand…" className="h-8 text-xs" />
                        <CommandEmpty className="py-2 text-xs text-center text-muted-foreground">
                          {varsLoading ? 'Loading…' : 'No brands found.'}
                        </CommandEmpty>
                        <CommandGroup className="max-h-60 overflow-y-auto">
                          {varsLoading ? (
                            <div className="px-2 py-1.5 space-y-1">
                              {[1, 2, 3].map((n) => (<div key={n} className="h-6 rounded bg-muted animate-pulse" />))}
                            </div>
                          ) : (
                            brandGroups.map((g) => (
                              <CommandItem
                                key={g.brandKey}
                                value={g.brandLabel}
                                onSelect={() => handleBrandSelect(g)}
                                className="text-xs"
                              >
                                <Check className={cn('mr-2 h-3 w-3 shrink-0', activeBrandGroup?.brandKey === g.brandKey ? 'opacity-100' : 'opacity-0')} />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate">{g.brandLabel}</div>
                                  {g.origins.length > 1 && (
                                    <div className="text-muted-foreground truncate">{g.origins.length} origins</div>
                                  )}
                                </div>
                              </CommandItem>
                            ))
                          )}
                        </CommandGroup>
                      </Command>
                      <div className="border-t px-2 py-1.5">
                        <button
                          type="button"
                          className="w-full text-left text-xs text-muted-foreground hover:text-foreground py-1 px-2 rounded hover:bg-accent"
                          onClick={() => setIsVarCreating(true)}
                        >
                          + Add new brand / variant
                        </button>
                      </div>
                    </>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {/* Origin select — revealed only when the active brand has >1 origin */}
            {showOrigin && (
              <div className="flex-1 min-w-0">
                <Popover open={originOpen} onOpenChange={setOriginOpen}>
                  <PopoverTrigger className={triggerCls} render={(props) => <button type="button" {...props} />}>
                    <span className="truncate">{selectedVariantOrigin ?? 'Origin…'}</span>
                    <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search origin…" className="h-8 text-xs" />
                      <CommandEmpty className="py-2 text-xs text-center text-muted-foreground">No origins.</CommandEmpty>
                      <CommandGroup className="max-h-60 overflow-y-auto">
                        {activeBrandGroup!.origins.map((leaf) => {
                          const originLabel = leaf.country_codes?.name ?? '— No origin —'
                          return (
                            <CommandItem
                              key={leaf.id}
                              value={`${originLabel} ${leaf.code ?? ''}`}
                              onSelect={() => handleOriginSelect(leaf)}
                              className="text-xs"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{originLabel}</div>
                                {leaf.code && <div className="text-muted-foreground truncate">{leaf.code}</div>}
                              </div>
                            </CommandItem>
                          )
                        })}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </>
        )}
      </div>
```

Implementer notes:
- Keep the EXISTING Item popover JSX verbatim inside the first inner `<div>` (shared — do not duplicate into both branches).
- Keep the EXISTING Brand/Variant popover JSX verbatim inside the `filterByActiveDivision ? (…)` branch (the combined list with `variantPickerLabel`, pooled + non-pooled rows). This preserves the sales path exactly.
- `selectedVariantOrigin` is already set by `handleVariantSelect`; reused here only for the Origin trigger label before `value` collapses to the breadcrumb.

- [ ] **Step 5: Verify.** `npx tsc --noEmit` clean; `npx eslint src/components/purchase/CascadeInventorySelector.tsx` clean (zero errors AND warnings — the `useEffect` deps are intentionally suppressed with the inline disable shown; confirm no OTHER warning); `npx vitest run src/lib/inventory/variantBrandGroups.test.ts` green. Do NOT run `next build`/`next dev`.

- [ ] **Step 6: ⏸ OPERATOR SMOKE — then commit** (commit after code-review; smoke gates branch finish). On a PO draft with the mixed item (DAIKIN 2 origins; LG/Samsung none):
  - Brand select lists DAIKIN / LG / Samsung / Unbranded (as applicable); picking **DAIKIN** reveals an **Origin** select (Egypt / Germany); picking origin fills cost + collapses to the breadcrumb (brand + origin).
  - Picking **LG** (single leaf) resolves immediately, **no Origin box**.
  - Single-brand item shows the brand pre-filled and only asks origin when >1; a single-variant item resolves on item pick.
  - Null-origin leaf under a multi-origin brand shows **"— No origin —"**; brandless leaves group under **"Unbranded"**.
  - No row-height shift as the Origin box appears; no raw UUIDs.
  - **Sales side unaffected:** a sales surface still shows the old combined list with per-division "avail".

Commit after review + smoke:

```bash
git add src/components/purchase/CascadeInventorySelector.tsx
git commit -m "$(cat <<'EOF'
feat(purchase): Brand -> Origin cascade in the PO picker (replaces combined list)

Purchase path (filterByActiveDivision=false) now picks Brand then a revealed
Origin select (mirrors the category cascade), via variantsToBrandGroups. Single
leaf / single-variant items auto-resolve; brandless->"Unbranded", null origin->
"- No origin -". Sales-side pooled list left untouched (Phase 2). Cost-default
path unchanged.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```
