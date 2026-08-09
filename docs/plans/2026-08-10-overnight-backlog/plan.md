# Overnight Backlog — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.
> This repo has **no unit-test harness** for these UI/DB changes — verification is
> `npx tsc --noEmit`, targeted `grep`, browser Network-panel checks, and operator
> smoke (per `feedback_test_split`). Steps reflect that, not pytest/jest.

**Goal:** Clear the code-only inventory backlog (N+1 chips, dead components,
tree nits) with verified local commits, and produce staged spec + draft
migrations for the Security P1 write-guards.

**Architecture:** WS1 feeds an already-batched category attribute map to per-item
chip strips via an optional React context (fallback preserved for non-list
callers). WS2/WS3 are localized deletions and polish. WS4 authors draft guard
triggers outside the migrations tree for attended morning review.

**Tech Stack:** Next.js (App Router, breaking-changes fork), React 18 + TanStack
Query, Supabase (Postgres + RLS + PostgREST), Tailwind.

## Global Constraints

- **Branches off current HEAD `feature/security-p1-po-column-lock`;** no push, no PR.
- **Commit trailer (every commit):**
  `Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>` +
  `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` (via HEREDOC).
- **PROGRESS.md** updated on task START and COMPLETION; the docs update is its own
  commit, never mixed with code.
- **EOD/EOD-2026-08-10.md** appended after each completed task (read-before-write).
- **Supabase-budget rule:** every `.from(...).select(...)` list read has `.limit(N)`.
- **No `next build`** unless the operator asks. `tsc --noEmit` is the gate.
- **WS4:** STAGING-only guard pattern; nothing pushed/committed tonight.

---

## WS1 — Batch inventory attribute-chip fetches (N+1)

**Branch:** `perf/inventory-attribute-chip-n1`

**Files:**
- Create: `src/components/shared/ItemAttributesContext.tsx`
- Modify: `src/hooks/useAttributes.ts` (add `enabled` arg to `useItemAttributes`)
- Modify: `src/components/shared/AttributeChipStrip.tsx` (consume context + fallback)
- Modify: `src/components/services/inventory/CategoryRow.tsx` (load-when-expanded + provider)

**Interfaces:**
- Produces: `ItemAttributesBatch = { byItem: Map<string, Map<string,string>> }`,
  `ItemAttributesProvider` (the context Provider), `useItemAttributesContext(): ItemAttributesBatch | null`.
- Consumes: `useItemAttributesByCategory(categoryId)` → `Map<itemId, Map<defId, optionId>>` (exists, `useAttributes.ts:240`).

### Task 1.1: PROGRESS.md — start

- [ ] Set `## 🔄 In Progress` to `🚀 Starting: **Overnight Backlog WS1: Attribute-chip N+1 batch**`.
- [ ] Commit **only** PROGRESS.md: `docs: update PROGRESS.md — starting Attribute-chip N+1 batch`.

### Task 1.2: Create the context

- [ ] Create `src/components/shared/ItemAttributesContext.tsx`:

```tsx
'use client'

import { createContext, useContext } from 'react'

/**
 * Optional batch of item→attribute picks, provided by a list container
 * (e.g. an expanded CategoryRow) so per-item chip strips don't each fire
 * their own query. `byItem` maps itemId → (definitionId → optionId).
 *
 * A container renders the Provider as soon as the list is shown (with an
 * empty map while the batch query is in flight), so children NEVER fall
 * back to a per-item query. When the context is absent (null) — e.g. a
 * non-list caller — consumers fall back to their own per-item fetch.
 */
export type ItemAttributesBatch = {
  byItem: Map<string, Map<string, string>>
}

const ItemAttributesContext = createContext<ItemAttributesBatch | null>(null)

export const ItemAttributesProvider = ItemAttributesContext.Provider

export function useItemAttributesContext(): ItemAttributesBatch | null {
  return useContext(ItemAttributesContext)
}
```

### Task 1.3: Add `enabled` to `useItemAttributes`

- [ ] In `src/hooks/useAttributes.ts`, change the `useItemAttributes` signature so
  a caller can disable the per-item query when a batch supplies the data:

```ts
export function useItemAttributes(
  itemId: string | null,
  options?: { enabled?: boolean },
) {
  const enabled = (options?.enabled ?? true) && !!itemId
  return useQuery({
    queryKey: queryKeys.attributes.itemValues(itemId ?? '__none__'),
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_item_attributes')
        .select('id, item_id, definition_id, option_id')
        .eq('item_id', itemId!)
        .limit(500)
      if (error) throw error
      return (data ?? []) as ItemAttributeRow[]
    },
  })
}
```

  (Also adds the missing `.limit(500)` — Supabase-budget rule; an item can't
  realistically have >500 attribute picks.)

### Task 1.4: Consume the context in `AttributeChipStrip`

- [ ] In `src/components/shared/AttributeChipStrip.tsx`, read the context, gate the
  fallback query on the context's absence, and build a single `pickMap`:

```tsx
'use client'

import { useMemo } from 'react'
import {
  useEffectiveAttributes,
  useItemAttributes,
  useAttributeOptionsBatch,
  type EffectiveAttribute,
  type AttributeOption,
} from '@/hooks/useAttributes'
import { useItemAttributesContext } from './ItemAttributesContext'

type Props = {
  itemId: string
  categoryId: string
  maxChips?: number
}

const EMPTY_PICKS: Map<string, string> = new Map()

export function AttributeChipStrip({ itemId, categoryId, maxChips = 4 }: Props) {
  const { data: effective = [] } = useEffectiveAttributes(categoryId)

  // Batched picks from a list container, if present. When a provider exists we
  // NEVER fire the per-item query (even mid-load) — that is the whole point.
  const batch = useItemAttributesContext()
  const hasProvider = batch !== null
  const { data: fallbackPicks = [] } = useItemAttributes(itemId, { enabled: !hasProvider })

  const { data: optionsByDefinition = new Map() } = useAttributeOptionsBatch(
    effective.map((e) => e.definition_id),
  )

  const pickMap = useMemo<Map<string, string>>(() => {
    if (hasProvider) return batch!.byItem.get(itemId) ?? EMPTY_PICKS
    const m = new Map<string, string>()
    for (const p of fallbackPicks) m.set(p.definition_id, p.option_id)
    return m
  }, [hasProvider, batch, itemId, fallbackPicks])

  const chips = useMemo(
    () => buildChips(effective, pickMap, optionsByDefinition),
    [effective, pickMap, optionsByDefinition],
  )
  if (chips.length === 0) return null

  const shown = chips.slice(0, maxChips)
  const overflow = chips.length - shown.length

  return (
    <div className="flex flex-wrap items-center gap-1 mt-0.5">
      {shown.map((c) => (
        <span
          key={c.definition_id}
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted/60 border border-border/50"
          title={`${c.label}: ${c.value}`}
        >
          <span className="text-muted-foreground">{c.label}:</span>
          <span className="font-medium text-foreground/80">{c.value}</span>
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-[10px] text-muted-foreground">+{overflow} more</span>
      )}
    </div>
  )
}

function buildChips(
  effective: EffectiveAttribute[],
  pickMap: Map<string, string>,
  optionsByDef: Map<string, AttributeOption[]>,
): Array<{ definition_id: string; label: string; value: string }> {
  const chips: Array<{ definition_id: string; label: string; value: string }> = []
  for (const attr of effective) {
    const optionId = pickMap.get(attr.definition_id)
    if (!optionId) continue
    const opts = optionsByDef.get(attr.definition_id) ?? []
    const opt = opts.find((o) => o.id === optionId)
    if (!opt) continue
    chips.push({ definition_id: attr.definition_id, label: attr.label_en, value: opt.value_en })
  }
  return chips
}
```

  Note: the `ItemAttributeRow` import is dropped from this file (no longer used
  directly — `buildChips` now takes a plain `pickMap`).

### Task 1.5: Provide the batch in `CategoryRow`

- [ ] In `src/components/services/inventory/CategoryRow.tsx`:
  1. Import `ItemAttributesProvider`, `type ItemAttributesBatch` from
     `@/components/shared/ItemAttributesContext`.
  2. Change the batch query gate from `expanded && attrFilterActive` to `expanded`
     so the map loads whenever the category is open (needed for chips + filter):

```tsx
  const { data: itemAttrsByItem } = useItemAttributesByCategory(
    expanded ? node.id : null,
  )
```

  3. Memoize a stable provider value (empty map while loading so children never
     fall back):

```tsx
  const EMPTY_BY_ITEM = useMemo(() => new Map<string, Map<string, string>>(), [])
  const attrBatchValue = useMemo<ItemAttributesBatch>(
    () => ({ byItem: itemAttrsByItem ?? EMPTY_BY_ITEM }),
    [itemAttrsByItem, EMPTY_BY_ITEM],
  )
```

  4. Wrap the direct-items map in the provider:

```tsx
      {/* Items — wrapped so their chip strips read ONE batched query, not N.
          The Provider is transparent to the table DOM. */}
      {expanded && items.length > 0 && (
        <ItemAttributesProvider value={attrBatchValue}>
          {items.map((item, idx) => (
            <ItemRow
              key={item.id}
              item={item}
              categoryType={categoryType}
              showArchived={showArchived}
              canMoveUp={idx > 0}
              canMoveDown={idx < items.length - 1}
              onMoveUp={() => handleItemMove(idx, 'up')}
              onMoveDown={() => handleItemMove(idx, 'down')}
            />
          ))}
        </ItemAttributesProvider>
      )}
```

  (The child-`CategoryRow` map and the empty-state row stay as-is, outside this
  provider — each child category provides its own batch.)

### Task 1.6: Verify + commit

- [ ] `npx tsc --noEmit` → clean.
- [ ] Grep sanity: `AttributeChipStrip` no longer calls `useItemAttributes` without
      the `enabled` gate in the list path.
- [ ] Commit WS1 code (branch `perf/inventory-attribute-chip-n1`), dual trailer.
- [ ] PROGRESS.md completion + separate docs commit; append EOD.
- [ ] **Operator (morning):** expand a category with many items, confirm Network
      panel shows ONE `inventory_item_attributes` request for chips (not N), and
      chips look identical.

---

## WS2 — Delete dead inventory components

**Branch:** `chore/inventory-tree-cleanup` (shared with WS3)

**Files (delete):**
- `src/components/services/inventory/InventoryColumnPicker.tsx`
- `src/components/master-data/BrandVariantFormDialog.tsx`
- `src/components/master-data/InventoryItemFormDialog.tsx`

### Task 2.1: Confirm zero imports

- [ ] For each file, grep `src/` for a real import (component name in an `import`
      statement, or the file path). Doc/comment mentions don't count.
      Command (repeat per name): search `import ... InventoryColumnPicker`,
      `BrandVariantFormDialog`, `InventoryItemFormDialog`.
- [ ] If ANY has a live import, **skip that file** and record it in this plan +
      PROGRESS.md. (Known so far: only doc/comment references;
      `BrandCombobox.tsx:23` is a comment.)

### Task 2.2: Delete + verify

- [ ] Delete the confirmed-dead files.
- [ ] `npx tsc --noEmit` → clean (catches any missed import).

### Task 2.3: Commit

- [ ] (Deferred to end of WS3 — WS2+WS3 land as separate commits on the same
      branch, WS2 first.) Commit message:
      `chore(inventory): remove dead components (column picker + 2 form dialogs)`,
      body listing the three files + "superseded by live brand picker / ItemEditDialog".
- [ ] PROGRESS.md + EOD updates.

---

## WS3 — Inventory-tree low-priority nits (code-only)

**Branch:** `chore/inventory-tree-cleanup`

Each nit's exact edit is finalized against the live file at execution (files not
yet all read); the fix intent and target are fixed below. `grep` enumerates any
"which files" ambiguity before editing.

### Task 3.1: `staleTime: 0` → sane value (3a)

- [ ] Grep for `staleTime: 0` in `src/hooks/**` (esp. variant/warehouse-stock
      hooks). For each inventory read hook found, set `staleTime: 30_000` (align
      with sibling attribute hooks) unless a comment justifies live-refetch.
- [ ] `tsc --noEmit` clean.

### Task 3.2: `aria-label` on icon-only buttons (3b)

- [ ] In `CategoryRow.tsx`, `ItemRow.tsx`, and `BrandVariantRow` (find exact file),
      add `aria-label` to every icon-only `<Button>`/`<button>` (move up/down,
      edit, archive, add item, add subcategory, manage attributes, add brand).
      Keep existing `title` where it also serves as a hover tooltip.
- [ ] `tsc --noEmit` clean.

### Task 3.3: Extract shared `filterTree` (3c)

- [ ] Create `src/lib/inventory/filterTree.ts` exporting the tree-search helper
      (generic over `{ name_en, name_ar, children }`), lifted verbatim from
      `ItemsListView.tsx:27-40`.
- [ ] Replace the local `filterTree` in `ItemsListView.tsx` and the duplicate in
      `ToolsAssetsView.tsx` with an import from the new util.
- [ ] `tsc --noEmit` clean; both views behave identically.

### Task 3.4: `FifoLayersTable` skeleton widths (3d)

- [ ] Find `FifoLayersTable` (grep). Match the loading skeleton's cell count and
      per-column widths to the real data columns so there's no layout shift on load.
- [ ] `tsc --noEmit` clean.

### Task 3.5: Standardize sort-arrow placement (3e)

- [ ] Compare arrow placement in `CategoryRow` (actions on the right) vs
      `ToolCategoryRow` (left). Pick the `CategoryRow` convention (right-aligned
      actions cluster) and align `ToolCategoryRow` to it (or vice-versa if the
      Tools view's layout demands left). Keep it consistent; document the choice.
- [ ] `tsc --noEmit` clean.

### Task 3.6: `.limit()` gaps (3f)

- [ ] Grep inventory list hooks for `.select(` calls lacking a `.limit(`. For each
      genuine list read (not `.single()`/`.maybeSingle()`), add an explicit
      `.limit(N)` sized above the realistic row count. Enumerate the concrete list
      in this plan as they're found.
- [ ] `tsc --noEmit` clean.

### Task 3.7: Commit WS3

- [ ] One commit: `chore(inventory): tree polish — a11y labels, shared filterTree,
      skeleton widths, staleTime, sort-arrow consistency, query limits`, body
      enumerating 3a–3f and noting the deferred stale-FK/policy-name nit
      (DB migration, tracked in future-plans.md).
- [ ] PROGRESS.md + EOD updates.

---

## WS4 — Security P1 write-guards (spec + draft migrations, staged)

**No branch commit. No push. No `db push`.** All output is docs + draft files.

**Files (create, drafts only):**
- `docs/plans/2026-08-10-overnight-backlog/draft-migrations/*.sql`
- Per-table audit written into this section (below) once the audit agent returns.
- `docs/plans/2026-08-10-overnight-backlog/MORNING-CHECKLIST.md`

### Task 4.1: Per-table write-path audit

- [ ] Fold the audit agent's findings into a table here: for each of `payments`,
      `so_invoices`, `so_po_returns`, `sale_deliveries`, `credit_notes`,
      `debit_notes` (+ the 4 lower-confidence tables), record: direct client
      write sites (`file:line`), the exact privileged columns/statuses to block,
      the legit client writes that must pass, the DEFINER RPCs that write it, and
      current grants. **Guard only where a real direct-write vector + direct grant
      is confirmed.**

### Task 4.2: Author draft guard migrations

- [ ] For each confirmed table, write a draft `guard_<table>_<what>.sql` under
      `draft-migrations/`, following the `guard_po_locked_columns` /
      `guard_so_privileged_status` template EXACTLY: `SECURITY INVOKER`,
      `SET search_path TO 'public'`, `current_user IN ('authenticated','anon')`
      gate, `RAISE ... USING ERRCODE='42501'`, `DROP TRIGGER IF EXISTS` +
      `CREATE TRIGGER ... BEFORE INSERT/UPDATE`.
- [ ] Column names copied verbatim from the audit (validated against the live
      schema in the morning before push).

### Task 4.3: Morning checklist

- [ ] Write `MORNING-CHECKLIST.md`: per table — (1) confirm direct `authenticated`
      grants live; (2) confirm every writer RPC `prosecdef=true`; (3) copy draft →
      `supabase/migrations/<ts>_*.sql` + `supabase/migrations-staging/` mirror;
      (4) `db push`; (5) live-verify trigger enabled + `prosecdef=false` on the
      guard fn; (6) operator smoke the legit write flow; (7) commit with dual
      trailer + registry/PROGRESS updates.

### Task 4.4: Record WS4 as staged

- [ ] PROGRESS.md: note WS4 drafted + staged (not shipped); link this folder.
      EOD: one line. No code commit for WS4.

---

## Self-Review (against spec.md)

**Spec coverage:** WS1 §2 → Tasks 1.1–1.6. WS2 §3 → 2.1–2.3. WS3 §4 (3a–3f, minus
deferred FK/policy-name) → 3.1–3.7. WS4 §5 → 4.1–4.4. ✅ every in-scope item mapped.

**Placeholder scan:** WS1/WS2 carry full code. WS3 tasks state exact target files +
fix intent; exact per-line edits are resolved against the live file at execution
(files not all pre-read) — intentional, not a "TODO". WS4 draft SQL is authored
from the audit + template, not left blank.

**Type consistency:** `ItemAttributesBatch = { byItem: Map<string, Map<string,string>> }`
used identically in the context, `AttributeChipStrip`, and `CategoryRow`.
`useItemAttributes(itemId, { enabled })` signature matches its one gated caller.
`ItemAttributesProvider` = the context Provider, imported by `CategoryRow`.
