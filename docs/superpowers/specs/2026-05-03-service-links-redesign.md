# Service Links Redesign — Search-First Master-Detail

**Date:** 2026-05-03  
**Branch:** feature/service-module  
**Replaces:** Miller-columns layout in the Service Links subtab (`/master-data/services?subtab=service-links`)

---

## 1. Problem Statement

The current Service Links subtab uses a Miller-columns layout (Category → Subcategory → Item → Brand). With 833 services and deeply nested names, every column truncates text aggressively. Users cannot read full service names, and finding a specific service requires multiple clicks through three columns. With 755 services unlinked, users need to go on "linking sprees" — the current UI does not support that workflow efficiently.

---

## 2. Goals

- Zero text truncation in the service list
- Find any service in under 3 seconds via search
- Link inventory items to one or many services without multi-step navigation
- Support bulk-linking for resolving large numbers of unlinked services

---

## 3. Layout

The subtab is split into two panels side by side:

| Panel | Width | Purpose |
|---|---|---|
| Master List | 40% | Browse and select services |
| Action Canvas | 60% | View and edit links for selected service(s) |

Both panels are full-height within the subtab container. No horizontal scroll at any viewport width.

---

## 4. Master List (Left Panel)

### 4.1 Search Bar

- Sticky at the top of the panel
- Placeholder: `Search 833 services…` (count updates with filters)
- Keyboard shortcut `CMD/CTRL + F` focuses the input from anywhere on the page
- Instant local filtering — no debounce needed (all data is already loaded)
- **When search is active:** list flattens to a single scrollable list of matching services. Category grouping headers are hidden; the breadcrumb on each row provides structural context.
- **When search is cleared:** list returns to grouped-by-category view with category headers

### 4.2 Stat Bar

Below the search bar, a single line showing:

```
833 services · 78 linked · 755 no supply
```

Numbers update dynamically as the search/filter changes.

### 4.3 Service Rows

Each row in the list contains:

```
☐  [status dot]  Water System > Water Filter [Cartridge Change]     ← breadcrumb (grey, small)
                 Kitchen Water Filter 3 Stage                        ← service name (bold, full width)
```

- **Breadcrumb:** `Category > Subcategory` in `text-xs text-muted-foreground`, truncated only if the path is extremely long (never the service name itself)
- **Service name:** full text, no truncation, wraps to a second line if needed
- **Status dot:** 8px circle, far right — green = at least one item linked, amber = no supply
- **Checkbox:** appears on hover; stays visible when checked; allows multi-select

### 4.4 Row Visual States

| State | Treatment |
|---|---|
| Default | White background |
| Hover | Subtle grey tint (`bg-muted/40`) |
| Checked (not active) | Light blue tint (`bg-blue-50`) + filled checkbox |
| Active (data in right panel) | Stronger tint (`bg-blue-100`) + 3px left accent bar in primary color |
| Checked + Active | Both left accent bar and blue tint |

Hover and active states are visually distinct so the user never confuses "I'm hovering" with "this is selected."

### 4.5 Keyboard Navigation

| Key | Action |
|---|---|
| `↑ / ↓` | Move active row up/down |
| `Enter` | Load active row in right panel |
| `Space` | Toggle checkbox on active row |
| `CMD/CTRL + F` | Focus search bar |
| `Escape` | Clear search (if focused on search bar) |

### 4.6 Grouped View (no search)

When no search is active, rows are grouped under collapsible category headers:

```
▼ Water System (14 services · 3 linked)
    Kitchen Water Filter 3 Stage  ●
    Central Water Filter [3 Stage]  ○
    ...
▶ Cleaning (52 services · 10 linked)
```

Category headers show service count and linked count. Clicking a header collapses/expands that category. All categories start expanded.

---

## 5. Action Canvas (Right Panel)

### 5.1 Zero State (nothing selected on load)

When the page first loads and no service has been clicked, the right panel shows:

- Heading: `Service Links Overview`
- A horizontal bar chart — one bar per top-level category — showing linked vs. unlinked counts side by side (green / amber)
- Below the chart: `Select a service on the left to view or edit its linked items.`

This zero state is replaced as soon as any row is clicked.

### 5.2 Single-Select Mode

When exactly one service row is active (clicked, not just checked):

**Header:**
```
Kitchen Water Filter 3 Stage
Water System > Water Filter [Cartridge Change]
```

**Linked Items section:**  
A list of currently linked inventory items, each showing:
- Item name
- Brand
- `Remove` button (icon only, with tooltip)

If no items are linked: `No items linked yet. Add one below.`

**Add Item control:**  
A combobox/search input to find and add an inventory item. Selecting an item links it immediately (single optimistic update, no confirmation needed for single-select).

### 5.3 Bulk-Select Mode

Activated when 2 or more checkboxes are checked. The right panel switches to the bulk-link interface.

**Header:**
```
12 services selected   [Clear selection]
```

**Add Inventory Item control (always visible):**  
Same combobox as single-select. Selecting an item here does NOT link immediately — it populates the confirmation checklist below.

**Confirmation Checklist:**  
Appears below the add control once an item is chosen:

```
Link "Alkauther (Central Filter Cartridge)" to:

☑ Kitchen Water Filter 3 Stage
☑ Central Water Filter [3 Stage]
☑ Drinking Water Filter 6 Stage
☐ Shower Filter                    ← user can uncheck exceptions
☑ Media Filter
...

[Link to 11 services]   [Cancel]
```

- All services pre-checked
- User unchecks exceptions
- Button label updates live: `Link to [N] services`
- User can change the selected inventory item (via the add control above) while the checklist is open
- **Height cap:** The checklist container is `max-h-[300px] overflow-y-auto` so that with 50+ services the `Link to [N] services` button and the Link Intersection Summary below always remain visible without the user scrolling the whole page

**Progress Flow:**

1. User clicks `Link to [N] services`
2. Button becomes a spinner: `Linking…`
3. Single API call: `POST /service-links/bulk { serviceIds: [...], inventoryItemId: "..." }` — atomic, all-or-nothing
4. On success: button becomes a checkmark for 1.5s, then a success toast appears: `Linked "Alkauther" to 11 services`, checkboxes auto-clear, right panel returns to zero state
5. On failure: toast with error message, checkboxes remain so the user can retry

> **Idempotency note:** The bulk endpoint must upsert — if any `serviceId` in the batch already has a link to the given `inventoryItemId`, the backend silently ignores that duplicate rather than returning an error. This ensures a user who accidentally re-selects an already-linked service never sees a failure for the entire batch.

**Link Intersection Summary (below checklist):**  
A read-only section showing the inventory items across all selected services:
- **Linked to all:** shown in green
- **Linked to some:** shown with a partial indicator (`N of 12 services`)
- **Linked to none:** shown in amber

---

## 6. API Endpoints

| Operation | Endpoint | Notes |
|---|---|---|
| Fetch all services with link counts | `GET /services?include=link_counts` | Existing or extend current query |
| Fetch links for a single service | `GET /services/:id/links` | Returns linked inventory items |
| Add single link | `POST /services/:id/links { inventoryItemId }` | Single-select mode |
| Remove single link | `DELETE /services/:id/links/:linkId` | Single-select mode |
| Bulk link | `POST /service-links/bulk { serviceIds: [...], inventoryItemId }` | Upsert — duplicates silently ignored; atomic for non-duplicate entries |

---

## 7. Responsive Behavior

| Viewport | Behavior |
|---|---|
| `≥ lg` (1024px+) | Full two-panel layout as described |
| `md` (640–1023px) | Master list takes full width; tapping a row slides the action canvas in as a bottom sheet |
| `< sm` (< 640px) | Master list full width; action canvas opens as a full-screen sheet with a back button |

---

## 8. Out of Scope

- Filtering services by division (existing filter controls remain unchanged)
- Editing service details (still handled by the existing edit dialog)
- Drag-to-reorder (drag mode remains on the Normal tab only)
- Creating new inventory items from within this view
