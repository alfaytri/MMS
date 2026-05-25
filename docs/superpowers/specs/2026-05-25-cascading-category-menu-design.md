# Cascading Category Menu — Design Spec

**Date:** 2026-05-25
**Scope:** Replace the flat category dropdown in `CascadeInventorySelector` (step 1) with a recursive nested flyout menu. Affects Purchase Order and Sales Order line item pickers.

## Problem

The current category picker shows a flat list of leaf-node breadcrumbs (e.g. "AC > Stand > Copeland"). With many categories this becomes a long, hard-to-scan list. Users want a hierarchical hover menu: see top-level categories first, hover to reveal children, keep hovering until they reach a leaf, then click to select.

## Design

### New Component: `CascadeCategoryMenu`

**File:** `src/components/purchase/CascadeCategoryMenu.tsx`

A recursive flyout menu rendered inside the existing `PopoverContent` of step 1 in `CascadeInventorySelector`.

#### Props

```ts
interface CascadeCategoryMenuProps {
  tree: InventoryTreeNode[]          // from useInventoryTree().tree
  flat: InventoryCategory[]          // from useInventoryTree().flat
  selectedId: string | null          // currently selected category ID
  breadcrumb: (id: string) => string // from useInventoryTree().breadcrumb
  onSelect: (cat: InventoryCategory) => void
  onCreateNew: () => void            // opens inline category form
}
```

#### Interaction Model — Split Click Zones

Each menu item has two interaction zones:

- **Label zone** (left side, fills available width): Clicking selects the category at that level — even if it's a parent with children. This allows users to assign to a broad category like "AC" when they don't need to drill deeper.
- **Chevron zone** (right side, visible only on parents): Hovering opens the child flyout. Clicking the chevron also opens the flyout (for touch devices that can't hover).

Leaf nodes (no children) have no chevron — the entire row is one click zone that selects.

#### Behavior — Desktop (pointer: fine)

Detected via `@media (pointer: fine)` — targets devices with a mouse/trackpad, regardless of screen size.

- Root panel renders level-1 categories (those with `parent_id === null`).
- Each item with children shows a `ChevronRight` icon on the right side. In RTL contexts (`dir="rtl"`), the icon is `ChevronLeft` and the flyout opens to the left.
- **Hover** the chevron zone of a parent item → a flyout panel appears to the side, showing its children.
- Flyout panels are recursive — any child with its own children shows a chevron and spawns another flyout on hover.
- **Click** the label zone → calls `onSelect(category)`, closes the popover (works for both parents and leaves).
- A hover delay of ~150ms prevents accidental flyout flicker when the mouse passes through items.
- Only one flyout per level is open at a time (hovering a different sibling closes the previous flyout).

#### Behavior — Touch (pointer: coarse)

Detected via `@media (pointer: coarse)` — targets touch devices (phones, tablets, iPads in landscape) regardless of screen width.

- Instead of hover flyouts, the menu uses **drill-down navigation**.
- Tapping the chevron zone replaces the current list with the parent's children.
- Tapping the label zone selects the category (same as desktop).
- A back arrow + parent name header appears at the top to navigate up one level.
- Tapping a leaf selects it.

#### Search

- A search input at the top of the root panel filters across all categories.
- When search text is non-empty, the flyout tree is replaced with a flat filtered list showing **both parent and leaf categories** that match the search text, each with its breadcrumb.
- Clicking a **leaf** in search results → selects it directly (calls `onSelect`).
- Clicking a **parent** in search results → clears the search and navigates the tree to that parent's branch (on desktop: opens the flyout chain to that parent; on touch: drills down to that parent's children).
- Clearing search restores the tree view.

#### Flyout Positioning

Flyout panels are positioned using **Floating UI** (`@floating-ui/react`) for collision detection and automatic axis flipping. This handles:

- Viewport overflow → flyout flips to the opposite side automatically.
- Scroll containers → flyout repositions on scroll.
- Dynamic content height → flyout adjusts without clipping.

Radix UI's Popover (already in the project via shadcn/ui) uses Floating UI internally, so the dependency is already available.

#### RTL Support

When the document or component has `dir="rtl"`:

- Chevron icon switches from `ChevronRight` to `ChevronLeft`.
- Flyout panels open to the **left** instead of the right.
- Floating UI's `placement` changes from `right-start` to `left-start`.
- Arabic name renders as the primary label; English name renders below in `text-muted-foreground` (reversed from LTR).

#### Visual Details

- Item height: `h-8`, text: `text-xs` (matches current Command items).
- Arabic name shown below English name in `text-muted-foreground`.
- Selected category (matching `selectedId`) shows a `Check` icon.
- Flyout panels: `w-48`, background matches theme (bg-popover), shadow-md border, positioned via Floating UI.
- Chevron zone: `w-8` clickable area on the trailing edge of each parent item.
- `+ Add new category` button at the bottom of the root panel (same as today).

### Changes to `CascadeInventorySelector`

Minimal — only the step 1 `PopoverContent` changes:

**Before:** `<Command>` with flat list of leaf categories + breadcrumbs.
**After:** `<CascadeCategoryMenu>` with tree prop from `useInventoryTree().tree`.

Steps 2 (Item) and 3 (Brand/Variant) remain unchanged. The `onSelect` callback sets `selectedCategory` identically to today.

### Changes to Sales Order

The `SoLineItemsEditor` uses the same `CascadeInventorySelector` component, so it gets the cascading menu automatically. No separate changes needed.

## Data

**No database changes.** The `inventory_categories` table already has `parent_id` for unlimited nesting. The `useInventoryTree` hook already builds the recursive tree and provides `breadcrumb()`.

**No new hooks or API routes.**

## Files Changed

| File | Change |
|---|---|
| `src/components/purchase/CascadeCategoryMenu.tsx` | **New** — recursive flyout menu component |
| `src/components/purchase/CascadeInventorySelector.tsx` | Replace step 1 Command list with CascadeCategoryMenu |

## Edge Cases

- **Empty category (no children, no items):** Still selectable as a leaf. The item picker (step 2) will show "No items found."
- **Single-level categories:** Root nodes with no children are leaves — clickable directly, no flyout.
- **Very deep nesting (5+ levels):** Floating UI handles positioning and flipping automatically.
- **Categories added while menu is open:** Tree updates on next `useInventoryTree` refetch (5 min staleTime). Acceptable since category creation is rare.
- **Large touch screens (iPad landscape):** `pointer: coarse` media query triggers drill-down mode regardless of screen width, avoiding broken hover interactions.
- **Parent selection:** Users can select any level of the hierarchy by clicking the label zone. This supports both broad assignments ("AC") and specific ones ("AC > Stand > Copeland").
