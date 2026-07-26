# Spec — Enum Cleanup Followup, Currency MED/LOW Sweep, Pass 3 Pilot

**Date:** 2026-07-26
**Branch:** `deploy/warehouse-shipping`
**Prerequisites:** Pass 1 (`306ef366`), Pass 2a+2c (`a7f67dc4`), Pass 2b (`0c1c2008`), edit-so currency fix (`daa14776`) already landed.
**Estimated LOC:** ~40–90 depending on Pass 3 column chosen.
**Estimated files touched:** 5–20.

---

## Goal

Land three chunks of finishing work from the enum-conversion effort in one focused sitting:

1. **Cleanup** — retire the misleading sweep report the agent produced this session.
2. **Currency MED/LOW sweep** — eliminate the last enabler of the "everything is QAR" bug class by removing the `formatCurrency` default and fixing whatever the compiler surfaces.
3. **Pass 3 pilot** — take ONE Pass 3 blocker column end-to-end (refactor writers + create native enum + migrate) so we have a proven pattern before tackling the bigger blockers.

Non-goals: sweeping all 28 Pass 3 blockers; introducing a `useBaseCurrency()` hook (queued as follow-up); dropping any of the text columns kept alongside the FK conversions (also follow-up).

---

## Task 1 — Delete outdated sweep report (5 min)

The `EOD/currency-hardcode-sweep.md` file the sweep agent produced in this session was generated from a pattern that flagged every `'QAR'` literal, including the `?? 'QAR'` fallbacks. Commit `3baf0844` (before this session) had already fixed all 18 files listed as HIGH-severity. The report is now misleading — anyone reading it would think 60+ hardcoded `'QAR'` bugs exist when the count is closer to zero.

**Steps:**
1. `git rm EOD/currency-hardcode-sweep.md`.
2. Append a note to `EOD/EOD-2026-07-26.md` recording that the sweep was superseded by `3baf0844`, and that the remaining MED/LOW work is captured in Task 3 of this spec.

**Definition of done:** report deleted, EOD note updated, one commit.

---

## Task 2 — Currency MED/LOW sweep

### Root cause

`src/lib/utils/formatters.ts:3` — `formatCurrency(amount, currency = 'QAR')`. The default argument is what enabled every "hardcoded QAR" bug we already fixed. As long as the default exists, new call sites can silently omit the currency and print QAR for foreign entities.

### Remaining MED/LOW sites from the sweep

These weren't touched by `3baf0844` because they're either dashboards aggregating in base currency (arguably correct) or contexts where the base-currency assumption is baked into logic:

- **Dashboards / reports** — `(dashboard)/page.tsx`, `reports/dashboard/page.tsx`, `reports/product-profitability/page.tsx`, `sales/aging-report/page.tsx`, `purchase/aging-report/page.tsx`, `sales/customer-statement/page.tsx`.
- **Base-currency logic** — landed-costs page (`currency !== 'QAR'` comparisons on lines 245, 685, 834, 873), `PoPaymentDialog`, `SoPaymentDialog` (`showExchangeRate = X.currency !== 'QAR'`), `PaymentSummaryTab.tsx` (`isForeignCurrency = currency !== 'QAR'`).
- **Credit / customer limits** — `CreditUtilizationBar.tsx`, `CreditGroupApprovalsContent.tsx`, `master-data/admin/credit-groups/page.tsx:94`. These are conventionally base currency per project design.

### Approach

1. Remove the `= 'QAR'` default in `src/lib/utils/formatters.ts:3`. Update the signature to require the currency arg.
2. Run `npx tsc --noEmit`. Every remaining silently-defaulting call site becomes a TS error.
3. For each surfaced error, decide by category:
   - **Row has its own currency** → pass `row.currency ?? 'QAR'` (same shape used in the `3baf0844` sweep).
   - **Aggregate in base currency** (dashboards, reports, credit limits) → pass a literal `'QAR'` explicitly. Rename the label alongside if it's still just "$X.XX" — should read as `QAR X.XX` or use the `(QAR)` column-header pattern.
   - **`X.currency !== 'QAR'` predicates** — leave the string literal alone; these encode "is this foreign vs. base?" and the answer depends on comparing to base. We won't introduce a base-currency hook this session — that's queued as separate work.
4. Repeat until `tsc` is clean.

### Definition of done
- `formatCurrency` signature: `formatCurrency(amount: number, currency: string): string`.
- `tsc --noEmit` clean.
- Manual spot-check: dashboard, aging report, credit-groups page each open without runtime errors.
- One commit: `refactor(currency): drop formatCurrency default; require explicit currency arg`.

### Risk
Low. The default-removal surfaces problems at compile time, not runtime. The number of call sites is finite and each fix is a one-liner.

---

## Task 3 — Pass 3 pilot: pick ONE column, end-to-end

### The tradeoff

Pass 3 is 28 columns worth of blocker work catalogued in `EOD/enum-code-impact.md`. Doing them all is a multi-day refactor. Doing one — proven start-to-finish — establishes the pattern (refactor writers → seed vocabulary → migrate → verify), gives us a real time-per-column estimate, and unblocks the rest.

### Candidates (pick one before executing)

Ranked smallest → biggest. Choose based on how much time is available and how visible the win is.

| # | Column | Writer count | Migration difficulty | Visibility | Recommended for |
|---|---|---|---|---|---|
| A | **`po_edit_requests.status`** | 3 sites | Trivial — one text rename (`'declined'` → `'rejected'`) + CREATE TYPE | Low (internal audit) | Warm-up pilot; proves the pattern in <1 hour |
| B | **`stock_adjustments.adjustment_type`** | 1 site | Trivial — add `'set'` to proposed enum, CREATE TYPE | Low | Similar warm-up |
| C | **`inventory_check_log.event_type`** | 6 sites, 6 literal values, 4 mismatches with proposed enum | Small — decide canonical vocab (`initialized`/`user_completed`/`all_counted`/`approval_action` vs `started`/`assignment_completed`/`item_counted`/`submitted`), rewrite the 6 call sites | Low-med | Pilot with a real vocabulary decision |
| D | **`payments.source_type`** | 4 sites, `purchase_order` missing from proposed enum | Small — expand proposed enum to include `purchase_order`, then straight retype | Med (visible in every payment) | Real value + small |
| E | **`credit_note_lines.line_type`** (also `debit_note_lines`) | 4 sites total; values `original`/`returned` vs proposed `product/service/discount/tax/adjustment` | Small — the proposed enum is wrong for the current usage; either abandon the enum for this column or redesign the vocabulary | Med | Requires design call; skip for pilot |
| F | **`notifications.type`** | 8 writers, zero overlap with proposed enum | Big — proposed enum is generic categories (`order`, `contract`, `invoice`, `payment`, `system`), code writes specific event names (`po_approval_requested`, `credit_group_pending`, etc.). Two paths: (i) drop the proposed enum, extend it to the specific vocabulary code uses; (ii) refactor writers to use categories + carry the specific type in `related_type`. | High | Not a pilot — do this after 2+ smaller ones |
| G | **`activity_log.severity`** | already done in Pass 1 | — | — | — |
| H | **`activity_log.action` / `module` / `entity_type`** | 50+ / 30+ / many writers | Huge — vocabulary redesign across every hook that calls `logActivity` | Very high | Not a pilot |

**Recommended pilot: A (`po_edit_requests.status`)** — smallest, safest, and doesn't require any vocabulary redesign. Once done we'll have a real number for "how long does one Pass 3 column take" and can plan the rest.

**Recommended second: D (`payments.source_type`)** if we have time after A + B — the biggest gap in observability across the payment stack.

### Pilot workflow (applies to whichever column we pick)

1. **Vocabulary decision** (Task 3.1). Either the proposed enum stays as-is or we adjust it based on what code actually writes. Document the final list in this spec before writing SQL.
2. **App-side refactor** (Task 3.2). Change all writers to write the canonical values. This lands as its own commit — the app still stores text, unchanged column type, no DB change yet.
3. **User verification** (Task 3.3). Ask user to smoke-test the affected flows on staging. Only proceed to migration after confirmation.
4. **Migration** (Task 3.4). `CREATE TYPE`, pre-flight `SELECT DISTINCT`, drop CHECKs / indexes with text-literal predicates, `ALTER COLUMN TYPE ... USING col::new_enum`, recreate indexes with typed predicates.
5. **Types regen + typecheck** (Task 3.5). Same helper-alias re-append per project convention.
6. **Verification + commit** (Task 3.6).

### Definition of done for the pilot
- Column has a native Postgres enum type.
- App writes only canonical enum values.
- Migration applied cleanly to staging.
- `tsc` clean.
- User confirms the affected screens still work.
- Two commits (refactor + migration), separated so a bad migration can be rolled back independent of the app change.

### Risk

Depends on chosen column. A/B/D are low-risk. C requires a vocabulary decision the user has to make. Anything F+ is out of scope for this spec.

---

## Execution order in one go

1. **Task 1** (delete sweep report) — safe, 5 min. Do first.
2. **Task 3.1** (vocabulary decision) — ask user which column and finalize the enum values. Blocks 3.2.
3. **Task 2** (currency MED/LOW) — do while user is picking the Pass 3 column; if the compiler doesn't surface much, this is 30 min.
4. **Task 3.2 → 3.6** (Pass 3 pilot execution) — the main effort.
5. **PROGRESS.md** entries and EOD note appended after each commit per project rules.

---

## Open questions to resolve before starting execution

1. **Which Pass 3 column?** Recommendation A (`po_edit_requests.status`). Alternatives ranked above.
2. **On the `formatCurrency` default removal — do we require an explicit currency arg everywhere, or a nullable arg that defaults to base via a helper?** The former is stricter (better long-term); the latter is less churn now. Recommendation: strict/required.
3. **`payments.source_type` — expand the enum to include `purchase_order`, or split payment_flow / source_type into two concepts?** Only relevant if D is chosen. Recommendation: expand.

---

## Rollback plan (per commit)

| Commit | Rollback |
|---|---|
| Task 1 delete | `git revert` — trivially safe |
| Task 2 default removal | `git revert` — restores the default; ~zero risk of data corruption |
| Task 3.2 refactor | `git revert` — writers go back to old vocabulary |
| Task 3.4 migration | New migration: `ALTER COLUMN TYPE text USING col::text` + `DROP TYPE`. Reversible because the data itself is preserved (enum labels are strings) |

---

## Estimated total time

- Task 1: 5 minutes
- Task 2: 20–60 minutes (depends on how many `formatCurrency` calls omit the arg)
- Task 3 (pilot A `po_edit_requests.status`): 30–60 minutes
- **Total: ~1–2 hours if the pilot is column A**

Longer if we pick D or C.
