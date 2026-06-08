# Contracts Module — Design Amendments

**Date:** 2026-06-01
**Status:** These amendments supersede the corresponding sections in the main spec.

---

## Amendment 1: Per-Service Visit Generation (replaces Section 8.5 Visit Generator)

**Problem:** The Visit Generator used a single global frequency selector, ignoring that each `contract_service` has its own frequency. A contract with monthly AC cleaning and weekly floor mopping would generate all visits at one frequency.

**Fix:** The Visit Generator iterates ALL `contract_services` and generates dates per service's own frequency. No global frequency picker.

### Revised Left Panel: Visit Generator (272px)

**"Auto-Generate All Visits" button (primary, Wand2 icon):**

On click, iterates every `contract_service` on the contract:

```typescript
function generateAllVisits(services: ContractService[], startDate: string, endDate: string): PendingVisit[] {
  const visits: PendingVisit[] = [];
  for (const svc of services) {
    const step = frequencyStep[svc.frequency]; // daily/weekly/monthly/etc.
    let current = parseISO(startDate);
    const end = parseISO(endDate);
    while (current <= end) {
      visits.push({
        temp_id: nanoid(),
        scheduled_date: format(current, 'yyyy-MM-dd'),
        service_name: svc.service_name,
        service_id: svc.id,
        building_node_id: svc.building_node_id,
        team_id: null,
        notes: '',
      });
      current = step(current);
    }
  }
  return visits.sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
}
```

**Summary table (before generation):**

| Service | Frequency | Visit count | Est. duration |
|---|---|---|---|
| AC Split Cleaning | Monthly | 12 | 1hr each |
| Floor Mopping | Weekly | 52 | 30min each |
| Window Cleaning | Quarterly | 4 | 2hr each |
| **Total** | | **68** | |

This table shows what WILL be generated. User reviews, then clicks "Generate All" to create the PendingVisit array.

**"Add Single Visit" button:** Opens a mini-dialog: select service from contract_services dropdown + pick date. Adds one PendingVisit for that specific service.

**No global frequency radio.** The frequency is per-service (already set in AddContractServiceDialog).

**Visit list grouping:** The right panel visit list now shows a `service_name` column so the user can see which service each visit belongs to. Visits are sorted by date (primary) then service name (secondary).

---

## Amendment 2: Proper RLS Policies (replaces all `USING (true)` policies)

**Problem:** `USING (true)` on contract data tables means any authenticated user can read/modify any contract's services and milestones, regardless of division or ownership.

**Fix:** Contract data tables use division-based isolation via a join to the parent `contracts` row. `service_brands` keeps permissive SELECT (it's reference data) but restricts writes.

### contract_services RLS

```sql
ALTER TABLE contract_services ENABLE ROW LEVEL SECURITY;

-- Read: user's divisions must overlap with the parent contract's divisions
CREATE POLICY "Division-scoped read contract_services"
  ON contract_services FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts c
      JOIN profiles p ON p.id = auth.uid()
      JOIN user_divisions ud ON ud.user_id = p.id
      JOIN divisions d ON d.id = ud.division_id
      WHERE c.id = contract_services.contract_id
        AND d.slug = ANY(c.divisions)
    )
  );

-- Insert/Update/Delete: same division check
CREATE POLICY "Division-scoped write contract_services"
  ON contract_services FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts c
      JOIN profiles p ON p.id = auth.uid()
      JOIN user_divisions ud ON ud.user_id = p.id
      JOIN divisions d ON d.id = ud.division_id
      WHERE c.id = contract_services.contract_id
        AND d.slug = ANY(c.divisions)
    )
  );
```

### contract_milestones RLS

Same pattern — join through `contract_id` to `contracts.divisions`, check against user's divisions.

```sql
ALTER TABLE contract_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Division-scoped read contract_milestones"
  ON contract_milestones FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts c
      JOIN profiles p ON p.id = auth.uid()
      JOIN user_divisions ud ON ud.user_id = p.id
      JOIN divisions d ON d.id = ud.division_id
      WHERE c.id = contract_milestones.contract_id
        AND d.slug = ANY(c.divisions)
    )
  );

CREATE POLICY "Division-scoped write contract_milestones"
  ON contract_milestones FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts c
      JOIN profiles p ON p.id = auth.uid()
      JOIN user_divisions ud ON ud.user_id = p.id
      JOIN divisions d ON d.id = ud.division_id
      WHERE c.id = contract_milestones.contract_id
        AND d.slug = ANY(c.divisions)
    )
  );
```

### service_brands RLS

Reference data — permissive read, admin-only write:

```sql
ALTER TABLE service_brands ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read (reference data for pricing)
CREATE POLICY "Authenticated read service_brands"
  ON service_brands FOR SELECT TO authenticated USING (true);

-- Only users with admin or master_data.edit permission can write
CREATE POLICY "Admin write service_brands"
  ON service_brands FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
        AND r.permissions @> '["master_data.edit"]'
    )
  );
```

**Note:** The exact RLS implementation depends on the project's existing `user_divisions` and `roles.permissions` patterns. The above follows the pattern used by other tables in the project. Verify against actual table/column names during implementation.

---

## Amendment 3: Differential Auto-Save (replaces Section 7 Form Management + Section 10.5 useUpdateContract)

**Problem:** The auto-save cleared and reinserted ALL child rows (services, milestones) every 30 seconds. This causes massive write overhead, burns UUID spaces, and triggers unnecessary Supabase realtime events.

**Fix:** Auto-save only touches the `contracts` row (scalar fields). Child tables are only written on explicit "Save" button clicks, using upsert for existing rows and targeted deletes for removed ones.

### Revised Auto-Save Strategy

1. **First save** ("Save" button): Creates the contract draft + all child rows (services, milestones). Standard INSERT.
2. **Auto-save (30s interval):** Only updates scalar fields on the `contracts` row:
   - `building_tree`, `discount`, `payment_mode`, `payment_frequency`, `notes`, `divisions`, `customer_name`, `phone`, `address`, `site_name`, `start_date`, `end_date`, `total_value`, `monthly_value`, `services_summary`, `area_count`
   - Does NOT touch `contract_services` or `contract_milestones`
   - Uses a simple `supabase.from('contracts').update({...}).eq('id', contractId)`
3. **Explicit "Save" button:** Writes everything — contract row + differential update of child tables:

```typescript
async function saveContractFull(contractId: string, formData: ContractFormData) {
  // 1. Update contract row
  await supabase.from('contracts').update({...contractFields}).eq('id', contractId);

  // 2. Diff services: upsert existing, insert new, delete removed
  const existingIds = formData.services.filter(s => !s._isNew).map(s => s.id);
  // Delete services no longer in the form
  await supabase.from('contract_services')
    .delete()
    .eq('contract_id', contractId)
    .not('id', 'in', `(${existingIds.join(',')})`);
  // Upsert remaining
  for (const svc of formData.services) {
    if (svc._isNew) {
      await supabase.from('contract_services').insert({...svc, contract_id: contractId});
    } else if (svc._isDirty) {
      await supabase.from('contract_services').update({...svc}).eq('id', svc.id);
    }
  }

  // 3. Same pattern for milestones
  // ...
}
```

**Dirty tracking:** Each service and milestone in form state carries `_isNew: boolean` and `_isDirty: boolean` flags. The form library (`react-hook-form`) tracks which fields changed. Only dirty rows are written.

### Revised Save Indicator

- "Saved" (green checkmark) — last explicit save succeeded
- "Auto-saved" (muted checkmark) — last auto-save of contract fields succeeded
- "Saving..." (spinner) — save in progress
- "Unsaved changes" (yellow dot) — form is dirty, next auto-save pending

---

## Amendment 4: JSONB Tree Integrity Validation (supplements Section 2.7)

**Problem:** `building_node_id` on `contract_services` is a loose TEXT reference into a JSONB blob. No FK constraint possible. Orphaned references cause UI crashes.

**Fix:** Application-level integrity validation runs before every tree save. Plus cascade-updates on rename.

### validateTreeIntegrity()

```typescript
function validateTreeIntegrity(tree: BuildingTree, services: ContractService[]): ValidationResult {
  const nodeIds = new Set(tree.nodes.map(n => n.id));
  const orphaned: ContractService[] = [];

  for (const svc of services) {
    if (svc.building_node_id && !nodeIds.has(svc.building_node_id)) {
      orphaned.push(svc);
    }
  }

  return {
    valid: orphaned.length === 0,
    orphanedServices: orphaned,
    message: orphaned.length > 0
      ? `${orphaned.length} service(s) reference nodes that no longer exist in the tree.`
      : null,
  };
}
```

**When called:**
- Before every `building_tree` save (auto-save and explicit save)
- If invalid: block save, show error dialog listing orphaned services with options:
  - "Reassign to..." — dropdown of existing nodes
  - "Remove services" — delete the orphaned service records
  - "Cancel" — revert tree change

### Cascade on node rename

When a node's `name` changes in the tree editor:

```typescript
function onNodeRename(nodeId: string, newName: string, tree: BuildingTree, services: ContractService[]) {
  // 1. Update node name in tree
  tree.nodes = tree.nodes.map(n => n.id === nodeId ? { ...n, name: newName } : n);

  // 2. Rebuild service_path for all services under this node (and descendants)
  const affectedNodeIds = getNodeAndDescendantIds(tree, nodeId);
  for (const svc of services) {
    if (svc.building_node_id && affectedNodeIds.has(svc.building_node_id)) {
      svc.service_path = buildPathFromTree(tree, svc.building_node_id, svc.service_name);
      svc._isDirty = true;
    }
  }
}

function buildPathFromTree(tree: BuildingTree, nodeId: string, serviceName: string): string[] {
  const path: string[] = [];
  let current = tree.nodes.find(n => n.id === nodeId);
  while (current) {
    path.unshift(current.name);
    current = current.parentId ? tree.nodes.find(n => n.id === current!.parentId) : undefined;
  }
  path.push(serviceName);
  return path;
}
```

### Cascade on node move (reparent)

Same as rename — rebuild `service_path` for all services under the moved node and its descendants. The `building_node_id` stays the same (it references the node ID, which doesn't change), but the path changes because the hierarchy changed.

---

## Amendment 5: Auto-Save Conflict Resolution (replaces Section 16.3)

**Problem:** Auto-save + `updated_at` conflict check = users lock themselves out when their own background save bumps the timestamp.

**Fix:** Auto-save is "last writer wins" with no conflict check. Conflict detection only on explicit saves and status transitions, using a session-scoped token.

### Revised Conflict Strategy

**Add column:** `last_saved_session TEXT` on `contracts` table. Stores the saving session's ID.

**Auto-save (30s):** Writes directly. No `updated_at` check. Sets `last_saved_session = sessionId`. This is safe because:
- Auto-save only writes the contract row (per Amendment 3)
- Same user, same form state — no conflict possible within one tab
- If another tab is open, they'll overwrite each other's scalar fields, which is acceptable for drafts

**Explicit "Save" button:** Before writing:
1. Fetch current `last_saved_session` and `updated_at` from DB
2. If `last_saved_session !== mySessionId` AND `updated_at > lastFetchedAt`:
   - Show conflict dialog: "This quotation was modified in another session ({time ago}). Reload to see their changes, or overwrite with yours?"
   - Buttons: "Reload" (refetch) / "Save Anyway" (overwrite)
3. If `last_saved_session === mySessionId`: no conflict possible (our own auto-save), proceed

**Status transitions** (Send, Approve, Reject, Activate, Cancel): Always check `updated_at` against last fetch. These are critical actions that should never silently overwrite.

**Session ID:** Generated once per page mount with `nanoid()`. Stored in a React ref. Not persisted.

---

## Amendment 6: Partial Calendar Push (replaces Section 9.4 "Push to Team Calendar")

**Problem:** "Push to Team Calendar" was disabled if ANY visit on that date was unassigned, blocking all work for one missing assignment.

**Fix:** Push only assigned visits. Show clear count. Warn but don't block.

### Revised "Push to Team Calendar" Button

**Always enabled** when at least 1 visit on the date has a team assignment.

**Button label:** "Push {assignedCount} of {totalCount} to Calendar"
- If all assigned: "Push {totalCount} to Calendar" (green variant, no warning)
- If some unassigned: "Push {assignedCount} of {totalCount} to Calendar" (default variant, warning icon)
- If none assigned: Button disabled, tooltip: "Assign at least one team first"

**On click (partial assignment):**
```
┌──────────────────────────────────────────────────────────────────┐
│  Push Assigned Visits to Calendar                                │
│                                                                   │
│  8 of 12 visits for June 15, 2026 have team assignments.        │
│  Only assigned visits will be pushed to the team calendar.       │
│                                                                   │
│  4 unassigned visits will remain here for later assignment.      │
│                                                                   │
│                      [Cancel]  [Push 8 Visits]                   │
└──────────────────────────────────────────────────────────────────┘
```

**On click (all assigned):** No confirmation needed — push directly.

---

## Amendment 7: Banker's Rounding for Milestones (replaces Section 12.1 milestone math)

**Problem:** `netTotal * percentage / 100` produces floating-point remainders. Three milestones at 33.33% each on a 100,000 QAR contract = 99,990 QAR, leaving 10 QAR unaccounted.

**Fix:** Remainder allocation strategy — compute each milestone normally, then adjust the last one to absorb the rounding delta.

### Revised Milestone Amount Calculation

```typescript
function computeMilestoneAmounts(milestones: ContractMilestone[], netTotal: number): ContractMilestone[] {
  if (milestones.length === 0) return [];

  const computed = milestones.map(m => ({
    ...m,
    amount: Math.round(netTotal * m.percentage / 100),
  }));

  // Adjust last milestone to absorb rounding delta
  const sumWithoutLast = computed.slice(0, -1).reduce((sum, m) => sum + m.amount, 0);
  computed[computed.length - 1].amount = netTotal - sumWithoutLast;

  return computed;
}
```

**Example:**
- Net total: 100,000 QAR
- 3 milestones: 33.33%, 33.33%, 33.34%
- Computed: 33,330 + 33,330 + 33,340 = 100,000 QAR (exact)

**Alternative equal-split example:**
- 3 milestones: 33.33%, 33.33%, 33.33% (sum = 99.99%)
- UI shows validation warning: "Total: 99.99% — Must equal 100%"
- User must adjust to sum to exactly 100% before saving
- With 33.33%, 33.33%, 33.34%: amounts are 33,330 + 33,330 + 33,340 = 100,000 (last absorbs delta)

**Invariant:** `SUM(milestone.amount) === netTotal` always holds after computation. This is enforced in both the UI computation and the database insert (assertion check).

### Database constraint (belt + suspenders)

```sql
-- Add a trigger that validates milestone sum equals contract net total on insert/update
-- (implemented as an application-level check, not a DB trigger, to avoid complexity)
```

The application-level check in `useCreateContractQuotation` and `useUpdateContract`:
```typescript
const milestoneSum = milestones.reduce((sum, m) => sum + m.amount, 0);
const netTotal = subtotal - discount;
if (Math.abs(milestoneSum - netTotal) > 0.01) {
  throw new Error('Milestone amounts do not sum to contract net total');
}
```

---

## Amendment 8: Split Migration Files (replaces Section 19)

**Problem:** PostgreSQL requires `ALTER TYPE ADD VALUE` to be committed in a separate transaction before the new values can be referenced in `CREATE TABLE` or `DEFAULT` clauses within the same migration.

**Fix:** Split into two sequential migration files.

### Migration 1: Enum expansion + column additions

```
supabase/migrations/YYYYMMDDHHMMSS_contracts_enum_and_columns.sql
```

Contents:
- `ALTER TYPE contract_status ADD VALUE IF NOT EXISTS ...` (6 new values)
- `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS ...` (all new columns)
- `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS last_saved_session TEXT` (Amendment 5)

This migration commits first, making the new enum values available.

### Migration 2: New tables + storage

```
supabase/migrations/YYYYMMDDHHMMSS_contracts_tables_and_storage.sql
```

Contents:
- `CREATE TABLE contract_services ...` (with RLS from Amendment 2)
- `CREATE TABLE contract_milestones ...` (with RLS from Amendment 2)
- `CREATE TABLE service_brands ...` (with RLS from Amendment 2)
- Storage bucket creation
- Storage policies

### Apply order

```bash
npx supabase db push   # applies both in filename order
```

The Supabase CLI applies migrations in filename-sorted order, each in its own transaction. The enum values from migration 1 are committed before migration 2 runs, so `DEFAULT 'draft'::contract_status` works correctly.

---

## Amendment 9: Robust Duration Calculation (replaces all `differenceInMonths` usage)

**Problem:** `date-fns` `differenceInMonths` uses strict day boundaries. A contract from Jan 15 to Jan 14 next year = 11 months (not 12), causing pricing distortion.

**Fix:** Use `differenceInCalendarMonths` + day-of-month adjustment for accurate billing periods.

### Revised Duration Calculation

```typescript
import { differenceInCalendarMonths, getDaysInMonth, parseISO } from 'date-fns';

function contractDurationMonths(startDate: string, endDate: string): number {
  const start = parseISO(startDate);
  const end = parseISO(endDate);

  // Calendar month difference (Jan 15 to Feb 14 = 1 calendar month)
  let months = differenceInCalendarMonths(end, start);

  // Adjust: if end day < start day, the last month is incomplete
  // UNLESS end day is the last day of its month (e.g., Feb 28 for a 28-day month)
  const startDay = start.getDate();
  const endDay = end.getDate();
  const endMonthDays = getDaysInMonth(end);

  if (endDay < startDay && endDay !== endMonthDays) {
    months -= 1;
  }

  return Math.max(months, 1); // minimum 1 month
}
```

**Test cases:**

| Start | End | Calendar months | Day adjustment | Result |
|---|---|---|---|---|
| Jan 1, 2026 | Dec 31, 2026 | 11 | 31 >= 1, no adj | 11 months |
| Jan 1, 2026 | Jan 1, 2027 | 12 | 1 >= 1, no adj | 12 months |
| Jan 15, 2026 | Jan 14, 2027 | 12 | 14 < 15, adj -1 | 11 months |
| Jan 15, 2026 | Jan 15, 2027 | 12 | 15 >= 15, no adj | 12 months |
| Mar 1, 2026 | Feb 28, 2027 | 11 | 28 < 1? No — 28 = last day of Feb, no adj | 11 months |

**Wait — Jan 1 to Dec 31 should be 12 months, not 11.** Let me reconsider.

The correct approach for billing: count the number of payment periods, not calendar months.

### Final approach: period-based calculation

```typescript
function paymentPeriodCount(startDate: string, endDate: string, frequency: string): number {
  const start = parseISO(startDate);
  const end = parseISO(endDate);

  const stepFn = {
    monthly: (d: Date) => addMonths(d, 1),
    quarterly: (d: Date) => addMonths(d, 3),
    semi_annual: (d: Date) => addMonths(d, 6),
    annual: (d: Date) => addYears(d, 1),
  }[frequency];

  if (!stepFn) return 1;

  let count = 0;
  let current = start;
  while (current < end) {
    count++;
    current = stepFn(current);
  }
  return Math.max(count, 1);
}
```

This counts how many periods fit between start and end by actually stepping through them. No rounding errors.

**For monthly value display:**
```typescript
const periodCount = paymentPeriodCount(startDate, endDate, 'monthly');
const monthlyValue = periodCount > 0 ? netTotal / periodCount : netTotal;
```

**For fixed payment amount:**
```typescript
const periodCount = paymentPeriodCount(startDate, endDate, paymentFrequency);
const paymentAmount = Math.round(netTotal / periodCount); // round to QAR
// Last payment absorbs remainder: netTotal - (paymentAmount * (periodCount - 1))
```

---

## Amendment 10: Path Rebuild on Tree Mutation (supplements Amendment 4)

**Problem:** `contract_services.service_path` is a static snapshot. If a building node is renamed or moved, the path becomes stale but is never updated.

**Fix:** `rebuildServicePaths()` runs on ANY tree mutation (rename, move, delete+reassign).

### rebuildServicePaths()

```typescript
function rebuildServicePaths(
  tree: BuildingTree,
  services: ContractService[]
): ContractService[] {
  return services.map(svc => {
    if (!svc.building_node_id || svc.is_general) return svc;

    // Build ancestor path from tree
    const ancestorNames: string[] = [];
    let nodeId: string | null = svc.building_node_id;
    while (nodeId) {
      const node = tree.nodes.find(n => n.id === nodeId);
      if (!node) break; // orphan — caught by validateTreeIntegrity
      ancestorNames.unshift(node.name);
      nodeId = node.parentId;
    }

    const newPath = [...ancestorNames, svc.service_name];
    const pathChanged = JSON.stringify(newPath) !== JSON.stringify(svc.service_path);

    return pathChanged
      ? { ...svc, service_path: newPath, _isDirty: true }
      : svc;
  });
}
```

**When called:**
- After any node rename
- After any node reparent (move)
- After reassigning orphaned services to new nodes (from Amendment 4 dialog)
- NOT on node add or delete (add doesn't affect existing paths; delete is blocked if services exist)

**Integration with save:**
The dirty flag (`_isDirty: true`) ensures these path updates are persisted on the next explicit save (per Amendment 3's differential save strategy).

---

## Summary of All Amendments

| # | Issue | Fix | Sections affected |
|---|---|---|---|
| 1 | Global frequency ignores per-service | Per-service visit generation | 8.5, 5.14 |
| 2 | RLS `USING (true)` too permissive | Division-scoped policies | 2.3, 2.4, 2.5 |
| 3 | Clear-and-reinsert on 30s auto-save | Differential save; auto-save only touches contracts row | 7, 10.5 |
| 4 | JSONB orphan risk | `validateTreeIntegrity()` + cascade on rename/move | 2.7 |
| 5 | Auto-save triggers own conflict detection | Session-scoped conflict check; auto-save skips check | 16.3 |
| 6 | Calendar push blocked by 1 unassigned visit | Partial push with count display | 9.4 |
| 7 | Milestone rounding errors | Remainder allocation to last milestone | 12.1, 3.4 |
| 8 | Enum + CREATE TABLE in same transaction | Split into 2 migration files | 19 |
| 9 | `differenceInMonths` day-boundary errors | Period-counting step function | 12.4, 5.14 |
| 10 | Stale service_path on tree mutation | `rebuildServicePaths()` on rename/move | 2.7, 3.2 |
