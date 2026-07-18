# Responsive UI Work-up — Spec

**Date:** 2026-07-18
**Branch:** `feature/purchase-warehouse-core`
**Owner:** Mohamed Ismail

## 1. Goal

Make every page in the Purchase & Sales / Master Data / Reports navigation menus fully responsive across **four breakpoints**:

| Breakpoint | Target | Tailwind prefix |
|---|---|---|
| `< 640px` | Phone | (default) |
| `640 – 1024px` | Tablet | `sm:` / `md:` |
| `1024 – 1920px` | Laptop / Desktop | `lg:` / `xl:` |
| `> 1920px` | TV / Large screen | `2xl:` |

Every page and every dialog must be usable, readable, and touch-friendly at each breakpoint.

## 2. Scope (26 pages)

### Master Data (5)
- `/master-data/inventory` — Inventory (tree + cascading selectors)
- `/master-data/warehouses` — Warehouses (multi-tab operational hub)
- `/master-data/users` — Users & Roles (permission tree)
- `/master-data/audit-trail` — Audit Trail (long virtualized timeline)
- `/master-data/admin` — Admin (hub of sub-pages)

### Reports (2)
- Financial Dashboard (KPI grid + charts)
- Product Profitability (charts + drill-down)

### Purchase & Sales
**Vendors & Clients (2):** Suppliers · Customers
**Purchase (7):** Purchase Orders · Approvals · Receivals · Bills · Returns · Debit Notes · Aging Report
**Sales (7):** Sale Orders · Invoices · Returns · Deliveries · Credit Notes · Customer Statement · Aging Report
**Logistics & Reports (3):** Shipments · Landed Costs · Dead Stock Report

## 3. Non-Goals

- Not touching pages outside these 26 (contracts, team-leader, contact-center, calendar, map, etc.)
- Not adding new features — this is a responsive layout pass only
- Not restyling brand colors, buttons, or typography beyond what responsive scaling requires
- Not building a new design system — reuse existing shadcn primitives + Tailwind

## 4. Locked Decisions

| # | Decision |
|---|---|
| Q1 | **Audit style** — source-code read + written defect list per breakpoint (no manual screenshots) |
| Q2 | **Mobile table pattern** — card list on mobile, table on desktop (`< md:` = cards, `md:+` = table) |
| Q3 | **TV/2xl scope** — dashboards + aging reports only; other pages get `max-w-*` caps so they don't stretch weirdly |
| Q4 | **Docs** — this spec + plan (`docs/superpowers/plans/2026-07-18-responsive-ui-workup.md`) |

## 5. Design Constraints (from `AGENTS.md`)

- Never hardcode pixel widths on layout containers — use `w-full`, `max-w-*`, or responsive fractions
- Tables must collapse gracefully on mobile: hide lower-priority columns below `md:`, horizontal scroll as fallback
- Dialogs/modals: full-screen on mobile (`w-full h-full rounded-none`), centered card on `md:+`
- Navigation: TopNav must have a hamburger drawer for `< lg:`
- Font sizes, padding, spacing must scale — avoid fixed `px` values that look wrong on 4K
- Touch targets must be at least `44px` tall on mobile (`min-h-11`)
- Layout stability — no shifts on Select / dropdown interaction (Section 5 of the security checklist)

## 6. Acceptance Criteria

Per page, at every breakpoint:
- **No horizontal scroll on the page body** (only inside `overflow-x` containers by design)
- **All interactive controls reachable** — nothing clipped, no essential column hidden without a scroll or menu fallback
- **Touch targets ≥ 44px** on mobile (buttons, dropdowns, links in nav)
- **Text readable** — body ≥ 12px, buttons ≥ 14px, no font sizes so large they wrap awkwardly on TV
- **Dialogs behave**: mobile = full-screen; tablet+ = centered card with `max-h-[90vh]` internal scroll
- **Filter bars stack** on mobile, wrap on tablet, sit inline on desktop
- **Tables**: mobile card layout when ≥ 4 columns exist; horizontal scroll only when a table has <4 columns and still doesn't fit
- **Layout stable** — no shifts when toggling a `<Select>` value, opening a dialog, or filtering

## 7. Deliverable Shape

The plan file will decompose this into ~28 tasks:
- 1 audit task (Phase 0)
- 6 shared-infrastructure tasks (Phase 1)
- 3 batched list-page tasks (Phase 2)
- 7 heavy-page tasks (Phase 3)
- 1 verify + close task (Phase 4)

Each task carries its own `PROGRESS.md` start / feature / doc commit trio + EOD line + manual-QA gate.

## 8. Open Questions

None — all four scoping questions locked (see §4).
