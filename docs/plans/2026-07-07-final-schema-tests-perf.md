# Final Schema + Purchase/Warehouse Test Suite + Perf Audit — Implementation Plan

**Goal:** Deliver three things: (1) one idempotent SQL file that spins up a working DB on a fresh Supabase project with no RPC/grant errors, (2) an Excel workbook of executable test cases for the Purchase + Warehouse module, (3) a response-time audit of the app with fixes committed.

**Architecture:** All three phases are independent deliverables but must be done in order — the test-case and perf phases both assume a working DB. Phase 1 rebuilds a single consolidated schema from the 110 existing migrations, fixing the 68 missing `GRANT EXECUTE` statements and the 7 functions that never made it into the baseline. Phase 2 walks every Purchase/Warehouse screen and captures concrete test inputs into an `.xlsx`. Phase 3 reads every list query, RPC, and realtime channel touched by those screens and fixes the slow ones.

**Tech Stack:** PostgreSQL 15 (Supabase), TypeScript/Next.js 15 (App Router), TanStack Query, Supabase Realtime, `xlsx` npm library (for the workbook), `psql` / `supabase db push` for schema apply.

---

## Scope & Non-Goals

**In scope:**
- Consolidate every migration under `supabase/migrations/*.sql` into ONE runnable file `database/final_schema.sql`.
- Include every function, trigger, index, RLS policy, grant, and seed row needed for the app to boot on a fresh DB.
- Test cases cover: PO create/edit/approve, Receival, Bills, Payments, Debit Notes, Returns, Shipments, Landed Costs, Warehouses, Stock Adjustments, Transfers, Aging Report, Dead Stock.
- Perf audit covers: N+1 queries, missing indexes on FKs, `select('*')` on lists, unpaginated reads, over-eager realtime channels, `useEffect` refetch storms.

**Out of scope:**
- Sales / Master Data / Contact Centre / Contracts test cases (separate future phase).
- Migrating existing data from the current DB — this schema targets a **fresh** database only.
- New features. This is consolidation + testing + tuning only.

---

## File Structure

**Phase 1 — Schema files:**
- Create: `database/final_schema.sql` — the one runnable file
- Create: `database/README.md` — how to run it (in `database/`, not repo root)
- Create: `scripts/build_final_schema.mjs` — the merger script that reads all migrations, dedupes, and writes `database/final_schema.sql`
- Modify: `.gitignore` — untrack `check_functions.sh`, `check_grants.sh`, `final_check.sh`, `missing_funcs.txt`, `summary.txt`, `verify_grants.sh` (currently loose in repo root; move under `scripts/legacy/` or delete)

**Phase 2 — Test-case workbook:**
- Create: `docs/test-cases/Purchase_Warehouse_Tests.xlsx` — the workbook
- Create: `scripts/build_test_workbook.mjs` — script that generates the workbook from a JSON spec (regeneratable)
- Create: `scripts/test-cases/purchase_warehouse_spec.json` — the source of truth for what goes in each sheet

**Phase 3 — Perf audit:**
- Create: `docs/response-time-audit-2026-07-07.md` — findings report
- Modify: individual files across `src/app/(dashboard)/purchase/**`, `src/app/(dashboard)/master-data/admin/warehouses/**`, `src/hooks/**` — indexes added to `final_schema.sql`, `.limit()` / `.select(cols)` fixes, realtime channel narrowing

---

## Phase 1 — Final Consolidated DB Schema

### Task 1: Inventory every migration file

**Files:**
- Read: `supabase/migrations/*.sql` (all 110)
- Create: `scripts/build_final_schema.mjs`

- [ ] **Step 1: Write a Node script that reads every `.sql` file under `supabase/migrations/`, sorts by filename (which is timestamp-ordered), and prints per-file:** number of `CREATE TABLE`, `CREATE FUNCTION`, `CREATE POLICY`, `GRANT` statements found. Just inventory — no output SQL yet.

```javascript
// scripts/build_final_schema.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/migrations';
const files = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();

const counts = files.map(f => {
  const sql = readFileSync(join(DIR, f), 'utf8');
  return {
    file: f,
    tables: (sql.match(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+/gi) || []).length,
    functions: (sql.match(/CREATE(?:\s+OR REPLACE)?\s+FUNCTION/gi) || []).length,
    policies: (sql.match(/CREATE POLICY/gi) || []).length,
    grants: (sql.match(/^GRANT\s/gim) || []).length,
  };
});
console.table(counts);
console.log('TOTAL:', counts.reduce((a, c) => ({
  tables: a.tables + c.tables,
  functions: a.functions + c.functions,
  policies: a.policies + c.policies,
  grants: a.grants + c.grants,
}), { tables: 0, functions: 0, policies: 0, grants: 0 }));
```

- [ ] **Step 2: Run it and record output**

Run: `node scripts/build_final_schema.mjs`
Expected: prints a table of 110 rows and a TOTAL line. Save the totals — they're the sanity check for later.

- [ ] **Step 3: Commit the inventory script**

```bash
git add scripts/build_final_schema.mjs
git commit -m "$(cat <<'EOF'
chore(schema): add migration inventory script (phase 1 of consolidation)

Counts CREATE TABLE / FUNCTION / POLICY / GRANT statements across every
migration file. Baseline for building the final consolidated schema.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Extend the script to detect duplicates and grant gaps

**Files:**
- Modify: `scripts/build_final_schema.mjs`

- [ ] **Step 1: Extract each `CREATE FUNCTION public.<name>` occurrence and its signature.** For each function name, record how many times it appears (each `CREATE OR REPLACE` is a legitimate re-declaration — the last one wins). Then list every function that has NO matching `GRANT EXECUTE ON FUNCTION public.<name>` anywhere in the migration set.

```javascript
function extractFunctionNames(sql) {
  const re = /CREATE(?:\s+OR REPLACE)?\s+FUNCTION\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(/gi;
  const names = new Set();
  let m;
  while ((m = re.exec(sql)) !== null) names.add(m[1]);
  return names;
}
function extractGrantedFunctions(sql) {
  const re = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.([a-zA-Z0-9_]+)/gi;
  const names = new Set();
  let m;
  while ((m = re.exec(sql)) !== null) names.add(m[1]);
  return names;
}
// Merge all files, then compute createdButNotGranted = created \ granted
```

- [ ] **Step 2: Run and verify the ungranted list matches what's already in `missing_funcs.txt` + `summary.txt`.**

Run: `node scripts/build_final_schema.mjs --report`
Expected: prints ~68–75 function names, matching the untracked `summary.txt` list. Any new names not in `summary.txt` are legitimate discoveries — record them.

- [ ] **Step 3: Commit**

```bash
git add scripts/build_final_schema.mjs
git commit -m "$(cat <<'EOF'
chore(schema): detect functions missing GRANT EXECUTE

Extends the merger script with a --report mode that lists every
CREATE FUNCTION without a matching GRANT anywhere in the migration set.
Reproduces the 68 gaps flagged in the previous manual audit.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Build the merger — extensions, types, tables

**Files:**
- Modify: `scripts/build_final_schema.mjs`
- Create: `database/final_schema.sql` (first pass, tables only)

- [ ] **Step 1: Add a `--build` mode to the script.** In build mode: concatenate every migration in filename order into a single output, but WRAP the whole file with a preamble:

```sql
-- Auto-generated: database/final_schema.sql
-- Source: supabase/migrations/*.sql (concatenated + patched)
-- Generated: <ISO timestamp>
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS.

BEGIN;

SET client_min_messages = warning;
SET statement_timeout = 0;
SET lock_timeout = 0;

-- === EXTENSIONS ===
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
-- (extract every CREATE EXTENSION from migrations, dedupe by name, emit here)
```

- [ ] **Step 2: For every `CREATE TABLE` in the merged output that lacks `IF NOT EXISTS`, patch it in.**

```javascript
// In build mode:
merged = merged.replace(
  /CREATE TABLE(?!\s+IF NOT EXISTS)/gi,
  'CREATE TABLE IF NOT EXISTS'
);
```

- [ ] **Step 3: Do the same for `CREATE TYPE … AS ENUM`.** Postgres has no `IF NOT EXISTS` for `CREATE TYPE`, so wrap each in a `DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN NULL; END $$;` block via regex.

```javascript
merged = merged.replace(
  /CREATE TYPE\s+(?:public\.)?([a-zA-Z0-9_]+)\s+AS\s+ENUM\s*\(([^)]+)\);/gi,
  (_, name, values) =>
    `DO $$ BEGIN CREATE TYPE public.${name} AS ENUM (${values}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
);
```

- [ ] **Step 4: Run the build, verify `database/final_schema.sql` is generated.**

Run: `node scripts/build_final_schema.mjs --build`
Expected: `database/final_schema.sql` exists, is roughly 700KB–1MB, starts with the preamble above.

- [ ] **Step 5: Commit**

```bash
git add scripts/build_final_schema.mjs database/final_schema.sql
git commit -m "$(cat <<'EOF'
feat(schema): build final consolidated schema — extensions, types, tables

First pass of the merger: emits a single idempotent SQL file from all
110 migrations. Extensions, enums, and tables are wrapped for safe re-run.
Functions/policies/grants come in subsequent tasks.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Merge functions with CREATE OR REPLACE

**Files:**
- Modify: `scripts/build_final_schema.mjs`
- Modify: `database/final_schema.sql`

- [ ] **Step 1: Patch every `CREATE FUNCTION` to `CREATE OR REPLACE FUNCTION`.**

```javascript
merged = merged.replace(
  /CREATE FUNCTION(?!\s+OR REPLACE)/gi,
  'CREATE OR REPLACE FUNCTION'
);
```

- [ ] **Step 2: Detect when two migrations both define `public.foo(…)` with different bodies.** For each function name, keep only the LAST occurrence (later migrations override earlier). Emit a `-- SUPERSEDED BY <later-file>` comment in place of the older ones.

```javascript
// Walk merged SQL; for each function block, record the file it came from.
// If the same function name appears in a later file, drop the earlier block
// and replace with a comment marker.
```

- [ ] **Step 3: Do the same for triggers** (`CREATE TRIGGER` — Postgres accepts `CREATE OR REPLACE TRIGGER` on PG 14+, which Supabase runs).

- [ ] **Step 4: Rebuild and confirm no duplicate function definitions**

Run: `node scripts/build_final_schema.mjs --build && grep -c "^CREATE OR REPLACE FUNCTION" database/final_schema.sql`
Expected: prints a number equal to the count of unique function names from Task 2.

- [ ] **Step 5: Commit**

```bash
git add scripts/build_final_schema.mjs database/final_schema.sql
git commit -m "$(cat <<'EOF'
feat(schema): dedupe functions/triggers in consolidated schema

Later CREATE FUNCTION definitions supersede earlier ones. Every function
now emits as CREATE OR REPLACE. Triggers same pattern. Ready for the
grants pass.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Backfill the 68 missing GRANT EXECUTE statements

**Files:**
- Modify: `scripts/build_final_schema.mjs`
- Modify: `database/final_schema.sql`

- [ ] **Step 1: At the end of the output SQL, before `COMMIT`, emit a `-- === GRANTS ===` block.** For every function detected in Task 2's ungranted list, emit:

```sql
-- === GRANTS (backfilled — these were missing from source migrations) ===
GRANT EXECUTE ON FUNCTION public.action_stock_adjustment_step(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_workflow_step(...) TO authenticated;
-- … all 68 …
```

The signature must match what's declared in the merged file. Read each function's argument list from its `CREATE OR REPLACE FUNCTION` line and use it here — Postgres requires exact argument types on `GRANT EXECUTE`.

- [ ] **Step 2: For functions that already have their own GRANT statements later in the file, skip the backfill for them.** The check: is `GRANT EXECUTE ON FUNCTION public.<name>` present anywhere in the current merged output?

- [ ] **Step 3: Rebuild and grep-verify**

Run: `node scripts/build_final_schema.mjs --build && grep -c "^GRANT EXECUTE ON FUNCTION" database/final_schema.sql`
Expected: prints a number ≥ (unique-function-count from Task 2). Every function is granted.

- [ ] **Step 4: For every function without a signature in the `CREATE OR REPLACE FUNCTION` line, emit `TO authenticated` grant using the RESOLVED signature.** Grep for any grant lines that still have literal `(...)` and fail the build if found.

```bash
grep -n "GRANT EXECUTE ON FUNCTION.*\.\.\." database/final_schema.sql
```
Expected: no output. If any lines match, fix the extractor and rebuild.

- [ ] **Step 5: Commit**

```bash
git add scripts/build_final_schema.mjs database/final_schema.sql
git commit -m "$(cat <<'EOF'
fix(schema): backfill 68 missing GRANT EXECUTE statements

Every RPC function now has a matching GRANT EXECUTE TO authenticated in
the consolidated schema. Resolves the 'permission denied for function'
class of errors when the app runs against a fresh database.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Add the 7 fully-missing functions

**Files:**
- Modify: `scripts/build_final_schema.mjs`
- Modify: `database/final_schema.sql`

The 7 functions from `missing_funcs.txt` that were never in the baseline:
1. `get_category_stock_aggregates`
2. `increment_credit_balance`
3. `rename_payment_method`
4. `rpc_customer_statement_v2`
5. `rpc_financial_dashboard`
6. `rpc_purchase_aging_report`
7. `rpc_sales_aging_report`

They ARE in later migrations (e.g. `20260704170000_category_stock_aggregates.sql`). The merger from Task 4 should pick them up automatically — this task is the **verification** pass.

- [ ] **Step 1: For each of the 7 names, grep the merged output**

```bash
for f in get_category_stock_aggregates increment_credit_balance rename_payment_method rpc_customer_statement_v2 rpc_financial_dashboard rpc_purchase_aging_report rpc_sales_aging_report; do
  echo "$f: $(grep -c "FUNCTION public.$f\b" database/final_schema.sql) definitions, $(grep -c "GRANT EXECUTE ON FUNCTION public.$f\b" database/final_schema.sql) grants"
done
```
Expected: every function shows `1 definitions, 1 grants`. If any is `0 definitions`, its source migration file was missed — trace back.

- [ ] **Step 2: If any function is missing, patch the merger.** Common causes: the migration file uses a non-standard `CREATE FUNCTION` syntax the regex didn't catch (e.g. `CREATE OR REPLACE FUNCTION\n public.foo` with a newline).

- [ ] **Step 3: Rebuild and re-verify Step 1.**

- [ ] **Step 4: Commit (only if changes were needed)**

```bash
git add scripts/build_final_schema.mjs database/final_schema.sql
git commit -m "$(cat <<'EOF'
fix(schema): ensure all 7 previously-missing functions land in output

Verified that get_category_stock_aggregates, increment_credit_balance,
rename_payment_method, rpc_customer_statement_v2, rpc_financial_dashboard,
rpc_purchase_aging_report, rpc_sales_aging_report are all defined and
granted in database/final_schema.sql.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: RLS policies — idempotent re-application

**Files:**
- Modify: `scripts/build_final_schema.mjs`
- Modify: `database/final_schema.sql`

- [ ] **Step 1: Every `CREATE POLICY "<name>" ON <table>` gets prefixed with a `DROP POLICY IF EXISTS "<name>" ON <table>;`**

```javascript
merged = merged.replace(
  /CREATE POLICY\s+"([^"]+)"\s+ON\s+([a-zA-Z0-9_.]+)/gi,
  (whole, policy, table) => `DROP POLICY IF EXISTS "${policy}" ON ${table};\n${whole}`
);
```

- [ ] **Step 2: `ALTER TABLE … ENABLE ROW LEVEL SECURITY` is already idempotent** — no change needed, Postgres accepts repeat calls.

- [ ] **Step 3: Merge the loose `database/RLS.sql` (profiles policies) into the output.** That file has 4 profiles policies that may or may not be in the baseline — the DROP-then-CREATE pattern from Step 1 makes double-inclusion safe.

```javascript
// Append database/RLS.sql content to the merged output before the GRANTS block.
```

- [ ] **Step 4: Rebuild and grep-verify**

Run: `grep -c "^DROP POLICY IF EXISTS" database/final_schema.sql && grep -c "^CREATE POLICY" database/final_schema.sql`
Expected: both counts equal (every CREATE POLICY has a matching DROP).

- [ ] **Step 5: Commit**

```bash
git add scripts/build_final_schema.mjs database/final_schema.sql database/RLS.sql
git commit -m "$(cat <<'EOF'
feat(schema): make RLS policies idempotent (DROP IF EXISTS + CREATE)

Every CREATE POLICY is now preceded by a DROP POLICY IF EXISTS on the
same table+name, so re-running final_schema.sql cleanly replaces policies
without ownership/duplicate errors.

Also folds in database/RLS.sql (profiles policies).

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Seed data — country codes, currencies, cash-customers group, bootstrap trigger

**Files:**
- Modify: `scripts/build_final_schema.mjs`
- Modify: `database/final_schema.sql`

- [ ] **Step 1: Identify every migration that inserts seed data.** Grep for `INSERT INTO` in the migrations set:

```bash
grep -l "^INSERT INTO" supabase/migrations/*.sql
```

The known seeds:
- Country codes (`country_codes` table) — check migration for the initial list
- Currencies (`currencies` table)
- Cash-customers group (`20260706140000_seed_cash_customers_group.sql`)
- Fresh-DB bootstrap trigger (`20260706130000_fresh_db_bootstrap.sql`)
- Payment methods, reason lists, approval workflows — check for these too

- [ ] **Step 2: For each seed, wrap the INSERT with `ON CONFLICT DO NOTHING`** (or `ON CONFLICT (…) DO UPDATE` if the seed is meant to overwrite tweaks).

```javascript
merged = merged.replace(
  /INSERT INTO\s+(public\.[a-zA-Z0-9_]+)\s*\([^)]+\)\s*VALUES\s*[^;]+;/gi,
  (whole) => whole.trim().replace(/;$/, ' ON CONFLICT DO NOTHING;')
);
// Skip lines that already have ON CONFLICT.
```

- [ ] **Step 3: Rebuild and verify seed section**

Run: `grep -c "ON CONFLICT DO NOTHING" database/final_schema.sql`
Expected: > 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/build_final_schema.mjs database/final_schema.sql
git commit -m "$(cat <<'EOF'
feat(schema): make seed inserts idempotent with ON CONFLICT DO NOTHING

Country codes, currencies, payment methods, reason lists, cash-customers
group, and the fresh-DB bootstrap trigger all now re-runnable.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Apply the schema on a scratch DB and verify

**Files:**
- Create: `database/README.md`

- [ ] **Step 1: Write `database/README.md` with the run instructions.**

```markdown
# Final DB Schema

## Applying to a fresh Supabase project

1. Create a new Supabase project. Grab the DB connection string from Project Settings → Database → Connection string → URI.
2. Run:
   ```bash
   psql "<connection_string>" -f database/final_schema.sql
   ```
   Expected: no ERROR output. NOTICE lines about "already exists" are fine (schema is idempotent).
3. Verify: the app should boot against this DB without RPC permission errors.

## Regenerating

If migrations change under `supabase/migrations/`, rebuild:
```bash
node scripts/build_final_schema.mjs --build
```
Commit both the script change and the regenerated `database/final_schema.sql` together.
```

- [ ] **Step 2: Ask the user to run against a scratch Supabase project or the staging DB (`mwvblpgbgxipvrevkeff` per `reference_staging_db.md`).**

The user should run:
```bash
psql "$STAGING_DB_URL" -f database/final_schema.sql 2>&1 | tee /tmp/apply.log
```
Then paste any ERROR lines back.

- [ ] **Step 3: If errors, patch the merger and re-run.** Common expected issues:
  - Function argument-type mismatches on GRANT — fix the signature extractor
  - Trigger already exists — add `CREATE OR REPLACE TRIGGER` or `DROP TRIGGER IF EXISTS` prefix
  - Column type change conflicts — happens when a later migration ALTERs a column; the merger should emit the ALTER after the CREATE

- [ ] **Step 4: Once clean, commit the README and the final schema together**

```bash
git add database/README.md database/final_schema.sql
git commit -m "$(cat <<'EOF'
docs(schema): document how to apply the consolidated schema

Verified clean apply on a fresh Supabase project. This is the file to
run when spinning up a new environment.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Clean up the loose helper scripts.**

```bash
mkdir -p scripts/legacy
git mv check_functions.sh check_grants.sh final_check.sh verify_grants.sh scripts/legacy/
rm missing_funcs.txt summary.txt
git add -u
git commit -m "$(cat <<'EOF'
chore: retire loose consolidation helper scripts

check_functions.sh / check_grants.sh / final_check.sh / verify_grants.sh
served their purpose during the schema audit — moved under
scripts/legacy/. Removed the throwaway text files (missing_funcs.txt,
summary.txt).

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Phase 1 exit criteria
- `psql "<fresh_db>" -f database/final_schema.sql` runs to completion with zero ERROR lines.
- The app can log in, list POs, and call at least one RPC per Purchase page without "permission denied for function" errors.
- `PROGRESS.md` gets a completion entry: `[2026-07-07] Phase 1: Final DB schema — database/final_schema.sql — idempotent single-file schema, 68 grants backfilled, 7 missing functions verified present`.

---

## Phase 2 — Purchase + Warehouse Test-Case Workbook

### Task 10: Enumerate every screen and workflow

**Files:**
- Create: `scripts/test-cases/purchase_warehouse_spec.json`

- [ ] **Step 1: Walk `src/app/(dashboard)/purchase/*` and list every route.** For each, note: page title, primary action, forms present, RPCs called. (I already have the route list from the survey; use those 17 routes.)

- [ ] **Step 2: Write the spec JSON structure.**

```json
{
  "workbookTitle": "Purchase + Warehouse Test Cases",
  "sheets": [
    {
      "name": "Summary",
      "columns": ["Sheet", "Screen", "# Tests", "Coverage Notes"],
      "rows": []
    },
    {
      "name": "PO_Create",
      "route": "/purchase/create-po",
      "columns": [
        "Test ID", "Scenario", "Preconditions", "Steps",
        "Input values", "Expected result", "Actual", "Pass/Fail", "Notes"
      ],
      "rows": [
        {
          "id": "PO-C-01",
          "scenario": "Create a PO with a single line item for an existing supplier",
          "preconditions": "1 supplier exists (ACME Ltd), 1 item exists (SKU ITEM-0001, base UoM PCS), 1 warehouse exists (WH-DOHA)",
          "steps": "1. Open /purchase/create-po. 2. Select supplier ACME Ltd. 3. Set delivery warehouse to WH-DOHA. 4. Set expected delivery to today+7. 5. Add line: SKU ITEM-0001, qty 10, rate 50.00, tax 0%. 6. Click Save Draft.",
          "input": "Supplier=ACME Ltd, Warehouse=WH-DOHA, Delivery=+7d, SKU=ITEM-0001, Qty=10, Rate=50, Tax=0",
          "expected": "PO created with status Draft, subtotal 500.00, tax 0, total 500.00. Redirects to /purchase/orders showing the new PO. Audit trail entry created."
        }
      ]
    }
  ]
}
```

- [ ] **Step 3: Fill in test rows for every screen.** Minimum coverage per screen (I'll enumerate the sheets and target counts here so no screen is skipped):

| Sheet | Route | Min tests | Golden path + edge cases |
|---|---|---|---|
| `PO_Create` | `/purchase/create-po` | 8 | Single line, multi-line, multi-currency, item-not-found, negative qty rejected, save-then-edit, discount, tax |
| `PO_Edit` | `/purchase/edit-po/[id]` | 4 | Edit line qty, delete line, add line, cancel edit |
| `PO_Approvals` | `/purchase/approvals` | 4 | Approve, reject with reason, escalate, view approval history |
| `Approval_Settings` | `/purchase/approval-settings` | 3 | Add tier, change threshold, remove tier |
| `Receivals` | `/purchase/receivals` | 6 | Full receive, partial receive, over-receive rejected, damaged qty, create+approve in one, receive against non-existent PO rejected |
| `Bills` | `/purchase/bills` + `/[id]` | 6 | Create bill from PO, edit bill, allocate payment, attach PDF, revoke bill, aging shows correctly |
| `Payments` | `/purchase/payments` | 5 | Cash payment, bank transfer, check with number, allocate to bill, detach payment |
| `Debit_Notes` | `/purchase/debit-notes` | 4 | Create debit note, apply against bill, PDF generated, aging updated |
| `Returns` | `/purchase/returns` | 5 | Return items to supplier, dispatch return, cancel dispatch, restock cancelled, aging reflects |
| `Shipments` | `/purchase/shipments` | 4 | Create shipment, add carrier, track by 17track, mark delivered |
| `Landed_Costs` | `/purchase/landed-costs` | 4 | Create, allocate to PO, validate allocation, revert |
| `Dead_Stock` | `/purchase/dead-stock` | 3 | Report shows items with no movement in 90d, filter by warehouse, export |
| `Aging_Report` | `/purchase/aging-report` | 3 | Full aging, filter by supplier, drill into invoice |
| `Warehouses_Admin` | `/master-data/admin/warehouses` | 4 | Create WH, edit, deactivate, RPS/replace field |
| `Stock_Adjustments` | (warehouse tab) | 5 | Adjust up, adjust down (blocks below zero if configured), workflow step, approve, cancel |
| `Transfers` | (warehouse tab) | 5 | Create transfer v2, dispatch, receive, cancel, receive partial |
| `Inventory_Check` | (warehouse tab) | 4 | Snapshot system qty, count items, apply adjustments, PDF |

Write each sheet's rows with concrete example values (supplier names, SKUs, quantities, prices — never `<TBD>` or `<enter something>`).

- [ ] **Step 4: Commit the spec**

```bash
git add scripts/test-cases/purchase_warehouse_spec.json
git commit -m "$(cat <<'EOF'
docs(tests): spec for Purchase + Warehouse test-case workbook

JSON source for the .xlsx generator. Covers all 17 Purchase routes plus
warehouse admin and stock movement tabs. ~80 test rows across 17 sheets.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Workbook generator

**Files:**
- Create: `scripts/build_test_workbook.mjs`
- Create: `docs/test-cases/Purchase_Warehouse_Tests.xlsx`

- [ ] **Step 1: Add the `xlsx` npm dependency.**

Run: `npm install --save-dev xlsx`
Expected: `xlsx` appears in `package.json` under `devDependencies`.

- [ ] **Step 2: Write the generator.**

```javascript
// scripts/build_test_workbook.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import XLSX from 'xlsx';

const spec = JSON.parse(readFileSync('scripts/test-cases/purchase_warehouse_spec.json', 'utf8'));
const outPath = 'docs/test-cases/Purchase_Warehouse_Tests.xlsx';

const wb = XLSX.utils.book_new();

// Build the Summary sheet by counting rows in every other sheet.
const summaryRows = spec.sheets
  .filter(s => s.name !== 'Summary')
  .map(s => ({
    Sheet: s.name,
    Screen: s.route || '',
    '# Tests': s.rows.length,
    'Coverage Notes': s.coverageNotes || '',
  }));
const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

// Emit each test sheet.
for (const s of spec.sheets) {
  if (s.name === 'Summary') continue;
  const rows = s.rows.map(r => ({
    'Test ID': r.id,
    Scenario: r.scenario,
    Preconditions: r.preconditions,
    Steps: r.steps,
    'Input values': r.input,
    'Expected result': r.expected,
    Actual: '',
    'Pass/Fail': '',
    Notes: '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  // Column widths
  ws['!cols'] = [
    { wch: 10 }, { wch: 40 }, { wch: 40 }, { wch: 60 },
    { wch: 40 }, { wch: 50 }, { wch: 20 }, { wch: 12 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, s.name);
}

mkdirSync(dirname(outPath), { recursive: true });
XLSX.writeFile(wb, outPath);
console.log(`Wrote ${outPath} (${spec.sheets.length} sheets)`);
```

- [ ] **Step 3: Run it**

Run: `node scripts/build_test_workbook.mjs`
Expected: `docs/test-cases/Purchase_Warehouse_Tests.xlsx` exists and opens in Excel with 18 sheets (Summary + 17 screens).

- [ ] **Step 4: Manually open in Excel and spot-check three sheets.** Column widths readable, test IDs unique, no `[object Object]` cells.

- [ ] **Step 5: Commit**

```bash
git add scripts/build_test_workbook.mjs docs/test-cases/Purchase_Warehouse_Tests.xlsx package.json package-lock.json
git commit -m "$(cat <<'EOF'
docs(tests): generate Purchase + Warehouse test-case workbook

Regenerable via node scripts/build_test_workbook.mjs. Source of truth
is scripts/test-cases/purchase_warehouse_spec.json.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Phase 2 exit criteria
- `docs/test-cases/Purchase_Warehouse_Tests.xlsx` has 18 sheets, each with concrete inputs (no placeholders).
- Anyone can open the workbook and execute a test row without asking clarifying questions.
- Rebuildable from the JSON spec.
- PROGRESS.md updated.

---

## Phase 3 — Response-Time Audit

### Task 12: List every DB touchpoint in Purchase + Warehouse pages

**Files:**
- Create: `docs/response-time-audit-2026-07-07.md` (report)

- [ ] **Step 1: Grep every purchase/warehouse page for Supabase calls.**

Run:
```bash
rg -n --type ts -e "supabase\.\(?:from|rpc\)" src/app/\(dashboard\)/purchase src/app/\(dashboard\)/master-data/admin/warehouses src/hooks 2>&1 | head -200
```

For each hit, record: file:line, call type (`.from(X).select(…)` or `.rpc(fn, …)`), whether there's a `.limit()`, whether there's a `.select('*')` vs explicit column list, whether it's inside a hot loop / `useEffect`.

- [ ] **Step 2: Grep every realtime `.channel(` in the same directories.**

Run:
```bash
rg -n --type ts -e "\.channel\(" src/app/\(dashboard\)/purchase src/hooks 2>&1
```

For each, note: table, event filter (`*` vs `INSERT` vs `UPDATE`), row filter present, whether it invalidates a large TanStack query.

- [ ] **Step 3: Write findings into `docs/response-time-audit-2026-07-07.md`** with columns: `File:Line | Issue | Severity | Fix`. Categorize:
  - **HIGH** — realtime `*` on high-write tables, `select('*')` on tables with 1M+ rows, missing FK indexes on join paths used in lists
  - **MEDIUM** — missing `.limit()`, over-eager useEffect, N+1 patterns (one query per list row)
  - **LOW** — over-fetching columns not displayed

- [ ] **Step 4: Cross-reference against `docs/supabase-query-performance-audit.md` (June 8).** Some issues may already be logged there. Merge findings.

- [ ] **Step 5: Commit the audit doc**

```bash
git add docs/response-time-audit-2026-07-07.md
git commit -m "$(cat <<'EOF'
docs(perf): response-time audit for Purchase + Warehouse

Categorized findings across list queries, RPCs, and realtime channels.
Builds on the June-8 Supabase query performance audit — some issues
already logged there, updated with current status.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Add missing DB indexes

**Files:**
- Modify: `database/final_schema.sql` (via a new migration)
- Create: `supabase/migrations/YYYYMMDDHHMMSS_perf_indexes.sql`

- [ ] **Step 1: For each HIGH-severity index gap from Task 12, write a `CREATE INDEX IF NOT EXISTS` in a new migration.**

Example candidates (verify each is actually missing by querying `pg_indexes` first):

```sql
-- Frequently joined FKs on large tables
CREATE INDEX IF NOT EXISTS idx_purchase_bills_supplier_id ON purchase_bills(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_bills_po_id ON purchase_bills(po_id);
CREATE INDEX IF NOT EXISTS idx_receivals_po_id ON receivals(po_id);
CREATE INDEX IF NOT EXISTS idx_receivals_warehouse_id ON receivals(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_fifo_cost_layers_variant_id_warehouse_id ON fifo_cost_layers(variant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_cogs_entries_variant_id_date ON cogs_entries(variant_id, entry_date DESC);
-- Add every index the audit flagged
```

- [ ] **Step 2: Apply via `npx supabase db push`** (per the CLAUDE.md database migrations rule).

Run: `npx supabase db push`
Expected: applies successfully.

- [ ] **Step 3: Regenerate `database/final_schema.sql`** so the fresh-DB path also gets these indexes.

Run: `node scripts/build_final_schema.mjs --build`

- [ ] **Step 4: Verify indexes exist in Supabase dashboard** (Table Editor → each table → Indexes).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_perf_indexes.sql database/final_schema.sql
git commit -m "$(cat <<'EOF'
perf(db): add missing indexes flagged in the response-time audit

Every FK used in a hot list query now has an index. See
docs/response-time-audit-2026-07-07.md for the list.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Fix `.select('*')` and missing `.limit()` on list reads

**Files:**
- Modify: whichever files the audit flagged (varies)

- [ ] **Step 1: For each MEDIUM finding, open the file and:**
  - Replace `.select('*')` with an explicit column list matching what the UI actually displays
  - Add `.limit(N)` where N matches the visible page size (usually 50)
  - Add `.order(…)` if pagination will need it

Example fix pattern:
```typescript
// BEFORE (from src/hooks/usePurchaseOrders.ts:34)
const { data } = await supabase.from('purchase_orders').select('*');

// AFTER
const { data } = await supabase
  .from('purchase_orders')
  .select('id, po_number, supplier_id, status, total, created_at, expected_delivery_date')
  .order('created_at', { ascending: false })
  .limit(50);
```

- [ ] **Step 2: For each fix, run the affected page manually** (per feedback_no_preview_eval.md — ask user to check, don't use browser tools yourself) and confirm no regressions in what the user sees.

- [ ] **Step 3: Commit in small batches** — one commit per screen fixed, not one giant commit.

```bash
git commit -m "$(cat <<'EOF'
perf(<screen>): narrow list reads to displayed columns + add .limit

Fixes finding <N> in docs/response-time-audit-2026-07-07.md — <screen>
list query was fetching all columns of purchase_orders (~30 cols) and
had no limit. Reduced to displayed columns and limit(50).

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Fix realtime channels — narrow event filter, add row filter

**Files:**
- Modify: any file with `.channel(...)` on high-traffic tables per the audit

- [ ] **Step 1: For each `event: '*'` on a table that only needs INSERT propagation (append-mostly tables like `fifo_cost_layers`, `audit_logs`, `purchase_orders`), change to `event: 'INSERT'` and add a `filter:` if scoped to a single entity.**

Follow the `docs/supabase-budget.md` rules — the memory says this project already hit Supabase Free-tier quota twice from over-broad channels.

- [ ] **Step 2: If a page opens a channel purely to trigger `queryClient.invalidateQueries`, consider replacing with a poll interval that respects `document.hidden`** (per the CLAUDE.md Supabase Budget rule).

- [ ] **Step 3: Commit — one per channel**

```bash
git commit -m "$(cat <<'EOF'
perf(realtime): narrow <channel> to INSERT + row filter

<file>:<line> was subscribed to '*' events on <table>, generating
list_changes traffic disproportionate to the actual UI need.
Reduced to <event/filter>.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Post-audit remeasure

- [ ] **Step 1: Ask the user to check the Supabase dashboard Query Performance page a day or two after the fixes land** and paste the top-time queries again. Compare against `docs/supabase-query-performance-audit.md` (June 8).

- [ ] **Step 2: Update `docs/response-time-audit-2026-07-07.md` with a "Post-Fix Results" section** — which findings closed, which still hot.

- [ ] **Step 3: Update `PROGRESS.md`'s `## 🔋 Quota Watch` table** with the new snapshot.

- [ ] **Step 4: Commit**

```bash
git add docs/response-time-audit-2026-07-07.md PROGRESS.md
git commit -m "$(cat <<'EOF'
docs(perf): post-fix results for the 2026-07-07 response-time audit

Records which findings closed after the index + limit + realtime fixes.
Updates the Quota Watch table.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Phase 3 exit criteria
- Every HIGH finding either fixed or explicitly explained in the audit doc under "Deferred / Won't Fix".
- No page in Purchase or Warehouse has a `.select('*')` without either an explicit limit or a business reason noted in a comment.
- No `.channel(…, event: '*')` on a high-write table without a row filter.
- Supabase Query Performance top-10 no longer dominated by app queries (matches the state described in the June-8 audit).

---

## Order of Operations

1. **Phase 1 first — no exceptions.** Test cases and perf work both assume a working DB.
2. **Phase 2 after Phase 1 lands and the fresh-DB apply is verified.** The test cases will be executed against that clean DB.
3. **Phase 3 last.** Perf changes will land in both the migrations directory and the consolidated schema — you want the consolidated schema to already be stable before piling perf commits on top.

Between phases: PROGRESS.md update + EOD update per the CLAUDE.md rules.

---

## Risks & Open Questions

- **Fresh-DB apply may surface long-tail migration bugs.** Some old migrations have circular dependencies (e.g. function A calls function B declared later in the same migration). Merger dedupe should mostly handle this, but expect 1–3 rebuild cycles in Task 9.
- **Test-case Excel is a static snapshot.** As Purchase/Warehouse evolves, the workbook will drift. That's fine — regenerate from the JSON spec.
- **Perf audit may find issues that need architecture changes** (e.g. denormalized cache tables). Those are out of scope for this plan — they go in a follow-up.
- **Seed data:** confirm with user whether the "cash-customers group" seed row should ship in `final_schema.sql` or be applied only after first admin logs in. Current plan says ship it (matches `20260706140000_seed_cash_customers_group.sql`).
