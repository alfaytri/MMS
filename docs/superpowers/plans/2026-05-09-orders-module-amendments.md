# Orders Module Plan — Amendments

> These amendments patch the base plan (`2026-05-09-orders-module.md`). Apply **before** starting Task 1. Each amendment references the task it modifies.

---

## Amendment A1 — Schema: Concurrency Constraint + is_full_day + parent_assignment_id

**Patches:** Task 1 (DB migration `20260509120000`)

**Issue:** No unique constraint on `(team_id, scheduled_date, time_slot)` — two agents can assign the same team to the same slot simultaneously. Also missing `is_full_day` flag (prevents contract visits with no time from blocking the whole day) and `parent_assignment_id` (needed for multi-day order grouping in Phase 2).

**Action:** Create a new migration that patches `order_team_assignments`:

**Files:**
- Create: `supabase/migrations/20260509120002_order_team_assignments_constraints.sql`

```sql
-- supabase/migrations/20260509120002_order_team_assignments_constraints.sql

-- Prevent two agents from booking the same team into the same slot on the same day
ALTER TABLE order_team_assignments
  ADD CONSTRAINT uq_team_slot
    UNIQUE (team_id, scheduled_date, time_slot);

-- Allows contract visits (which have no specific time) without blocking the whole day
ALTER TABLE order_team_assignments
  ADD COLUMN is_full_day boolean NOT NULL DEFAULT false;

-- Groups multi-day visits so swapping one day doesn't silently move all others
ALTER TABLE order_team_assignments
  ADD COLUMN parent_assignment_id uuid REFERENCES order_team_assignments(id);
```

Apply:
```bash
npx supabase db push
git add supabase/migrations/20260509120002_order_team_assignments_constraints.sql
git commit -m "$(cat <<'EOF'
feat(db): add slot uniqueness constraint, is_full_day, parent_assignment_id to order_team_assignments

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

**Conflict error handling:** When the `uq_team_slot` constraint fires, Supabase returns `error.code === '23505'`. Catch this in `useCreateOrder.submit` and `useOrderActions` and surface: `toast.error('That time slot is already taken — choose a different time or team')`.

---

## Amendment A2 — Schema: Drop address_line from customer_addresses

**Patches:** Task 1 (migration) + Task 6 (`useCustomerAddresses`) + Task 8 (`AddressCreationSheet`)

**Issue:** Persisting `address_line` into `customer_addresses` means stale formatted strings live in the DB forever. If the format changes, old records break. The `orders.address` column (a snapshot per order) is intentionally immutable — that should stay. `customer_addresses.address_line` is not a snapshot; it's a display helper and should be computed.

**Action:**

1. Add migration to drop the column:

```sql
-- supabase/migrations/20260509120003_drop_customer_address_line.sql
ALTER TABLE customer_addresses DROP COLUMN IF EXISTS address_line;
```

2. Update `src/types/orders.ts` — remove `address_line` from `CustomerAddress`:

```typescript
// Remove this line from CustomerAddress:
address_line: string | null   // DELETE

// formatAddressLine now reads the raw fields only (unit_no, building_no, etc.)
// The function already handles null address_line gracefully — no change needed there
```

3. Update `useCustomerAddresses.ts` — remove `address_line` from insert:

```typescript
// In addAddress.mutationFn — remove this line:
const address_line = formatAddressLine(...)   // DELETE

// And remove address_line from the insert:
.insert({ ...input, address_line })  →  .insert(input)
```

4. When writing `orders.address` (in `useCreateOrder.submit`), compute the snapshot there:

```typescript
// In useCreateOrder.submit, replace:
address: draft.addressLine,

// With:
address: draft.addressId
  ? formatAddressLine(draft.addressSnapshot)  // pass snapshot via draft
  : null,
```

Add `addressSnapshot: CustomerAddress | null` to `OrderDraft` in `src/types/orders.ts`.

---

## Amendment A3 — RPC: Atomic Customer Creation (replaces Task 5 quickCreate)

**Patches:** Task 5 (`useCustomerLookup.quickCreate`)

**Issue:** Three separate `insert` calls (customer, phone, optional second phone) from the client are not atomic. A crash between calls leaves orphaned records.

**Action:** Create a Supabase RPC that does all three operations in a single transaction.

**Files:**
- Create: `supabase/migrations/20260509120004_create_customer_with_phone_rpc.sql`

```sql
-- supabase/migrations/20260509120004_create_customer_with_phone_rpc.sql

CREATE OR REPLACE FUNCTION create_customer_with_phone(
  p_name        text,
  p_phone       text,
  p_link_phone  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id   uuid;
  v_phone_id      uuid;
  v_existing_cid  uuid;
BEGIN
  -- Normalise phones
  p_phone      := regexp_replace(p_phone, '\s+', '', 'g');
  p_link_phone := regexp_replace(COALESCE(p_link_phone, ''), '\s+', '', 'g');

  -- If linkPhone already exists, use that customer
  IF p_link_phone <> '' THEN
    SELECT customer_id INTO v_existing_cid
      FROM customer_phones WHERE phone = p_link_phone;
  END IF;

  IF v_existing_cid IS NOT NULL THEN
    v_customer_id := v_existing_cid;
  ELSE
    INSERT INTO customers (name, type)
    VALUES (p_name, 'cash')
    RETURNING id INTO v_customer_id;

    -- Also insert the linkPhone under the new customer if it doesn't exist yet
    IF p_link_phone <> '' THEN
      INSERT INTO customer_phones (customer_id, phone, is_primary)
      VALUES (v_customer_id, p_link_phone, false)
      ON CONFLICT (phone) DO NOTHING;
    END IF;
  END IF;

  -- Insert primary phone
  INSERT INTO customer_phones (customer_id, phone, is_primary)
  VALUES (v_customer_id, p_phone, true)
  RETURNING id INTO v_phone_id;

  RETURN jsonb_build_object(
    'customer_id',   v_customer_id,
    'phone_id',      v_phone_id,
    'customer_name', p_name
  );
END;
$$;
```

Apply and commit:
```bash
npx supabase db push
git add supabase/migrations/20260509120004_create_customer_with_phone_rpc.sql
git commit -m "$(cat <<'EOF'
feat(db): add create_customer_with_phone RPC for atomic customer creation

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

Update `useCustomerLookup.quickCreate` to call the RPC instead of multiple inserts:

```typescript
// Replace the entire quickCreate mutationFn body with:
mutationFn: async ({ name, phone, linkPhone }: { name: string; phone: string; linkPhone?: string }): Promise<CustomerLookupResult> => {
  const { data, error } = await supabase.rpc('create_customer_with_phone', {
    p_name: name.trim(),
    p_phone: phone.trim(),
    p_link_phone: linkPhone?.trim() ?? null,
  })
  if (error) throw error
  return {
    found: true,
    customerId: data.customer_id,
    phoneId: data.phone_id,
    customerName: data.customer_name,
    addressCount: 0,
    orderCount: 0,
  }
},
```

---

## Amendment A4 — Edge Function: Blue Plate API Proxy

**Patches:** Task 6 (`useBlueplate`)

**Issue:** Direct `fetch()` from the browser to Qatar Municipality's API will be blocked by CORS and exposes the API key in the client bundle.

**Action:** Create a Supabase Edge Function as a server-side proxy.

**Files:**
- Create: `supabase/functions/blue-plate-lookup/index.ts`

```typescript
// supabase/functions/blue-plate-lookup/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const BLUE_PLATE_API_URL = Deno.env.get('BLUE_PLATE_API_URL') ?? ''
const BLUE_PLATE_API_KEY = Deno.env.get('BLUE_PLATE_API_KEY') ?? ''

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  const { plate } = await req.json()
  if (!plate) {
    return new Response(JSON.stringify({ error: 'plate required' }), { status: 400 })
  }

  const res = await fetch(`${BLUE_PLATE_API_URL}?plate=${encodeURIComponent(plate)}`, {
    headers: { Authorization: `Bearer ${BLUE_PLATE_API_KEY}` },
  })

  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'Blue Plate not found' }), { status: 404 })
  }

  const data = await res.json()
  return new Response(
    JSON.stringify({
      unit_no: data.unit ?? '',
      building_no: data.building ?? '',
      street_no: data.street ?? '',
      zone_no: data.zone ?? '',
      lat: parseFloat(data.lat),
      lng: parseFloat(data.lng),
      address_line: data.formatted_address ?? '',
    }),
    { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
  )
})
```

Deploy:
```bash
npx supabase functions deploy blue-plate-lookup
```

Set secrets (one-time on the project):
```bash
npx supabase secrets set BLUE_PLATE_API_URL=https://api.qatar-municipality.gov.qa/address
npx supabase secrets set BLUE_PLATE_API_KEY=YOUR_KEY_HERE
```

Update `useBlueplate.ts` to call the Edge Function instead of a direct URL:

```typescript
// Replace the fetch call in useBlueplate:
mutationFn: async (bluePlateNo: string) => {
  const supabase = createClient()
  const { data, error } = await supabase.functions.invoke('blue-plate-lookup', {
    body: { plate: bluePlateNo },
  })
  if (error) throw new Error('Blue Plate not found')
  return data as BlueplateResult
},
```

Commit:
```bash
git add supabase/functions/blue-plate-lookup/index.ts
git commit -m "$(cat <<'EOF'
feat(edge): add blue-plate-lookup Edge Function proxy

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Amendment A5 — Fix: Warranty startOfDay (Task 4)

**Patches:** Task 4 (`src/lib/orders/warrantyUtils.ts`)

**Issue:** `differenceInDays` with raw `new Date()` and `new Date(warrantyExpiresAt)` can return off-by-one results when the browser timezone differs from the server's stored UTC date.

**Action:** Replace the date comparison in `getWarrantyInfo`:

```typescript
// Add to imports:
import { differenceInDays, differenceInMonths, startOfDay } from 'date-fns'

// Replace inside getWarrantyInfo:
const today = startOfDay(new Date())
const expiry = startOfDay(new Date(warrantyExpiresAt))
```

Update the test to match:
```typescript
// The existing test already uses vi.setSystemTime(new Date('2026-05-09'))
// startOfDay on a date set to midnight doesn't change anything — tests pass unchanged
```

---

## Amendment A6 — Fix: DnD handleDragEnd uses data.current (Task 13)

**Patches:** Task 13 (`src/app/(dashboard)/orders/create/page.tsx`)

**Issue:** `String(over.id).split('-')[0]` to extract team name is fragile. The `DroppableCell` already passes `data: { teamId, hour }` — use it.

**Action:** Replace `handleDragEnd` in the Create Order page:

```typescript
function handleDragEnd(event: DragEndEvent) {
  setDraggingService(null)
  const { active, over } = event
  if (!over || !active.data.current) return

  const service = active.data.current.service as OrderServiceDraft
  const { teamId, hour } = over.data.current as { teamId: string; hour: number }
  const timeSlot = `${String(hour).padStart(2, '0')}:00`

  addAssignment({
    teamId,
    teamName: teamId,   // resolved to real name by TeamCalendarPanel via useTeams lookup
    services: [{ serviceId: service.serviceId, qty: service.qty }],
    timeSlot,
    duration: service.duration,
  })
}
```

Also resolve `teamName` properly: pass a `teamNameById` map from `useTeams` into the Create Order page and look it up by `teamId` when creating the assignment.

---

## Amendment A7 — Fix: useCustomerHistory server-side pagination (Task 12)

**Patches:** Task 12 (`src/hooks/useCustomerHistory.ts`)

**Issue:** Hook fetches the entire month's orders/products, then the component slices client-side. High-volume customers cause unnecessary data transfer and render lag.

**Action:** Change `useCustomerHistory` to accept a `page` parameter and use Supabase `.range()`:

```typescript
// Change signature:
export function useCustomerHistory(
  customerId: string | null,
  year: number,
  month: number,
  orderPage: number = 0,      // new
  productPage: number = 0,    // new
  pageSize: number = 4        // new
)

// In orders query, replace select + order with:
const { data: orderItems, error, count: orderCount } = await supabase
  .from('orders')
  .select('id, order_id, status, scheduled_date, has_invoice, invoice_number', { count: 'exact' })
  .eq('customer_id', customerId)
  .gte('scheduled_date', startDate)
  .lte('scheduled_date', endDate)
  .order('scheduled_date', { ascending: false })
  .range(orderPage * pageSize, (orderPage + 1) * pageSize - 1)

// Return totalOrderCount alongside items so CustomerHistoryPanel can show page controls
return { orders: { data: orderItems, count: orderCount, isLoading }, products: { ... } }
```

Update `CustomerHistoryPanel` to:
- Move `orderPage` and `productPage` state into the component (already there)
- Pass them as args to `useCustomerHistory` instead of slicing locally
- Use `count` from the hook response for pagination controls instead of `items.length`
- Remove the `slice()` calls entirely

---

## Deferred Items (Phase 2)

These are valid improvements that are out of scope for Phase 1. Document them here so they aren't lost.

| Item | Why Deferred | Phase 2 Task |
|---|---|---|
| Proximity dispatching (team scoring by travel time) | Requires map integration + routing API | Map Module |
| Waitlist "Fill Slot" button on cancellation | New UX flow, not a bug fix | Orders Phase 2 |
| Multi-day visit `parent_assignment_id` logic | Column added (A1), swap logic deferred | Calendar Phase 2 |
| Post-visit product spawning (job completion form) | Requires Team Leader App (mobile) | Team App Phase |

---

## Amended Build Order

Run these additional steps **between** Task 1 and Task 2 of the base plan:

```
Task 1   (base) — customer_phones + customer_addresses migrations
Amendment A1   — order_team_assignments constraints migration
Amendment A2   — drop address_line migration + type update
Amendment A3   — create_customer_with_phone RPC migration
Amendment A4   — blue-plate-lookup Edge Function
Task 2   (base) — installed_products migration
... Tasks 3–18 continue as written ...
Amendment A5   — apply during Task 4 (warrantyUtils)
Amendment A6   — apply during Task 13 (Create Order page)
Amendment A7   — apply during Task 12 (useCustomerHistory)
```
