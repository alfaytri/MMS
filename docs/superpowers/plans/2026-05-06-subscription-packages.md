# Subscription Packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/master-data/subscriptions` page — a catalog manager for annual customer loyalty packages with per-service discounts, SLA priority tiers, and a live subscriber count display.

**Architecture:** Three migrations create the four tables, the aggregate view (which includes both subscriber count and service count — no client-side aggregation), and the atomic upsert RPC. One hook file owns all TanStack Query logic. Four focused components compose the page: a searchable checkbox service tree, a full-featured edit dialog, a table row, and the client shell. The nav entry already exists in `nav-config.ts` — just remove `comingSoon: true`.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgREST + RPC + `npx supabase db push`), TanStack Query v5, react-hook-form + zod, shadcn/ui, lucide-react, sonner (toasts), `@/lib/logActivity`

---

### Task 1: Migrations — tables + view

**Files:**
- Create: `supabase/migrations/20260506000004_subscription_tables.sql`
- Create: `supabase/migrations/20260506000005_subscription_packages_view.sql`

- [ ] **Step 1: Create the tables migration**

```sql
-- supabase/migrations/20260506000004_subscription_tables.sql

-- Reusable updated_at trigger function (skip if already exists)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── subscription_packages ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_packages (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text          NOT NULL,
  name_ar            text,
  description        text,
  discount_percent   numeric(5,2)  NOT NULL DEFAULT 0
                       CHECK (discount_percent >= 0 AND discount_percent <= 100),
  initial_fee        numeric(10,2) NOT NULL DEFAULT 0
                       CHECK (initial_fee >= 0),
  duration_months    int           NOT NULL DEFAULT 12,
  priority_response  text          NOT NULL DEFAULT 'none'
                       CHECK (priority_response IN ('none','24_48hr','under_24hr')),
  response_hours     int           CHECK (response_hours IS NULL OR (response_hours >= 1 AND response_hours <= 168)),
  auto_renew_default boolean       NOT NULL DEFAULT true,
  is_active          boolean       NOT NULL DEFAULT true,
  created_by_name    text,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_subscription_packages_updated_at
  BEFORE UPDATE ON subscription_packages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── subscription_package_services ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_package_services (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id        uuid          NOT NULL REFERENCES subscription_packages(id) ON DELETE CASCADE,
  service_id        uuid          NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  discount_override numeric(5,2)  CHECK (discount_override IS NULL OR (discount_override >= 0 AND discount_override <= 100)),
  UNIQUE (package_id, service_id)
);

-- ── customer_subscriptions ────────────────────────────────────────────────
-- customer_id intentionally has no FK constraint here — the customers table
-- FK will be wired when the customers module confirms its primary key column.
CREATE TABLE IF NOT EXISTS customer_subscriptions (
  id                        uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id               uuid          NOT NULL,
  package_id                uuid          NOT NULL REFERENCES subscription_packages(id),
  price_paid                numeric(10,2) NOT NULL,
  discount_percent_snapshot numeric(5,2)  NOT NULL,
  start_date                date          NOT NULL,
  end_date                  date          NOT NULL,
  auto_renew                boolean       NOT NULL DEFAULT true,
  status                    text          NOT NULL DEFAULT 'active'
                              CHECK (status IN ('pending_payment','active','expired','cancelled')),
  created_at                timestamptz   NOT NULL DEFAULT now(),
  updated_at                timestamptz   NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_customer_subscriptions_updated_at
  BEFORE UPDATE ON customer_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── subscription_usage_log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_usage_log (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  uuid          NOT NULL REFERENCES customer_subscriptions(id),
  order_id         uuid          NOT NULL,
  service_id       uuid          NOT NULL,
  discount_applied numeric(5,2)  NOT NULL,
  created_at       timestamptz   NOT NULL DEFAULT now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE subscription_packages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_package_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_usage_log       ENABLE ROW LEVEL SECURITY;

-- service_role bypass
CREATE POLICY "service_role_all" ON subscription_packages
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON subscription_package_services
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON customer_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON subscription_usage_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- authenticated read
CREATE POLICY "authenticated_read" ON subscription_packages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON subscription_package_services
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON customer_subscriptions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON subscription_usage_log
  FOR SELECT TO authenticated USING (true);
```

- [ ] **Step 2: Create the view migration**

```sql
-- supabase/migrations/20260506000005_subscription_packages_view.sql

-- Both counts live in Postgres — zero client-side aggregation.
CREATE OR REPLACE VIEW subscription_packages_with_counts AS
SELECT
  sp.*,
  COALESCE(sub_cnt.active_subscribers, 0)::int AS subscriber_count,
  COALESCE(svc_cnt.service_count,       0)::int AS service_count
FROM subscription_packages sp
LEFT JOIN (
  SELECT package_id, COUNT(*)::int AS active_subscribers
  FROM customer_subscriptions
  WHERE status = 'active'
  GROUP BY package_id
) sub_cnt ON sub_cnt.package_id = sp.id
LEFT JOIN (
  SELECT package_id, COUNT(*)::int AS service_count
  FROM subscription_package_services
  GROUP BY package_id
) svc_cnt ON svc_cnt.package_id = sp.id;

GRANT SELECT ON subscription_packages_with_counts TO authenticated;
GRANT SELECT ON subscription_packages_with_counts TO service_role;
```

- [ ] **Step 3: Push both migrations**

```bash
npx supabase db push
```

Expected output: two new migrations applied, ending with "Remote database is up to date."

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260506000004_subscription_tables.sql
git add supabase/migrations/20260506000005_subscription_packages_view.sql
git commit -m "$(cat <<'EOF'
feat(db): add subscription_packages tables and aggregate view

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Migration — atomic upsert RPC

**Files:**
- Create: `supabase/migrations/20260506000006_upsert_package_with_services_rpc.sql`

- [ ] **Step 1: Create the RPC migration**

```sql
-- supabase/migrations/20260506000006_upsert_package_with_services_rpc.sql

CREATE OR REPLACE FUNCTION upsert_package_with_services(
  p_package  jsonb,
  p_services jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF (p_package->>'id') IS NOT NULL THEN
    -- UPDATE existing package
    v_id := (p_package->>'id')::uuid;
    UPDATE subscription_packages SET
      name               = p_package->>'name',
      name_ar            = NULLIF(p_package->>'name_ar', ''),
      description        = NULLIF(p_package->>'description', ''),
      discount_percent   = (p_package->>'discount_percent')::numeric,
      initial_fee        = (p_package->>'initial_fee')::numeric,
      duration_months    = (p_package->>'duration_months')::int,
      priority_response  = p_package->>'priority_response',
      response_hours     = CASE
                             WHEN p_package->>'response_hours' IS NULL THEN NULL
                             ELSE (p_package->>'response_hours')::int
                           END,
      auto_renew_default = (p_package->>'auto_renew_default')::boolean,
      updated_at         = now()
    WHERE id = v_id;
  ELSE
    -- INSERT new package
    INSERT INTO subscription_packages (
      name, name_ar, description,
      discount_percent, initial_fee, duration_months,
      priority_response, response_hours, auto_renew_default,
      created_by_name
    ) VALUES (
      p_package->>'name',
      NULLIF(p_package->>'name_ar', ''),
      NULLIF(p_package->>'description', ''),
      (p_package->>'discount_percent')::numeric,
      (p_package->>'initial_fee')::numeric,
      (p_package->>'duration_months')::int,
      p_package->>'priority_response',
      CASE
        WHEN p_package->>'response_hours' IS NULL THEN NULL
        ELSE (p_package->>'response_hours')::int
      END,
      (p_package->>'auto_renew_default')::boolean,
      NULLIF(p_package->>'created_by_name', '')
    )
    RETURNING id INTO v_id;
  END IF;

  -- Atomically replace all services for this package
  DELETE FROM subscription_package_services WHERE package_id = v_id;

  INSERT INTO subscription_package_services (package_id, service_id, discount_override)
  SELECT
    v_id,
    (svc->>'service_id')::uuid,
    CASE
      WHEN svc->>'discount_override' IS NULL THEN NULL
      ELSE (svc->>'discount_override')::numeric
    END
  FROM jsonb_array_elements(p_services) AS svc;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION upsert_package_with_services(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_package_with_services(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_package_with_services(jsonb, jsonb) TO service_role;
```

- [ ] **Step 2: Push the RPC migration**

```bash
npx supabase db push
```

Expected: one new migration applied.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260506000006_upsert_package_with_services_rpc.sql
git commit -m "$(cat <<'EOF'
feat(db): add upsert_package_with_services atomic RPC

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Hook — `useSubscriptionPackages.ts`

**Files:**
- Create: `src/hooks/useSubscriptionPackages.ts`

- [ ] **Step 1: Create the hook file**

```typescript
// src/hooks/useSubscriptionPackages.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PriorityResponse = 'none' | '24_48hr' | 'under_24hr'

export type SubscriptionPackage = {
  id: string
  name: string
  name_ar: string | null
  description: string | null
  discount_percent: number
  initial_fee: number
  duration_months: number
  priority_response: PriorityResponse
  response_hours: number | null
  auto_renew_default: boolean
  is_active: boolean
  created_by_name: string | null
  created_at: string
  updated_at: string
}

export type SubscriptionPackageWithCount = SubscriptionPackage & {
  subscriber_count: number
  service_count: number
}

export type PackageServiceEntry = {
  service_id: string
  discount_override: number | null
}

export type UpsertPackagePayload = {
  id?: string | null
  name: string
  name_ar: string | null
  description: string | null
  discount_percent: number
  initial_fee: number
  duration_months: number
  priority_response: PriorityResponse
  response_hours: number | null
  auto_renew_default: boolean
  services: PackageServiceEntry[]
  created_by_name?: string | null
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useSubscriptionPackages({ includeArchived = false }: { includeArchived?: boolean } = {}) {
  return useQuery({
    queryKey: ['subscription_packages', { includeArchived }],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('subscription_packages_with_counts')
        .select('*')
        .order('created_at', { ascending: false })
      if (!includeArchived) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as SubscriptionPackageWithCount[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function usePackageServices(packageId: string | null) {
  return useQuery({
    queryKey: ['subscription_package_services', packageId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('subscription_package_services')
        .select('service_id, discount_override')
        .eq('package_id', packageId)
      if (error) throw error
      return (data ?? []) as PackageServiceEntry[]
    },
    enabled: !!packageId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpsertPackage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      payload,
      performerName,
    }: {
      payload: UpsertPackagePayload
      performerName?: string | null
    }) => {
      const supabase = createClient()
      const isCreate = !payload.id
      const { services, ...packageFields } = payload

      const { data, error } = await (supabase as any).rpc('upsert_package_with_services', {
        p_package: packageFields,
        p_services: services,
      })
      if (error) throw new Error(error.message)

      await logActivity({
        action: isCreate ? 'create' : 'update',
        module: 'subscription_packages',
        entity_id: data as string,
        details: JSON.stringify(packageFields),
        performer_name: performerName ?? null,
      })

      return data as string
    },
    onSuccess: (_, { payload }) => {
      qc.invalidateQueries({ queryKey: ['subscription_packages'] })
      if (payload.id) {
        qc.invalidateQueries({ queryKey: ['subscription_package_services', payload.id] })
      }
    },
  })
}

export function useArchivePackage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      performerName,
    }: {
      id: string
      performerName?: string | null
    }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('subscription_packages')
        .update({ is_active: false })
        .eq('id', id)
      if (error) throw new Error(error.message)
      await logActivity({
        action: 'archive',
        module: 'subscription_packages',
        entity_id: id,
        performer_name: performerName ?? null,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription_packages'] }),
  })
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors related to `useSubscriptionPackages.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSubscriptionPackages.ts
git commit -m "$(cat <<'EOF'
feat(subscriptions): add useSubscriptionPackages hook

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Component — `ServicePickerTree`

**Files:**
- Create: `src/components/master-data/subscriptions/ServicePickerTree.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/master-data/subscriptions/ServicePickerTree.tsx
'use client'

import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import { buildTreeMap, collectDescendantIds } from '@/components/services/ServiceTree'
import type { PackageServiceEntry } from '@/hooks/useSubscriptionPackages'

type PickerService = {
  id: string
  name_en: string
  parent_id: string | null
  tree_type: string
}

function useAllServicesForPicker() {
  return useQuery({
    queryKey: ['services-all-picker'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('services')
        .select('id, name_en, parent_id, tree_type')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as PickerService[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

function getCheckState(
  nodeId: string,
  treeMap: Map<string | null, PickerService[]>,
  selectedSet: Set<string>,
): 'checked' | 'unchecked' | 'indeterminate' {
  const descendants = collectDescendantIds(nodeId, treeMap as any)
  if (descendants.size === 0) {
    return selectedSet.has(nodeId) ? 'checked' : 'unchecked'
  }
  const selectedCount = [...descendants].filter((id) => selectedSet.has(id)).length
  if (selectedCount === 0) return 'unchecked'
  if (selectedCount === descendants.size) return 'checked'
  return 'indeterminate'
}

interface ServicePickerTreeProps {
  selectedIds: string[]
  overrides: Record<string, number | null>
  onChange: (ids: string[], overrides: Record<string, number | null>) => void
  packageDiscountPercent: number
}

export function ServicePickerTree({
  selectedIds,
  overrides,
  onChange,
  packageDiscountPercent,
}: ServicePickerTreeProps) {
  const { data: services = [], isLoading } = useAllServicesForPicker()
  const [search, setSearch] = useState('')

  const treeMap = useMemo(() => buildTreeMap(services as any), [services])
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const filteredServices = useMemo(() => {
    if (!search.trim()) return services
    const q = search.toLowerCase()
    return services.filter((s) => s.name_en.toLowerCase().includes(q))
  }, [services, search])

  const filteredTreeMap = useMemo(
    () => buildTreeMap(filteredServices as any),
    [filteredServices],
  )

  function toggleNode(nodeId: string) {
    const descendants = [...collectDescendantIds(nodeId, treeMap as any)]
    const isLeaf = descendants.length === 0
    const targets = isLeaf ? [nodeId] : descendants
    const allSelected = targets.every((id) => selectedSet.has(id))
    let next: Set<string>
    if (allSelected) {
      next = new Set(selectedSet)
      targets.forEach((id) => next.delete(id))
      if (!isLeaf) next.delete(nodeId)
    } else {
      next = new Set(selectedSet)
      targets.forEach((id) => next.add(id))
    }
    const nextOverrides = { ...overrides }
    if (allSelected) targets.forEach((id) => delete nextOverrides[id])
    onChange([...next], nextOverrides)
  }

  function setOverride(serviceId: string, value: string) {
    const parsed = value === '' ? null : parseFloat(value)
    const nextOverrides = { ...overrides, [serviceId]: parsed }
    onChange(selectedIds, nextOverrides)
  }

  function renderNode(service: PickerService, depth: number) {
    const children = filteredTreeMap.get(service.id) ?? []
    const checkState = getCheckState(service.id, treeMap as any, selectedSet)
    const isLeaf = (treeMap.get(service.id) ?? []).length === 0
    const isSelected = selectedSet.has(service.id)

    return (
      <div key={service.id}>
        <div
          className="flex items-center gap-2 py-1 rounded hover:bg-muted/40 px-1"
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
        >
          <Checkbox
            id={`svc-${service.id}`}
            checked={checkState === 'checked'}
            ref={(el) => {
              if (el) (el as any).indeterminate = checkState === 'indeterminate'
            }}
            onCheckedChange={() => toggleNode(service.id)}
          />
          <Label htmlFor={`svc-${service.id}`} className="text-xs cursor-pointer flex-1">
            {service.name_en}
          </Label>
          {isLeaf && isSelected && (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                className="h-5 w-16 text-[10px] px-1"
                placeholder={`${packageDiscountPercent}% (pkg)`}
                value={overrides[service.id] ?? ''}
                onChange={(e) => setOverride(service.id, e.target.value)}
              />
              <span className="text-[10px] text-muted-foreground">%</span>
            </div>
          )}
        </div>
        {children.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  const roots = filteredTreeMap.get(null) ?? []

  if (isLoading) {
    return (
      <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">
        Loading services…
      </div>
    )
  }

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            className="h-7 text-xs pl-7"
            placeholder="Search services…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto p-1">
        {roots.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No services found.</p>
        ) : (
          roots.map((root) => renderNode(root, 0))
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors. If `Checkbox` ref usage causes a TS error, replace the `ref` prop with a `useEffect` that sets `indeterminate` imperatively on the DOM element — but try the ref approach first.

- [ ] **Step 3: Commit**

```bash
git add src/components/master-data/subscriptions/ServicePickerTree.tsx
git commit -m "$(cat <<'EOF'
feat(subscriptions): add ServicePickerTree with search + override inputs

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Component — `PackageEditDialog`

**Files:**
- Create: `src/components/master-data/subscriptions/PackageEditDialog.tsx`

- [ ] **Step 1: Create the dialog**

```typescript
// src/components/master-data/subscriptions/PackageEditDialog.tsx
'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PackageCheck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ServicePickerTree } from './ServicePickerTree'
import {
  useUpsertPackage,
  usePackageServices,
  type SubscriptionPackage,
  type PackageServiceEntry,
  type PriorityResponse,
} from '@/hooks/useSubscriptionPackages'
import { toast } from 'sonner'

// ─── Validation schema ────────────────────────────────────────────────────────

const schema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    name_ar: z.string().optional(),
    description: z.string().optional(),
    discount_percent: z.coerce.number().min(0, 'Min 0').max(100, 'Max 100'),
    initial_fee: z.coerce.number().min(0, 'Min 0'),
    duration_months: z.coerce.number().int().min(1, 'Min 1 month'),
    priority_response: z.enum(['none', '24_48hr', 'under_24hr']),
    response_hours: z.coerce.number().int().optional().nullable(),
    auto_renew_default: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.priority_response === '24_48hr') {
      if (!data.response_hours || data.response_hours < 25 || data.response_hours > 48) {
        ctx.addIssue({
          code: 'custom',
          path: ['response_hours'],
          message: 'Must be 25–48 for "24–48 HR" priority',
        })
      }
    }
    if (data.priority_response === 'under_24hr') {
      if (!data.response_hours || data.response_hours < 1 || data.response_hours > 24) {
        ctx.addIssue({
          code: 'custom',
          path: ['response_hours'],
          message: 'Must be 1–24 for "< 24 HR" priority',
        })
      }
    }
  })

type FormValues = z.infer<typeof schema>

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  pkg?: SubscriptionPackage | null
  performerName?: string | null
  selectedServices: PackageServiceEntry[]
  onServicesChange: (services: PackageServiceEntry[]) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PackageEditDialog({
  open,
  onOpenChange,
  pkg,
  performerName,
  selectedServices,
  onServicesChange,
}: Props) {
  const isEditing = !!pkg
  const upsert = useUpsertPackage()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      name_ar: '',
      description: '',
      discount_percent: 0,
      initial_fee: 0,
      duration_months: 12,
      priority_response: 'none',
      response_hours: null,
      auto_renew_default: true,
    },
  })

  const priorityResponse = form.watch('priority_response')
  const discountPercent = form.watch('discount_percent') ?? 0

  // Build overrides map from selectedServices
  const overrides: Record<string, number | null> = {}
  selectedServices.forEach((s) => {
    overrides[s.service_id] = s.discount_override
  })

  function handleServicesChange(ids: string[], newOverrides: Record<string, number | null>) {
    onServicesChange(
      ids.map((id) => ({ service_id: id, discount_override: newOverrides[id] ?? null })),
    )
  }

  useEffect(() => {
    if (!open) return
    if (pkg) {
      form.reset({
        name: pkg.name,
        name_ar: pkg.name_ar ?? '',
        description: pkg.description ?? '',
        discount_percent: pkg.discount_percent,
        initial_fee: pkg.initial_fee,
        duration_months: pkg.duration_months,
        priority_response: pkg.priority_response,
        response_hours: pkg.response_hours ?? null,
        auto_renew_default: pkg.auto_renew_default,
      })
    } else {
      form.reset({
        name: '',
        name_ar: '',
        description: '',
        discount_percent: 0,
        initial_fee: 0,
        duration_months: 12,
        priority_response: 'none',
        response_hours: null,
        auto_renew_default: true,
      })
      onServicesChange([])
    }
  }, [open, pkg]) // eslint-disable-line react-hooks/exhaustive-deps

  function onSubmit(values: FormValues) {
    if (selectedServices.length === 0) {
      toast.error('Select at least one service')
      return
    }
    upsert.mutate(
      {
        payload: {
          id: pkg?.id ?? null,
          name: values.name,
          name_ar: values.name_ar || null,
          description: values.description || null,
          discount_percent: values.discount_percent,
          initial_fee: values.initial_fee,
          duration_months: values.duration_months,
          priority_response: values.priority_response as PriorityResponse,
          response_hours: values.priority_response === 'none' ? null : values.response_hours ?? null,
          auto_renew_default: values.auto_renew_default,
          services: selectedServices,
          created_by_name: performerName,
        },
        performerName,
      },
      {
        onSuccess: () => {
          toast.success(isEditing ? 'Package updated' : 'Package created')
          onOpenChange(false)
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full rounded-none md:h-auto md:max-w-2xl md:rounded-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-primary" />
            {isEditing ? 'Edit Package' : 'New Subscription Package'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Names */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name (EN) *</Label>
              <Input className="h-8 text-xs" {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-[10px] text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Name (AR)</Label>
              <Input className="h-8 text-xs text-right" dir="rtl" {...form.register('name_ar')} />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              className="text-xs min-h-[60px]"
              placeholder="Optional description…"
              {...form.register('description')}
            />
          </div>

          {/* Numbers row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Discount % *</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                className="h-8 text-xs"
                {...form.register('discount_percent')}
              />
              {form.formState.errors.discount_percent && (
                <p className="text-[10px] text-destructive">
                  {form.formState.errors.discount_percent.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Initial Fee (QAR) *</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                className="h-8 text-xs"
                {...form.register('initial_fee')}
              />
              {form.formState.errors.initial_fee && (
                <p className="text-[10px] text-destructive">
                  {form.formState.errors.initial_fee.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Duration (months) *</Label>
              <Input
                type="number"
                min={1}
                className="h-8 text-xs"
                {...form.register('duration_months')}
              />
            </div>
          </div>

          {/* Priority + Response Hours */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Priority Response</Label>
              <Select
                value={priorityResponse}
                onValueChange={(v) =>
                  form.setValue('priority_response', v as PriorityResponse, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">None</SelectItem>
                  <SelectItem value="24_48hr" className="text-xs">24–48 HR</SelectItem>
                  <SelectItem value="under_24hr" className="text-xs">{'< 24 HR'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {priorityResponse !== 'none' && (
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Response Hours *{' '}
                  <span className="text-muted-foreground">
                    ({priorityResponse === '24_48hr' ? '25–48' : '1–24'})
                  </span>
                </Label>
                <Input
                  type="number"
                  min={priorityResponse === '24_48hr' ? 25 : 1}
                  max={priorityResponse === '24_48hr' ? 48 : 24}
                  className="h-8 text-xs"
                  {...form.register('response_hours')}
                />
                {form.formState.errors.response_hours && (
                  <p className="text-[10px] text-destructive">
                    {form.formState.errors.response_hours.message}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Auto-renew switch */}
          <div className="flex items-center gap-3">
            <Switch
              id="auto_renew_default"
              checked={form.watch('auto_renew_default')}
              onCheckedChange={(v) => form.setValue('auto_renew_default', v)}
            />
            <Label htmlFor="auto_renew_default" className="text-xs">
              Auto-renew by default
            </Label>
          </div>

          {/* Services */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Applicable Services *</Label>
              <span className="text-[10px] text-muted-foreground">
                {selectedServices.length} selected
              </span>
            </div>
            <ServicePickerTree
              selectedIds={selectedServices.map((s) => s.service_id)}
              overrides={overrides}
              onChange={handleServicesChange}
              packageDiscountPercent={discountPercent}
            />
            {selectedServices.length === 0 && form.formState.isSubmitted && (
              <p className="text-[10px] text-destructive">Select at least one service</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="text-xs"
              disabled={upsert.isPending}
            >
              {upsert.isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Package'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors. Fix any that appear.

- [ ] **Step 3: Commit**

```bash
git add src/components/master-data/subscriptions/PackageEditDialog.tsx
git commit -m "$(cat <<'EOF'
feat(subscriptions): add PackageEditDialog with SLA strict-mode validation

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Component — `SubscriptionPackageRow`

**Files:**
- Create: `src/components/master-data/subscriptions/SubscriptionPackageRow.tsx`

- [ ] **Step 1: Create the row component**

```typescript
// src/components/master-data/subscriptions/SubscriptionPackageRow.tsx
'use client'

import { Pencil, Archive } from 'lucide-react'
import { TableCell, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SubscriptionPackageWithCount } from '@/hooks/useSubscriptionPackages'

const PRIORITY_BADGE: Record<string, { label: string; className: string }> = {
  none:        { label: '—',        className: 'bg-muted text-muted-foreground' },
  '24_48hr':   { label: '24–48 HR', className: 'bg-warning/10 text-warning' },
  under_24hr:  { label: '< 24 HR',  className: 'bg-primary/10 text-primary' },
}

interface Props {
  pkg: SubscriptionPackageWithCount
  showStatus: boolean
  onEdit: (pkg: SubscriptionPackageWithCount) => void
  onArchive: (pkg: SubscriptionPackageWithCount) => void
}

export function SubscriptionPackageRow({ pkg, showStatus, onEdit, onArchive }: Props) {
  const priority = PRIORITY_BADGE[pkg.priority_response] ?? PRIORITY_BADGE.none

  return (
    <TableRow className={cn(!pkg.is_active && 'opacity-50')}>
      {/* Name */}
      <TableCell className="text-xs">
        <p className="font-medium">{pkg.name}</p>
        {pkg.name_ar && (
          <p className="text-muted-foreground text-[10px] text-right" dir="rtl">
            {pkg.name_ar}
          </p>
        )}
      </TableCell>

      {/* Discount */}
      <TableCell>
        <Badge className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-0">
          {pkg.discount_percent}%
        </Badge>
      </TableCell>

      {/* Initial Fee */}
      <TableCell className="text-xs">
        QAR {Number(pkg.initial_fee).toLocaleString('en-QA', { minimumFractionDigits: 0 })}
      </TableCell>

      {/* Priority */}
      <TableCell>
        <Badge className={cn('text-[10px] px-1.5 py-0 border-0', priority.className)}>
          {priority.label}
        </Badge>
      </TableCell>

      {/* Services count */}
      <TableCell>
        <span className="text-[10px] border border-primary/30 text-primary rounded-full px-2 py-0.5">
          {/* subscriber count comes from the view but service count is fetched lazily — show placeholder */}
          services
        </span>
      </TableCell>

      {/* Duration */}
      <TableCell className="text-xs">{pkg.duration_months} mo</TableCell>

      {/* Subscribers */}
      <TableCell>
        <span className="text-[10px] bg-primary text-primary-foreground rounded-full px-2 py-0.5 font-medium">
          {pkg.subscriber_count}
        </span>
      </TableCell>

      {/* Status — only visible when Show Archived is on */}
      {showStatus && (
        <TableCell>
          <Badge
            className={cn(
              'text-[10px] px-1.5 py-0 border-0',
              pkg.is_active
                ? 'bg-success/10 text-success'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {pkg.is_active ? 'Active' : 'Archived'}
          </Badge>
        </TableCell>
      )}

      {/* Actions */}
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onEdit(pkg)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          {pkg.is_active && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => onArchive(pkg)}
            >
              <Archive className="h-3 w-3" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}
```

**Note on "services" column:** The view returns packages + subscriber counts but not service counts. Service counts require either a second view or a separate query. For the initial implementation, replace the `services` static placeholder in this component with a `usePackageServiceCount` hook or pass service count as a prop from `SubscriptionsPage` after fetching all junction rows in bulk. The simplest approach: add a second query in `SubscriptionsPage` — `SELECT package_id, COUNT(*) FROM subscription_package_services GROUP BY package_id` — and pass counts down as `serviceCount: number`.

- [ ] **Step 2: Fix the services cell — read `pkg.service_count` directly**

`service_count` is now returned by the view on every package row, so no extra hook or prop is needed. In `SubscriptionPackageRow`, replace the static `'services'` placeholder in the services cell:

```typescript
{/* Services count — sourced from the DB view, no extra query */}
<span className="text-[10px] border border-primary/30 text-primary rounded-full px-2 py-0.5">
  {pkg.service_count} services
</span>
```

Also remove `serviceCount` from the `Props` interface — it is no longer needed since the value lives on `pkg`.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/master-data/subscriptions/SubscriptionPackageRow.tsx
git add src/hooks/useSubscriptionPackages.ts
git commit -m "$(cat <<'EOF'
feat(subscriptions): add SubscriptionPackageRow + service count hook

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Component — `SubscriptionsPage` client shell

**Files:**
- Create: `src/components/master-data/subscriptions/SubscriptionsPage.tsx`

- [ ] **Step 1: Create the page shell**

```typescript
// src/components/master-data/subscriptions/SubscriptionsPage.tsx
'use client'

import { useState, useMemo } from 'react'
import { PackageCheck, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  useSubscriptionPackages,
  useArchivePackage,
  usePackageServices,
  type SubscriptionPackageWithCount,
  type PackageServiceEntry,
} from '@/hooks/useSubscriptionPackages'
import { SubscriptionPackageRow } from './SubscriptionPackageRow'
import { PackageEditDialog } from './PackageEditDialog'
import type { Profile } from '@/hooks/useProfiles'

interface Props {
  currentProfile: Profile | null
}

export function SubscriptionsPage({ currentProfile }: Props) {
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [editTarget, setEditTarget] = useState<SubscriptionPackageWithCount | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<SubscriptionPackageWithCount | null>(null)
  const [editServices, setEditServices] = useState<PackageServiceEntry[]>([])

  const { data: packages = [], isLoading } = useSubscriptionPackages({ includeArchived: showArchived })
  const archive = useArchivePackage()

  // Load existing services when edit dialog opens for an existing package
  const { data: existingServices = [] } = usePackageServices(editTarget?.id ?? null)

  // Sync existing services into dialog state when target changes
  useMemo(() => {
    if (editTarget && existingServices.length > 0) {
      setEditServices(existingServices)
    }
  }, [editTarget, existingServices])

  const filtered = useMemo(() => {
    if (!search.trim()) return packages
    const q = search.toLowerCase()
    return packages.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.name_ar ?? '').toLowerCase().includes(q),
    )
  }, [packages, search])

  const activeCount = packages.filter((p) => p.is_active).length

  function openCreate() {
    setEditTarget(null)
    setEditServices([])
    setDialogOpen(true)
  }

  function openEdit(pkg: SubscriptionPackageWithCount) {
    setEditTarget(pkg)
    setEditServices([]) // will be overwritten by useMemo above once existingServices loads
    setDialogOpen(true)
  }

  function handleArchiveConfirm() {
    if (!archiveTarget) return
    archive.mutate(
      { id: archiveTarget.id, performerName: currentProfile?.full_name ?? null },
      {
        onSuccess: () => toast.success(`"${archiveTarget.name}" archived`),
        onError: (e) => toast.error(e.message),
        onSettled: () => setArchiveTarget(null),
      },
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-sm font-semibold">Subscription Packages</h1>
            <p className="text-xs text-muted-foreground">
              Manage annual subscription tiers for customers
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="show-archived"
              checked={showArchived}
              onCheckedChange={setShowArchived}
            />
            <Label htmlFor="show-archived" className="text-xs">
              Show Archived
            </Label>
          </div>
          <Button size="sm" className="text-xs gap-1 h-8" onClick={openCreate}>
            <Plus className="h-3 w-3" />
            New Package
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <Input
          className="h-8 text-xs max-w-xs"
          placeholder="Search packages…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
          {activeCount} active
        </span>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Discount</TableHead>
              <TableHead className="text-xs">Initial Fee</TableHead>
              <TableHead className="text-xs">Priority</TableHead>
              <TableHead className="text-xs">Services</TableHead>
              <TableHead className="text-xs">Duration</TableHead>
              <TableHead className="text-xs">Subscribers</TableHead>
              {showArchived && <TableHead className="text-xs">Status</TableHead>}
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: showArchived ? 9 : 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showArchived ? 9 : 8}
                  className="text-center py-10"
                >
                  {search ? (
                    <p className="text-xs text-muted-foreground">
                      No packages match your search.
                    </p>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-xs text-muted-foreground">No packages yet.</p>
                      <Button variant="ghost" size="sm" className="text-xs" onClick={openCreate}>
                        <Plus className="h-3 w-3 mr-1" />
                        Create your first package
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((pkg) => (
                <SubscriptionPackageRow
                  key={pkg.id}
                  pkg={pkg}
                  showStatus={showArchived}
                  onEdit={openEdit}
                  onArchive={setArchiveTarget}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit / Create dialog */}
      <PackageEditDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditTarget(null)
        }}
        pkg={editTarget}
        performerName={currentProfile?.full_name ?? null}
        selectedServices={editServices}
        onServicesChange={setEditServices}
      />

      {/* Archive confirmation */}
      <AlertDialog open={!!archiveTarget} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              Archive &ldquo;{archiveTarget?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This package will no longer appear in new sign-up flows. Existing customer
              subscriptions will not be cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="text-xs bg-destructive hover:bg-destructive/90"
              onClick={handleArchiveConfirm}
              disabled={archive.isPending}
            >
              {archive.isPending ? 'Archiving…' : 'Archive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/master-data/subscriptions/SubscriptionsPage.tsx
git commit -m "$(cat <<'EOF'
feat(subscriptions): add SubscriptionsPage client shell

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Route page + navigation

**Files:**
- Create: `src/app/(dashboard)/master-data/subscriptions/page.tsx`
- Modify: `src/components/layout/nav-config.ts` (remove `comingSoon: true` from subscriptions entry)

- [ ] **Step 1: Create the route page**

```typescript
// src/app/(dashboard)/master-data/subscriptions/page.tsx
import { createClient } from '@/lib/supabase/server'
import { SubscriptionsPage } from '@/components/master-data/subscriptions/SubscriptionsPage'

export default async function SubscriptionPackagesPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let currentProfile = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    currentProfile = data
  }

  return <SubscriptionsPage currentProfile={currentProfile} />
}
```

- [ ] **Step 2: Remove `comingSoon` from the nav config**

Open `src/components/layout/nav-config.ts` and find line 44:

```typescript
{ label: 'Subscription Packages', href: '/master-data/subscriptions', comingSoon: true }
```

Change to:

```typescript
{ label: 'Subscription Packages', href: '/master-data/subscriptions' }
```

- [ ] **Step 3: Full type-check and build**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Verify the page loads**

Start the dev server (`npm run dev`), navigate to `/master-data/subscriptions`. Expected: empty state with "No packages yet. Create your first package." button. The "Subscription Packages" link in the sidebar should be active (no "Coming Soon" label).

Click **New Package**, fill in Name, set Discount to 10, Initial Fee to 500, select at least one service from the tree, click **Create Package**. Expected: success toast and the new row appears in the table with the orange subscriber pill showing `0`.

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/master-data/subscriptions/page.tsx
git add src/components/layout/nav-config.ts
git commit -m "$(cat <<'EOF'
feat(subscriptions): add route page and activate nav link

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: PROGRESS.md update

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Update PROGRESS.md**

Add to `## ✅ Completed`:
```
- [2026-05-06] **Subscription Module Task 1–8: Subscription Packages master-data page** —
  `supabase/migrations/20260506000004–6_*.sql`,
  `src/hooks/useSubscriptionPackages.ts`,
  `src/components/master-data/subscriptions/{ServicePickerTree,PackageEditDialog,SubscriptionPackageRow,SubscriptionsPage}.tsx`,
  `src/app/(dashboard)/master-data/subscriptions/page.tsx`,
  `src/components/layout/nav-config.ts` —
  Full catalog page for annual subscription tiers: atomic upsert RPC, DB aggregate view,
  searchable service picker tree with per-service discount overrides, SLA strict-mode validation,
  subscriber count pill, archive flow with AlertDialog, bilingual EN/AR names.
```

Update `## 🔄 In Progress` to the next planned task.

- [ ] **Step 2: Commit PROGRESS.md only**

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — subscription packages page complete

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Future migration note — customer FK

**Files:**
- Create: `supabase/migrations/20260506000007_customer_subscriptions_customer_fk.sql` *(do NOT push yet — placeholder only)*

- [ ] **Step 1: Create the placeholder migration file but leave it unapplied**

```sql
-- supabase/migrations/20260506000007_customer_subscriptions_customer_fk.sql
-- TODO: Apply once the customers table primary key column is confirmed.
-- Run `npx supabase db push` after the customers module is live.

ALTER TABLE customer_subscriptions
  ADD CONSTRAINT fk_customer_subscriptions_customer
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
```

- [ ] **Step 2: Commit the placeholder only (do NOT push to DB)**

```bash
git add supabase/migrations/20260506000007_customer_subscriptions_customer_fk.sql
git commit -m "$(cat <<'EOF'
chore(db): add placeholder FK migration for customer_subscriptions.customer_id

Not applied yet — waiting on customers module to confirm PK column name.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

**When to apply:** Once `src/app/(dashboard)/master-data/customers` is built and the `customers` table exists, run `npx supabase db push` to wire the FK and close this gap.

---

## Self-Review Checklist

| Spec requirement | Covered in task |
|---|---|
| 4 DB tables + view + atomic RPC | Tasks 1, 2 |
| `subscription_packages` columns incl. bilingual, SLA, auto-renew | Task 1 |
| `subscription_package_services` with `ON DELETE RESTRICT` + `discount_override` | Task 1 |
| `customer_subscriptions` with `price_paid` + `discount_percent_snapshot` | Task 1 |
| `subscription_usage_log` | Task 1 |
| `subscription_packages_with_counts` view (no client-side aggregation) | Task 1 |
| `upsert_package_with_services` RPC (atomic) | Task 2 |
| `useSubscriptionPackages`, `usePackageServices`, `useUpsertPackage`, `useArchivePackage` | Task 3 |
| `service_count` in DB view — no client-side aggregation | Task 1 |
| `ServicePickerTree` — tree hierarchy, checkboxes, tri-state parents, search, discount overrides | Task 4 |
| `PackageEditDialog` — all fields, SLA strict-mode, services picker, validation | Task 5 |
| `SubscriptionPackageRow` — all columns, subscriber pill, archive action hidden on archived | Task 6 |
| `SubscriptionsPage` — search filter, show-archived toggle, skeleton, empty states | Task 7 |
| Route page with profile | Task 8 |
| Nav: remove comingSoon | Task 8 |
| Audit trail via `logActivity` on create/update/archive | Task 3 |
| Orange accent throughout | Tasks 6, 7 |
| Full-screen on mobile, centered card on md+ | Task 5 |
| PROGRESS.md update | Task 9 |
| Customer FK placeholder migration (not applied until customers module ships) | Task 10 |
