# SO Detail Dialog + Invoice-Detail Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five surgical UI touch-ups on the SO detail dialog and the AR invoice detail page. No DB changes; no backend changes; no behavior changes beyond what's spelled out below. Every task is a code-only edit gated on user QA before commit.

**Architecture context:** The AR invoice module built up header actions ("Attach Payment", "Payment Plan") on the standalone invoice detail page (`InvoiceDetail.tsx`) that never got moved into the SO Detail dialog after that dialog gained a Payments tab and an Invoice tab. Meanwhile the Invoice tab of the SO dialog grew into a full invoice preview (with its own Payment Plan button, PDF/download actions, and — accidentally — the dialog-footer "Cancel SO" button leaking in from the outer scope). The PO side already settled on the right pattern: the Bill tab is a compact list, actions live in the appropriate tab. This plan aligns the SO side.

**Currency-display decision (locked, Task 1):** `avg_cost` is stored in QAR only. When the SO currency selector changes, the Unit Cost cell should stay locked to QAR — always render `QAR 73.54` regardless of SO currency, because cost basis is our accounting truth in QAR. No FX conversion.

**Tech stack:** Next.js 15 App Router, React 18, Tailwind + shadcn/ui, TypeScript strict. No DB migrations. Types stay as-is.

## Global Constraints

- **Commits include both authors:**
  ```
  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```
- **No commits until the user confirms** the change works via the browser.
- **Fresh branch:** work happens on `feature/so-dialog-cleanup` off `feature/purchase-warehouse-core`. The SO/Invoice Parity work on the parent branch is complete and this cleanup is independent — keep the diffs focused.
- **No new files unless a task explicitly requires it.** Every task is an edit of existing files.
- **Impeccable UI rule:** invoke `impeccable` skill judgment on any touched component. Preserve spacing, breakpoint responsiveness, and touch-target sizes (`min-h-11` on mobile).
- **Layout stability:** no shifts when tabs switch, dialogs open, or currency changes. Cells that show `QAR 73.54` and `QAR 0.00` should have identical widths at all times.

---

## File Structure

**Modified (per-task, exact files):**
- Task 1: `src/components/sales/SoLineItemsEditor.tsx` (Unit Cost cell renders in QAR always).
- Task 2: `src/components/sales/InvoiceDetail.tsx` (remove Attach Payment button + `AttachInvoiceDialog` mount + related state).
- Task 3:
  - `src/components/sales/InvoiceDetail.tsx` (remove Payment Plan button + `PaymentPlanDialog` mount + `planOpen` state).
  - `src/components/sales/SoInvoiceTab.tsx` (remove the invoice-scoped Payment Plan button — its purpose is covered by the new Payments-tab entry point, and Task 4 rewrites this file anyway).
  - `src/components/finance/PaymentSummaryTab.tsx` (add the Payment Plan action to this tab's header row, gated on the same conditions the old button used).
- Task 4: `src/components/sales/SoInvoiceTab.tsx` (rewrite to a compact PO-Bill-tab-style list).
- Task 5: `src/components/sales/SoDetailDialog.tsx` (gate Cancel SO button on `activeTab === 'items'`).

**Untouched (do not edit):**
- `src/hooks/useSaleOrders.ts` — currency + exchange_rate persisted here; no change.
- `src/hooks/useCustomerInvoices.ts` — invoice hooks; no change.
- `src/components/finance/AttachInvoiceDialog.tsx` — kept as-is; the button is gone but the dialog / hook may still be referenced from other AR flows.
- `src/components/finance/PaymentPlanDialog.tsx` — same; kept, just wired from a new location.
- `src/components/purchase/PoDetailDialog.tsx` — reference-only for the Bill-tab shape; do not modify.

**No new files.** **No migrations.** **No types regen.**

---

# Task 1: Lock Unit Cost cell to QAR

**Files:**
- Modify: `src/components/sales/SoLineItemsEditor.tsx`

**Interfaces:**
- Consumes: existing `avg_cost: number` (QAR) on the line-item row model.
- Produces: Unit Cost cell always renders `formatCurrency(avg_cost, 'QAR')` regardless of the `currency` prop passed to the editor. Everything else in the row still uses `currency` (sale price, total).

**Rationale:** Cost basis lives in QAR internally (`brand_variants.cost_price`, FIFO layers). Rendering it with the SO currency was misleading — it swapped the symbol without converting the number. Locking to QAR makes the display truthful and stops the visual bug the user reported.

- [ ] **Step 1: Locate the Unit Cost cell**

`src/components/sales/SoLineItemsEditor.tsx` around lines 276-286 renders `formatCurrency(row.avg_cost ?? 0, currency)`. Confirm the surrounding column header is "UNIT COST" (with a padlock icon).

- [ ] **Step 2: Replace the currency argument**

Change:
```tsx
{formatCurrency(row.avg_cost ?? 0, currency)}
```
to:
```tsx
{formatCurrency(row.avg_cost ?? 0, 'QAR')}
```

Do NOT touch any other `formatCurrency(..., currency)` call in the file — sale price, line total, and grand total stay in the SO's chosen currency.

- [ ] **Step 3: Add a lock-tooltip clarifying the reason (optional but recommended)**

If the "UNIT COST" column header already has a padlock icon (per the screenshot it does), add a tooltip: "Cost basis — always in QAR". Reuse the existing tooltip primitive already in the file if one is present. Skip if adding a tooltip would drift the column layout.

- [ ] **Step 4: Typecheck**

```
npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "SoLineItemsEditor" | head -10
```
Expected: no errors from this file.

- [ ] **Step 5: Ask the user to smoke-test**

> "Open Create SO. Add a line item. Switch the SO currency selector (QAR ↔ USD ↔ EUR). The Unit Cost column should stay `QAR 73.54` (or whatever the item's cost is) unchanged. Sale Price and Total should reflect the new currency."

- [ ] **Step 6: Commit after confirmation**

```
git add src/components/sales/SoLineItemsEditor.tsx
git commit -m "$(cat <<'EOF'
fix(sales): lock SO line-item Unit Cost display to QAR

The unit cost cell was rendering `formatCurrency(avg_cost, currency)`
where currency was the SO's chosen currency (USD, EUR, etc.), while
avg_cost is stored only in QAR (from brand_variants.cost_price and
FIFO layers). Result: the symbol changed but the number didn't, so
"QAR 73.54" became "$73.54" without any FX conversion — a lie.

Cost basis is accounting truth in QAR. Lock the cell to QAR regardless
of SO currency. Sale price + total continue to render in the SO
currency as before.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

# Task 2: Remove "Attach Payment" from invoice detail

**Files:**
- Modify: `src/components/sales/InvoiceDetail.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: the invoice detail page header no longer offers "Attach Payment". Users record payments via the SO dialog's Payments tab like every other AR flow. `AttachInvoiceDialog` and `useAttachPaymentToInvoice` are NOT deleted — they may be referenced from other flows; leaving the component untouched is safer.

- [ ] **Step 1: Remove the button + dialog mount + state**

In `src/components/sales/InvoiceDetail.tsx` (~lines 160-179):
- Delete the `<Button>` that opens the attach dialog (label "Attach Payment").
- Delete the `<AttachInvoiceDialog ... />` mount below it.
- Delete the `const [attachOpen, setAttachOpen] = useState(false)` line.
- Delete the `import { AttachInvoiceDialog } from ...` line if it becomes unused.
- Delete the `useUnlinkedIncomingPayments` import + its call if only used by the attach-disabled check.

- [ ] **Step 2: Verify no orphan disabled-state check remains**

Grep for `unlinkedPaymentsCount`, `hasUnlinked`, or any variable that was only used to gate the button's disabled state. Delete them if unused.

- [ ] **Step 3: Typecheck**

```
npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "InvoiceDetail" | head -10
```

- [ ] **Step 4: Ask the user to smoke-test**

> "Open any invoice detail page. There should be no 'Attach Payment' button anywhere in the header. Payment Plan, Refresh, and Open PDF are still there for now (Payment Plan goes away in the next task)."

- [ ] **Step 5: Commit after confirmation** (see the standard commit template above)

---

# Task 3: Move "Payment Plan" to the SO Payments tab

**Files:**
- Modify: `src/components/sales/InvoiceDetail.tsx` (remove).
- Modify: `src/components/sales/SoInvoiceTab.tsx` (remove — Task 4 rewrites this file anyway, but for clarity land the removal here).
- Modify: `src/components/finance/PaymentSummaryTab.tsx` (add).

**Interfaces:**
- Consumes: existing `PaymentPlanDialog` (unchanged), existing SO context available to `PaymentSummaryTab`.
- Produces: "Set Up Payment Plan" button appears in the header of the Payments tab within the SO Detail dialog, gated on the same conditions the old button used: the invoice is a credit invoice, has an outstanding balance, and no existing plan.

- [ ] **Step 1: Remove the Payment Plan button from `InvoiceDetail.tsx`**

Delete lines 180-184 (`<Button>` that opens `PaymentPlanDialog`) + its `PaymentPlanDialog` mount + `const [planOpen, setPlanOpen] = useState(false)`. Remove the import if it becomes unused.

- [ ] **Step 2: Remove the invoice-scoped Payment Plan button from `SoInvoiceTab.tsx`**

Delete lines 199-206 ("Set Up Payment Plan" button block). Task 4 rewrites the whole file, so this may be superseded — but doing the removal here first keeps the plan reviewable in isolation.

- [ ] **Step 3: Add the Payment Plan button to `PaymentSummaryTab.tsx`**

Locate the tab's header row (the same row that likely holds a "Record Payment" button or a title). Add a "Set Up Payment Plan" button next to the existing actions.

Gate its visibility on the same conditions the removed buttons used — the reviewer should confirm the conditions match by comparing the removed code against the added code. Typical conditions (from the old code):
- Invoice's `invoice_type = 'credit'` (not a cash invoice).
- Invoice's `payment_status IN ('unpaid', 'partially_paid')`.
- No existing payment plan for this invoice.

Wire the click handler to open the same `PaymentPlanDialog` component that used to be mounted in `InvoiceDetail.tsx`. Import it fresh — it's unchanged.

- [ ] **Step 4: Typecheck**

```
npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "InvoiceDetail|SoInvoiceTab|PaymentSummaryTab" | head -20
```

- [ ] **Step 5: Ask the user to smoke-test**

> "Open the invoice detail page — no 'Payment Plan' button. Open an SO dialog → Payments tab — 'Set Up Payment Plan' button appears when the invoice qualifies (credit invoice with outstanding balance and no existing plan). Clicking it opens the same dialog as before."

- [ ] **Step 6: Commit after confirmation**

Commit message note: this ships together with Task 2 for a coherent "AR header cleanup" story, OR as a separate commit — controller decides based on how QA plays out.

---

# Task 4: Rewrite SO Invoice tab to match the PO Bill tab shape

**Files:**
- Modify: `src/components/sales/SoInvoiceTab.tsx` (full rewrite).

**Interfaces:**
- Consumes: same props the current tab consumes (SO id, invoice list from a hook — verify by reading the current file first).
- Produces: a compact list identical in shape to the PO Bill tab: table with columns `Invoice #`, `Issued`, `Due`, `Status`, `Payment`, `Amount`, `Paid`. Each row is clickable and links to `/sales/invoices/[id]`. No inline PDF preview, no per-invoice action buttons.

**Reference:** `src/components/purchase/PoDetailDialog.tsx:560-` (Bill tab section). Copy its layout verbatim, adjusting only column names and the row-link target.

**Note:** Since Task 4 of the SO/Invoice Parity module enforced 1 SO = 1 invoice at the DB level (`UNIQUE(sale_order_id)`), this list will have 0 or 1 rows. That's fine — the pattern still applies and stays consistent with the PO Bill tab which supports N rows.

- [ ] **Step 1: Read both files side-by-side before writing**

- Read `src/components/purchase/PoDetailDialog.tsx:560-...` (Bill tab section — probably ~40-80 lines).
- Read `src/components/sales/SoInvoiceTab.tsx` (full file).

Note the exact prop signature the tab exposes, what hook it uses to fetch invoice data, and how empty state (no invoices) is handled in the PO Bill tab.

- [ ] **Step 2: Write the new tab body**

Replace the file's contents with a compact table view:
- Header: invoice count + total (mirror the PO Bill tab's header format).
- Table with the columns listed above.
- Rows link to `/sales/invoices/[id]` — use Next's `<Link>` component matching the PO Bill tab's link pattern.
- Empty state: same "No invoice yet" pattern the PO Bill tab uses for its "No bills yet".
- No `InvoicePdfButton`, no "Send" button, no "Set Up Payment Plan" button, no "Cancel SO" button — those responsibilities have moved elsewhere or been removed.

Column formatters:
- Amount → `formatCurrency(invoice.total_amount, invoice.currency ?? 'QAR')`.
- Paid → `formatCurrency(invoice.paid_amount, invoice.currency ?? 'QAR')`.
- Issued / Due → `formatDate(invoice.issued_date)` / `formatDate(invoice.due_date)`.
- Status / Payment → reuse existing badge components (search `SoInvoiceTab.tsx` for `<Badge>` and keep the same visual chips).

- [ ] **Step 3: Preserve responsive behavior**

The PO Bill tab uses column hiding on small screens (`hidden md:table-cell`, `hidden lg:table-cell`). Copy the same breakpoints — no more visible columns on mobile than the PO Bill tab exposes.

- [ ] **Step 4: Typecheck**

```
npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "SoInvoiceTab" | head -10
```

- [ ] **Step 5: Ask the user to smoke-test**

> "Open an SO with a generated invoice → Invoice tab now shows a compact one-row list matching the PO's Bill tab layout. Click the row → opens `/sales/invoices/[id]`. No View PDF, no Download, no Cancel SO, no Set Up Payment Plan buttons in the tab. Open an SO without an invoice — empty-state message like the PO Bill tab's."

- [ ] **Step 6: Commit after confirmation**

---

# Task 5: Gate Cancel SO to the main tab only

**Files:**
- Modify: `src/components/sales/SoDetailDialog.tsx`

**Interfaces:**
- Consumes: existing `activeTab` state in the dialog.
- Produces: the Cancel SO button (currently visible on every tab because it sits in the dialog footer outside the `<Tabs>` block) now only renders when `activeTab === 'items'`.

- [ ] **Step 1: Locate the button**

`src/components/sales/SoDetailDialog.tsx` lines 427-437. Verify the button lives inside the footer div at line 426 and is currently unconditional.

- [ ] **Step 2: Add the gate**

Mirror the pattern at line 443 (`canDeliver && activeTab === 'deliveries'`). Add `activeTab === 'items' &&` to the Cancel SO button's visibility condition. Preserve any existing conditions (e.g. `canCancelSo && activeTab === 'items' && …`).

- [ ] **Step 3: Verify no other footer button gained the same over-visibility**

Look at every button in that footer div — each should be gated on the tab it belongs to, or clearly meant to appear on all tabs (like a Close button). Report any inconsistencies but do NOT fix them in this task — that's separate scope.

- [ ] **Step 4: Typecheck + smoke-test**

```
npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "SoDetailDialog" | head
```

> "Open an SO detail dialog. Switch to Payments, Deliveries, Invoice, Activity tabs — Cancel SO button should be hidden on each. Return to the Items tab — Cancel SO reappears (assuming the SO is cancellable)."

- [ ] **Step 5: Commit after confirmation**

---

# Task 6: Exchange Rate input + FX-aware totals for non-QAR SOs

**Files:**
- Modify: `src/app/(dashboard)/sales/create-so/page.tsx`
- Modify: `src/app/(dashboard)/sales/edit-so/[id]/page.tsx`
- Optionally: `src/components/sales/SoLineItemsEditor.tsx` (for the per-row QAR-equivalent subtitle, if we choose to render one)

**Interfaces:**
- Consumes: existing `currency` + `exchange_rate` fields on the SO payload (`useSaleOrders.ts:84-85`).
- Produces: when SO currency ≠ QAR, an "Exchange Rate" input is required. The rate is captured, used to compute `totalQar` correctly on submit, and — optionally — shown as a small QAR-equivalent subtitle beneath the SO Total in the header. Line items still display Sale Price + Line Total in the SO currency (single-currency row from the user's point of view); Unit Cost stays in QAR (per Task 1).

**Rationale:** Today `create-so/page.tsx:77` hardcodes `const exchangeRate = 1`. That means:
- Every non-QAR SO is stored with `exchange_rate = 1` in the DB — false data for accounting reports that later read `exchange_rate` to reconcile QAR-equivalents.
- The margin-comparison logic (`avg_cost > sale_price`) treats a `100 QAR` cost as equivalent to `100 USD` — false negatives and false positives on the "Negative margin" badge.
- There's no visibility of the QAR-equivalent anywhere in the UI when the SO is in USD/EUR/etc.

The user needs to capture the day's rate at SO creation (real-world FX-locking practice) so the SO row is a self-contained record of what was agreed.

**Rate convention (locked):** `exchange_rate` = QAR per 1 unit of SO currency. Example: SO in USD with rate `3.64` means 1 USD = 3.64 QAR. To convert USD → QAR: `usd * exchange_rate`. To convert QAR → USD: `qar / exchange_rate`. This matches how `payments.exchange_rate` is used in the AP/AR flows already (`PaymentSummaryTab.tsx:34`).

- [ ] **Step 1: Replace the hardcoded `exchangeRate = 1` with a stateful input**

In `src/app/(dashboard)/sales/create-so/page.tsx`:
- Remove `const exchangeRate = 1`.
- Add `const [exchangeRate, setExchangeRate] = useState<number | ''>(currency === 'QAR' ? 1 : '')`.
- Add an effect: when `currency` changes to `'QAR'`, force `exchangeRate = 1`. When it changes away from QAR, reset to `''` so the user must enter a value.

- [ ] **Step 2: Render the input**

Directly beneath (or beside) the Currency selector — same row on `md:+` breakpoints, stacked on mobile.

```tsx
{currency !== 'QAR' && (
  <div className="space-y-1">
    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
      Exchange Rate <span className="text-destructive">*</span>{' '}
      <span className="text-muted-foreground/70 normal-case">(1 {currency} = ? QAR)</span>
    </label>
    <Input
      type="number"
      min={0}
      step="0.0001"
      className="h-9 text-sm"
      placeholder="e.g. 3.64"
      value={exchangeRate === '' ? '' : exchangeRate}
      onChange={(e) => {
        const v = e.target.value
        setExchangeRate(v === '' ? '' : Number(v))
      }}
    />
  </div>
)}
```

Layout: reuse the same grid the Currency selector sits in. If it uses a single-column layout, the exchange-rate input can sit as its next child.

- [ ] **Step 3: Gate the "Confirm SO" (or Save) button on a valid rate**

The submit button should be `disabled` when `currency !== 'QAR' && (exchangeRate === '' || Number(exchangeRate) <= 0)`. Add a tooltip / helper text: "Enter exchange rate to continue".

- [ ] **Step 4: Fix `totalQar`**

Line ~100 currently: `const totalQar = total * (exchangeRate || 1)`. Keep the shape (that's already the right formula given the rate convention). The bug was that `exchangeRate` was hardcoded to 1; once it's a real user value, `totalQar` becomes correct automatically.

- [ ] **Step 5: Show QAR-equivalent subtitle beneath the SO Total (header + footer)**

In the header (near `<SubtotalCard>`) and the footer Total field: when `currency !== 'QAR' && exchangeRate > 0`, render a small line like:
```
$1,000.00
≈ QAR 3,640.00
```
Use `text-xs text-muted-foreground` for the QAR line. This gives the user visibility into what will actually be recorded in QAR.

- [ ] **Step 6: Optional — per-line QAR-equivalent subtitle**

If it fits without shifting the line-item row layout, add a small `text-[10px] text-muted-foreground` below the Line Total showing `≈ QAR {formatCurrency(line_total * exchangeRate, 'QAR')}`. Skip if it causes any breakpoint issues; the header/footer subtitle covers the visibility need.

- [ ] **Step 7: Mirror the change in `edit-so/[id]/page.tsx`**

Same input, same gating, same submit logic. Pre-fill `exchangeRate` from the loaded SO's `exchange_rate` field.

- [ ] **Step 8: Typecheck + smoke-test**

```
npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "create-so|edit-so" | head
```

> "Create a new SO. Leave currency = QAR — no Exchange Rate field. Switch to USD — Exchange Rate input appears, is required, Confirm button disabled until you enter a value. Enter 3.64 and $200 sale price — SO Total shows `$1,000.00` with a `≈ QAR 3,640.00` subtitle. Edit an existing USD SO — the previously-saved rate is pre-filled."

- [ ] **Step 9: Commit after confirmation**

```
git add "src/app/(dashboard)/sales/create-so/page.tsx" \
        "src/app/(dashboard)/sales/edit-so/[id]/page.tsx" \
        src/components/sales/SoLineItemsEditor.tsx
git commit -m "$(cat <<'EOF'
feat(sales): require exchange rate on non-QAR SOs; show QAR-equivalent

exchangeRate was hardcoded to 1 in create-so/page.tsx:77. Every non-QAR
SO was persisted with exchange_rate=1 in the DB — accounting reports
that read that field couldn't reconcile QAR-equivalents, and the
margin-comparison logic (avg_cost QAR vs sale_price in SO currency)
was silently wrong for every foreign-currency line.

Now:
- Exchange Rate input appears when currency ≠ QAR. Required — Confirm
  button disabled until it's positive. Rate convention: QAR per 1 unit
  of the SO's currency (matches payments.exchange_rate).
- SO Total renders "$1,000.00" with "≈ QAR 3,640.00" subtitle so users
  can see what will land in the DB as totalQar.
- edit-so pre-fills from the saved rate.

Line items still display Sale Price + Line Total in the SO currency.
Unit Cost stays locked to QAR (per Task 1 of this plan).

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

# Testing Strategy

No test infrastructure exists for these components. Manual smoke suite per task, gated by user confirmation:

**Task 1:** Create SO → switch currency → confirm Unit Cost stays "QAR X.XX".
**Task 2:** Open invoice → confirm no Attach Payment button.
**Task 3:** Open invoice → confirm no Payment Plan button; open SO dialog → Payments tab → confirm Payment Plan button appears and works.
**Task 4:** Open SO with invoice → Invoice tab → confirm compact list, no inline preview, row links to standalone page; open SO without invoice → confirm empty state.
**Task 5:** Cycle tabs in SO dialog → confirm Cancel SO only on Items tab.

Cross-cutting:
- Open a Telelink invoice — confirm nothing regressed (Telelink UI untouched).
- Open a PO Bill tab — confirm nothing changed there either (reference-only file).

---

# Risks & Rollback

| Risk | Mitigation |
|---|---|
| Task 3's gating logic in `PaymentSummaryTab` diverges subtly from the old `InvoiceDetail` conditions and the button appears when it shouldn't (or hides when it should). | Review both code paths side-by-side before writing; copy the conditions verbatim, not from memory. Verify with 3 SOs in staging: paid, partially paid, and cash-invoice cases. |
| Task 4's list view uses a hook or type shape the SO Invoice tab didn't already have. | Read the current `SoInvoiceTab.tsx` first — reuse its existing invoice-fetching hook. Only add new columns; don't add new data dependencies. |
| Task 5's gate accidentally hides Cancel SO on the Items tab too. | Explicit `activeTab === 'items'` (positive gate) not `activeTab !== 'invoice'` (negative — misses future tabs). |
| Impeccable review flags a design regression (e.g., column widths shift, empty-state layout drifts). | Invoke `impeccable polish` on each touched component before commit. |

**Rollback per task:** `git revert` the commit. All changes are code-only, no DB or type changes to unwind.

---

# Self-Review Checklist

- ✅ **Spec coverage:** Currency lock (Task 1), Attach Payment removal (Task 2), Payment Plan relocation (Task 3), Invoice tab rewrite (Task 4), Cancel SO gate (Task 5). All five items from the user's list accounted for.
- ✅ **No DB changes:** confirmed. No migrations, no types regen.
- ✅ **Branch strategy:** fresh `feature/so-dialog-cleanup` off `feature/purchase-warehouse-core`.
- ✅ **Reference sources:** PO Bill tab named as reference for Task 4; existing dialogs named as reference for Task 3.
- ✅ **Commit gate:** every task waits for user QA before commit.
- ✅ **File count:** 5 files modified, 0 created, 0 deleted.

---

# Execution Handoff

Plan complete. Two execution options:

1. **Subagent-driven** — fresh subagent per task with the constraint "no background tasks, everything synchronous." Recent Sonnet subagents in this session have failed the reporting step twice due to background-task misuse; either dispatch with tighter guardrails or fall back to (2).
2. **Inline execution** — same rhythm as SO/Invoice Parity Tasks 3-6; controller executes each task in-turn, user confirms, controller commits.

The five tasks are independent and can be tackled in any order, but Task 4 (Invoice tab rewrite) supersedes Task 3's `SoInvoiceTab.tsx` removal — do Task 3 before Task 4, or fold the removal into Task 4's rewrite.
