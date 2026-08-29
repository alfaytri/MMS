# Staff Usage Manual — Preparation Requirements (HELD, resume later)

> Status: **on hold** at the operator's request (2026-08-21). This file captures
> everything decided so we can resume without re-deciding. When resuming, read
> this first.

## Decisions already locked
- **Format:** PDF (a file to hand/print to staff). Build path: write per-module
  Markdown → render to PDF (use the `pdf` / `docx` skill, or pandoc). The app's
  own PDF stack is puppeteer + `@sparticuz/chromium` (could reuse) but a
  Markdown→PDF render is simpler for a document.
- **Audience:** end-users / staff (non-technical) — "to do X, go here, click
  this." Not a developer doc (that's the separate "refresh project docs" task).
- **Language:** English now. Arabic version possibly later (the app is Qatar-based;
  confirm with operator).
- **Scope = the live 4-area back-office app only.** `deploy/warehouse-shipping`
  is a pruned build.

## EXCLUDE (pruned from this branch — do NOT document; confirmed via prune commit `dd855dac`)
- Dibsy / payments gateway, the public `/pay` portal (do not exist here)
- WhatsApp (WATI / WHAPI) sending + Contact Centre
- Field Work Orders, Team-Leader mobile app
- Standalone Quotations module (quotations are handled *inside* Sale Orders)

The old `README.md` still advertises these — ignore it for the manual.

## Proposed table of contents (mirrors the real menu — `nav-config.ts`)
1. **Getting started** — logging in, the dashboard, your profile, how divisions
   & permissions decide what you see.
2. **Master Data** — Inventory (category tree, items, brands/origins, stock),
   Warehouses, Users & Roles, Audit Trail, Admin.
3. **Purchase** — Suppliers → Purchase Orders → Approvals → Receivals → Bills →
   Returns / Debit Notes → Landed Costs, Shipments, Aging, Dead Stock.
4. **Sales** — Customers → Sale Orders → Approvals → Invoices → Deliveries →
   Returns / Credit Notes → Customer Statement, Aging.
5. **Operations** — Custody, Consumption, Damaged Stock, Tools & Assets,
   Picture Transfer.
6. **Reports** — the 9 financial/stock reports (what each one tells you).
7. **Common tasks & troubleshooting** — quick "how do I…" index + who to ask
   when something's blocked (e.g. a PO stuck in approval, an over-limit SO).

## Sources of truth for accuracy (read these when writing)
- `src/components/layout/nav-config.ts` — the exact menu/labels/permissions staff see
- `src/components/master-data/AdminSidebar.tsx` — the Admin sub-pages
- `docs/flows-registry.md` — the authoritative business flows per module
- The graphify graph (`graphify-out/graph.json`) + the actual page components
- `src/lib/route-permissions.ts` — which permission gates each route

## Open questions to resolve before/at build
1. **Screenshots?** Real screenshots make a staff manual far clearer but require
   running the app + capturing ~dozens of screens (browser automation), which
   multiplies effort. Default = text walkthroughs with nav paths ("Purchase →
   Orders → New PO"); add screenshots for the top ~10 screens if the operator wants.
2. **Per-role variants or one manual?** One manual with "who can do this"
   notes is simplest; a per-role cut (e.g. warehouse-only, sales-only) is more work.
3. **Arabic** — now or later?
4. **Reports depth** — how much to explain what each financial report means.

## Build approach when resumed
- Draft per-module Markdown sections against the sources above (accuracy first).
- Keep language simple + task-oriented; note permission requirements inline.
- Render to a single PDF; deliver via SendUserFile.
- (Related deliverable, separate task: refresh the stale `README.md` + add a
  `/docs` index + a deploy/backup runbook — the "project docs" ask.)
