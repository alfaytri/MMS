# Mobile UI Sweep — Test Matrix (2026-08-13)

Full mobile-responsiveness pass across **Inventory · Warehouse · Operations · Audit Trail · Reports**, plus the mobile-nav bug. 25 files changed, `tsc` clean.

## How to test
Use Chrome DevTools device toolbar (Ctrl/Cmd+Shift+M) OR a real phone. Check at **three widths**:
- **Phone — 375 px** (iPhone SE / most Androids) ← the important one
- **Tablet — 768 px**
- **Laptop — 1280 px** (should be unchanged from before)

The one rule that catches most breaks: **the page must never scroll sideways.** Wide tables may scroll *inside their own box*, but the page body must not.

---

## 0 · Navigation (the reported bug) — do this first
| # | Check | Steps | Expected | ✓ |
|---|---|---|---|---|
| 0.1 | **Operations reachable on mobile** | Phone width, as **admin/Owner** → tap the ☰ hamburger (top-left) | Drawer shows **Operations** alongside Master Data / Reports / Purchase & Sales | ☐ |
| 0.2 | Operations children | Expand **Operations** in the drawer | **Custody**, **Consumption**, **Damaged Stock** all listed and tappable | ☐ |
| 0.3 | Non-admin parity | Log in as a role with `operations.access` + `consumption.view` | Operations still shows (unchanged) | ☐ |
| 0.4 | Desktop unchanged | Laptop width | Top-nav Operations dropdown works as before | ☐ |

---

## 1 · Inventory
| # | Check | Steps | Expected | ✓ |
|---|---|---|---|---|
| 1.1 | **New/Edit Item footer reachable** (main fix) | Phone → Inventory → **+ New Item** (or edit an item) | Dialog is full-screen; the long form **scrolls**; **Create Item / Cancel** stay pinned at the bottom and are tappable | ☐ |
| 1.2 | Item form with keyboard | Phone → focus the Specification / name field (keyboard opens) | Footer still reachable; can scroll to it | ☐ |
| 1.3 | Tools tap targets | Phone → Tools & Assets → expand a tool category → **Add Unit**, **Auto-generate serials**, unit **Confirm** | Each button is comfortably tappable (≥44 px tall) | ☐ |
| 1.4 | Item list table | Phone → Products/Spare Parts tab | Table hides low-priority columns / scrolls in its box; page doesn't scroll sideways | ☐ |
| 1.5 | Desktop unchanged | Laptop | Item dialog is a centered card as before | ☐ |

## 2 · Warehouse
| # | Check | Steps | Expected | ✓ |
|---|---|---|---|---|
| 2.1 | Tab bar | Phone → Master Data → Warehouses | The tab row (Overview/Transfers/…) scrolls horizontally; no page side-scroll | ☐ |
| 2.2 | **Inventory Check — Generated SAs** (fix) | Phone → Inv. Checks → open an approved check → **Adjustments** tab | The 5-column table **scrolls horizontally** inside its box; Status column reachable (was clipped) | ☐ |
| 2.3 | **Inventory Check — Reconciliation** (fix) | Same dialog → **Approval** tab (or the reconciliation table) | 8-column table scrolls; **System / Status** columns reachable (were cut off) | ☐ |
| 2.4 | **Post-count movements** (fix) | Approval tab, if movements exist | 4-column grid scrolls horizontally; Date column reachable | ☐ |
| 2.5 | Report button | Phone → any WH tab → **Report ▾** | Button ≥44 px, opens | ☐ |
| 2.6 | Main tables | Phone → Stock Overview / Stock Value / Movements | Card fallback or in-box scroll; no page side-scroll | ☐ |
| 2.7 | Create dialogs | Phone → New Transfer / New Adjustment / Start Check | Full-screen, scroll body, footer pinned (already worked — regression check) | ☐ |

## 3 · Operations
| # | Check | Steps | Expected | ✓ |
|---|---|---|---|---|
| 3.1 | Custody tab bar | Phone → Operations → Custody (with 2+ custody locations) | Tab row scrolls horizontally; long names don't push the page sideways | ☐ |
| 3.2 | Custody card actions | Phone → a custody card you're RP of | **Request / Return / Consume** and pending **Dispatch / Accept** are ≥44 px, tappable | ☐ |
| 3.3 | **Send-for-Repair footer** (fix) | Phone → Damaged Stock → On-hand → **wrench (Send for repair)** → pick vendor, focus Notes (keyboard) | Body scrolls; **Cancel / Submit** stay reachable (was clipped by keyboard) | ☐ |
| 3.4 | **Write-Off footer** (fix) | Phone → Damaged Stock → On-hand → **✕ (Write off)** | Same — footer reachable with keyboard open | ☐ |
| 3.5 | **Send Damaged for Repair footer** (fix) | Phone → the send-damaged dialog | Same — footer reachable | ☐ |
| 3.6 | Damaged action buttons | Phone → On-hand icons, **Assign Vendor**, **Return from Repair** | All ≥44 px | ☐ |
| 3.7 | **Consumption detail table** (fix) | Phone → Consumption → open an entry (as a cost-viewer) | Lines table **scrolls**; Unit cost / Total columns reachable; **Close** ≥44 px | ☐ |
| 3.8 | **Request-cancellation dialog** (fix) | Phone → Consumption detail → **Request cancellation** | Dialog full-screen (was mis-sized); body scrolls; footer pinned; buttons ≥44 px | ☐ |
| 3.9 | Already-good dialogs (regression) | Phone → New Consumption, its Confirm modal, Custody Assign / Return / Accept | Full-screen/compact, footer pinned, no overflow (should be unchanged) | ☐ |

## 4 · Audit Trail
| # | Check | Steps | Expected | ✓ |
|---|---|---|---|---|
| 4.1 | **Date pickers** (fix) | Phone → Master Data → Audit Trail → From/To date pickers | Both ≥44 px tall (were 36 px) | ☐ |
| 4.2 | Log + filters | Phone | Log is stacked cards (no wide table); filter row stacks; long JSON diffs wrap, no side-scroll | ☐ |

## 5 · Reports
| # | Check | Steps | Expected | ✓ |
|---|---|---|---|---|
| 5.1 | **Cash stat tiles** (fix) | Phone → Reports → Cash, with real (7-figure) amounts | 3 tiles become **2-up**; large QAR values wrap inside the tile — **page does not scroll sideways** | ☐ |
| 5.2 | **Receivables / Payables tiles** (fix) | Phone → Receivables, Payables | Same — tiles 2-up, values contained | ☐ |
| 5.3 | Revenue/COGS & Product Cost tiles | Phone → those reports | Values wrap, don't spill (hardened) | ☐ |
| 5.4 | **Filter + Export controls** (fix) | Phone → any report → Export ▾, division/warehouse multi-selects, date range, **Clear** | All ≥44 px, tappable | ☐ |
| 5.5 | Grouped financial tables | Phone → Revenue/COGS, Cash, AR, AP | Table scrolls **inside its box**; page body does not scroll sideways | ☐ |
| 5.6 | **P&L basis toggle** (fix) | Phone → Profit & Loss → Accrual / Cash toggle | ≥44 px | ☐ |
| 5.7 | **Profitability chart** (fix) | Phone → Product Profitability | Currency values don't overlap the bars for large numbers | ☐ |
| 5.8 | Dashboard | Phone → Financial Dashboard | KPI cards 2-up, charts fit, no side-scroll | ☐ |

---

## 6 · Mobile card layouts + large-screen (this round — the "change how the table looks" pass)
These are the new **card** conversions and the **reports large-screen** work. Test cards at **375 px**, large-screen at **≥1536 px** (2xl — a big monitor / TV, or DevTools at 1920/2560 px).

| # | Check | Steps | Expected | ✓ |
|---|---|---|---|---|
| 6.1 | **Consumption → cards** | Phone → Operations → Consumption | List renders as **cards** (CE# + status badge · consumer · source · date/lines/total), not a squeezed table; tapping a card opens the detail | ☐ |
| 6.2 | **Damaged Stock On-hand → cards** | Phone → Damaged Stock → On-hand | Cards (item + qty · SKU · warehouse · source · weighted cost · updated); **Send for Repair / Write Off** are full-width tappable buttons | ☐ |
| 6.3 | **Damaged Stock Out-for-Repair → cards** | Phone → Out for Repair (with data) | Pending-assignment cards (**Assign Vendor**) + out-for-repair cards (**Return from Repair**), all tappable | ☐ |
| 6.4 | **Inventory rows on mobile** | Phone → Inventory → Products | Each item shows name + a **meta line (SKU · unit · avg cost)** under it + stock badge + edit/archive; nothing important hidden | ☐ |
| 6.5 | Desktop tables unchanged | Laptop → all of the above | Consumption / Damaged Stock / Inventory show the **normal desktop tables** exactly as before (cards are phone-only) | ☐ |
| 6.6 | **Reports on a large monitor** | ≥1536 px → any report (Cash, AR, AP, Revenue/COGS, Product Cost) | Stat tiles have **bigger values + more padding**; the grouped table uses **larger text + roomier cells**; content fills the wide screen (no cramped column in the middle) | ☐ |
| 6.7 | Reports P&L / dashboard large-screen | ≥1536 px → Profit & Loss, Financial Dashboard | P&L statement is wider (`max-w-4xl`), bigger text; dashboard KPI values + charts scale up | ☐ |
| 6.8 | Reports laptop/mobile unchanged | Laptop + phone → reports | Laptop identical to before; phone still 2-up stat tiles + in-box table scroll (the earlier fixes) | ☐ |

## Known-left (intentionally not changed — verified non-breaking)
These were reviewed and are functional on mobile; left to keep the diff focused:
- `BrandVariantEditDialog` — whole dialog scrolls (footer reachable), just not pinned.
- `WhAdjustmentDetailDialog` + a few WH detail dialogs — width-capped, content fits, off the full-screen pattern only cosmetically.
- FIFO-layers "view receival" eye button (deep inside a nested scroll table) — sub-44 px but rarely tapped.
- Accept-custody shortfall Write-off/Give-back toggles — small but secondary.

If any of these bother you in testing, say so and I'll bring them to the full pattern too.

## Notes
- All changes are on `deploy/warehouse-shipping` (uncommitted until you confirm). To test on your **phone against prod**, they need to be committed + pushed (Vercel rebuild). To test **locally**, just run the dev server.
- Desktop/laptop layouts are unchanged — every fix is gated behind mobile breakpoints (`sm:`/`md:` restore the previous sizing).
