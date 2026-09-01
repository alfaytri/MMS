# Consumption Phase 1 — Mandatory Notes, Richer List, Real-time — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make custody consumption behave like the start of a sale — require Notes (the invoice/order/project ref), surface each row's items + notes in the list, and keep the page fresh without a manual refresh.

**Architecture:** Three small, independent changes over the existing consumption module: (1) a server guard in `rpc_post_consumption` + a form gate for mandatory notes on `consumer_type='custody'`; (2) widen the list query + render items/notes; (3) `refetchOnWindowFocus` on the list/detail hooks. No new tables, no money-path changes.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, TanStack Query v5, shadcn/ui + Tailwind, Supabase (Postgres RPCs, psql-applied migrations).

**Spec:** `docs/plans/2026-08-29-consumption-sales-returns-warranty-design.md` (Phase 1 = §5.1).

## Global Constraints

- **Verification model (this repo):** No unit-test harness for UI/RPCs. Verify TypeScript with `npx tsc --noEmit` (must be `0 errors`); verify RPC behavior with a **rolled-back** psql `DO`/`BEGIN…ROLLBACK` probe against **staging**; hand golden-path UI behavior to the operator to smoke. Do **not** write speculative vitest specs for these changes.
- **Migrations:** write every `.sql` to BOTH `supabase/migrations/` AND `supabase/migrations-staging/` (same filename). Apply with `psql -f` to **staging** (`mwvblpgbgxipvrevkeff`) and **new-prod** (`optishfnnctrhffpoywg`) — `db push` is unusable (ledgers drifted); record the ledger row `INSERT INTO supabase_migrations.schema_migrations(version,name)`. Staging connection: keyword args via `supabase/.temp/migrate.env` `STAGING_DB_PASSWORD`, host `aws-1-ap-south-1.pooler.supabase.com`, user `postgres.mwvblpgbgxipvrevkeff`; new-prod via `NEW_DB_URL` in the same file.
- **RPC edits:** never trust the baseline dump — fetch the live body with `pg_get_functiondef` first, `CREATE OR REPLACE` from THAT, keep a single overload, confirm columns/enums exist before use (per the SQL-migration self-check rule).
- **Commits:** each task ends in a commit with BOTH co-author trailers:
  `Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>` and `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`. Commit locally; do NOT push (operator batches pushes).
- **Scope:** custody = `consumer_type='custody'`; `internal` consumption keeps notes optional. Do not change the `code` column behavior.
- **After the phase:** update `PROGRESS.md` + today's `EOD/EOD-YYYY-MM-DD.md`; if any new operator-visible flow, update `docs/flows-registry.md`.

---

### Task 1: Server-side mandatory-notes guard in `rpc_post_consumption`

Make the database the source of truth: reject a **custody** consumption whose notes are blank, before any FIFO drain. Internal consumption is unaffected.

**Files:**
- Create: `supabase/migrations/20260830000000_consumption_custody_notes_required.sql`
- Create: `supabase/migrations-staging/20260830000000_consumption_custody_notes_required.sql` (identical)
- Reference (live body source): function `public.rpc_post_consumption` — current definition last set in `supabase/migrations/20260919000000_consumption_is_team_item_stamp.sql:24`.

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the same `rpc_post_consumption(p_source_warehouse_id, p_source_sub_container_id, p_consumer_type, p_consumer_sub_container_id, p_notes, p_attachments, p_lines, p_milestone_id, p_discipline_id, p_code)` signature (unchanged) — now raising `P0001` on custody + blank notes. Task 2's form relies on this message text only as a backstop.

- [ ] **Step 1: Fetch the live function body**

Run (staging, read-only):
```bash
cd D:/MMS && set -a && source supabase/.temp/migrate.env && set +a && python - <<'PY'
import os, psycopg2
c=psycopg2.connect(host='aws-1-ap-south-1.pooler.supabase.com',port=5432,user='postgres.mwvblpgbgxipvrevkeff',password=os.environ['STAGING_DB_PASSWORD'],dbname='postgres')
c.set_session(readonly=True,autocommit=True);cur=c.cursor()
cur.execute("select pg_get_functiondef('public.rpc_post_consumption(uuid,uuid,text,uuid,text,text[],jsonb,uuid,uuid,text)'::regprocedure)")
print(cur.fetchone()[0]); c.close()
PY
```
Expected: the full current `CREATE OR REPLACE FUNCTION …` body. If the argument list errors, list overloads with `select oid::regprocedure from pg_proc where proname='rpc_post_consumption'` and use the real one. Copy this body verbatim into the migration file.

- [ ] **Step 2: Write the migration — paste the fetched body, add the guard**

In the migration file, reproduce the fetched `CREATE OR REPLACE FUNCTION public.rpc_post_consumption(...)` exactly, and insert this guard in the `DECLARE … BEGIN` body **immediately after `p_consumer_type` is validated / the consumer branch is resolved and before the FIFO loop** (search the body for where `consumer_type`/`consumer_sub_container_id` is established):

```sql
  -- Phase 1: custody consumption is a sale — the invoice/order/project ref is mandatory.
  IF p_consumer_type = 'custody' AND NULLIF(btrim(p_notes), '') IS NULL THEN
    RAISE EXCEPTION 'Notes are required for custody consumption — enter the invoice / order number / project code.'
      USING ERRCODE = 'P0001';
  END IF;
```

End the file with `NOTIFY pgrst, 'reload schema';`. Copy the file byte-identically to the `migrations-staging/` path.

- [ ] **Step 3: Apply to staging**

Run:
```bash
cd D:/MMS && set -a && source supabase/.temp/migrate.env && set +a && PGPASSWORD="$STAGING_DB_PASSWORD" && python - <<'PY'
import os,psycopg2
c=psycopg2.connect(host='aws-1-ap-south-1.pooler.supabase.com',port=5432,user='postgres.mwvblpgbgxipvrevkeff',password=os.environ['STAGING_DB_PASSWORD'],dbname='postgres');c.autocommit=True;cur=c.cursor()
cur.execute(open('supabase/migrations/20260830000000_consumption_custody_notes_required.sql',encoding='utf-8').read())
cur.execute("insert into supabase_migrations.schema_migrations(version,name) values ('20260830000000','consumption_custody_notes_required') on conflict do nothing")
print('applied'); c.close()
PY
```
Expected: `applied`, no error.

- [ ] **Step 4: Prove the guard with a rolled-back probe (staging)**

Run a `BEGIN … ROLLBACK` probe that (a) a custody call with blank notes RAISES, (b) an internal call with blank notes does NOT raise on the notes check, (c) a custody call WITH notes does not raise on the notes check. Use a real source sub-container + a real custody consumer sub-container + one real variant with stock (query them first). Example skeleton:
```bash
cd D:/MMS && set -a && source supabase/.temp/migrate.env && set +a && python - <<'PY'
import os,psycopg2
c=psycopg2.connect(host='aws-1-ap-south-1.pooler.supabase.com',port=5432,user='postgres.mwvblpgbgxipvrevkeff',password=os.environ['STAGING_DB_PASSWORD'],dbname='postgres');cur=c.cursor()
# resolve real ids
cur.execute("select id from warehouse_sub_containers where is_active limit 1"); src=cur.fetchone()[0]
cur.execute("select sc.id from warehouse_sub_containers sc join warehouses w on w.id=sc.warehouse_id where w.warehouse_kind='custody' and sc.is_active limit 1"); cust=cur.fetchone()[0]
cur.execute("select bv.id from inventory_item_brand_variants bv where bv.stock_level>0 limit 1"); bv=cur.fetchone()[0]
import json
def call(ctype, notes, consumer):
  cur.execute("select public.rpc_post_consumption(%s,%s,%s,%s,%s,%s,%s::jsonb,null,null,null)",
    (src,src,ctype,consumer,notes,[], json.dumps([{ 'brand_variant_id':str(bv),'qty':1}])))
try:
  cur.execute("begin"); 
  try:
    call('custody','',cust); print('FAIL: custody blank did NOT raise')
  except Exception as e:
    print('OK custody-blank raised:', str(e).splitlines()[0][:60])
  cur.execute("rollback")
finally:
  cur.execute("rollback"); c.close()
PY
```
Expected: prints `OK custody-blank raised: Notes are required …`. (Adjust the probe to also assert internal-blank + custody-with-notes pass the notes check — they may fail later guards, which is fine; only confirm they do NOT raise the notes message.)

- [ ] **Step 5: Apply to new-prod**

Repeat Step 3 against new-prod using `NEW_DB_URL` (psycopg2 `psycopg2.connect(os.environ['NEW_DB_URL'])`), running the migration SQL + the ledger insert. Expected: `applied`.

- [ ] **Step 6: Commit**

```bash
cd D:/MMS && git add supabase/migrations/20260830000000_consumption_custody_notes_required.sql supabase/migrations-staging/20260830000000_consumption_custody_notes_required.sql && git commit -m "$(cat <<'EOF'
feat(consumption): require notes on custody consumption (server guard)

rpc_post_consumption now raises P0001 when consumer_type='custody' and notes
are blank — the invoice/order/project ref is mandatory for the sale case.
Internal consumption unchanged. Live body fetched via pg_get_functiondef;
applied to staging + new-prod; rolled-back probe confirms custody-blank raises.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Form — mandatory notes gate + placeholder (custody)

Gate the confirm step on notes when custody, and update the placeholder. Internal keeps notes optional.

**Files:**
- Modify: `src/components/consumption/NewConsumptionDialog.tsx` (the `canOpenConfirm` gate ~`:521-530`; the notes `<Textarea>` ~`:1124-1132`).

**Interfaces:**
- Consumes: Task 1's server guard (backstop only).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Read the current gate + notes field**

Run: open `NewConsumptionDialog.tsx`; locate the `consumerType` state, the `canOpenConfirm` boolean, and the notes `<Textarea>` (`value={notes}` / `placeholder=…`). Confirm the state variable names (`notes`, `consumerType`/`consumer_type`).

- [ ] **Step 2: Add the custody-notes condition to the gate**

In the `canOpenConfirm` expression, AND-in a custody-notes requirement. Example (adapt to the real variable names):
```tsx
// custody consumption is a sale → notes (invoice/order/project ref) required
const notesOk = consumerType !== 'custody' || notes.trim().length > 0
const canOpenConfirm = /* existing conditions */ && notesOk
```

- [ ] **Step 3: Update the placeholder + add a required hint**

```tsx
<Label htmlFor="cons-notes">
  Notes{consumerType === 'custody' && <span className="text-destructive"> *</span>}
</Label>
<Textarea
  id="cons-notes"
  value={notes}
  onChange={(e) => setNotes(e.target.value)}
  placeholder={consumerType === 'custody'
    ? 'Enter invoice / order number / project code'
    : 'Optional context (job ref, site visit, WO number, etc.)'}
/>
```

- [ ] **Step 4: Typecheck**

Run: `cd D:/MMS && npx tsc --noEmit 2>&1 | grep -E "NewConsumptionDialog" ; echo "total: $(npx tsc --noEmit 2>&1 | grep -cE 'error TS')"`
Expected: no `NewConsumptionDialog` errors; total `0`.

- [ ] **Step 5: Commit**

```bash
cd D:/MMS && git add src/components/consumption/NewConsumptionDialog.tsx && git commit -m "$(cat <<'EOF'
feat(consumption): require notes on custody consumption (form gate)

Custody consumption can't be confirmed without notes; placeholder is now
"Enter invoice / order number / project code" and the label shows a required
asterisk. Internal consumption unchanged. Backed by the server guard.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Operator smoke (hand off)**

Ask the operator: on the Consumption page, "New Consumption" with a **custody** consumer + blank notes → Confirm is disabled / blocked; typing notes enables it; an **internal** consumption still confirms with blank notes.

---

### Task 3: Richer list view — items + notes per row

Show each consumption's line items and notes in the list (notes is already fetched; items are not).

**Files:**
- Modify: `src/hooks/useConsumption.ts` — `LIST_SELECT` (~`:141-153`) and the `ConsumptionListRow` type (~`:50-60`).
- Modify: `src/app/(dashboard)/consumption/page.tsx` — table columns + mobile card (~`:126-202`, `:300-306`).

**Interfaces:**
- Consumes: nothing.
- Produces: `ConsumptionListRow.lines: { item_name: string; sku: string | null; qty: number; unit_cost: number }[]` and existing `.notes`.

- [ ] **Step 1: Widen the list query**

In `LIST_SELECT`, change the embedded `consumption_lines(qty, unit_cost)` to `consumption_lines(item_name, sku, qty, unit_cost)`. Update the `ConsumptionListRow`/lines type to include `item_name` + `sku`. Keep `.limit(500)` and the existing total computation.

- [ ] **Step 2: Render an Items summary + Notes**

In `page.tsx`, add an **Items** column (desktop) rendering a compact summary from `row.lines` — e.g. first 2 as `item_name ×qty`, then `+N more` when `lines.length > 2` — and a **Notes** column (truncated with `title={row.notes ?? ''}`); include both in the mobile card. Example:
```tsx
function itemsSummary(lines: { item_name: string; qty: number }[]): string {
  if (!lines?.length) return '—'
  const head = lines.slice(0, 2).map((l) => `${l.item_name} ×${l.qty}`).join(', ')
  return lines.length > 2 ? `${head} +${lines.length - 2} more` : head
}
```
```tsx
<td className="px-2 py-2 text-xs max-w-[220px] truncate" title={itemsSummary(row.lines)}>{itemsSummary(row.lines)}</td>
<td className="px-2 py-2 text-xs text-muted-foreground max-w-[200px] truncate" title={row.notes ?? ''}>{row.notes || '—'}</td>
```
Add matching `<th>` headers. Follow the file's existing responsive `hidden md:table-cell` pattern so mobile stays readable.

- [ ] **Step 3: Typecheck**

Run: `cd D:/MMS && npx tsc --noEmit 2>&1 | grep -E "useConsumption|consumption/page" ; echo "total: $(npx tsc --noEmit 2>&1 | grep -cE 'error TS')"`
Expected: no matches; total `0`.

- [ ] **Step 4: Commit**

```bash
cd D:/MMS && git add src/hooks/useConsumption.ts "src/app/(dashboard)/consumption/page.tsx" && git commit -m "$(cat <<'EOF'
feat(consumption): show items + notes in the list front view

The list now shows each entry's consumed items (summarized) and its notes;
the list query pulls item_name/sku (notes was already fetched, unused).

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Operator smoke (hand off)**

Ask the operator: the Consumption list rows now show the item(s) and the notes; long values truncate with a tooltip; mobile cards still read cleanly.

---

### Task 4: Real-time — refetch on window focus

Keep the list/detail fresh without a manual refresh, quota-safe (no polling).

**Files:**
- Modify: `src/hooks/useConsumption.ts` — `useConsumptionList` (~`:157-186`) and `useConsumption(id)` (~`:190-228`).

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Add refetchOnWindowFocus**

In both `useQuery` configs add `refetchOnWindowFocus: true` (keep existing `staleTime`). Do **not** add `refetchInterval` (Supabase-budget rule). Same-tab create/cancel already invalidate `queryKeys.consumption.all` via the existing mutation `onSuccess`.

- [ ] **Step 2: Typecheck**

Run: `cd D:/MMS && npx tsc --noEmit 2>&1 | grep -cE 'error TS'`
Expected: `0`.

- [ ] **Step 3: Commit**

```bash
cd D:/MMS && git add src/hooks/useConsumption.ts && git commit -m "$(cat <<'EOF'
feat(consumption): refetch list/detail on window focus (no manual refresh)

refetchOnWindowFocus on the consumption list + detail so returning to the tab
picks up changes; no polling (Supabase-budget rule). Same-tab actions already
invalidate.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Operator smoke (hand off)**

Ask the operator: post a consumption in one tab; switch to another tab showing the list and back — the new row appears without a manual refresh.

---

### Task 5: Phase docs

**Files:**
- Modify: `PROGRESS.md` (In Progress entry + Security Audit Log row if warranted), `EOD/EOD-2026-08-30.md` (or the current date).

- [ ] **Step 1: Update PROGRESS.md** — add a `🔄` In Progress entry summarizing Phase 1 (mandatory custody notes + server guard, items/notes in list, refetch-on-focus), commits, "committed, not pushed."
- [ ] **Step 2: Update the EOD file** — append the completed tasks in plain language.
- [ ] **Step 3: Commit docs** (PROGRESS.md only; EOD is gitignored):
```bash
cd D:/MMS && git add PROGRESS.md && git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — consumption Phase 1 (notes/list/real-time)

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

- **Spec coverage (§5.1):** mandatory custody notes (Task 1 server + Task 2 form ✓), placeholder (Task 2 ✓), items+notes list (Task 3 ✓), real-time invalidation+focus (Task 4 ✓). All Phase-1 spec items covered.
- **Placeholder scan:** no TBD/TODO; every code step shows the actual change or the exact fetch-then-edit procedure (the RPC body is fetched live per the repo rule, not guessed).
- **Type consistency:** `ConsumptionListRow.lines` gains `item_name`/`sku` in Task 3 and is consumed only there; `consumerType`/`notes` names to be confirmed against the file in Task 2 Step 1 before editing.
- **Verification realism:** RPC via rolled-back probe (Task 1), TS via `tsc` (Tasks 2-4), behavior via operator smoke — matches this repo's convention; no invented unit tests.

## Later phases (separate plans, written when we reach them)

- **Phase 2** — consumption warranty (schema relax + `create_warranty_records_for_consumption` + page + perms).
- **Phase 3a** — sales return COGS-reversal fix (money-path RPCs).
- **Phase 3b** — consumption returns (enum + return RPCs + page + perms).
- **Phase 4** — warranty claim → consumption return (needs 3b).
