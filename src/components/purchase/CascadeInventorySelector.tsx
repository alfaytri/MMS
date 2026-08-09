'use client'

import { useState, useEffect, useMemo } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { ItemPhoto } from '@/components/shared/ItemPhoto'
import { variantPickerLabel } from '@/lib/inventory/variantPickerLabel'
import { variantsToBrandGroups, type PickerBrandGroup } from '@/lib/inventory/variantBrandGroups'
import {
  useInventoryItemsByCategory,
  useInventoryBrandVariants,
  type InventoryCategory,
  type InventoryItem,
  type BrandVariantWithJoins,
} from '@/hooks/useInventory'
import { useInventoryTree, type InventoryTreeNode } from '@/hooks/useInventoryTree'
import { useBrandVariantAncestry } from '@/hooks/useBrandVariantAncestry'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { useCascadeAccessibleItems } from '@/hooks/useCascadeAccessibleItems'
import { useVariantStockByDivision, type VariantDivisionPool } from '@/hooks/useVariantStockByDivision'
import type { InventoryLookupResult } from '@/hooks/usePurchaseOrders'
import type { LineType } from './PoLineItemsEditor'
import {
  CascadeNewCategoryForm,
  CascadeNewItemForm,
  CascadeNewVariantForm,
} from './CascadeInlineForms'

interface CascadeInventorySelectorProps {
  lineType: LineType
  value: InventoryLookupResult | null
  onChange: (item: InventoryLookupResult | null) => void
  onPriceLoading?: (loading: boolean) => void
  /**
   * Phase D.12 Task 3 — opt into the division-aware filter. When true AND
   * an active division is set, categories/items collapse to only those the
   * active division can legitimately consume (owns stock, or was shared to
   * AND has stock somewhere in the caller's RLS scope). Sales-side callers
   * (SO create, replacement delivery) set this. Purchase-side callers (PO
   * create, receival) leave it false because they're adding stock, not
   * consuming it.
   */
  filterByActiveDivision?: boolean
  /**
   * Opt into the Brand → Origin cascade (two side-by-side selects) instead of
   * the combined Brand/Variant list. Set by the buying pickers (PO create,
   * receivals). Independent of `filterByActiveDivision` — that is the division
   * stock filter, and several sales callers set it too, so it can't be used to
   * tell buying from selling.
   */
  brandOriginCascade?: boolean
}

async function fetchLastFifoCost(variantId: string): Promise<number> {
  const supabase = createClient()
  const { data } = await supabase
    .from('fifo_cost_layers')
    .select('total_unit_cost')
    .eq('brand_variant_id', variantId)
    .order('date',       { ascending: false })
    .order('created_at', { ascending: false })
    .order('id',         { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.total_unit_cost ?? 0
}

const triggerCls =
  'h-8 w-full inline-flex items-center justify-between rounded-md border border-input bg-background px-3 text-xs font-normal shadow-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'

// ─── Single-level category select (one column, searchable) ───────────────────

interface CategoryLevelSelectProps {
  placeholder: string
  options: InventoryTreeNode[]
  selected: InventoryTreeNode | null
  disabled: boolean
  loading: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (node: InventoryTreeNode) => void
  // Inline "Add new" form integration
  lineType: LineType
  parentId: string | null
  isCreating: boolean
  onStartCreate: () => void
  onCancelCreate: () => void
  onCreated: (cat: InventoryCategory) => void
  emptyHint?: string
}

function CategoryLevelSelect({
  placeholder,
  options,
  selected,
  disabled,
  loading,
  open,
  onOpenChange,
  onSelect,
  lineType,
  parentId,
  isCreating,
  onStartCreate,
  onCancelCreate,
  onCreated,
  emptyHint,
}: CategoryLevelSelectProps) {
  return (
    <Popover open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) onCancelCreate() }}>
      <PopoverTrigger
        className={cn(triggerCls, disabled && 'pointer-events-none opacity-50')}
        render={(props) => <button type="button" disabled={disabled} {...props} />}
      >
        <span className="truncate">
          {loading ? 'Loading…' : (selected?.name_en ?? placeholder)}
        </span>
        <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        {isCreating ? (
          <CascadeNewCategoryForm
            lineType={lineType}
            parentId={parentId}
            onCreated={onCreated}
            onCancel={onCancelCreate}
          />
        ) : (
          <>
            <Command>
              <CommandInput placeholder="Search…" className="h-8 text-xs" />
              <CommandEmpty className="py-2 text-xs text-center text-muted-foreground">
                {loading ? 'Loading…' : (emptyHint ?? 'No categories found.')}
              </CommandEmpty>
              <CommandGroup className="max-h-60 overflow-y-auto">
                {loading ? (
                  <div className="px-2 py-1.5 space-y-1">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="h-6 rounded bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : (
                  options.map((node) => (
                    <CommandItem
                      key={node.id}
                      value={`${node.name_en} ${node.name_ar ?? ''}`}
                      onSelect={() => onSelect(node)}
                      className="text-xs"
                    >
                      <Check className={cn('mr-2 h-3 w-3 shrink-0', selected?.id === node.id ? 'opacity-100' : 'opacity-0')} />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{node.name_en}</div>
                        {node.name_ar && <div className="text-muted-foreground truncate">{node.name_ar}</div>}
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
                onClick={onStartCreate}
              >
                + Add new category
              </button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function CascadeInventorySelector({
  lineType,
  value,
  onChange,
  onPriceLoading,
  filterByActiveDivision = false,
  brandOriginCascade = false,
}: CascadeInventorySelectorProps) {
  // Three category levels — the deepest non-null wins as the effective category.
  const [selectedL1, setSelectedL1] = useState<InventoryTreeNode | null>(null)
  const [selectedL2, setSelectedL2] = useState<InventoryTreeNode | null>(null)
  const [selectedL3, setSelectedL3] = useState<InventoryTreeNode | null>(null)
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)

  const selectedCategory: InventoryTreeNode | null = selectedL3 ?? selectedL2 ?? selectedL1

  const [l1Open, setL1Open] = useState(false)
  const [l2Open, setL2Open] = useState(false)
  const [l3Open, setL3Open] = useState(false)
  const [itemOpen, setItemOpen] = useState(false)
  const [varOpen,  setVarOpen]  = useState(false)
  const [isPriceLoading, setIsPriceLoading] = useState(false)

  const [selectedVariantCode,  setSelectedVariantCode]  = useState<string | null>(null)
  const [selectedVariantBrand, setSelectedVariantBrand] = useState<string | null>(null)
  const [selectedVariantStock, setSelectedVariantStock] = useState<number | null>(null)
  const [selectedVariantOrigin, setSelectedVariantOrigin] = useState<string | null>(null)

  const [brandOpen, setBrandOpen] = useState(false)
  const [originOpen, setOriginOpen] = useState(false)
  const [selectedBrandKey, setSelectedBrandKey] = useState<string | null>(null)

  const [l1Creating, setL1Creating] = useState(false)
  const [l2Creating, setL2Creating] = useState(false)
  const [l3Creating, setL3Creating] = useState(false)
  const [isItemCreating, setIsItemCreating] = useState(false)
  const [isVarCreating,  setIsVarCreating]  = useState(false)

  const { tree: rawTree, flat: flatCategories, isLoading: catsLoading } = useInventoryTree(lineType)
  const { data: rawItems = [], isLoading: itemsLoading } =
    useInventoryItemsByCategory(selectedCategory?.id ?? null)
  const { data: variantRows = [], isLoading: varsLoading } =
    useInventoryBrandVariants(selectedItem?.id ?? null)
  const variants = variantRows as BrandVariantWithJoins[]

  const brandGroups = useMemo(() => variantsToBrandGroups(variants), [variants])
  // Single-brand item -> that brand is the active group (nothing to pick);
  // multi-brand -> the group the operator picked.
  const activeBrandGroup = useMemo(
    () => (brandGroups.length === 1 ? brandGroups[0] : brandGroups.find((g) => g.brandKey === selectedBrandKey) ?? null),
    [brandGroups, selectedBrandKey],
  )
  // Origin select appears only when the active brand has >1 origin to choose
  // among — mirrors Subcategory/Type appearing only when the parent has children.
  const showOrigin = brandOriginCascade && !!activeBrandGroup && activeBrandGroup.origins.length > 1

  // Phase D.12 Task 4 — per-variant per-division stock breakdown so each
  // variant row can expand into one row per division holding stock, with
  // a "Shared from <div>" chip on rows whose division !== active.
  const { data: variantPools } = useVariantStockByDivision(
    filterByActiveDivision && !brandOriginCascade ? selectedItem?.id ?? null : null,
  )

  // Phase D.12 Task 3 — division-aware filter (opt-in via `filterByActiveDivision`).
  // When active, the tree collapses to only branches containing accessible items.
  const { activeDivisionId } = useActiveDivision()
  const accessibility = useCascadeAccessibleItems(
    lineType,
    activeDivisionId,
    filterByActiveDivision,
  )

  const visibleCategoryIds = useMemo<Set<string> | null>(() => {
    if (!accessibility.accessibleItemIds) return null
    const parentMap = new Map<string, string | null>()
    for (const c of flatCategories) parentMap.set(c.id, c.parent_id ?? null)
    const keep = new Set<string>()
    for (const itemId of accessibility.accessibleItemIds) {
      const categoryId = accessibility.itemCategoryMap.get(itemId)
      if (!categoryId) continue
      let cursor: string | null = categoryId
      while (cursor && !keep.has(cursor)) {
        keep.add(cursor)
        cursor = parentMap.get(cursor) ?? null
      }
    }
    return keep
  }, [accessibility.accessibleItemIds, accessibility.itemCategoryMap, flatCategories])

  const tree = useMemo(() => {
    if (!visibleCategoryIds) return rawTree
    const prune = (nodes: InventoryTreeNode[]): InventoryTreeNode[] =>
      nodes
        .filter((n) => visibleCategoryIds.has(n.id))
        .map((n) => ({ ...n, children: prune(n.children) }))
    return prune(rawTree)
  }, [rawTree, visibleCategoryIds])

  const items = useMemo(() => {
    if (!accessibility.accessibleItemIds) return rawItems
    return rawItems.filter((it) => accessibility.accessibleItemIds!.has(it.id))
  }, [rawItems, accessibility.accessibleItemIds])

  const { data: ancestry, isLoading: ancestryLoading } = useBrandVariantAncestry(
    value && !selectedCategory ? value.brand_variant_id : null
  )

  // Look children up in the pruned tree so the filter propagates down levels.
  // Falling back to the captured node's children keeps parity with the
  // previous behaviour when no filter is active.
  const l1InTree = useMemo(
    () => (selectedL1 ? tree.find((n) => n.id === selectedL1.id) : null),
    [tree, selectedL1],
  )
  const l2InTree = useMemo(
    () => (selectedL2 && l1InTree ? l1InTree.children.find((n) => n.id === selectedL2.id) : null),
    [l1InTree, selectedL2],
  )
  const l2Options = l1InTree?.children ?? selectedL1?.children ?? []
  const l3Options = l2InTree?.children ?? selectedL2?.children ?? []

  // Purchase path: an item with exactly one variant resolves immediately (the
  // "only one option -> don't make them pick it" rule). Guarded by `value` so it
  // fires once and never loops (resolving sets value -> the breadcrumb renders).
  useEffect(() => {
    if (!brandOriginCascade || value || varsLoading) return
    if (!selectedItem || !selectedCategory) return
    if (variants.length === 1) void handleVariantSelect(variants[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants, value, varsLoading, selectedItem, selectedCategory, brandOriginCascade])

  // ── Selection handlers ──────────────────────────────────────────────────────
  function handleL1Select(node: InventoryTreeNode) {
    setSelectedL1(node)
    setSelectedL2(null)
    setSelectedL3(null)
    setSelectedItem(null)
    onChange(null)
    setL1Open(false)
    // Auto-open L2 if there are children
    if (node.children.length > 0) setTimeout(() => setL2Open(true), 0)
  }

  function handleL2Select(node: InventoryTreeNode) {
    setSelectedL2(node)
    setSelectedL3(null)
    setSelectedItem(null)
    onChange(null)
    setL2Open(false)
    if (node.children.length > 0) setTimeout(() => setL3Open(true), 0)
  }

  function handleL3Select(node: InventoryTreeNode) {
    setSelectedL3(node)
    setSelectedItem(null)
    onChange(null)
    setL3Open(false)
  }

  async function handleVariantSelect(variant: BrandVariantWithJoins) {
    if (!selectedItem || !selectedCategory) return
    setVarOpen(false)

    setSelectedVariantCode(variant.code ?? null)
    setSelectedVariantBrand(variant.brand)
    setSelectedVariantStock(
      Math.max(0, (variant.stock_level ?? 0) - (variant.reserved_qty ?? 0))
    )
    setSelectedVariantOrigin(variant.country_codes?.name ?? null)

    const rawCost = variant.cost_price ?? 0
    if (rawCost > 0) {
      onChange({
        brand_variant_id: variant.id,
        item_name:        selectedItem.name_en,
        item_name_ar:     selectedItem.name_ar ?? null,
        sku:              variant.code ?? '',
        unit:             selectedItem.unit,
        cost_price:       rawCost,
        selling_price:    variant.selling_price ?? 0,
        category_name:    selectedCategory.name_en,
        category_name_ar: selectedCategory.name_ar ?? null,
        brand:            variant.brand,
      })
      return
    }

    setIsPriceLoading(true)
    onPriceLoading?.(true)
    try {
      const effectiveCost = await fetchLastFifoCost(variant.id)
      onChange({
        brand_variant_id: variant.id,
        item_name:        selectedItem.name_en,
        item_name_ar:     selectedItem.name_ar ?? null,
        sku:              variant.code ?? '',
        unit:             selectedItem.unit,
        cost_price:       effectiveCost,
        selling_price:    variant.selling_price ?? 0,
        category_name:    selectedCategory.name_en,
        category_name_ar: selectedCategory.name_ar ?? null,
        brand:            variant.brand,
      })
    } finally {
      setIsPriceLoading(false)
      onPriceLoading?.(false)
    }
  }

  function handleBrandSelect(group: PickerBrandGroup<BrandVariantWithJoins>) {
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

  function handleClear() {
    onChange(null)
    setSelectedL1(null)
    setSelectedL2(null)
    setSelectedL3(null)
    setSelectedItem(null)
    setSelectedVariantCode(null)
    setSelectedVariantBrand(null)
    setSelectedVariantStock(null)
    setSelectedVariantOrigin(null)
    setSelectedBrandKey(null)
    setBrandOpen(false)
    setOriginOpen(false)
  }

  // After creating a new category at a given level, slot it into that level.
  function handleL1Created(cat: InventoryCategory) {
    setL1Creating(false)
    setL1Open(false)
    handleL1Select({ ...cat, children: [] })
  }
  function handleL2Created(cat: InventoryCategory) {
    setL2Creating(false)
    setL2Open(false)
    handleL2Select({ ...cat, children: [] })
  }
  function handleL3Created(cat: InventoryCategory) {
    setL3Creating(false)
    setL3Open(false)
    handleL3Select({ ...cat, children: [] })
  }

  function handleItemCreated(item: InventoryItem) {
    setSelectedItem(item)
    setIsItemCreating(false)
    setItemOpen(false)
    setVarOpen(true)
    setSelectedBrandKey(null)
    setBrandOpen(false)
    setOriginOpen(false)
  }

  function handleVariantCreated(variant: BrandVariantWithJoins) {
    handleVariantSelect(variant)
    setIsVarCreating(false)
  }

  // ── BREADCRUMB (compact, single-line, sits above the vendor name input) ────
  if (value) {
    const ancestryCatId = ancestry?.inventory_items?.inventory_categories?.id ?? null
    const categoryLabel =
      selectedCategory
        ? selectedCategory.name_en
        : ancestryCatId
          ? (ancestry?.inventory_items?.inventory_categories?.name_en ||
              value.category_name ||
              null)
          : value.category_name ?? null
    const inventoryName = selectedItem?.name_en ?? ancestry?.inventory_items?.name_en ?? null
    const brand = selectedVariantBrand ?? ancestry?.brand ?? null
    const code  = selectedVariantCode  ?? ancestry?.code  ?? null
    const origin = selectedVariantOrigin ?? ancestry?.country_codes?.name ?? null
    const ancestryStock =
      ancestry != null
        ? Math.max(0, (ancestry.stock_level ?? 0) - (ancestry.reserved_qty ?? 0))
        : null
    const stockToShow = selectedVariantStock ?? ancestryStock

    const breadcrumbParts: string[] = []
    if (categoryLabel) breadcrumbParts.push(categoryLabel)
    if (inventoryName) breadcrumbParts.push(inventoryName)
    if (code) breadcrumbParts.push(code)
    if (brand) breadcrumbParts.push(brand)
    if (origin) breadcrumbParts.push(origin)
    const breadcrumbText = breadcrumbParts.join(' - ')

    return (
      <div className="flex items-center gap-2 min-h-[20px] px-1 text-xs">
        {isPriceLoading ? (
          <span className="flex-1 text-muted-foreground animate-pulse">Fetching price…</span>
        ) : ancestryLoading && !categoryLabel ? (
          <span className="flex-1 h-3 rounded bg-muted animate-pulse" />
        ) : (
          <span className="flex-1 min-w-0 truncate text-muted-foreground">
            {breadcrumbText || value.item_name}
            {breadcrumbText && value.item_name?.trim() && (
              <span className="text-foreground font-medium">{` (${value.item_name.trim()})`}</span>
            )}
          </span>
        )}
        {stockToShow != null && (
          <span
            className={cn(
              'shrink-0 font-medium',
              stockToShow > 0 ? 'text-success' : 'text-muted-foreground'
            )}
          >
            {stockToShow > 0 ? `${stockToShow} in stock` : 'Out of stock'}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-4 w-4 shrink-0"
          onClick={handleClear}
          disabled={isPriceLoading}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    )
  }

  // ── CASCADE ────────────────────────────────────────────────────────────────
  // Row 1: cascading category selects. Subcategory and Type slots only appear
  // when the previous level actually has children — so picking a leaf category
  // like "Water Heater" with no subtree gives you a single full-width select
  // instead of two empty greyed-out boxes.
  // Row 2: item + variant.
  const showL2 = (selectedL1?.children.length ?? 0) > 0
  const showL3 = showL2 && (selectedL2?.children.length ?? 0) > 0

  return (
    <div className="space-y-2">
      {/* Row 1 — Category cascade (flex so visible columns share the width) */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 min-w-0">
          <CategoryLevelSelect
            placeholder="Category…"
            options={tree}
            selected={selectedL1}
            disabled={false}
            loading={catsLoading}
            open={l1Open}
            onOpenChange={setL1Open}
            onSelect={handleL1Select}
            lineType={lineType}
            parentId={null}
            isCreating={l1Creating}
            onStartCreate={() => setL1Creating(true)}
            onCancelCreate={() => setL1Creating(false)}
            onCreated={handleL1Created}
          />
        </div>
        {showL2 && (
          <div className="flex-1 min-w-0">
            <CategoryLevelSelect
              placeholder="Subcategory…"
              options={l2Options}
              selected={selectedL2}
              disabled={false}
              loading={false}
              open={l2Open}
              onOpenChange={setL2Open}
              onSelect={handleL2Select}
              lineType={lineType}
              parentId={selectedL1?.id ?? null}
              isCreating={l2Creating}
              onStartCreate={() => setL2Creating(true)}
              onCancelCreate={() => setL2Creating(false)}
              onCreated={handleL2Created}
              emptyHint="No subcategories."
            />
          </div>
        )}
        {showL3 && (
          <div className="flex-1 min-w-0">
            <CategoryLevelSelect
              placeholder="Type…"
              options={l3Options}
              selected={selectedL3}
              disabled={false}
              loading={false}
              open={l3Open}
              onOpenChange={setL3Open}
              onSelect={handleL3Select}
              lineType={lineType}
              parentId={selectedL2?.id ?? null}
              isCreating={l3Creating}
              onStartCreate={() => setL3Creating(true)}
              onCancelCreate={() => setL3Creating(false)}
              onCreated={handleL3Created}
              emptyHint="No types."
            />
          </div>
        )}
      </div>

      {/* Row 2 — Item + Brand/Origin. Buying pickers (brandOriginCascade) use a
          Brand->Origin cascade mirroring Row 1; everyone else keeps the combined list. */}
      <div className={cn('gap-2', brandOriginCascade ? 'flex flex-col sm:flex-row' : 'grid grid-cols-1 sm:grid-cols-2')}>
        <div className={brandOriginCascade ? 'flex-1 min-w-0' : undefined}>
          {/* Item */}
          <Popover open={itemOpen} onOpenChange={(open) => { setItemOpen(open); if (!open) setIsItemCreating(false) }}>
            <PopoverTrigger
              className={cn(triggerCls, !selectedCategory && 'pointer-events-none opacity-50')}
              render={(props) => <button type="button" disabled={!selectedCategory} {...props} />}
            >
              <span className="truncate">
                {itemsLoading ? 'Loading…' : (selectedItem?.name_en ?? 'Item…')}
              </span>
              <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              {isItemCreating ? (
                <CascadeNewItemForm
                  categoryId={selectedCategory!.id}
                  onCreated={handleItemCreated}
                  onCancel={() => setIsItemCreating(false)}
                />
              ) : (
                <>
                  <Command>
                    <CommandInput placeholder="Search item…" className="h-8 text-xs" />
                    <CommandEmpty className="py-2 text-xs text-center text-muted-foreground">
                      {itemsLoading ? 'Loading…' : 'No items found.'}
                    </CommandEmpty>
                    <CommandGroup className="max-h-60 overflow-y-auto">
                      {itemsLoading ? (
                        <div className="px-2 py-1.5 space-y-1">
                          {[1, 2, 3].map((n) => (
                            <div key={n} className="h-6 rounded bg-muted animate-pulse" />
                          ))}
                        </div>
                      ) : (
                        items.map((item) => {
                          // Share-only when the filter is active and the item
                          // is accessible but not owned by the active division.
                          const isShareOnly =
                            filterByActiveDivision &&
                            !!activeDivisionId &&
                            accessibility.accessibleItemIds?.has(item.id) === true &&
                            !accessibility.ownedItemIds.has(item.id)
                          return (
                            <CommandItem
                              key={item.id}
                              value={item.name_en}
                              onSelect={() => {
                                setSelectedItem(item)
                                onChange(null)
                                setItemOpen(false)
                                setSelectedBrandKey(null)
                                setBrandOpen(false)
                                setOriginOpen(false)
                              }}
                              className="text-xs items-start py-2"
                            >
                              <Check className={cn('mr-2 mt-1 h-3 w-3 shrink-0', selectedItem?.id === item.id ? 'opacity-100' : 'opacity-0')} />
                              <ItemPhoto
                                url={(item as unknown as { image_url?: string | null }).image_url ?? null}
                                name={item.name_en}
                                size={32}
                                className="mr-2 mt-0.5 shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-start gap-1.5">
                                  <span className="whitespace-normal break-words leading-snug">{item.name_en}</span>
                                  {isShareOnly && (
                                    <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 px-1.5 py-0 text-[9px] font-medium whitespace-nowrap">
                                      Shared
                                    </span>
                                  )}
                                </div>
                                {item.name_ar && <div className="text-muted-foreground whitespace-normal break-words leading-snug mt-0.5">{item.name_ar}</div>}
                              </div>
                            </CommandItem>
                          )
                        })
                      )}
                    </CommandGroup>
                  </Command>
                  <div className="border-t px-2 py-1.5">
                    <button
                      type="button"
                      className="w-full text-left text-xs text-muted-foreground hover:text-foreground py-1 px-2 rounded hover:bg-accent"
                      onClick={() => setIsItemCreating(true)}
                    >
                      + Add new item
                    </button>
                  </div>
                </>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {!brandOriginCascade ? (
          <div>
            {/* Brand / Variant — combined pooled list (sales path, Phase 2 territory) */}
            <Popover open={varOpen} onOpenChange={(open) => { setVarOpen(open); if (!open) setIsVarCreating(false) }}>
              <PopoverTrigger
                className={cn(triggerCls, !selectedItem && 'pointer-events-none opacity-50')}
                render={(props) => <button type="button" disabled={!selectedItem} {...props} />}
              >
                <span className="truncate">
                  {varsLoading ? 'Loading…' : 'Brand / Variant…'}
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
                        {varsLoading ? 'Loading…' : 'No variants found.'}
                      </CommandEmpty>
                      <CommandGroup className="max-h-60 overflow-y-auto">
                        {varsLoading ? (
                          <div className="px-2 py-1.5 space-y-1">
                            {[1, 2, 3].map((n) => (
                              <div key={n} className="h-6 rounded bg-muted animate-pulse" />
                            ))}
                          </div>
                        ) : (
                          variants.flatMap((v) => {
                            const pools = variantPools?.get(v.id) ?? []
                            const label = variantPickerLabel({
                              brand_name: v.brands?.name ?? null,
                              brand: v.brand,
                              country_name: v.country_codes?.name ?? null,
                            })
                            // Fall back to a single row when the pool breakdown
                            // isn't available (filter off, still loading, or the
                            // variant has zero stock anywhere).
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
                          })
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
    </div>
  )
}
