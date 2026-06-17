# Responsive Foundation — Phase 0 Design

**Date:** 2026-06-16
**Branch:** `feature/responsive-ui`
**Status:** Draft — pending user approval
**Author:** Mohamed Ismail + Claude

## Context

The MMS app is built laptop/desktop-first. CLAUDE.md mandates that every UI must work at four breakpoints — phone (`<640px`), tablet (`640–1024px`), laptop/desktop (`1024–1920px`), and TV (`>1920px`) — but the existing shell, tables, dialogs, and forms break or degrade badly outside the laptop/desktop range.

The full responsive rollout was scoped into six phases. **This spec covers Phase 0 — the foundation only.** It does not redesign any module. Later phases will deliver the mobile-first UX for Team Leader, Calendar, Map, Order/SO/Quotation creation, Inventory overview, and the TV-optimized dashboards.

### Usage intent (drives the phase priorities)

| Tier | Modules / pages |
|---|---|
| **Mobile-first (fully functional on phone)** | Team Leader, Calendar, Map, Order/SO/Quotation creation, Service Request creation, Inventory overview |
| **TV-optimized (wall display)** | Reports, Services overview, Employee/Team check-in dashboards |
| **Survival bar (just doesn't break)** | Purchase, Master Data, Accounting, Contracts, and other admin modules |
| **Desktop-only (no mobile UX)** | Contact Centre |

### Phase map (this spec = Phase 0 only)

| Phase | Scope |
|---|---|
| **0. Foundation (this spec)** | Responsive shell, primitives, reference implementations, Contact Centre desktop gate, TV polish |
| 1. Mobile-first: Field ops | Team Leader, Calendar, Map |
| 2. Mobile-first: Document creation | SO/Quotation/Order create, Service Request |
| 3. Mobile-first: Inventory overview | Read-mostly lookup view |
| 4. TV-optimized dashboards | Reports, Services, Employee/Team check-in for wall TVs |
| 5. Survival sweep | Remaining pages get the "doesn't break on phone" pass |

## Goals

1. The app shell (`TopNav`) works correctly from 380px phone to 4K TV.
2. Three reusable responsive primitives exist and are documented: `ResponsiveTable`, `ResponsiveDialog`, and `PageContainer`.
3. Reference implementations exist for three page shapes — list, detail/edit, dashboard — using the primitives. These become the pattern Phase 1+ copies.
4. Contact Centre shows a clear "best viewed on desktop or tablet" gate below `lg:` instead of breaking.
5. TV (`2xl:`, >1920px) viewing is polished — shell stretches sensibly, base font scales up, home dashboard is TV-friendly.

## Non-Goals (deferred to later phases)

- Per-page survival sweep of the other ~57 dashboard pages (Phase 5).
- Mobile-first redesign of Team Leader / Calendar / Map / Order Creation / Inventory (Phases 1–3).
- TV-optimized layouts for Reports / Services / Employee dashboards (Phase 4).
- Touch-target retrofit on every existing button/input — only Phase 0's new primitives meet the `min-h-11` rule; the rest is fixed in their module phase.
- Visual regression / E2E test infrastructure — manual breakpoint testing only.
- RTL / multi-language support.
- Reduced-motion / accessibility audit beyond touch-target sizes.

## Architecture

Four layers, bottom-up. Nothing in this stack touches business logic or database access.

```
┌────────────────────────────────────────────────────────────┐
│  Sample pages (Orders list + Orders edit + Home)           │ ← reference impls
├────────────────────────────────────────────────────────────┤
│  ResponsiveTable │ ResponsiveDialog │ PageContainer │ ...  │ ← primitives
├────────────────────────────────────────────────────────────┤
│  TopNav (drawer below lg) │ DesktopGate (CC) │ 2xl shell   │ ← shell
├────────────────────────────────────────────────────────────┤
│  Tailwind breakpoint tokens │ typography scale @ 2xl       │ ← tokens
└────────────────────────────────────────────────────────────┘
```

### Breakpoints (already defined in Tailwind defaults)

| Tailwind prefix | Min width | Target device |
|---|---|---|
| _none_ (default) | 0 | Phone |
| `sm:` | 640px | Large phone / small tablet |
| `md:` | 768px | Tablet |
| `lg:` | 1024px | Laptop |
| `xl:` | 1280px | Desktop |
| `2xl:` | 1536px | Large desktop / TV |

For this spec, the **TV breakpoint** is `2xl:` (1536px+). On true 4K (3840px) the same `2xl:` rules apply — there is no `3xl` distinction in Phase 0.

### Why the shell and tables switch at different breakpoints

The mobile drawer triggers below `lg:` (so portrait tablets still get the drawer — the desktop nav has too many items to fit in 1024px landscape). Tables switch to card stacks below `md:` (768px) — a landscape tablet has enough horizontal room for a normal table, so we keep it. These two thresholds are intentionally different.

## Shell Layer

### Mobile drawer navigation (below `lg:`)

`TopNav` is currently a single horizontal nav bar that overflows on phones and tablets in portrait.

**`< lg:`** — header content becomes: hamburger button | logo | spacer | `NotificationBell` | `UserMenu`. The central `NavDropdown` strip is hidden.

**Hamburger opens a `Sheet`** (shadcn — already in repo) sliding from the **left**:
- Width: `w-[85vw] max-w-xs` (cap at 320px).
- Contains the same `NAV_ITEMS` tree as `NavDropdown`, rendered as a vertical accordion.
- Accordion is controlled, **single-open** — opening one section closes the others — so the drawer doesn't grow taller than the viewport.
- Closes on item click and on backdrop tap.

**`lg:` and up** — current desktop nav unchanged.

**`2xl:` and up** — header inner content gets `max-w-screen-2xl mx-auto px-8` so logo and user menu don't sit at the far edges of a 4K screen.

Implementation: `src/components/layout/TopNav.tsx` + new `MobileNavDrawer.tsx`.

### Contact Centre desktop-only gate

New small component: `<DesktopOnlyGate>` renders a friendly screen below `lg:`:

> **Best viewed on a desktop or tablet**
> The Contact Centre needs more screen space than a phone provides.
> Please open this page on a laptop, desktop, or tablet in landscape.

Wrap it around the Contact Centre route layouts (`src/app/(dashboard)/contact-centre/...`) so phone users see this instead of broken UI. The component is generic — other desktop-only surfaces can reuse it later.

### TV (`2xl:`) shell polish

- **Body typography scale** — add `2xl:text-base` to the document body (current implicit base is `text-sm`), bumping the base reading size on TVs only. Per-component changes are not required because Tailwind sizes are relative.
- **Max-width container** — `PageContainer` caps content at `max-w-screen-2xl` so dashboards don't sprawl edge-to-edge on a 4K wall TV.
- **TopNav height** — stays 56px (`h-14`) across all breakpoints. Touch-friendly and consistent.

## Primitives Layer

### `<PageContainer>`

A thin wrapper used by every page. Promoted from the existing `PageWrapper`.

```tsx
<PageContainer compact={false}>
  {children}
</PageContainer>
```

Behavior:
- Classes: `w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6`
- `compact` prop removes padding (used by full-bleed pages like the Map).
- Existing `PageWrapper` keeps re-exporting from `PageContainer` so existing imports continue to work.

### `<ResponsiveTable>`

Wraps a list of rows with two render strategies.

```tsx
<ResponsiveTable
  data={orders}
  columns={[...]}                    // existing column defs
  mobileCardRender={(row) => (...)}  // OPTIONAL
  onRowClick={(row) => ...}
  isLoading={...}
  emptyState={...}
/>
```

Behavior:
- **`md:` and up** — renders as a desktop table using the existing shadcn `Table` parts under the hood.
- **`< md:` + `mobileCardRender` provided** — renders a vertical stack of cards, one per row. Each card has `min-h-11` and the same `onRowClick` handler the table row uses.
- **`< md:` + no `mobileCardRender`** — wraps the table in `overflow-x-auto` with sticky first column and a right-edge gradient fade hinting at horizontal scroll. This is the fallback used by the ~57 unconverted pages until their phase.
- Loading skeleton, empty state, and pagination render at both breakpoints with sensible compact variants on mobile.

### `<ResponsiveDialog>`

Wraps shadcn `Dialog` with a mobile-full-screen variant.

```tsx
<ResponsiveDialog open={...} onOpenChange={...}>
  <ResponsiveDialogHeader>...</ResponsiveDialogHeader>
  <ResponsiveDialogBody>...</ResponsiveDialogBody>
  <ResponsiveDialogFooter>...</ResponsiveDialogFooter>
</ResponsiveDialog>
```

Behavior:
- **`md:` and up** — centered card (current `Dialog` behavior).
- **`< md:`** — full-screen: `w-full h-full rounded-none`, header sticky-top, footer sticky-bottom, scrollable body in between.
- Same API surface and slot names as today's `Dialog`, so an existing dialog opts in with a one-line import change.

Phase 0 converts only the dialogs touched by the sample pages. Other dialogs migrate during their module's phase.

### Form layout helpers

Two utility classes added at Tailwind's component layer (in `tailwind.config.ts` or `src/app/globals.css`):

```css
.form-grid    { @apply grid grid-cols-1 md:grid-cols-2 gap-4; }
.form-actions { @apply flex flex-col-reverse sm:flex-row sm:justify-end gap-2; }
```

These codify the "stacked on phone, side-by-side on tablet+" patterns without sprinkling them across every form.

## Sample Page Conversions

### 1. Orders list — `src/app/(dashboard)/orders/page.tsx`

- Wrap content in `<PageContainer>`.
- Replace table render with `<ResponsiveTable>` providing `mobileCardRender`.
- **Mobile card schema** per Orders row:
  - Top row: `#{order_number}` (bold) · status badge (right-aligned)
  - Middle row: customer name (truncate)
  - Bottom row: total amount (right) · created date (muted)
  - Tap target = whole card, opens detail page (same as desktop row click).
- **Filters bar** — on `< md:`, the horizontal filter row collapses to a single "Filters" button that opens a `Sheet` containing the same filter controls. Apply / Reset buttons in the sheet footer.
- **Search input** — full-width on mobile, sticky directly under the header.
- **Pagination** — compact on mobile: Prev / "Page 2 of 7" label / Next. Page-size selector hidden below `md:`.

### 2. Order detail/edit — `src/app/(dashboard)/orders/[id]/edit/page.tsx`

- Wrap content in `<PageContainer>`.
- Two-column form becomes `.form-grid` (stacks below `md:`).
- **Line items** — desktop keeps the editable table; mobile renders each line item as a card with stacked inputs (item name, qty, price, computed line total, Remove button). Same data model; presentation only.
- Save / Cancel uses `.form-actions` — on mobile, Save sits at the top of the stacked column-reverse so it's thumb-reachable.
- Any dialog opened from this page (e.g., "Add line item") converts to `<ResponsiveDialog>`.

### 3. Home dashboard — `src/app/(dashboard)/page.tsx`

- Wrap in `<PageContainer>`.
- Card grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4`.
- At `2xl:` only — KPI numbers use `text-5xl` (current `text-3xl`), card padding `p-8`, icons scale up. This is the TV-friendly pass for Phase 0.

## File Map

```
NEW   src/components/layout/MobileNavDrawer.tsx
NEW   src/components/shared/DesktopOnlyGate.tsx
NEW   src/components/shared/ResponsiveTable.tsx
NEW   src/components/shared/ResponsiveDialog.tsx
NEW   src/components/shared/PageContainer.tsx        (promoted from PageWrapper; old name re-exports)
EDIT  src/components/layout/TopNav.tsx               (hamburger + 2xl max-width)
EDIT  src/app/(dashboard)/layout.tsx                 (body typography scale @ 2xl)
EDIT  src/app/(dashboard)/contact-centre/.../layout  (DesktopOnlyGate wrap — exact path verified during impl)
EDIT  src/app/(dashboard)/orders/page.tsx            (sample — list)
EDIT  src/app/(dashboard)/orders/[id]/edit/page.tsx  (sample — detail/edit)
EDIT  src/app/(dashboard)/page.tsx                   (sample — home dashboard)
EDIT  src/app/globals.css                            (form-grid / form-actions utility layer)
```

No DB migrations. No new npm dependencies — shadcn `Sheet`, `Dialog`, `Table` already in repo.

## Verification

Manual breakpoint testing only in Phase 0. For each sample page and the shell, the implementer runs a pass at four viewport widths in DevTools responsive mode (and on at least one physical phone if available):

| Viewport | What to verify |
|---|---|
| **380px** (phone) | Hamburger opens drawer; drawer is single-open accordion; Orders list shows cards; edit form stacks; line items are cards; no horizontal page scroll; dialogs open full-screen; Contact Centre shows the gate. |
| **768px** (tablet) | Drawer still present (below `lg:`); table renders as a table; form is 2-col; dialogs centered. |
| **1280px** (laptop) | Desktop TopNav restored; current desktop UX visibly identical to today. |
| **2560px** (TV) | TopNav inner content centered; dashboard cards expand to 4 cols; KPI text scales up; body font is `text-base`. |

Verification is recorded as a checklist in the PR description.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Promoting `PageWrapper` → `PageContainer` ripples into pages that import the old name | Keep `PageWrapper` as a re-export of `PageContainer`; no caller changes required |
| `ResponsiveTable` API doesn't fit the 57 unconverted tables | The fallback path (horizontal scroll + sticky first column) needs no opt-in — works automatically when `mobileCardRender` is absent |
| Drawer accordion grows taller than the viewport with the full nav tree | Controlled single-open accordion: at most one section's children visible at a time |
| TV typography bump breaks tightly-fitted desktop layouts on 1080p screens | Scale only triggers at `2xl:` (≥1536px); 1080p (1920×1080) is `2xl` — verify dashboard at exactly 1920px during implementation; if it breaks, raise the trigger to a custom 2K+ media query |
| Contact Centre gate hides the page from staff using tablets occasionally | Gate triggers only below `lg:` (1024px); tablets in landscape are above that and still see the page |
| Sticky-first-column on `overflow-x-auto` tables can clip dropdowns rendered inside cells | Verify with one table that has a row-action dropdown; if it clips, render dropdowns via portal (Radix already does this) |

## Layout-Stability Compliance

CLAUDE.md's "Layout stability — no visual shifts on user interaction" rule applies. Phase 0 commitments:

- The hamburger button and the desktop nav occupy the same horizontal slot — switching breakpoints does not change `TopNav` height.
- `MobileNavDrawer`'s open/close uses Sheet's overlay (does not push content).
- Mobile filter `Sheet` overlays the page; it does not push the list below.
- `ResponsiveTable` empty state has the same min-height as a single row so transitioning empty → populated doesn't jump.
- All Select / Dropdown triggers introduced in Phase 0 use fixed `h-10` (or `h-11` for touch) and `truncate` on dynamic labels.

## Security Audit (per CLAUDE.md module checklist)

Phase 0 is pure UI presentation. The checklist still applies:

| Check | Status | Note |
|---|---|---|
| Secrets | ✅ N/A | No env or secret usage added |
| RLS | ✅ N/A | No DB tables added |
| Auth gate on new API routes | ✅ N/A | No new API routes |
| Error handling on external calls | ✅ N/A | No external calls added |
| Layout stability | ✅ Required | See section above |

## Open Items (to resolve during planning / implementation)

- Exact path of the Contact Centre route layout to wrap with `DesktopOnlyGate` (subfolder structure inspected during implementation, not blocking the spec).
- Whether the 1920×1080 desktop case needs a custom breakpoint between `xl:` and the new `2xl:` TV behavior (decided after a quick check during impl).
- Final wording of the Contact Centre gate copy (placeholder above is fine for now).

## Out of scope for this spec

If something is not listed in "Goals" or "Sample Page Conversions", it is out of scope for Phase 0. New ideas that surface during implementation get logged for the appropriate later phase, not added here.
