# Service photos + dialog service picker — design

**Date:** 2026-10-21
**Status:** awaiting approval — nothing built yet
**Modules touched:** Orders, Quotations, Team Leader, Services (read-only), Invoicing

Reviewed once by a fresh engineer before hand-over; their findings are folded in below
(§6.2 records the calls made in response).

---

## 1. Why

Two problems that meet on the same surface.

**Adding a service to an order is slow and has a dead end.** The picker under
"Requested Services" is a fixed 2×2 grid of dropdowns plus a conditional fifth. Each box is
disabled until the one before it is answered, so most of the time three of the four are greyed
out. After every single add the picker resets to empty — adding a second service from the same
branch means walking all four or five levels again from scratch.

**It cannot reach a sixth level.** `ServiceCascadePicker` iterates `i <= 4` and renders at most
five selects. Select a fifth-level node that still has children and `isLeaf` is `false`, so the Add
panel never appears *and* there is no sixth dropdown to drill into. That branch cannot be ordered
at all. The service tree is meant to go about six deep, so this is a live hazard.

**Services already have photos that nothing displays.** `services.catalog_image_url` is populated
through a working upload UI, carried through the change-approval RPCs, and then read back in
exactly one place — the edit dialog, to show what is already there.

---

## 2. Current state (verified against the running app and the Dev DB)

### The picker

`src/components/services/ServiceCascadePicker.tsx` — 169 lines. Reads the flat `useServiceTree`
list, walks it by `parent_id`, emits `onAdd(service, qty, pathNames)`.

Consumers — one component, three surfaces:

```
ServiceCascadePicker
├── ServiceSelector ──┬── OrderFormPanel      (/orders/create)
│                     └── QuotationFormPanel  (/quotations/create)
└── ServiceCatalogPicker ── Team Leader dialogs
                            (NormalOrderDialog, BackworkDialog,
                             FollowUpDialog, SiteVisitSingleDialog)
```

`onAdd` is the compatibility seam. **Note the TL surfaces are already inside full-screen dialogs** —
this shapes §6.2-D.

### Photo upload — already built, do not rebuild

- `services.catalog_image_url text` exists.
- `CatalogImageSection` in `src/components/services/ServiceEditBasicInfo.tsx` — click-to-upload,
  5 MB cap, `image/jpeg,image/png,image/webp`.
- `src/components/services/ServiceEditDialog.tsx:136` uploads to the public `service-photos`
  bucket at `catalog/{serviceId}.{ext}` with `upsert: true`, stores the public URL.
- The change-approval RPCs already carry `catalog_image_url`, so photo edits go through approval.

### The chain the photo has to travel

| Step | Table / type | Links to service? | Image field? |
|---|---|---|---|
| 1 | `services` | — | ✅ `catalog_image_url` |
| 2 | `order_services` | ✅ `service_id` | ❌ |
| 3 | `order_quotation_line_items` | ✅ `service_id` | ❌ |
| 4 | `tl_invoice_lines` | ❌ **none — `name` text only** | ❌ |
| 5 | `TlInvoiceLineInput` | ❌ | ❌ |
| 6 | `tl-invoice-pdf-html.ts` | — | ❌ |

### Two pre-existing bugs this work runs into

**(a) Invoice lines are matched to services by name string.** `tl_invoice_lines` has no link to the
service, so `src/lib/orders/generate-tl-invoice-pdf.ts:131` does `.in('name_en', lineNames)` and
builds a `Map` keyed on the name. The comments call it "best-effort". In a six-level tree leaf
names repeat — `AC › Split › Cleaning` and `AC › Ducted › Cleaning` are both plausibly "Cleaning" —
and the `Map` keeps whichever row came back last. **The Arabic text and unit on an invoice can
already be the wrong service's today.** Adding `service_id` (§7.3) retires the guess.

**(b) ~~PDFs silently clip.~~ — WITHDRAWN 2026-10-21, this was wrong.**

The original claim: `BASE_CSS` sets `body { height: 297mm; overflow: hidden }` with no
`page-break`/`break-inside` rules anywhere, so a long document must lose rows off the bottom.
It was asserted from reading the CSS, and a reviewer agreed. **Rendering it proved both of us
wrong.**

Measured by rendering real purchase orders through the real Puppeteer pipeline
(`src/lib/pdf/__tests__/page-overflow.test.ts`):

| PO lines | Pages produced |
|---|---|
| 5 | 1 |
| 25 | 2 |
| 60 | 4 |
| 120 | 7 |

Page count scales with content and the final line prints in full. `overflow: hidden` on the body
**does not clip in paged media** — Chromium paginates the overflow regardless. No data is lost in
any of the 16 generators.

**What is actually wrong is smaller and cosmetic:** `.footer { position: absolute; bottom: 10mm }`
anchors to the bottom of the 297mm body, so on a multi-page document the footer appears on page 1
and never again — the last page has none. A single-page document is unaffected.

Consequence for this design: the operator's "allow multi-page invoices" decision in §6.1 was made
to prevent clipping that does not happen. **It should be revisited** — see the note there.

---

## 3. Goals

1. Picking a service happens in a dialog, not inline in the order form.
2. Any tree depth is reachable — six levels, or ten.
3. Several services can be added in one visit, with no reset between each.
4. The operator sees the service's photo while picking it.
5. The photo reaches the customer's invoice **and quotation** PDFs.
6. All three consuming surfaces benefit from one change.

## 4. Non-goals

- Rebuilding the photo upload UI. It exists and works. (§6.2-E adds a derivative write to it —
  an addition, not a rebuild.)
- Changing the service tree itself, its depth, or `/master-data/services`.
- Changing the rest of the order form — division, visit date, address, attachments all stay.
- Fixing the clipping bug (§2b) in the other 14 PDF generators. Separate work — see §6.2-F.
- Bulk photo import for existing services.

## 5. Anti-goals

- **A dialog that is just the 2×2 grid moved into a modal.** That solves nothing.
- **Slower order intake.** Operators are often on the phone. More keystrokes than today is a
  regression regardless of how it looks.
- **A photo that can block an invoice from being issued.** See §6.2-B.
- **A modal opened on top of a full-screen modal** on the phone-first TL surfaces. See §6.2-D.

---

## 6. Decisions

### 6.1 Made by the operator

| Decision | Choice |
|---|---|
| Scope of the dialog | **Service picking only.** The rest of the order form is untouched. |
| Snapshot vs live lookup | **Snapshot.** A line captures the URL when it is created, so a later photo change never rewrites a past document. |
| Photo in invoicing | **On the invoice PDF, as a thumbnail in each line row.** |
| Services with no photo, in the picker | **Collapse** — no image slot, text-only row. Ragged left edge accepted. |
| Invoice page budget | **Allow multi-page** — ⚠️ **chosen on a false premise, needs revisiting.** It was picked to stop lines being clipped, but §2b now shows nothing was ever clipped; invoices already paginate. What is actually needed is far smaller: make the footer appear on every page (or the last), and add `break-inside: avoid` so thumbnails cannot split a row. No layout overhaul. |
| Quotation PDF | **Yes, same pass** — including the extra column and RPC change. |
| Catalogue size | **~500 services; build for 500+** — proper server-side indexed search, not client filtering. |

**Flagged and overridden, recorded deliberately:** the collapse choice runs against the
layout-stability rule in `AGENTS.md`. It was raised before the choice was made and chosen anyway.
It applies to **the picker list only** — a table column cannot be ragged, so §7.4 defines the PDF
rule separately.

### 6.2 Made by me, as the designer — open to correction at review

**A — Picker layout: search-first, with browse as a fallback.** The dialog opens on a focused
search field; results are a flat list carrying photo, full `root › … › leaf` breadcrumb, and price.
A "browse the full catalogue" affordance reveals the tree. It is the only shape where adding a
service does not get slower as the catalogue grows, and the operator's own ragged-edge choice is a
*list* pattern — columns have no ragged edge to accept.

**A2 — A basket.** The dialog accumulates picks and commits on one "Add". Without it the dialog is
a worse version of today.

**B — The server authors the snapshot; the client never sends a URL.** Per-line the client passes
`service_id`, and `create_tl_invoice` resolves the photo itself. Two reasons: the RPC's own header
states it authors the money and never trusts a client total, and the server later *fetches* the
stored URL to embed it in a PDF — a client-supplied URL on that path is SSRF-shaped.

Resolution order, which preserves the operator's "what was current when the work was sold" rule:
1. Prefer `order_services.catalog_image_url` where the line came from an order line.
2. Fall back to a live read from `services` for TL-added billables. Contract and site visits have
   no order line at all (`services_json` is `NULL` for them), so there is nothing to copy; their
   sale moment *is* invoice creation.

**C — Photo failures degrade, never block.** The first draft said "fail loudly", which contradicted
the anti-goal. A missing, deleted or slow photo renders an empty cell and the invoice still issues.
Per-line `Promise.allSettled` with a timeout budget. This matters because
`src/app/api/notifications/send-invoice/route.ts:96` already catches a PDF failure and sends the
customer's WhatsApp **with no PDF attached** — a decorative photo must never be able to trigger that.

**D — A panel plus a thin dialog wrapper, not one dialog.** `ServiceCatalogPicker` already renders
inside four TL dialogs that are themselves full-screen on mobile. So: `ServicePickerPanel` holds all
UI and logic; `ServicePickerDialog` is a thin wrapper used only by the order and quotation forms.
The TL surfaces embed the panel directly — no modal-over-modal.

**E — A thumbnail derivative is written at upload time.** A search list can put dozens of photos on
screen; shipping 5 MB originals would breach the Supabase budget rule on a project that has hit
quota twice, and Supabase image transforms need a paid plan. So the upload path also writes
`catalog/{serviceId}_thumb.webp` (long edge ~200 px). Picker and PDF both read the thumb; the
original is kept for the edit dialog. This does touch the upload path §4 fences off — §4 forbids
*rebuilding* it, and this is an addition, stated here so it is not a surprise.

**F — ~~Multi-page scoping.~~ Superseded 2026-10-21 by the §2b correction.** Documents already
paginate, so there is no multi-page work to scope. What remains for the two documents we touch is
narrow: add `break-inside: avoid` to line rows so a thumbnail cannot split a row across a page
boundary, and repeat the `<thead>` so page 2+ keeps its column headers. Both are local to
`tl-invoice-pdf-html.ts` and `quotation-pdf-html.ts`; `BASE_CSS` is not touched.

The footer-on-multi-page defect (§2b) is app-wide and independent of this feature — see §10.

**G — Dev-only migration, and `service_id` carries no foreign key.** `tl_invoice_lines` is live in
staging and prod, but `services` is not — the staging cleanup drops it. An FK therefore cannot
exist. A plain `uuid` column keeps the same migration applicable to staging if the module ever
ships. The `supabase/migrations-staging/` mirror is deliberately skipped per that rule's own
excluded-module exception, with the reason written into the migration header.

---

## 7. How it should work

### 7.1 The dialog

Opens from "Requested Services", replacing the inline grid with a trigger button.

- Search field autofocused. Matches English and Arabic names.
- Result row: thumbnail (omitted entirely when absent — §6.1), name, breadcrumb in muted text, price.
- Keyboard: arrows to move, Enter to add to basket, Escape to close.
- Browse mode drills the tree with the breadcrumb always visible.
- Basket shows picks with per-line quantity and a running total.
- Commit calls the existing `onAdd` once per basket line, so no consumer changes.
- Full-screen on mobile, centered card from `md:` up.

### 7.2 Reaching every level

The five-select ceiling goes with the grid. Search returns leaves at any depth directly; browse
drills by `parent_id` with no depth constant anywhere. **A leaf is a node with no children** — the
existing `isLeaf` test is correct and stays. Only leaves are addable; branches drill.

### 7.3 Search at 500+ services

Server-side, indexed. The full tree is no longer shipped to the browser for search.

- A trigram index (`pg_trgm`) on `services.name_en` and `name_ar`, or a `tsvector` column if
  prefix matching proves insufficient.
- A `SECURITY DEFINER` RPC returning id, name, breadcrumb path, price, thumb URL and leaf flag,
  filtered by `tree_type` and division, `LIMIT`ed per the Supabase budget rule.
- Debounced from the client; browse mode still reads the existing tree hook.

Breadcrumb paths should be computed in the RPC via a recursive CTE rather than assembled client-side.

### 7.4 Carrying the photo

New nullable columns — nullable throughout, since every existing row predates this:

| Table | Column | Written when |
|---|---|---|
| `order_services` | `catalog_image_url text` | service added to the order |
| `order_quotation_line_items` | `catalog_image_url text` | quotation line saved |
| `tl_invoice_lines` | `catalog_image_url text` | invoice created, server-resolved (§6.2-B) |
| `tl_invoice_lines` | `service_id uuid` (no FK, §6.2-G) | invoice created |

`save_order_quotation` and `create_tl_invoice` both change to accept `service_id` per line and
resolve the snapshot themselves.

### 7.5 The PDFs

`TlInvoiceLineInput` and the quotation line type each gain `imageDataUri: string | null`.

**Base64, not a URL.** `pdf-fonts.ts` already embeds the logo, footer and stamp via `readAsBase64`.
Service thumbs follow the same path: fetch, encode, embed. Relying on the renderer to pull images
mid-render would make generation fail intermittently.

**Column rule:** if *any* line has a photo, the IMG column renders for *all* lines with empty cells
where absent. If *no* line has one, the column is omitted and the table prints exactly as today —
so existing documents are unchanged.

**Multi-page** per §6.2-F: local override of the fixed height and `overflow: hidden`,
`break-inside: avoid` on rows, repeating table header, and a footer/stamp treatment that works on a
final page rather than an absolute one.

---

## 8. Constraints

- `onAdd(service, qty, pathNames)` is the compatibility seam. Keep it and no consumer changes.
- **This module does not exist in production.** `services` has no table in new-prod or staging.
  Migrations go to Dev (`wkmvjxxmzstsvahuiwsz`) per `feedback_fullbuild_migrations_dev`. See §6.2-G
  for the `tl_invoice_lines` nuance — that table *is* live elsewhere.
- The Dev DB holds **one** service, `AC General Service`, no children, no photo. **Seeding a
  realistic tree is task 1, not an afterthought** — nothing here is testable without it. Seed as a
  throwaway fixture script in `scratchpad/`, not a migration: roughly 3 roots, one branch a full six
  levels deep, ~60 leaves, ~15 carrying photos. It is dev fixture data, not the real catalogue.
- PDFs render through the existing Chromium/Puppeteer path and a bilingual RTL layout.
- `src/lib/compressImage.ts` is canvas-based and browser-only; the upload-time derivative (§6.2-E)
  can use it, the server-side PDF path cannot.

---

## 9. Left to the builder

- Exact thumbnail dimensions and encoding quality, within §6.2-E's ~200 px long edge.
- Index choice: `pg_trgm` vs `tsvector` for §7.3, and the result `LIMIT`.
- Debounce timing, empty-state and no-results copy.
- Where the basket sits in the panel and how it behaves at mobile width.
- Whether `ServiceViewSheet` and the services tree should also show the photo now that a read path
  exists. Out of scope, cheap once the plumbing lands.
- Test coverage. `src/components/orders/__tests__` and `src/lib/orders/__tests__` set the pattern.

## 10. Follow-up, not in this work

The **footer defect** from §2b: on any multi-page document the footer prints on page 1 only and the
last page has none. It affects all 16 generators equally, is cosmetic rather than data loss, and is
independent of this feature. Worth fixing once in `BASE_CSS` — but that touches every document in
the app, so it wants its own change and its own visual sign-off.

(The clipping bug this section previously described does not exist — see §2b.)
