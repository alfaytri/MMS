# Pre-CRM Patch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split service customers from SO customers, scope teams by Company → Division, and filter the Create Order division dropdown by user access — before building the Contact Centre / CRM module.

**Architecture:** Four independent patches applied sequentially. Patches 1–2 each require a DB migration followed by frontend updates. Patch 3 is a single hook swap in `OrderFormPanel.tsx`. Patch 4 is already implemented and requires no work.

**Tech Stack:** Next.js 15, Supabase (Postgres + RLS), TanStack Query, TypeScript, Tailwind CSS, shadcn/ui, react-hook-form

---

## Pre-flight: Patch 4 Already Done

Open `src/components/orders/OrderFormPanel.tsx` lines 230–250. The service selector is already conditionally rendered: when `selectedDivisions.length === 0` it shows `"Select a division first"`. **No work needed for Patch 4.**

---

## PATCH 1 — Service Customers Table Split

### File Map

| File | Action |
|---|---|
| `supabase/migrations/YYYYMMDDHHMMSS_service_customers.sql` | Create — 3 new tables + RLS + partial index |
| `supabase/migrations/YYYYMMDDHHMMSS_service_customer_backfill.sql` | Create — Migration A: add service_customer_id to orders/quotations + backfill |
| `supabase/migrations/YYYYMMDDHHMMSS_update_rpcs_service_customer.sql` | Create — Update RPCs to use service_customer_id |
| `src/hooks/useCustomerLookup.ts` | Modify — query service_customer_phones + service_customers |
| `src/hooks/useCustomerAddresses.ts` | Modify — query service_customer_addresses |
| `src/types/orders.ts` | Modify — verify CustomerAddress type matches service_customer_addresses |

---

### Task 1: Create service_customers tables

**Files:**
- Create: `supabase/migrations/20260511100000_service_customers.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260511100000_service_customers.sql

-- ── 1. service_customers ──────────────────────────────────────────────────────
CREATE TABLE public.service_customers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  name_ar    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. service_customer_phones ────────────────────────────────────────────────
CREATE TABLE public.service_customer_phones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.service_customers(id) ON DELETE CASCADE,
  phone       TEXT NOT NULL,
  label       TEXT,         -- 'mobile' | 'work' | 'home'
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce max one primary phone per customer at the DB level
CREATE UNIQUE INDEX idx_one_primary_phone
  ON public.service_customer_phones (customer_id)
  WHERE (is_primary = true);

-- ── 3. service_customer_addresses ─────────────────────────────────────────────
CREATE TABLE public.service_customer_addresses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL REFERENCES public.service_customers(id) ON DELETE CASCADE,
  address_type TEXT NOT NULL CHECK (address_type IN ('blue-plate', 'google-coords')),
  label        TEXT,
  unit         TEXT,
  building     TEXT,
  street       TEXT,
  zone         TEXT,
  lat          NUMERIC,
  lng          NUMERIC,
  is_primary   BOOLEAN NOT NULL DEFAULT false,
  tags         TEXT[] NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 4. updated_at trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_service_customers_updated_at
  BEFORE UPDATE ON public.service_customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 5. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.service_customers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_customer_phones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_customer_addresses ENABLE ROW LEVEL SECURITY;

-- Internal users can read all three tables
CREATE POLICY "internal_select_service_customers"
  ON public.service_customers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "internal_select_service_customer_phones"
  ON public.service_customer_phones FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "internal_select_service_customer_addresses"
  ON public.service_customer_addresses FOR SELECT
  TO authenticated
  USING (true);

-- Any authenticated user can insert/update (agents create customers inline)
CREATE POLICY "internal_write_service_customers"
  ON public.service_customers FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "internal_write_service_customer_phones"
  ON public.service_customer_phones FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "internal_write_service_customer_addresses"
  ON public.service_customer_addresses FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Apply migration**

```powershell
npx supabase db push
```

Expected: `Applying migration 20260511100000_service_customers.sql... done`

- [ ] **Step 3: Commit**

```powershell
git add supabase/migrations/20260511100000_service_customers.sql
git commit -m "$(cat <<'EOF'
feat(db): create service_customers, phones, and addresses tables

Separate field-service customer data from SO customers.
Includes partial unique index on is_primary and RLS policies.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Create RPC for service customer creation

The existing `create_customer_with_phone` RPC writes to the `customers` table. Create a new RPC that writes to `service_customers` + `service_customer_phones`.

**Files:**
- Create: `supabase/migrations/20260511100001_create_service_customer_rpc.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260511100001_create_service_customer_rpc.sql

CREATE OR REPLACE FUNCTION public.create_service_customer(
  p_name       TEXT,
  p_phone      TEXT,
  p_link_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id UUID;
  v_phone_id    UUID;
BEGIN
  -- Check if phone already exists
  SELECT scp.customer_id, scp.id
    INTO v_customer_id, v_phone_id
    FROM public.service_customer_phones scp
   WHERE scp.phone = p_phone
   LIMIT 1;

  IF v_customer_id IS NOT NULL THEN
    -- Return existing customer
    RETURN jsonb_build_object(
      'customer_id',   v_customer_id,
      'phone_id',      v_phone_id,
      'customer_name', (SELECT name FROM public.service_customers WHERE id = v_customer_id)
    );
  END IF;

  -- Create new customer
  INSERT INTO public.service_customers (name)
  VALUES (p_name)
  RETURNING id INTO v_customer_id;

  -- Insert primary phone
  INSERT INTO public.service_customer_phones (customer_id, phone, label, is_primary)
  VALUES (v_customer_id, p_phone, 'mobile', true)
  RETURNING id INTO v_phone_id;

  -- Insert optional second phone (not primary)
  IF p_link_phone IS NOT NULL AND p_link_phone <> '' THEN
    INSERT INTO public.service_customer_phones (customer_id, phone, label, is_primary)
    VALUES (v_customer_id, p_link_phone, 'mobile', false);
  END IF;

  RETURN jsonb_build_object(
    'customer_id',   v_customer_id,
    'phone_id',      v_phone_id,
    'customer_name', p_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_service_customer TO authenticated;
```

- [ ] **Step 2: Apply migration**

```powershell
npx supabase db push
```

Expected: `Applying migration 20260511100001_create_service_customer_rpc.sql... done`

- [ ] **Step 3: Commit**

```powershell
git add supabase/migrations/20260511100001_create_service_customer_rpc.sql
git commit -m "$(cat <<'EOF'
feat(db): add create_service_customer RPC

Writes to service_customers + service_customer_phones.
Handles duplicate phone gracefully by returning existing customer.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Migration A — Add service_customer_id to orders + quotations, backfill

**Files:**
- Create: `supabase/migrations/20260511100002_orders_service_customer_backfill.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260511100002_orders_service_customer_backfill.sql
-- Migration A: Add service_customer_id (nullable) and backfill from customers.
-- The old customer_id column is NOT dropped here — see Migration B (Task 11).

-- ── 1. Add nullable column to orders ─────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_customer_id UUID
    REFERENCES public.service_customers(id);

-- ── 2. Add nullable column to quotations ─────────────────────────────────────
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS service_customer_id UUID
    REFERENCES public.service_customers(id);

-- ── 3. Backfill: for every unique customer referenced by orders, create a
--      service_customers row (copy name/name_ar) and a primary phone row.
--      Use a CTE with INSERT ... ON CONFLICT DO NOTHING for idempotency.
WITH distinct_order_customers AS (
  SELECT DISTINCT o.customer_id
    FROM public.orders o
   WHERE o.customer_id IS NOT NULL
),
-- Insert into service_customers only if not already created
inserted_service_customers AS (
  INSERT INTO public.service_customers (id, name, name_ar)
  SELECT
    gen_random_uuid(),
    COALESCE(c.name, 'Unknown'),
    c.name_ar
  FROM distinct_order_customers doc
  JOIN public.customers c ON c.id = doc.customer_id
  ON CONFLICT DO NOTHING
  RETURNING id
),
-- We need a mapping from old customer_id → new service_customer_id.
-- Build it by matching on name (since we just inserted fresh rows).
-- For safety, use a temp table keyed by old customer_id.
mapping AS (
  SELECT
    doc.customer_id AS old_id,
    sc.id           AS new_id
  FROM distinct_order_customers doc
  JOIN public.customers c ON c.id = doc.customer_id
  JOIN public.service_customers sc
    ON sc.name = COALESCE(c.name, 'Unknown')
   AND sc.created_at >= now() - interval '1 minute'
)
-- Update orders
UPDATE public.orders o
   SET service_customer_id = m.new_id
  FROM mapping m
 WHERE o.customer_id = m.old_id
   AND o.service_customer_id IS NULL;

-- ── 4. Backfill phones from customers.phone ───────────────────────────────────
INSERT INTO public.service_customer_phones (customer_id, phone, label, is_primary)
SELECT DISTINCT
  o.service_customer_id,
  c.phone,
  'mobile',
  true
FROM public.orders o
JOIN public.customers c ON c.id = o.customer_id
WHERE o.service_customer_id IS NOT NULL
  AND c.phone IS NOT NULL
  AND c.phone <> ''
ON CONFLICT DO NOTHING;

-- ── 5. Backfill quotations ────────────────────────────────────────────────────
WITH distinct_quot_customers AS (
  SELECT DISTINCT q.customer_id
    FROM public.quotations q
   WHERE q.customer_id IS NOT NULL
)
UPDATE public.quotations q
   SET service_customer_id = sc.id
  FROM distinct_quot_customers dqc
  JOIN public.customers c ON c.id = dqc.customer_id
  JOIN public.service_customers sc
    ON sc.name = COALESCE(c.name, 'Unknown')
 WHERE q.customer_id = dqc.customer_id
   AND q.service_customer_id IS NULL;

-- ── 6. Set NOT NULL now that backfill is complete ─────────────────────────────
-- Only set NOT NULL if every row has been backfilled (safe guard).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.orders WHERE service_customer_id IS NULL AND customer_id IS NOT NULL
  ) THEN
    ALTER TABLE public.orders ALTER COLUMN service_customer_id SET NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.quotations WHERE service_customer_id IS NULL AND customer_id IS NOT NULL
  ) THEN
    ALTER TABLE public.quotations ALTER COLUMN service_customer_id SET NOT NULL;
  END IF;
END;
$$;
```

- [ ] **Step 2: Apply migration**

```powershell
npx supabase db push
```

Expected: `Applying migration 20260511100002_orders_service_customer_backfill.sql... done`

- [ ] **Step 3: Commit**

```powershell
git add supabase/migrations/20260511100002_orders_service_customer_backfill.sql
git commit -m "$(cat <<'EOF'
feat(db): Migration A — add service_customer_id to orders + quotations

Backfills service_customers and service_customer_phones from existing
customers table data. Old customer_id column retained until Migration B.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Update RPCs — create_order_with_dates and save_quotation

The existing RPCs accept `p_customer_id`. Update them to accept `p_service_customer_id` instead.

**Files:**
- Create: `supabase/migrations/20260511100003_update_order_rpcs_service_customer.sql`

- [ ] **Step 1: Write the migration**

Read the current RPC definitions first:
```powershell
npx supabase db diff --schema public 2>$null | Select-String -Pattern "create_order_with_dates|save_quotation|create_site_visit" -Context 0,5
```

Then write the updated RPCs. The key change in each: replace `p_customer_id` parameter with `p_service_customer_id`, and update the INSERT to use `service_customer_id` column instead of `customer_id`.

```sql
-- supabase/migrations/20260511100003_update_order_rpcs_service_customer.sql
-- Update create_order_with_dates to write service_customer_id instead of customer_id.
-- The full RPC body is preserved; only the parameter name and INSERT column change.

-- Drop and recreate (Postgres requires DROP to change parameter names)
DROP FUNCTION IF EXISTS public.create_order_with_dates CASCADE;

CREATE OR REPLACE FUNCTION public.create_order_with_dates(
  p_order_id           TEXT,
  p_service_customer_id UUID,       -- ← renamed from p_customer_id
  p_type               TEXT,
  p_division           TEXT,
  p_status             TEXT,
  p_scheduled_date     DATE,
  p_total_amount       NUMERIC,
  p_address            TEXT,
  p_notes              TEXT,
  p_arrival_phone      TEXT,
  p_attachments        JSONB        DEFAULT NULL,
  p_services           JSONB        DEFAULT '[]',
  p_visit_dates        JSONB        DEFAULT '[]',
  p_assignments        JSONB        DEFAULT '[]'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_uuid UUID;
  v_svc        JSONB;
  v_vd         JSONB;
  v_asgn       JSONB;
BEGIN
  INSERT INTO public.orders (
    order_id, service_customer_id, type, division, status,
    scheduled_date, total_amount, address, notes, arrival_phone, attachments
  ) VALUES (
    p_order_id, p_service_customer_id, p_type, p_division, p_status,
    p_scheduled_date, p_total_amount, p_address, p_notes, p_arrival_phone, p_attachments
  ) RETURNING id INTO v_order_uuid;

  -- Insert services
  FOR v_svc IN SELECT * FROM jsonb_array_elements(p_services) LOOP
    INSERT INTO public.order_services (
      order_id, service_id, name, qty, price, duration, path, configuration, from_time, to_time
    ) VALUES (
      v_order_uuid,
      (v_svc->>'service_id')::UUID,
      v_svc->>'name',
      (v_svc->>'qty')::INT,
      (v_svc->>'price')::NUMERIC,
      (v_svc->>'duration')::INT,
      v_svc->'path',
      v_svc->'configuration',
      (v_svc->>'from_time')::TIME,
      (v_svc->>'to_time')::TIME
    );
  END LOOP;

  -- Insert visit dates
  FOR v_vd IN SELECT * FROM jsonb_array_elements(p_visit_dates) LOOP
    INSERT INTO public.order_visit_dates (order_id, visit_date, from_time, to_time, sort_order)
    VALUES (
      v_order_uuid,
      (v_vd->>'visit_date')::DATE,
      (v_vd->>'from_time')::TIME,
      (v_vd->>'to_time')::TIME,
      (v_vd->>'sort_order')::INT
    );
  END LOOP;

  -- Insert team assignments (with slot conflict check)
  FOR v_asgn IN SELECT * FROM jsonb_array_elements(p_assignments) LOOP
    IF EXISTS (
      SELECT 1 FROM public.order_team_assignments
       WHERE team_id        = (v_asgn->>'team_id')::UUID
         AND scheduled_date = (v_asgn->>'scheduled_date')::DATE
         AND time_slot      = v_asgn->>'time_slot'
         AND status        <> 'cancelled'
    ) THEN
      RAISE EXCEPTION 'slot_conflict:% % %',
        v_asgn->>'team_id', v_asgn->>'scheduled_date', v_asgn->>'time_slot';
    END IF;

    INSERT INTO public.order_team_assignments (
      order_id, team_id, scheduled_date, time_slot, duration, services, status
    ) VALUES (
      v_order_uuid,
      (v_asgn->>'team_id')::UUID,
      (v_asgn->>'scheduled_date')::DATE,
      v_asgn->>'time_slot',
      v_asgn->>'duration',
      v_asgn->'services',
      'scheduled'
    );
  END LOOP;

  RETURN p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order_with_dates TO authenticated;

-- ── save_quotation ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.save_quotation CASCADE;

CREATE OR REPLACE FUNCTION public.save_quotation(
  p_quotation_id        TEXT,
  p_service_customer_id UUID,       -- ← renamed from p_customer_id
  p_division            TEXT,
  p_status              TEXT,
  p_total_amount        NUMERIC,
  p_notes               TEXT,
  p_expiry_date         DATE,
  p_sent_date           TIMESTAMPTZ DEFAULT NULL,
  p_line_items          JSONB       DEFAULT '[]'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uuid UUID;
  v_line JSONB;
BEGIN
  INSERT INTO public.quotations (
    quotation_id, service_customer_id, division, status,
    total_amount, notes, expiry_date, sent_date
  ) VALUES (
    p_quotation_id, p_service_customer_id, p_division, p_status,
    p_total_amount, p_notes, p_expiry_date, p_sent_date
  )
  ON CONFLICT (quotation_id) DO UPDATE SET
    service_customer_id = EXCLUDED.service_customer_id,
    division            = EXCLUDED.division,
    status              = EXCLUDED.status,
    total_amount        = EXCLUDED.total_amount,
    notes               = EXCLUDED.notes,
    expiry_date         = EXCLUDED.expiry_date,
    sent_date           = EXCLUDED.sent_date,
    updated_at          = now()
  RETURNING id INTO v_uuid;

  -- Replace line items
  DELETE FROM public.quotation_lines WHERE quotation_id = v_uuid;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_line_items) LOOP
    INSERT INTO public.quotation_lines (
      quotation_id, service_id, name, path, qty, price, duration
    ) VALUES (
      v_uuid,
      NULLIF(v_line->>'service_id', '')::UUID,
      v_line->>'name',
      v_line->'path',
      (v_line->>'qty')::INT,
      (v_line->>'price')::NUMERIC,
      NULLIF(v_line->>'duration', '')::INT
    );
  END LOOP;

  RETURN v_uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_quotation TO authenticated;
```

> **Important:** Before running this migration, read the actual current RPC body from Supabase dashboard → Database → Functions for `create_order_with_dates`, `create_site_visit`, and `save_quotation`. The bodies above match the pattern observed in `useCreateOrder.ts` but the real DB functions may have additional logic. Merge any extra logic before applying.
>
> **Also update `create_site_visit`:** The site-visit path in `useCreateOrder.ts` (~line 239) also calls `create_site_visit` with `p_customer_id`. Apply the same rename (`p_customer_id` → `p_service_customer_id`, INSERT column `customer_id` → `service_customer_id`) to `create_site_visit` in this same migration file.

- [ ] **Step 2: Apply migration**

```powershell
npx supabase db push
```

- [ ] **Step 3: Commit**

```powershell
git add supabase/migrations/20260511100003_update_order_rpcs_service_customer.sql
git commit -m "$(cat <<'EOF'
feat(db): update create_order_with_dates and save_quotation RPCs

Replace p_customer_id with p_service_customer_id parameter.
Orders and quotations now write to service_customer_id column.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Update useCustomerLookup — query service_customer_phones

**Files:**
- Modify: `src/hooks/useCustomerLookup.ts`

- [ ] **Step 1: Rewrite the hook**

Replace the entire file contents:

```typescript
// src/hooks/useCustomerLookup.ts
import { useMutation } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface CustomerLookupResult {
  found: true
  customerId: string
  phoneId: string
  customerName: string
  phone: string
  addressCount: number
  orderCount: number
}

export interface CustomerNotFound {
  found: false
}

export type LookupResult = CustomerLookupResult | CustomerNotFound

export function useCustomerLookup() {
  const supabase = createClient()

  const lookupPhone = useMutation({
    mutationFn: async (phone: string): Promise<LookupResult> => {
      const normalizedPhone = phone.replace(/\s+/g, '')

      const { data, error } = await (supabase as any)
        .from('service_customer_phones')
        .select(`
          id,
          customer_id,
          service_customers!inner(id, name, service_customer_addresses(id))
        `)
        .eq('phone', normalizedPhone)
        .single()

      if (!error && data) {
        const customer = data.service_customers as any
        const { count: orderCount } = await (supabase as any)
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('service_customer_id', data.customer_id)

        return {
          found: true,
          customerId: data.customer_id,
          phoneId: data.id,
          customerName: customer.name,
          phone: normalizedPhone,
          addressCount: (customer.service_customer_addresses as any[]).length,
          orderCount: orderCount ?? 0,
        }
      }

      return { found: false }
    },
  })

  const quickCreate = useMutation({
    mutationFn: async ({
      name,
      phone,
      linkPhone,
    }: {
      name: string
      phone: string
      linkPhone?: string | null
      entityType?: 'individual' | 'business'
    }): Promise<CustomerLookupResult> => {
      const { data, error } = await (supabase as any).rpc('create_service_customer', {
        p_name:       name.trim(),
        p_phone:      phone.trim(),
        p_link_phone: linkPhone?.trim() ?? null,
      })
      if (error || !data) throw new Error(error?.message ?? 'Failed to create customer')

      const result = data as any
      return {
        found: true,
        customerId: result.customer_id,
        phoneId:    result.phone_id,
        customerName: result.customer_name,
        phone:      phone.trim(),
        addressCount: 0,
        orderCount:   0,
      }
    },
  })

  return { lookupPhone, quickCreate }
}
```

- [ ] **Step 2: Check PhoneLookupModal still compiles**

The `PhoneLookupModal` uses `useCustomerLookup` — the interface (`CustomerLookupResult`, `LookupResult`, `quickCreate`, `lookupPhone`) is unchanged so no changes needed there. The `entityType` parameter is silently ignored in `quickCreate` now (service customers don't have entity type) — this is intentional.

- [ ] **Step 3: Commit**

```powershell
git add src/hooks/useCustomerLookup.ts
git commit -m "$(cat <<'EOF'
feat(orders): useCustomerLookup now queries service_customer_phones

Phone lookup and quick create now target service_customers tables.
Removes fallback to old customers table.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Update useCustomerAddresses — query service_customer_addresses

**Files:**
- Modify: `src/hooks/useCustomerAddresses.ts`

- [ ] **Step 1: Update the hook**

Replace `customer_addresses` with `service_customer_addresses`:

```typescript
// src/hooks/useCustomerAddresses.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { CustomerAddress } from '@/types/orders'

export function useCustomerAddresses(customerId: string | null) {
  const supabase = createClient()
  const qc = useQueryClient()

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ['service-customer-addresses', customerId],
    queryFn: async (): Promise<CustomerAddress[]> => {
      if (!customerId) return []
      const { data, error } = await (supabase as any)
        .from('service_customer_addresses')
        .select('*')
        .eq('customer_id', customerId)
        .order('is_primary', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!customerId,
  })

  const addAddress = useMutation({
    mutationFn: async (
      input: Omit<CustomerAddress, 'id' | 'created_at'>
    ): Promise<CustomerAddress> => {
      const { data, error } = await (supabase as any)
        .from('service_customer_addresses')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-customer-addresses', customerId] })
    },
  })

  return { addresses, isLoading, addAddress }
}
```

- [ ] **Step 2: Commit**

```powershell
git add src/hooks/useCustomerAddresses.ts
git commit -m "$(cat <<'EOF'
feat(orders): useCustomerAddresses queries service_customer_addresses

Address picker now reads from the service-customer-specific table.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Update useCreateOrder — use service_customer_id in RPC call

**Files:**
- Modify: `src/hooks/useCreateOrder.ts`

- [ ] **Step 1: Update the RPC call**

In `useCreateOrder.ts`, find the two RPC calls and change `p_customer_id` to `p_service_customer_id`:

In the site-visit path (~line 239):
```typescript
// Before:
const { data: newId, error } = await (supabase as any).rpc('create_site_visit', {
  p_visit_id:       visitId,
  p_customer_id:    draft.customerId,   // ← change this line
  ...
})

// After:
const { data: newId, error } = await (supabase as any).rpc('create_site_visit', {
  p_visit_id:            visitId,
  p_service_customer_id: draft.customerId,   // ← updated
  ...
})
```

In the regular order path (~line 299):
```typescript
// Before:
const { data: newOrderId, error } = await (supabase as any).rpc('create_order_with_dates', {
  p_order_id:       orderId,
  p_customer_id:    draft.customerId,   // ← change this line
  ...
})

// After:
const { data: newOrderId, error } = await (supabase as any).rpc('create_order_with_dates', {
  p_order_id:            orderId,
  p_service_customer_id: draft.customerId,   // ← updated
  ...
})
```

- [ ] **Step 2: Commit**

```powershell
git add src/hooks/useCreateOrder.ts
git commit -m "$(cat <<'EOF'
feat(orders): useCreateOrder passes service_customer_id to RPCs

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Update useEditOrder — read service_customer_id from order

**Files:**
- Modify: `src/hooks/useEditOrder.ts`

- [ ] **Step 1: Update draft initialisation**

In `useEditOrder.ts` around line 79, the draft is populated from `order.customer_id`. After Migration A, the `orders` table has `service_customer_id`. Update the relevant line:

```typescript
// Before (line ~79):
customerId: order.customer_id,

// After:
customerId: (order as any).service_customer_id ?? order.customer_id,
```

The `?? order.customer_id` fallback is a safety net during the transition period before Migration B drops the old column. Once Migration B runs and code is stable, remove the fallback.

Also update the submit RPC call in `useEditOrder.ts` — find the `update_order` or equivalent RPC call and change `p_customer_id` to `p_service_customer_id` (same pattern as Task 7).

- [ ] **Step 2: Commit**

```powershell
git add src/hooks/useEditOrder.ts
git commit -m "$(cat <<'EOF'
feat(orders): useEditOrder reads service_customer_id from order

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Update useCreateQuotation — use service_customer_id

**Files:**
- Modify: `src/hooks/useCreateQuotation.ts`

- [ ] **Step 1: Update the RPC call**

In `useCreateQuotation.ts` around line 111, find the `save_quotation` RPC call:

```typescript
// Before:
const { data: quotUuid, error } = await (supabase as any).rpc('save_quotation', {
  p_quotation_id: draft.quotationId,
  p_customer_id:  draft.customerId,    // ← change this line
  ...
})

// After:
const { data: quotUuid, error } = await (supabase as any).rpc('save_quotation', {
  p_quotation_id:        draft.quotationId,
  p_service_customer_id: draft.customerId,   // ← updated
  ...
})
```

- [ ] **Step 2: Commit**

```powershell
git add src/hooks/useCreateQuotation.ts
git commit -m "$(cat <<'EOF'
feat(quotations): useCreateQuotation passes service_customer_id to RPC

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## PATCH 2 — Teams Scoped by Company → Division

### File Map

| File | Action |
|---|---|
| `supabase/migrations/20260511200000_teams_division_fk.sql` | Create — drop enum, add division_id FK, backfill |
| `src/hooks/useTeams.ts` | Modify — update division filter + TeamFull type |
| `src/components/teams/dialogs/TeamEditDialog.tsx` | Modify — Company → Division cascade picker |
| `src/components/teams/TeamGrid.tsx` | Modify — group teams by Company → Division |

---

### Task 10: Migration — teams.division enum → division_id FK

**Files:**
- Create: `supabase/migrations/20260511200000_teams_division_fk.sql`

- [ ] **Step 1: Write the migration**

Before writing the SQL, verify division slugs match enum values by querying the DB:
```powershell
npx supabase db --help 2>$null
# Or check in Supabase dashboard: Table Editor → divisions
# Confirm: which division has slug 'alfaytri-maintenance', 'alfaytri-kitchen', 'rsh'
```

```sql
-- supabase/migrations/20260511200000_teams_division_fk.sql

-- ── 1. Add new division_id column (nullable during backfill) ──────────────────
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS division_id UUID REFERENCES public.divisions(id);

-- ── 2. Backfill: map enum strings to division UUIDs by slug ──────────────────
UPDATE public.teams t
   SET division_id = d.id
  FROM public.divisions d
 WHERE (t.division::text) = d.slug
   AND t.division_id IS NULL;

-- ── 3. Set NOT NULL (every team must belong to a division) ────────────────────
ALTER TABLE public.teams
  ALTER COLUMN division_id SET NOT NULL;

-- ── 4. Drop old division enum column ─────────────────────────────────────────
ALTER TABLE public.teams DROP COLUMN IF EXISTS division;

-- ── 5. Drop enum type if nothing else references it ──────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE t.typname = 'team_division'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND c.relname <> 'teams'
  ) THEN
    DROP TYPE IF EXISTS public.team_division;
  END IF;
END;
$$;
```

- [ ] **Step 2: Apply migration**

```powershell
npx supabase db push
```

Expected: `Applying migration 20260511200000_teams_division_fk.sql... done`

- [ ] **Step 3: Commit**

```powershell
git add supabase/migrations/20260511200000_teams_division_fk.sql
git commit -m "$(cat <<'EOF'
feat(db): teams.division enum → division_id FK

Backfills from slug matching. Drops hardcoded enum.
Teams are now dynamically scoped to any division.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Update useTeams — division_id filter + join divisions

**Files:**
- Modify: `src/hooks/useTeams.ts`

- [ ] **Step 1: Update TeamsFilters and useTeams query**

In `src/hooks/useTeams.ts`:

1. Update `TeamsFilters` interface (~line 72):
```typescript
export interface TeamsFilters {
  search?:     string
  divisionId?: string | null   // now a UUID, not an enum slug
}
```

2. Update the query to join divisions:
```typescript
// In the query, change the teams select to include division:
(supabase.from('teams') as any)
  .select('*, divisions(id, slug, name, company_id, companies(id, name_en))')
  .is('deleted_at', null)
  .order('name_en', { nullsFirst: false }),
```

3. Update `TeamFull` to include division:
```typescript
export interface TeamFull extends TeamRaw {
  leader:    Employee | null
  members:   Employee[]
  vehicle:   Vehicle | null
  schedule:  Schedule | null
  division:  { id: string; slug: string; name: string; company_id: string; company_name: string } | null
}
```

4. Update the filter logic (~line 131):
```typescript
// Before:
if (filters?.divisionId) {
  result = result.filter(t => (t as unknown as Record<string, unknown>).division === filters.divisionId)
}

// After:
if (filters?.divisionId) {
  result = result.filter(t => t.division_id === filters.divisionId)
}
```

5. Update the TeamFull mapping to include the joined division:
```typescript
let result: TeamFull[] = teams.map(t => ({
  ...t,
  leader:   t.leader_id ? (empById.get(t.leader_id) ?? null) : null,
  members:  employees.filter(e => e.team_id === t.id),
  vehicle:  vehByTeam.get(t.id) ?? null,
  schedule: t.schedule_id ? (schById.get(t.schedule_id) ?? null) : null,
  division: (t as any).divisions
    ? {
        id:           (t as any).divisions.id,
        slug:         (t as any).divisions.slug,
        name:         (t as any).divisions.name,
        company_id:   (t as any).divisions.company_id,
        company_name: (t as any).divisions.companies?.name_en ?? '',
      }
    : null,
}))
```

- [ ] **Step 2: Commit**

```powershell
git add src/hooks/useTeams.ts
git commit -m "$(cat <<'EOF'
feat(teams): useTeams joins divisions table, filters by division_id UUID

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Update TeamEditDialog — Company → Division cascade

**Files:**
- Modify: `src/components/teams/dialogs/TeamEditDialog.tsx`

- [ ] **Step 1: Add company state + fetch hooks**

At the top of the file, add imports:
```typescript
import { useCompanies } from '@/hooks/useCompanies'
import { useDivisions } from '@/hooks/useDivisions'
```

- [ ] **Step 2: Update TeamFormValues**

Replace the `division` field (was enum `TeamDivision`) with `company_id` + `division_id`:

```typescript
// Remove:
type TeamDivision = 'alfaytri-maintenance' | 'alfaytri-kitchen' | 'rsh'
const DIVISION_OPTIONS: { value: TeamDivision; label: string }[] = [...]

// Replace TeamFormValues field:
interface TeamFormValues {
  name_en:              string
  name_ar:              string
  company_id:           string    // ← new: pick company first
  division_id:          string    // ← was: division (enum)
  countryCode:          string
  phoneNumber:          string
  is_emergency:         boolean
  is_qc:                boolean
  site_visit_order:     boolean
  site_visit_quotation: boolean
  traccar_device_id:    string
}
```

- [ ] **Step 3: Add hooks and filtered divisions state**

Inside `TeamEditDialog` component, after existing hooks:
```typescript
const { data: companies = [] } = useCompanies()
const { data: allDivisions = [] } = useDivisions()

const selectedCompanyId = form.watch('company_id')
const filteredDivisions = allDivisions.filter(
  (d) => d.company_id === selectedCompanyId
)
```

- [ ] **Step 4: Update form defaultValues + reset**

```typescript
// defaultValues:
defaultValues: {
  name_en: '', name_ar: '',
  company_id: '',
  division_id: '',
  countryCode: '+974', phoneNumber: '',
  is_emergency: false, is_qc: false,
  site_visit_order: false, site_visit_quotation: false,
  traccar_device_id: '',
}

// In useEffect reset for existing team:
company_id:  (team as any).divisions?.company_id ?? '',
division_id: (team as any).division_id           ?? '',
```

- [ ] **Step 5: Update form submission payload**

```typescript
const payload = {
  name:              values.name_en,
  name_en:           values.name_en,
  name_ar:           values.name_ar || null,
  division_id:       values.division_id || null,   // ← was: division: values.division
  phone:             fullPhone,
  is_emergency:         values.is_emergency,
  is_qc:                values.is_qc,
  site_visit_order:     values.site_visit_order,
  site_visit_quotation: values.site_visit_quotation,
  traccar_device_id:    values.traccar_device_id || null,
}
```

- [ ] **Step 6: Replace the division Select with Company → Division cascade in JSX**

Find the existing Division `<Select>` in the JSX and replace it with:

```tsx
{/* Company selector */}
<div className="space-y-1.5">
  <label className="text-sm font-medium">Company *</label>
  <Controller
    control={form.control}
    name="company_id"
    render={({ field }) => (
      <Select
        value={field.value}
        onValueChange={(v) => {
          field.onChange(v)
          form.setValue('division_id', '')  // reset division when company changes
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select company…" />
        </SelectTrigger>
        <SelectContent>
          {companies.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name_en}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )}
  />
</div>

{/* Division selector — filtered by selected company */}
<div className="space-y-1.5">
  <label className="text-sm font-medium">Division *</label>
  <Controller
    control={form.control}
    name="division_id"
    render={({ field }) => (
      <Select
        value={field.value}
        onValueChange={field.onChange}
        disabled={!selectedCompanyId}
      >
        <SelectTrigger>
          <SelectValue placeholder={selectedCompanyId ? 'Select division…' : 'Select company first'} />
        </SelectTrigger>
        <SelectContent>
          {filteredDivisions.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )}
  />
</div>
```

Add `Controller` to imports from `react-hook-form`.

- [ ] **Step 7: Commit**

```powershell
git add src/components/teams/dialogs/TeamEditDialog.tsx
git commit -m "$(cat <<'EOF'
feat(teams): TeamEditDialog — Company → Division cascade picker

Replaces hardcoded division enum with dynamic company + division FKs.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Update TeamGrid — group teams by Company → Division

**Files:**
- Modify: `src/components/teams/TeamGrid.tsx`

- [ ] **Step 1: Group teams in the list view**

Replace the flat rendering with grouped rendering:

```tsx
// src/components/teams/TeamGrid.tsx
// In the content section, replace flat team list with grouped view:

{!isLoading && density === 'card' && (() => {
  // Group teams by company_name → division_name
  const grouped = new Map<string, { divisionName: string; teams: typeof teams }>()
  for (const t of teams) {
    const key = `${t.division?.company_name ?? 'Unknown'} — ${t.division?.name ?? 'Unknown'}`
    if (!grouped.has(key)) {
      grouped.set(key, { divisionName: t.division?.name ?? 'Unknown', teams: [] })
    }
    grouped.get(key)!.teams.push(t)
  }

  return (
    <div className="space-y-6">
      {[...grouped.entries()].map(([key, group]) => (
        <div key={key}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{key}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {group.teams.map(t => <TeamCard key={t.id} team={t} />)}
          </div>
        </div>
      ))}
    </div>
  )
})()}

{!isLoading && density === 'list' && (() => {
  const grouped = new Map<string, { teams: typeof teams }>()
  for (const t of teams) {
    const key = `${t.division?.company_name ?? 'Unknown'} — ${t.division?.name ?? 'Unknown'}`
    if (!grouped.has(key)) grouped.set(key, { teams: [] })
    grouped.get(key)!.teams.push(t)
  }
  return (
    <div className="space-y-4">
      {[...grouped.entries()].map(([key, group]) => (
        <div key={key}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{key}</p>
          <div className="rounded-lg border overflow-hidden">
            {group.teams.map(t => <TeamRow key={t.id} team={t} />)}
          </div>
        </div>
      ))}
    </div>
  )
})()}
```

- [ ] **Step 2: Commit**

```powershell
git add src/components/teams/TeamGrid.tsx
git commit -m "$(cat <<'EOF'
feat(teams): TeamGrid groups teams by Company → Division

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## PATCH 3 — Division Dropdown Filtered by User Access

### Task 14: Swap useDivisions → useUserCompanyDivisions in OrderFormPanel

**Files:**
- Modify: `src/components/orders/OrderFormPanel.tsx`

- [ ] **Step 1: Update import and hook call**

In `OrderFormPanel.tsx`:

```typescript
// Remove:
import { useDivisions } from '@/hooks/useDivisions'

// Add:
import { useUserCompanyDivisions } from '@/hooks/useUserCompanyDivisions'
```

```typescript
// Line 74 — change:
const { data: divisions = [] } = useDivisions()

// To:
const { data: divisions = [] } = useUserCompanyDivisions()
```

The `useUserCompanyDivisions` hook returns `DivisionOption[]` with `{ id, slug, name }`. The division pills in the JSX use `d.slug` (value) and `d.short_name ?? d.name` (label). Since `DivisionOption` has no `short_name`, update the label fallback:

```tsx
// Before:
{d.short_name ?? d.name}

// After:
{d.name}
```

(`short_name` can be added to `useUserCompanyDivisions` later if needed — for now `d.name` is correct.)

- [ ] **Step 2: Verify useDivisions is no longer imported in OrderFormPanel**

```powershell
Select-String -Path "src/components/orders/OrderFormPanel.tsx" -Pattern "useDivisions"
```

Expected: no matches.

- [ ] **Step 3: Commit**

```powershell
git add src/components/orders/OrderFormPanel.tsx
git commit -m "$(cat <<'EOF'
feat(orders): filter division dropdown by user access

Swap useDivisions (all) for useUserCompanyDivisions (user-scoped).
Admins without user_divisions rows still see all active divisions.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## PATCH 4 — Already Implemented

No work required. `OrderFormPanel.tsx` lines 230–250 already conditionally render `"Select a division first"` when `selectedDivisions.length === 0`, and only show `ServiceSelector` once a division is chosen.

---

## Migration B — Cleanup (run after all code is stable in production)

### Task 15: Drop old customer_id columns from orders and quotations

> **When to run:** After Tasks 1–14 are deployed and confirmed stable. The old `customer_id` columns are unused but still present. Migration B removes them.

**Files:**
- Create: `supabase/migrations/20260511300000_drop_legacy_customer_id.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260511300000_drop_legacy_customer_id.sql
-- Migration B: Remove legacy customer_id columns from orders and quotations.
-- Run only after new code is confirmed stable in production.

ALTER TABLE public.orders     DROP COLUMN IF EXISTS customer_id;
ALTER TABLE public.quotations DROP COLUMN IF EXISTS customer_id;
```

- [ ] **Step 2: Apply migration**

```powershell
npx supabase db push
```

- [ ] **Step 3: Remove the fallback in useEditOrder**

In `src/hooks/useEditOrder.ts`, remove the `?? order.customer_id` fallback added in Task 8:

```typescript
// Remove ?? fallback — only service_customer_id exists now:
customerId: (order as any).service_customer_id,
```

- [ ] **Step 4: Commit**

```powershell
git add supabase/migrations/20260511300000_drop_legacy_customer_id.sql src/hooks/useEditOrder.ts
git commit -m "$(cat <<'EOF'
feat(db): Migration B — drop legacy customer_id from orders + quotations

Clean-up after service_customer_id fully adopted in production.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Execution Order Summary

| # | Task | Type | Risk |
|---|---|---|---|
| 1 | Create service_customers tables | DB migration | Low |
| 2 | create_service_customer RPC | DB migration | Low |
| 3 | Migration A — add service_customer_id, backfill | DB migration | Medium |
| 4 | Update order/quotation RPCs | DB migration | High — read existing RPC bodies first |
| 5 | useCustomerLookup → service_customer_phones | Frontend | Medium |
| 6 | useCustomerAddresses → service_customer_addresses | Frontend | Low |
| 7 | useCreateOrder → p_service_customer_id | Frontend | Low |
| 8 | useEditOrder → service_customer_id | Frontend | Low |
| 9 | useCreateQuotation → p_service_customer_id | Frontend | Low |
| 10 | Teams division_id migration | DB migration | Medium |
| 11 | useTeams — join divisions, filter by UUID | Frontend | Low |
| 12 | TeamEditDialog — Company → Division cascade | Frontend | Low |
| 13 | TeamGrid — group by Company → Division | Frontend | Low |
| 14 | OrderFormPanel — swap to useUserCompanyDivisions | Frontend | Low |
| 15 | Migration B — drop customer_id (post-deploy cleanup) | DB migration | Low |
