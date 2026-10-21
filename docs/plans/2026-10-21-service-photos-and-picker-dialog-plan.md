# Service Photos + Dialog Service Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the order form's cascading dropdown picker with a searchable dialog that shows each service's photo, and carry that photo through to the invoice and quotation PDFs.

**Architecture:** One presentational `ServicePickerPanel` (search + browse + basket) wrapped by a thin `ServicePickerDialog`; the existing `onAdd(service, qty, pathNames)` seam is preserved so all three consuming surfaces upgrade without changes to their own code. Search moves server-side behind a trigram-indexed RPC. The photo URL is snapshotted onto each line record at creation time, resolved server-side from `service_id` — the client never supplies a URL.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Supabase (Postgres + Storage), TanStack Query, Base UI / shadcn, Tailwind, Puppeteer (`puppeteer-core`) for PDFs, Vitest.

**Spec:** [docs/plans/2026-10-21-service-photos-and-picker-dialog-design.md](2026-10-21-service-photos-and-picker-dialog-design.md)

## Global Constraints

- **Migrations target the Dev DB only** (`wkmvjxxmzstsvahuiwsz`). Apply with direct psycopg2 using `DEV_DB_URL` from `supabase/.temp/migrate.env` — not `npx supabase db push`, whose ledger has drifted.
- **Skip the `supabase/migrations-staging/` mirror** for every migration in this plan, and write the reason in each migration header: `services` and `order_services` are dropped from staging/prod as excluded modules.
- **`tl_invoice_lines.service_id` gets NO foreign key.** That table is live in staging/prod but `services` is not, so an FK cannot exist there.
- **Rewrite RPC bodies from the live database**, never from `baseline_schema.sql` or the migration files — both are stale. Fetch with `pg_get_functiondef(p.oid)` and edit that text.
- **Commit trailers**, via heredoc, on every commit:
  `Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>` and `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **Every `.select()` carries `.limit(N)`**; no new realtime channels or polling (`docs/supabase-budget.md`).
- **Responsive at all four breakpoints.** The dialog is full-screen on mobile (`w-full h-full rounded-none`), a centered card from `md:`. Touch targets `min-h-11`.
- **Dropdown/label rule:** never render a raw UUID as visible text.
- **Do not run `next build`.** Do not commit until the operator confirms a surface works.

## Review Focus

Five conditions the spec implies that no task's happy path exercises. Each has a test assigned to the task that owns the code.

1. **A photo deleted from storage after it was snapshotted** — the invoice must still render, with an empty image cell, never a thrown error. (Task 8)
2. **Two services sharing `name_en` at different tree paths** — search results and invoice Arabic text/unit must resolve the right one, which the current name-string lookup cannot. (Tasks 3 and 8)
3. **A team-leader billable with no `service_id`** (typed custom service) — invoice creation must succeed with a null snapshot. (Task 7)
4. **A branch node matching a search query** — must drill into its children, never be addable. (Task 4)
5. **An order placed before this feature** — invoice has no snapshot anywhere, so the PDF must omit the image column entirely and print byte-identically to today. (Task 8)

---

### Task 1: Seed a realistic service tree in the Dev DB

Nothing else in this plan is testable: the Dev DB holds one childless service.

**Files:**
- Create: `scratchpad/seed_service_tree.py`

**Interfaces:**
- Produces: a Dev-DB service tree later tasks query. Roots named `AC General Service`, `Plumbing`, `Electrical`; one branch exactly six levels deep; ~60 leaves total; ~15 leaves carrying `catalog_image_url`.

- [ ] **Step 1: Write the seed script**

Throwaway fixture data, not a migration. Insert directly into `services` with `tree_type='normal'`, `status='active'`, `deleted_at=NULL`, and `division` set to a mix of `{Alfaytri-Maintenance}` and `{Alfaytri-MEP}`. Make it idempotent — delete rows whose `name_en` starts with the seed prefix before inserting, so it can be re-run.

For the ~15 leaves with photos, upload a small generated placeholder PNG per service to the `service-photos` bucket at `catalog/{serviceId}.png` and store the public URL, so the real storage path is exercised rather than a fake URL.

Deliberately include **two leaves both named `Cleaning`** under different parents — Review Focus #2 depends on them existing.

- [ ] **Step 2: Run it against Dev**

Run: `python scratchpad/seed_service_tree.py`
Expected: prints the inserted count and the deepest path, with depth 6.

- [ ] **Step 3: Verify the shape**

Query the Dev DB with a recursive CTE grouping by level.
Expected: 6 levels present, ~60 leaves, exactly 2 services named `Cleaning`.

- [ ] **Step 4: Commit**

```bash
git add scratchpad/seed_service_tree.py
git commit -m "chore(dev): seed a realistic service tree for picker work"
```

---

### Task 2: Thumbnail derivative on upload

**Files:**
- Create: `supabase/migrations/<ts>_services_catalog_thumb_url.sql`
- Modify: `src/components/services/ServiceEditDialog.tsx` (upload block ~line 136)
- Create: `src/lib/services/__tests__/catalogThumb.test.ts`
- Create: `src/lib/services/catalogThumb.ts`

**Interfaces:**
- Produces: `services.catalog_thumb_url text` (nullable); `thumbPathFor(serviceId: string): string` returning `catalog/{serviceId}_thumb.webp`; `buildCatalogThumb(file: File): Promise<Blob>` producing a WebP whose long edge is at most 200 px.

- [ ] **Step 1: Write the failing test**

```ts
describe('thumbPathFor', () => {
  it('derives a stable thumb path from the service id', () => {
    expect(thumbPathFor('abc-123')).toBe('catalog/abc-123_thumb.webp')
  })
})

describe('buildCatalogThumb', () => {
  it('caps the long edge at 200px and preserves aspect ratio', async () => {
    const blob = await buildCatalogThumb(fileFromImage(800, 400))
    const { width, height } = await imageSize(blob)
    expect(width).toBe(200)
    expect(height).toBe(100)
  })
  it('emits image/webp', async () => {
    expect((await buildCatalogThumb(fileFromImage(50, 50))).type).toBe('image/webp')
  })
  it('does not upscale an image already smaller than the cap', async () => {
    const { width } = await imageSize(await buildCatalogThumb(fileFromImage(80, 60)))
    expect(width).toBe(80)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/services/__tests__/catalogThumb.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the migration**

`ALTER TABLE public.services ADD COLUMN IF NOT EXISTS catalog_thumb_url text;` plus a column comment naming it a derivative of `catalog_image_url`, and the skip-the-staging-mirror reason in the header.

- [ ] **Step 4: Apply to Dev and confirm the column exists**

- [ ] **Step 5: Implement `src/lib/services/catalogThumb.ts`**

`buildCatalogThumb` follows the canvas approach already in `src/lib/compressImage.ts` — reuse it if its options allow a max-dimension cap, otherwise mirror its structure. Browser-only; do not import it from server code.

- [ ] **Step 6: Run the tests to verify they pass**

- [ ] **Step 7: Wire it into the upload**

In `ServiceEditDialog.onSubmit`, after the existing `catalog_image_url` upload succeeds, build the thumb and upload it to `thumbPathFor(serviceId)` with `upsert: true`, then add `catalog_thumb_url` to the payload beside `catalog_image_url` — same conditional-spread treatment, so it travels through the change-approval path identically.

If the thumb upload fails, log and continue — a missing thumb must never block saving a service.

- [ ] **Step 8: Backfill thumbs for the seeded tree**

Task 1 seeded `catalog_image_url` only — the thumb column did not exist yet. Extend
`scratchpad/seed_service_tree.py` with a `--thumbs-only` mode that, for every seeded service holding
a `catalog_image_url`, uploads a 200 px derivative to `thumbPathFor(id)` and sets
`catalog_thumb_url`. Run it.

Without this, Task 3's RPC returns `thumb_url = NULL` for every row and Task 4's image tests pass
vacuously.

Verify: `SELECT count(*) FROM services WHERE catalog_thumb_url IS NOT NULL` returns ~15.

- [ ] **Step 9: Operator check**

Hand to the operator: edit a service, upload a photo, save, confirm both objects exist in the bucket and both columns are populated. Wait for confirmation.

- [ ] **Step 10: Commit**

---

### Task 3: Server-side service search

**Files:**
- Create: `supabase/migrations/<ts>_rpc_search_services.sql`
- Create: `src/hooks/useServiceSearch.ts`
- Modify: `src/lib/queryKeys.ts` (`services` block, ~line 475)

**Depends on:** Task 2 — the RPC returns `services.catalog_thumb_url`, which Task 2 creates.

**Interfaces:**
- Produces: RPC `rpc_search_services(p_query text, p_tree_type text, p_division_slugs text[], p_limit int DEFAULT 50)` returning `(id uuid, name_en text, name_ar text, path text[], price numeric, emergency_price numeric, duration int, division text[], thumb_url text, is_leaf boolean)`, where `thumb_url` is `services.catalog_thumb_url` and is NULL for a service with no photo.
- Produces: `queryKeys.services.search(query, treeType, divisionSlugs)`; `useServiceSearch(query, treeType, divisionSlugs): UseQueryResult<ServiceSearchHit[]>` with the row type exported from the hook file:

```ts
export interface ServiceSearchHit {
  id: string
  name_en: string
  name_ar: string | null
  path: string[]              // root → leaf breadcrumb
  price: number | null
  emergency_price: number | null
  duration: number | null
  division: string[] | null
  thumb_url: string | null
  is_leaf: boolean
}
```

`ServiceSearchHit` is a superset of Task 4's `PickedService` in every field the latter declares, so a hit converts to one without a lookup — Task 4 and Task 5 rely on that.

- [ ] **Step 1: Write the migration**

Two indexes: `CREATE EXTENSION IF NOT EXISTS pg_trgm;` then GIN trigram indexes on `services.name_en` and `services.name_ar`.

`rpc_search_services` is `STABLE SECURITY DEFINER SET search_path TO 'public'`. It filters `deleted_at IS NULL`, `status='active'`, `tree_type = p_tree_type`, and — when `p_division_slugs` is non-empty — `division && p_division_slugs`. Matching is case-insensitive substring on either name. `path` is the root→leaf breadcrumb built by a recursive CTE walking `parent_id` **in the RPC**, not client-side. `is_leaf` is `NOT EXISTS (SELECT 1 FROM services c WHERE c.parent_id = s.id AND c.deleted_at IS NULL)`. Order exact-prefix matches first, then by `name_en`. Apply `LIMIT p_limit`.

Branches are returned as well as leaves — Review Focus #4 needs them visible and marked.

- [ ] **Step 2: Apply to Dev**

- [ ] **Step 3: Prove it in a rolled-back probe against the seeded tree**

Assert: a query matching the two `Cleaning` leaves returns **both**, with **different** `path` arrays (Review Focus #2); a branch node comes back with `is_leaf = false`; a six-level leaf returns a `path` of length 6; the division filter excludes a service tagged only to another division.

- [ ] **Step 4: Add the query key and the hook**

`useServiceSearch` is disabled while `query.trim().length < 2`, has `staleTime: 60_000`, and passes `p_limit: 50`.

- [ ] **Step 5: Commit**

---

### Task 4: `ServicePickerPanel`

**Files:**
- Create: `src/components/services/ServicePickerPanel.tsx`
- Create: `src/components/services/__tests__/ServicePickerPanel.test.tsx`

**Interfaces:**
- Consumes: `useServiceSearch` (Task 3), `useServiceTree` (existing).
- Produces:
```ts
/** Structurally identical to the old CascadePickedService; the panel owns it now,
 *  because Task 5 deletes ServiceCascadePicker.tsx (pre-flight ruling). */
export interface PickedService {
  id: string; name_en: string; parent_id: string | null
  price: number | null; emergency_price: number | null
  duration: number | null; division: string[] | null
}
export interface BasketLine { service: PickedService; qty: number; pathNames: string[] }
export interface ServicePickerPanelProps {
  onCommit: (lines: BasketLine[]) => void
  treeType?: string            // default 'normal'
  divisionFilters?: string[]   // default []
}
export function ServicePickerPanel(props: ServicePickerPanelProps): JSX.Element
```

- [ ] **Step 1: Write the failing tests**

```tsx
it('focuses the search field on mount')
it('shows each result with its name, breadcrumb path and price')
it('renders no image slot for a service without a photo')   // spec 6.1: collapse
it('adds a leaf to the basket on Enter and keeps the query')
it('does not add a branch to the basket — it drills into its children')  // Review Focus #4
it('accumulates several services and commits them in one onCommit call')
it('commits qty as edited per basket line')
it('shows the breadcrumb for each basket line so two same-named services are distinguishable')
```

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement the panel**

Search field autofocused; results from `useServiceSearch`. A result row shows the thumb (omitted entirely when `thumb_url` is null), name, `path.join(' › ')` muted, and price. Clicking or Entering a **leaf** appends to basket state; a **branch** switches to browse mode rooted at that node. Browse mode reads `useServiceTree` and drills by `parent_id` with no depth constant. The basket lists lines with an editable qty and a running total; one commit button calls `onCommit(lines)`.

Keep the panel free of any dialog chrome — Task 5 supplies that.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

---

### Task 5: `ServicePickerDialog` and wiring the three surfaces

**Files:**
- Create: `src/components/services/ServicePickerDialog.tsx`
- Modify: `src/components/orders/ServiceSelector.tsx`
- Modify: `src/components/team-leader/shared/ServiceCatalogPicker.tsx`

**Interfaces:**
- Consumes: `ServicePickerPanel` (Task 4).
- Produces: `ServicePickerDialog` with the same props as the panel plus `triggerLabel?: string`.

- [ ] **Step 1: Implement the dialog wrapper**

A trigger button opening a dialog containing the panel; committing closes it. Full-screen on mobile, centered card from `md:`, per the responsive rule.

- [ ] **Step 2: Rewire `ServiceSelector`**

Swap `ServiceCascadePicker` for `ServicePickerDialog`, mapping each committed `BasketLine` to an `OrderServiceDraft` with the **same field mapping the file already uses** — `serviceId`, `serviceName`, `path`, `qty`, `price`, `emergencyPrice`, `duration`, `division`, `rootSkillId` — calling `onAdd` once per line. Its own `Props` do not change, so `OrderFormPanel` and `QuotationFormPanel` are untouched.

- [ ] **Step 3: Rewire `ServiceCatalogPicker`**

Render `ServicePickerPanel` **directly, not the dialog** — these four callers (`NormalOrderDialog`, `BackworkDialog`, `FollowUpDialog`, `SiteVisitSingleDialog`) are already full-screen dialogs on mobile, and nesting would stack a modal on a modal. Map each line to an `AddedBillableService` using the existing mapping (`id`, `name`, `path` joined with ` › `, `qty`, `unitPrice`).

- [ ] **Step 4: Delete `ServiceCascadePicker.tsx`**

Verify first: `grep -rn "ServiceCascadePicker" src/` must return nothing outside the file itself.

- [ ] **Step 5: `npx tsc --noEmit` clean**

- [ ] **Step 6: Operator check**

Hand over: add several services to an order in one dialog visit; reach a six-level leaf (impossible today); confirm the quotation form and a team-leader dialog both still add services. Wait for confirmation.

- [ ] **Step 7: Commit**

---

### Task 6: Snapshot the photo onto order and quotation lines

**Files:**
- Create: `supabase/migrations/<ts>_order_and_quotation_line_catalog_image.sql`

**Interfaces:**
- Produces: `order_services.catalog_image_url text`, `order_quotation_line_items.catalog_image_url text`, both nullable; `create_order_with_dates`, `edit_order_with_dates` and `save_order_quotation` resolving the snapshot server-side.

- [ ] **Step 1: Fetch the three live function bodies**

`pg_get_functiondef` for each. Edit that text — the migration files are stale.

- [ ] **Step 2: Write the migration**

Add both columns. Then rewrite each function so its line INSERT also writes `catalog_image_url`, resolved as
`(SELECT s.catalog_image_url FROM public.services s WHERE s.id = NULLIF(v_item->>'service_id','')::uuid)`.

Resolved **from `service_id`, server-side** — the client does not send a URL (spec §6.2-B). Everything else in each body stays verbatim.

- [ ] **Step 3: Apply to Dev**

- [ ] **Step 4: Prove the write path in a rolled-back `DO` block**

Create an order through `create_order_with_dates` with one service that has a photo and one that does not. Assert the first line's `catalog_image_url` matches the service's, the second is NULL, and a line with no `service_id` also gets NULL. Repeat for `save_order_quotation`. Roll back.

- [ ] **Step 5: Confirm the snapshot freezes**

In the same rolled-back block: after creating the order, UPDATE the service's `catalog_image_url` to a different value and re-read the order line. It must still hold the original — this is the operator's snapshot rule.

- [ ] **Step 6: Commit**

---

### Task 7: Snapshot onto invoice lines, and give them a `service_id`

**Files:**
- Create: `supabase/migrations/<ts>_tl_invoice_lines_service_and_image.sql`
- Modify: `src/types/team-leader.ts` (`TlService`, ~line 12)
- Modify: `src/components/team-leader/TlInvoiceDialog.tsx` (line building, ~line 83)

**Interfaces:**
- Produces: `tl_invoice_lines.service_id uuid` (nullable, **no FK**) and `tl_invoice_lines.catalog_image_url text`; `TlService` gains `service_id: string | null`; `create_tl_invoice`'s `p_lines` elements accept an optional `service_id`.

- [ ] **Step 1: Fetch the live `create_tl_invoice` and `get_team_leader_visits` bodies**

- [ ] **Step 2: Write the migration**

Add both columns — `service_id` as a plain `uuid`, no foreign key, with a comment stating why.

Rewrite `get_team_leader_visits` so `services_json`'s `jsonb_build_object` carries `'service_id', os.service_id` alongside the existing `'id', os.id`. It currently exposes only the `order_services` row id, so the client cannot identify the service at all.

Rewrite `create_tl_invoice`'s line insert to take `service_id` and resolve the image, preferring the order line's frozen snapshot and falling back to a live read for team-leader billables that have no order line:

```sql
insert into public.tl_invoice_lines
  (tl_invoice_id, name, qty, unit_price, total, service_id, catalog_image_url)
select v_id, (l->>'name'),
       (l->>'qty')::numeric, (l->>'unit_price')::numeric,
       (l->>'qty')::numeric * (l->>'unit_price')::numeric,
       nullif(l->>'service_id','')::uuid,
       coalesce(
         (select os.catalog_image_url from public.order_services os
           where os.id = nullif(l->>'order_service_id','')::uuid),
         (select s.catalog_image_url from public.services s
           where s.id = nullif(l->>'service_id','')::uuid))
from jsonb_array_elements(p_lines) l;
```

- [ ] **Step 3: Apply to Dev**

- [ ] **Step 4: Prove it in a rolled-back `DO` block**

Assert: a line with `order_service_id` takes the order line's snapshot even when the service's current photo differs; a line with only `service_id` takes the live value; **a line with neither still inserts, with both new columns NULL, and the invoice is created** (Review Focus #3).

- [ ] **Step 5: Thread `service_id` to the client**

Add `service_id: string | null` to `TlService`. In `TlInvoiceDialog`, include `service_id` and `order_service_id` on each visit-service line, and `service_id` on each added-billable line. Money fields are untouched — the server still authors the totals.

- [ ] **Step 6: `npx tsc --noEmit` clean**

- [ ] **Step 7: Operator check**

Hand over: complete a visit and raise an invoice containing both an ordered service and a typed-in billable. Wait for confirmation.

- [ ] **Step 8: Commit**

---

### Task 8: Thumbnails on the invoice and quotation PDFs

**Files:**
- Create: `src/lib/pdf/line-images.ts`
- Create: `src/lib/pdf/__tests__/line-images.test.ts`
- Modify: `src/lib/orders/tl-invoice-pdf-html.ts`, `src/lib/orders/generate-tl-invoice-pdf.ts`
- Modify: `src/lib/quotations/quotation-pdf-html.ts`, `src/lib/quotations/generate-quotation-pdf.ts`
- Modify: `src/lib/pdf/__tests__/page-overflow.test.ts`

**Interfaces:**
- Consumes: `tl_invoice_lines.catalog_image_url`, `service_id` (Task 7); `order_quotation_line_items.catalog_image_url` (Task 6).
- Produces: `fetchLineImages(urls: (string | null)[]): Promise<(string | null)[]>` returning data URIs positionally; `TlInvoiceLineInput` and the quotation line type each gain `imageDataUri: string | null`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('fetchLineImages', () => {
  it('returns data URIs positionally aligned with the input urls')
  it('returns null for a null url without a network call')
  it('returns null for a url that 404s, and does not throw')        // Review Focus #1
  it('returns null for a url that exceeds the timeout, and does not throw')
  it('resolves every other image when one fails')                    // degrade, not block
})

describe('invoice html', () => {
  it('omits the image column entirely when no line has an image')    // Review Focus #5
  it('renders the column for every line when at least one has an image')
  it('renders an empty cell for a line without an image')
  it('sets break-inside: avoid on line rows')
  it('repeats the table header on later pages')
})
```

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement `fetchLineImages`**

`Promise.allSettled` over the distinct URLs with a per-request timeout (`AbortSignal.timeout`); a rejection or non-2xx maps to `null`. Base64-encode successes as data URIs, mirroring `readAsBase64` in `pdf-fonts.ts`. Never throws.

The spec's "fail loudly" was corrected to degrade-not-block (§6.2-C): `send-invoice` already dispatches the customer's message with no PDF when generation throws, so a decorative photo must not be able to trigger that.

- [ ] **Step 4: Render the column**

In both HTML builders, add an IMG `<th>`/`<td>` only when `lines.some(l => l.imageDataUri)`; otherwise emit today's markup unchanged. Cap the rendered thumb with a fixed CSS height. Add `break-inside: avoid` to line rows and move the header row into a `<thead>` so it repeats — both local to these two files; `BASE_CSS` is not touched.

- [ ] **Step 5: Retire the name-string service lookup**

In `generate-tl-invoice-pdf.ts`, replace the `.in('name_en', lineNames)` map keyed on name with a lookup on `l.service_id`, falling back to the old name match only when `service_id` is null (pre-feature rows and typed billables). This fixes Review Focus #2 — today two services named `Cleaning` collide and the invoice can print the wrong Arabic text and unit.

- [ ] **Step 6: Extend the paged-layout test**

Add a case to `page-overflow.test.ts`: a multi-page invoice with thumbnails on every line still reports every line present and never splits a row across a page boundary.

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 8: Operator check**

Generate an invoice PDF with photos, one without any, and a quotation PDF. Confirm the no-photo invoice is unchanged from today. Wait for confirmation.

- [ ] **Step 9: Commit, then update PROGRESS.md, the flow registry, the security audit log and the EOD file**

---

## Notes for the executor

- Task 1 gates everything. Do not start Task 3's probe or Task 4's tests before the tree exists.
- Order: **1 → 2 → 3 → 4 → 5**, strictly, because Task 3's RPC returns the column Task 2 adds and Task 4 renders what Task 3 returns. **6 → 7 → 8** is also strictly sequential.
- **Task 6 is the only one that can run in parallel** with the 2→3→4→5 chain, since it touches only order and quotation RPCs. Task 7 must wait for Task 6 (it reads `order_services.catalog_image_url`).
- Task 1 seeds `catalog_image_url`; the thumbs are backfilled in Task 2 step 8, once the column exists. Skip that step and Task 3 returns `thumb_url = NULL` for every row, which makes Task 4's image tests pass without testing anything.
- After each migration, re-run the Task 6 / Task 7 rolled-back probes; a later `CREATE OR REPLACE` that was built from a stale body will silently revert an earlier change.
- `src/lib/compressImage.ts` is canvas-based and browser-only. Task 2 may use it; Task 8 runs in Node and must not.
