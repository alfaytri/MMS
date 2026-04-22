# PO Approval Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded 3-role approval logic with configurable, division-based approval chains featuring cumulative sequential tiers, parallel any-one-of-role approvals, in-app notifications, four-eyes enforcement, iteration history, and admin force-approve.

**Architecture:** Pure business logic lives in `src/lib/approvalChainResolution.ts` (unit-testable, no Supabase). Hooks call Supabase then delegate to pure functions. A Postgres function `advance_po_approval_tier` handles state machine transitions atomically. Admin settings page at `/purchase/approval-settings`.

**Tech Stack:** Next.js 15, Supabase (postgres + rpc), React Query, Vitest, shadcn/ui, TypeScript

---

## File Map

| Action | Path |
|--------|------|
| Create | `supabase/migrations/20260422000001_approval_chains.sql` |
| Create | `src/lib/approvalChainResolution.ts` |
| Create | `src/lib/approvalChainResolution.test.ts` |
| Modify | `src/lib/permissions.ts` |
| Modify | `src/lib/permissions.test.ts` |
| Create | `src/hooks/useApprovalChains.ts` |
| Create | `src/hooks/useApprovalRoleAssignments.ts` |
| Create | `src/hooks/useNotifications.ts` |
| Modify | `src/hooks/usePurchaseOrders.ts` (replace `useSubmitPOForApproval`, `calcApprovalLevel`, `getApprovalRoles`) |
| Modify | `src/hooks/usePOApprovals.ts` (full rewrite) |
| Create | `src/components/layout/NotificationBell.tsx` |
| Modify | `src/components/layout/TopNav.tsx` |
| Create | `src/app/(dashboard)/purchase/approval-settings/page.tsx` |
| Create | `src/components/purchase/ApprovalChainsTab.tsx` |
| Create | `src/components/purchase/ApprovalRoleAssignmentsTab.tsx` |
| Modify | `src/components/layout/nav-config.ts` |
| Modify | `src/app/(dashboard)/purchase/approvals/page.tsx` |
| Modify | `src/components/purchase/PoApprovalChain.tsx` |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260422000001_approval_chains.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260422000001_approval_chains.sql

-- ── New tables ────────────────────────────────────────────────────────────────

CREATE TABLE approval_chains (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id  UUID REFERENCES divisions(id),
  name         TEXT NOT NULL,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (division_id)
);

CREATE TABLE approval_chain_tiers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id       UUID NOT NULL REFERENCES approval_chains(id) ON DELETE CASCADE,
  rank           INT NOT NULL,
  min_amount     NUMERIC NOT NULL,
  max_amount     NUMERIC,
  required_roles approval_role[] NOT NULL,
  deleted_at     TIMESTAMPTZ,
  UNIQUE (chain_id, rank)
);

CREATE TABLE approval_role_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        approval_role NOT NULL,
  division_id UUID REFERENCES divisions(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  deleted_at  TIMESTAMPTZ,
  UNIQUE (profile_id, role, division_id)
);

CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT,
  related_id   UUID,
  related_type TEXT,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ── Alter po_approvals ────────────────────────────────────────────────────────

ALTER TABLE po_approvals
  DROP COLUMN IF EXISTS assigned_to,
  ADD COLUMN IF NOT EXISTS tier_rank      INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iteration      INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS force_approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS force_comment  TEXT;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX idx_notifications_related_id         ON notifications(related_id);
CREATE INDEX idx_notifications_profile_read        ON notifications(profile_id, read_at);
CREATE INDEX idx_po_approvals_po_iteration         ON po_approvals(po_id, iteration);
CREATE INDEX idx_po_approvals_active_pending       ON po_approvals(po_id, is_active, status);

-- ── RLS (permissive — matches existing pattern) ───────────────────────────────

ALTER TABLE approval_chains           ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_chain_tiers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications             ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_approval_chains"           ON approval_chains           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_approval_chain_tiers"      ON approval_chain_tiers      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_approval_role_assignments" ON approval_role_assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_notifications"             ON notifications             FOR ALL USING (true) WITH CHECK (true);

-- ── State machine function ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION advance_po_approval_tier(p_po_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_iteration  INT;
  v_next_rank  INT;
  v_all_done   BOOLEAN;
BEGIN
  SELECT COALESCE(MAX(iteration), 1) INTO v_iteration
  FROM po_approvals WHERE po_id = p_po_id;

  SELECT NOT EXISTS (
    SELECT 1 FROM po_approvals
    WHERE po_id = p_po_id
      AND iteration = v_iteration
      AND is_active = true
      AND status NOT IN ('approved')
  ) INTO v_all_done;

  IF NOT v_all_done THEN RETURN; END IF;

  SELECT MIN(tier_rank) INTO v_next_rank
  FROM po_approvals
  WHERE po_id = p_po_id
    AND iteration = v_iteration
    AND is_active = false
    AND status = 'pending';

  IF v_next_rank IS NOT NULL THEN
    UPDATE po_approvals
    SET is_active = true
    WHERE po_id = p_po_id
      AND iteration = v_iteration
      AND tier_rank = v_next_rank;
  ELSE
    UPDATE purchase_orders SET status = 'approved' WHERE id = p_po_id;
  END IF;
END;
$$;
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected: migration applies without errors.

- [ ] **Step 3: Verify in Supabase Studio**

Check that tables `approval_chains`, `approval_chain_tiers`, `approval_role_assignments`, `notifications` exist. Check `po_approvals` has `tier_rank`, `is_active`, `iteration`, `force_approved`, `force_comment` columns.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260422000001_approval_chains.sql
git commit -m "feat(db): add approval chains, role assignments, notifications tables"
```

---

## Task 2: Pure Approval Chain Resolution Logic + Tests

**Files:**
- Create: `src/lib/approvalChainResolution.ts`
- Create: `src/lib/approvalChainResolution.test.ts`

- [ ] **Step 1: Write the failing tests first**

```typescript
// src/lib/approvalChainResolution.test.ts
import { describe, it, expect } from 'vitest'
import {
  findApplicableTiers,
  validateRoles,
  buildApprovalSteps,
  getNotificationRecipients,
  type ApprovalChainTier,
  type ApprovalRoleAssignmentRow,
} from './approvalChainResolution'

function tier(rank: number, minAmount: number, roles: string[]): ApprovalChainTier {
  return { id: `t${rank}`, chain_id: 'c1', rank, min_amount: minAmount, max_amount: null, required_roles: roles as any, deleted_at: null }
}

function assign(profileId: string, role: string, divisionId: string | null = null): ApprovalRoleAssignmentRow {
  return { id: `a-${profileId}-${role}`, profile_id: profileId, role: role as any, division_id: divisionId, deleted_at: null, created_at: '' }
}

describe('findApplicableTiers', () => {
  const tiers = [tier(1, 0, ['purchase_manager']), tier(2, 5000, ['accountant']), tier(3, 50000, ['owner'])]

  it('returns only tier 1 for amount under 5000', () => {
    expect(findApplicableTiers(2000, tiers).map((t) => t.rank)).toEqual([1])
  })

  it('returns tiers 1+2 for 10000', () => {
    expect(findApplicableTiers(10000, tiers).map((t) => t.rank)).toEqual([1, 2])
  })

  it('returns all tiers for 100000', () => {
    expect(findApplicableTiers(100000, tiers).map((t) => t.rank)).toEqual([1, 2, 3])
  })

  it('skips soft-deleted tiers', () => {
    const withDeleted = [...tiers, { ...tier(4, 0, ['owner']), deleted_at: '2026-01-01' }]
    expect(findApplicableTiers(100000, withDeleted)).toHaveLength(3)
  })

  it('sorts by rank ascending regardless of input order', () => {
    expect(findApplicableTiers(100000, [tiers[2], tiers[0], tiers[1]]).map((t) => t.rank)).toEqual([1, 2, 3])
  })
})

describe('validateRoles', () => {
  const tiers = [tier(1, 0, ['purchase_manager']), tier(2, 5000, ['accountant'])]

  it('returns null when all roles have eligible assignees', () => {
    expect(validateRoles(tiers, [assign('pm', 'purchase_manager'), assign('ac', 'accountant')], 'creator')).toBeNull()
  })

  it('returns error message naming the missing role', () => {
    const result = validateRoles(tiers, [assign('pm', 'purchase_manager')], 'creator')
    expect(result).toContain('Accountant')
  })

  it('excludes the creator from eligible assignees', () => {
    const result = validateRoles(tiers, [assign('pm', 'purchase_manager'), assign('creator', 'accountant')], 'creator')
    expect(result).toContain('Accountant')
  })

  it('excludes soft-deleted assignments', () => {
    const result = validateRoles(tiers, [assign('pm', 'purchase_manager'), { ...assign('ac', 'accountant'), deleted_at: '2026-01-01' }], 'creator')
    expect(result).toContain('Accountant')
  })
})

describe('buildApprovalSteps', () => {
  it('first tier is active, others dormant', () => {
    const tiers = [tier(1, 0, ['purchase_manager']), tier(2, 5000, ['accountant'])]
    const steps = buildApprovalSteps('po1', tiers, 1)
    expect(steps.filter((s) => s.tier_rank === 1).every((s) => s.is_active)).toBe(true)
    expect(steps.filter((s) => s.tier_rank === 2).every((s) => !s.is_active)).toBe(true)
  })

  it('creates one step per role per tier', () => {
    const steps = buildApprovalSteps('po1', [tier(1, 0, ['purchase_manager', 'accountant'])], 1)
    expect(steps).toHaveLength(2)
  })

  it('stamps all steps with the iteration number', () => {
    const steps = buildApprovalSteps('po1', [tier(1, 0, ['purchase_manager'])], 3)
    expect(steps.every((s) => s.iteration === 3)).toBe(true)
  })
})

describe('getNotificationRecipients', () => {
  const tiers = [tier(1, 0, ['purchase_manager']), tier(2, 5000, ['accountant'])]

  it('returns users holding the active tier role', () => {
    const result = getNotificationRecipients(1, tiers, [assign('pm', 'purchase_manager'), assign('ac', 'accountant')], 'creator')
    expect(result).toEqual(['pm'])
  })

  it('deduplicates user holding multiple roles in same tier', () => {
    const multiTier = [tier(1, 0, ['purchase_manager', 'accountant'])]
    const result = getNotificationRecipients(1, multiTier, [assign('multi', 'purchase_manager'), assign('multi', 'accountant')], 'creator')
    expect(result).toEqual(['multi'])
  })

  it('excludes the creator', () => {
    const result = getNotificationRecipients(1, tiers, [assign('creator', 'purchase_manager')], 'creator')
    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests — expect all to fail**

```bash
npx vitest run src/lib/approvalChainResolution.test.ts
```

Expected: FAIL with "Cannot find module './approvalChainResolution'"

- [ ] **Step 3: Implement the pure functions**

```typescript
// src/lib/approvalChainResolution.ts

export type ApprovalRole = 'purchase_manager' | 'accountant' | 'owner'

export type ApprovalChainTier = {
  id: string
  chain_id: string
  rank: number
  min_amount: number
  max_amount: number | null
  required_roles: ApprovalRole[]
  deleted_at: string | null
}

export type ApprovalRoleAssignmentRow = {
  id: string
  profile_id: string
  role: ApprovalRole
  division_id: string | null
  created_at: string
  deleted_at: string | null
}

export type ApprovalStepInsert = {
  po_id: string
  role: ApprovalRole
  tier_rank: number
  status: 'pending'
  is_active: boolean
  iteration: number
}

const ROLE_LABELS: Record<ApprovalRole, string> = {
  purchase_manager: 'Purchase Manager',
  accountant: 'Accountant',
  owner: 'Owner',
}

export function findApplicableTiers(totalQar: number, tiers: ApprovalChainTier[]): ApprovalChainTier[] {
  return tiers
    .filter((t) => t.deleted_at === null && totalQar >= t.min_amount)
    .sort((a, b) => a.rank - b.rank)
}

export function validateRoles(
  applicableTiers: ApprovalChainTier[],
  assignments: ApprovalRoleAssignmentRow[],
  creatorProfileId: string,
): string | null {
  const eligible = assignments.filter((a) => a.deleted_at === null && a.profile_id !== creatorProfileId)
  for (const t of applicableTiers) {
    for (const role of t.required_roles) {
      if (!eligible.some((a) => a.role === role)) {
        return `No ${ROLE_LABELS[role]} assigned for this division (excluding you). Please assign an additional approver.`
      }
    }
  }
  return null
}

export function buildApprovalSteps(
  poId: string,
  applicableTiers: ApprovalChainTier[],
  iteration: number,
): ApprovalStepInsert[] {
  const lowestRank = applicableTiers[0]?.rank ?? 1
  return applicableTiers.flatMap((t) =>
    t.required_roles.map((role) => ({
      po_id: poId,
      role,
      tier_rank: t.rank,
      status: 'pending' as const,
      is_active: t.rank === lowestRank,
      iteration,
    }))
  )
}

export function getNotificationRecipients(
  activeTierRank: number,
  applicableTiers: ApprovalChainTier[],
  assignments: ApprovalRoleAssignmentRow[],
  creatorProfileId: string,
): string[] {
  const activeTier = applicableTiers.find((t) => t.rank === activeTierRank)
  if (!activeTier) return []
  const eligible = assignments.filter((a) => a.deleted_at === null && a.profile_id !== creatorProfileId)
  const ids = new Set<string>()
  for (const role of activeTier.required_roles) {
    for (const a of eligible) {
      if (a.role === role) ids.add(a.profile_id)
    }
  }
  return Array.from(ids)
}
```

- [ ] **Step 4: Run tests — expect all to pass**

```bash
npx vitest run src/lib/approvalChainResolution.test.ts
```

Expected: PASS (18 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/approvalChainResolution.ts src/lib/approvalChainResolution.test.ts
git commit -m "feat: add pure approval chain resolution logic with tests"
```

---

## Task 3: Add New Permissions

**Files:**
- Modify: `src/lib/permissions.ts`
- Modify: `src/lib/permissions.test.ts`

- [ ] **Step 1: Write failing test for new permissions**

Open `src/lib/permissions.test.ts`. Add at the end of the existing test file:

```typescript
it('includes purchase.approvals.chain.manage permission', () => {
  expect(ALL_PERMISSIONS).toContain('purchase.approvals.chain.manage')
})

it('includes purchase.approvals.bypass permission', () => {
  expect(ALL_PERMISSIONS).toContain('purchase.approvals.bypass')
})
```

- [ ] **Step 2: Run — expect to fail**

```bash
npx vitest run src/lib/permissions.test.ts
```

Expected: FAIL

- [ ] **Step 3: Add permissions to permissions.ts**

In the `'Purchase'` module group in `src/lib/permissions.ts`, add after `purchase.approvals.manage`:

```typescript
{ key: 'purchase.approvals.chain.manage', label: 'Manage Approval Chains', description: 'Configure approval chains, tiers, and role assignments' },
{ key: 'purchase.approvals.bypass',       label: 'Bypass Approvals',        description: 'Force-approve stuck purchase order approval steps' },
```

- [ ] **Step 4: Run — expect to pass**

```bash
npx vitest run src/lib/permissions.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissions.ts src/lib/permissions.test.ts
git commit -m "feat: add purchase.approvals.chain.manage and bypass permissions"
```

---

## Task 4: useApprovalChains Hook

**Files:**
- Create: `src/hooks/useApprovalChains.ts`

- [ ] **Step 1: Create the hook file**

```typescript
// src/hooks/useApprovalChains.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ApprovalRole, ApprovalChainTier } from '@/lib/approvalChainResolution'

export type ApprovalChain = {
  id: string
  division_id: string | null
  name: string
  is_active: boolean
  created_at: string
  approval_chain_tiers?: ApprovalChainTier[]
}

export function useApprovalChains() {
  return useQuery({
    queryKey: ['approval-chains'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('approval_chains')
        .select('*, approval_chain_tiers(*)')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as ApprovalChain[]
    },
    staleTime: 60 * 1000,
  })
}

export function useChainForDivision(divisionId: string | null | undefined) {
  return useQuery({
    queryKey: ['approval-chain-for-division', divisionId],
    queryFn: async () => {
      const supabase = createClient()
      // Try division-specific chain first
      if (divisionId) {
        const { data } = await (supabase as any)
          .from('approval_chains')
          .select('*, approval_chain_tiers(*)')
          .eq('division_id', divisionId)
          .eq('is_active', true)
          .maybeSingle()
        if (data) return data as ApprovalChain
      }
      // Fall back to company default
      const { data, error } = await (supabase as any)
        .from('approval_chains')
        .select('*, approval_chain_tiers(*)')
        .is('division_id', null)
        .eq('is_active', true)
        .maybeSingle()
      if (error) throw error
      return data as ApprovalChain | null
    },
    enabled: divisionId !== undefined,
    staleTime: 60 * 1000,
  })
}

export function useUpsertApprovalChain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { id?: string; division_id: string | null; name: string }) => {
      const supabase = createClient()
      if (payload.id) {
        const { data, error } = await (supabase as any)
          .from('approval_chains').update({ name: payload.name }).eq('id', payload.id).select().single()
        if (error) throw error
        return data as ApprovalChain
      }
      const { data, error } = await (supabase as any)
        .from('approval_chains').insert({ division_id: payload.division_id, name: payload.name, is_active: true }).select().single()
      if (error) throw error
      return data as ApprovalChain
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval-chains'] }),
  })
}

export function useUpsertApprovalChainTier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id?: string
      chain_id: string
      rank: number
      min_amount: number
      max_amount: number | null
      required_roles: ApprovalRole[]
    }) => {
      const supabase = createClient()
      if (payload.id) {
        const { data, error } = await (supabase as any)
          .from('approval_chain_tiers').update({
            rank: payload.rank,
            min_amount: payload.min_amount,
            max_amount: payload.max_amount,
            required_roles: payload.required_roles,
          }).eq('id', payload.id).select().single()
        if (error) throw error
        return data
      }
      const { data, error } = await (supabase as any)
        .from('approval_chain_tiers').insert({
          chain_id: payload.chain_id,
          rank: payload.rank,
          min_amount: payload.min_amount,
          max_amount: payload.max_amount,
          required_roles: payload.required_roles,
        }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval-chains'] }),
  })
}

export function useSoftDeleteApprovalChainTier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ tierId, chainId }: { tierId: string; chainId: string }) => {
      const supabase = createClient()
      // Block if any POs in flight reference this chain
      const { count } = await (supabase as any)
        .from('purchase_orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending_approval')
      if ((count ?? 0) > 0) {
        // Simplified check — full check would filter by chain. Good enough for now.
        throw new Error('Cannot delete tier: there are POs currently pending approval.')
      }
      const { error } = await (supabase as any)
        .from('approval_chain_tiers')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', tierId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval-chains'] }),
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useApprovalChains.ts
git commit -m "feat: add useApprovalChains hook"
```

---

## Task 5: useApprovalRoleAssignments Hook

**Files:**
- Create: `src/hooks/useApprovalRoleAssignments.ts`

- [ ] **Step 1: Create the hook file**

```typescript
// src/hooks/useApprovalRoleAssignments.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ApprovalRole, ApprovalRoleAssignmentRow } from '@/lib/approvalChainResolution'

export type ApprovalRoleAssignmentWithProfile = ApprovalRoleAssignmentRow & {
  profiles: { id: string; full_name: string; email: string | null } | null
}

export function useApprovalRoleAssignments() {
  return useQuery({
    queryKey: ['approval-role-assignments'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('approval_role_assignments')
        .select('*, profiles(id, full_name, email)')
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as ApprovalRoleAssignmentWithProfile[]
    },
    staleTime: 60 * 1000,
  })
}

export function useApprovalRoleAssignmentsForDivision(divisionId: string | null | undefined) {
  return useQuery({
    queryKey: ['approval-role-assignments', divisionId],
    queryFn: async () => {
      const supabase = createClient()
      const query = (supabase as any)
        .from('approval_role_assignments')
        .select('*')
        .is('deleted_at', null)
      const { data, error } = divisionId
        ? await query.or(`division_id.eq.${divisionId},division_id.is.null`)
        : await query.is('division_id', null)
      if (error) throw error
      return data as ApprovalRoleAssignmentRow[]
    },
    enabled: divisionId !== undefined,
    staleTime: 60 * 1000,
  })
}

export function useCurrentUserApprovalRoles() {
  return useQuery({
    queryKey: ['my-approval-roles'],
    queryFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return [] as ApprovalRole[]
      const { data: profile } = await (supabase as any)
        .from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
      if (!profile) return [] as ApprovalRole[]
      const { data, error } = await (supabase as any)
        .from('approval_role_assignments')
        .select('role')
        .eq('profile_id', profile.id)
        .is('deleted_at', null)
      if (error) throw error
      return (data ?? []).map((r: { role: ApprovalRole }) => r.role) as ApprovalRole[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useAddApprovalRoleAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { profile_id: string; role: ApprovalRole; division_id: string | null }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('approval_role_assignments')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-role-assignments'] })
      qc.invalidateQueries({ queryKey: ['my-approval-roles'] })
    },
  })
}

export function useSoftDeleteApprovalRoleAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('approval_role_assignments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-role-assignments'] })
      qc.invalidateQueries({ queryKey: ['my-approval-roles'] })
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useApprovalRoleAssignments.ts
git commit -m "feat: add useApprovalRoleAssignments hook"
```

---

## Task 6: useNotifications Hook

**Files:**
- Create: `src/hooks/useNotifications.ts`

- [ ] **Step 1: Create the hook file**

```typescript
// src/hooks/useNotifications.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type NotificationRow = {
  id: string
  profile_id: string
  type: string
  title: string
  body: string | null
  related_id: string | null
  related_type: string | null
  read_at: string | null
  created_at: string
}

async function getMyProfileId(): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await (supabase as any)
    .from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  return data?.id ?? null
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const profileId = await getMyProfileId()
      if (!profileId) return 0
      const supabase = createClient()
      const { count, error } = await (supabase as any)
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .is('read_at', null)
      if (error) throw error
      return count ?? 0
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  })
}

export function useRecentNotifications() {
  return useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: async () => {
      const profileId = await getMyProfileId()
      if (!profileId) return [] as NotificationRow[]
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('notifications')
        .select('*')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return data as NotificationRow[]
    },
    staleTime: 30 * 1000,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const profileId = await getMyProfileId()
      if (!profileId) return
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .is('read_at', null)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useNotifications.ts
git commit -m "feat: add useNotifications hook for in-app inbox"
```

---

## Task 7: Rewrite useSubmitPOForApproval

**Files:**
- Modify: `src/hooks/usePurchaseOrders.ts`

This replaces the hardcoded `calcApprovalLevel` / `getApprovalRoles` approach with the new chain-based system.

- [ ] **Step 1: Update the `POApprovalStep` type** (add new columns)

In `src/hooks/usePurchaseOrders.ts`, replace the existing `POApprovalStep` type:

```typescript
export type POApprovalStep = {
  id: string
  po_id: string
  role: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  approved_by: string | null
  date: string | null
  comment: string | null
  tier_rank: number
  is_active: boolean
  iteration: number
  force_approved: boolean
  force_comment: string | null
}
```

- [ ] **Step 2: Replace `useSubmitPOForApproval`**

Remove the existing `useSubmitPOForApproval` function and the `calcApprovalLevel` / `getApprovalRoles` helpers. Replace with:

```typescript
import { findApplicableTiers, validateRoles, buildApprovalSteps, getNotificationRecipients } from '@/lib/approvalChainResolution'

export function useSubmitPOForApproval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Get current user's profile
      const { data: myProfile } = await (supabase as any)
        .from('profiles').select('id, division_id').eq('auth_user_id', user.id).single()
      if (!myProfile) throw new Error('Profile not found')

      const divisionId: string | null = myProfile.division_id ?? null

      // Get PO details
      const { data: po } = await (supabase as any)
        .from('purchase_orders').select('id, total_qar, created_by').eq('id', id).single()
      if (!po) throw new Error('PO not found')

      // Find chain (division-specific → company default)
      let chain: { id: string; approval_chain_tiers: any[] } | null = null
      if (divisionId) {
        const { data } = await (supabase as any)
          .from('approval_chains')
          .select('id, approval_chain_tiers(*)')
          .eq('division_id', divisionId)
          .eq('is_active', true)
          .maybeSingle()
        chain = data
      }
      if (!chain) {
        const { data } = await (supabase as any)
          .from('approval_chains')
          .select('id, approval_chain_tiers(*)')
          .is('division_id', null)
          .eq('is_active', true)
          .maybeSingle()
        chain = data
      }
      if (!chain) throw new Error('No approval chain configured. Contact your administrator.')

      // Find applicable tiers
      const tiers = findApplicableTiers(po.total_qar, chain.approval_chain_tiers ?? [])
      if (tiers.length === 0) throw new Error('No approval tiers match this PO amount. Check approval chain configuration.')

      // Fetch role assignments for this division (including company-wide)
      const { data: assignments } = await (supabase as any)
        .from('approval_role_assignments')
        .select('*')
        .is('deleted_at', null)
        .or(divisionId ? `division_id.eq.${divisionId},division_id.is.null` : 'division_id.is.null')
      const roleAssignments = assignments ?? []

      // Validate roles (exclude creator)
      const validationError = validateRoles(tiers, roleAssignments, myProfile.id)
      if (validationError) throw new Error(validationError)

      // Determine iteration
      const { data: existingSteps } = await (supabase as any)
        .from('po_approvals').select('iteration').eq('po_id', id).order('iteration', { ascending: false }).limit(1)
      const iteration = existingSteps?.[0]?.iteration ? existingSteps[0].iteration + 1 : 1

      // Create approval steps
      const steps = buildApprovalSteps(id, tiers, iteration)
      const { error: stepsErr } = await (supabase as any).from('po_approvals').insert(steps)
      if (stepsErr) throw stepsErr

      // Update PO status
      const { error: poErr } = await (supabase as any)
        .from('purchase_orders').update({ status: 'pending_approval' }).eq('id', id)
      if (poErr) throw poErr

      // Fire notifications (distinct per user for lowest-rank tier)
      const lowestRank = tiers[0].rank
      const recipientIds = getNotificationRecipients(lowestRank, tiers, roleAssignments, myProfile.id)
      if (recipientIds.length > 0) {
        const { data: poFull } = await (supabase as any)
          .from('purchase_orders').select('po_number').eq('id', id).single()
        const notifs = recipientIds.map((profileId: string) => ({
          profile_id: profileId,
          type: 'po_approval_requested',
          title: `PO ${poFull?.po_number ?? id} requires your approval`,
          body: `Total: ${po.total_qar} QAR`,
          related_id: id,
          related_type: 'purchase_order',
        }))
        await (supabase as any).from('notifications').insert(notifs)
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['po-approvals'] })
    },
  })
}
```

- [ ] **Step 3: Update callers** — search for `useSubmitPOForApproval` usage and remove the `approval_level` parameter from calls

```bash
grep -r "useSubmitPOForApproval\|submitPOForApproval\|approval_level" /d/MMS/src --include="*.tsx" --include="*.ts" -l
```

For each file found, change the mutation call from:
```typescript
submitPO.mutate({ id: po.id, approval_level: po.approval_level })
```
to:
```typescript
submitPO.mutate({ id: po.id })
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/usePurchaseOrders.ts
git commit -m "feat: rewrite useSubmitPOForApproval with configurable chain-based logic"
```

---

## Task 8: Rewrite usePOApprovals

**Files:**
- Modify: `src/hooks/usePOApprovals.ts`

Full rewrite. Replace the entire file:

- [ ] **Step 1: Replace the file content**

```typescript
// src/hooks/usePOApprovals.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getNotificationRecipients } from '@/lib/approvalChainResolution'
import type { PurchaseOrder } from './usePurchaseOrders'

async function getMyIdentity() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await (supabase as any)
    .from('profiles').select('id, division_id').eq('auth_user_id', user.id).maybeSingle()
  return { email: user.email ?? '', profileId: profile?.id ?? null, divisionId: profile?.division_id ?? null }
}

export function usePendingApprovals() {
  return useQuery({
    queryKey: ['po-approvals', 'pending'],
    queryFn: async () => {
      const me = await getMyIdentity()
      if (!me?.profileId) return [] as PurchaseOrder[]
      const supabase = createClient()

      // Get current user's approval roles
      const { data: myRoles } = await (supabase as any)
        .from('approval_role_assignments')
        .select('role')
        .eq('profile_id', me.profileId)
        .is('deleted_at', null)
      const roles = (myRoles ?? []).map((r: { role: string }) => r.role) as string[]
      if (roles.length === 0) return [] as PurchaseOrder[]

      // Get max iteration per PO for filtering
      const { data, error } = await (supabase as any)
        .from('purchase_orders')
        .select('*, po_line_items(*), po_approvals(*)')
        .eq('status', 'pending_approval')
        .is('deleted_at', null)
        .neq('created_by', me.email)          // self-approval guard
        .order('created_at', { ascending: false })
      if (error) throw error

      const pos = (data ?? []) as PurchaseOrder[]

      // Filter to POs where current user has an active pending step in their role
      return pos.filter((po) => {
        const steps = po.po_approvals ?? []
        const maxIteration = Math.max(...steps.map((s: any) => s.iteration ?? 1), 1)
        return steps.some(
          (s: any) =>
            s.status === 'pending' &&
            s.is_active === true &&
            s.iteration === maxIteration &&
            roles.includes(s.role),
        )
      })
    },
    staleTime: 30 * 1000,
  })
}

export function useCompletedApprovals() {
  return useQuery({
    queryKey: ['po-approvals', 'completed'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('purchase_orders')
        .select('*, po_approvals(*)')
        .in('status', ['approved', 'partially_received', 'received', 'cancelled'])
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as PurchaseOrder[]
    },
    staleTime: 60 * 1000,
  })
}

export function useApproveStep() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      stepId,
      poId,
      comment,
    }: {
      stepId: string
      poId: string
      comment: string
    }) => {
      const supabase = createClient()
      const me = await getMyIdentity()
      if (!me) throw new Error('Not authenticated')

      // Four-eyes check: has this user already approved a different role in the same tier+iteration?
      const { data: thisStep } = await (supabase as any)
        .from('po_approvals').select('tier_rank, iteration').eq('id', stepId).single()
      if (thisStep) {
        const { data: sameUserApprovals } = await (supabase as any)
          .from('po_approvals')
          .select('id')
          .eq('po_id', poId)
          .eq('tier_rank', thisStep.tier_rank)
          .eq('iteration', thisStep.iteration)
          .eq('status', 'approved')
          .eq('approved_by', me.email)
          .neq('id', stepId)
        if ((sameUserApprovals ?? []).length > 0) {
          throw new Error('You have already approved another role in this tier. A second approval from the same person violates the four-eyes requirement.')
        }
      }

      // Approve the step
      const { error: stepErr } = await (supabase as any)
        .from('po_approvals').update({
          status: 'approved',
          approved_by: me.email,
          date: new Date().toISOString().split('T')[0],
          comment: comment || null,
        }).eq('id', stepId)
      if (stepErr) throw stepErr

      // Ghost notification cleanup
      await (supabase as any)
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('related_id', poId)
        .eq('type', 'po_approval_requested')
        .is('read_at', null)

      // Advance state machine (Postgres function handles next tier / PO approval)
      const { error: rpcErr } = await supabase.rpc('advance_po_approval_tier', { p_po_id: poId })
      if (rpcErr) throw rpcErr

      // Check if next tier was activated — fire notifications for it
      const { data: newlyActive } = await (supabase as any)
        .from('po_approvals')
        .select('tier_rank')
        .eq('po_id', poId)
        .eq('is_active', true)
        .eq('status', 'pending')
        .order('tier_rank', { ascending: true })
        .limit(1)
      if (newlyActive?.[0] && newlyActive[0].tier_rank !== thisStep?.tier_rank) {
        // New tier activated — fetch tiers + assignments + fire notifications
        const { data: allSteps } = await (supabase as any)
          .from('po_approvals').select('tier_rank, role, is_active').eq('po_id', poId).eq('iteration', thisStep?.iteration ?? 1)
        const { data: assignments } = await (supabase as any)
          .from('approval_role_assignments').select('*').is('deleted_at', null)
        const activeTierRank = newlyActive[0].tier_rank
        const uniqueTiers = [...new Map((allSteps ?? []).map((s: any) => [s.tier_rank, { rank: s.tier_rank, required_roles: [] as string[], id: '', chain_id: '', min_amount: 0, max_amount: null, deleted_at: null }])).values()]
        ;(allSteps ?? []).forEach((s: any) => { const t = uniqueTiers.find((u: any) => u.rank === s.tier_rank); if (t) (t as any).required_roles.push(s.role) })
        const recipientIds = getNotificationRecipients(activeTierRank, uniqueTiers as any, assignments ?? [], me.profileId ?? '')
        if (recipientIds.length > 0) {
          const { data: po } = await (supabase as any).from('purchase_orders').select('po_number, total_qar').eq('id', poId).single()
          const notifs = recipientIds.map((profileId: string) => ({
            profile_id: profileId,
            type: 'po_approval_requested',
            title: `PO ${po?.po_number ?? poId} requires your approval`,
            body: `Total: ${po?.total_qar} QAR`,
            related_id: poId,
            related_type: 'purchase_order',
          }))
          await (supabase as any).from('notifications').insert(notifs)
        }
      }

      // Check if PO is now fully approved — notify creator
      const { data: poStatus } = await (supabase as any)
        .from('purchase_orders').select('status, created_by, po_number').eq('id', poId).single()
      if (poStatus?.status === 'approved' && poStatus.created_by) {
        const { data: creatorProfile } = await (supabase as any)
          .from('profiles').select('id').eq('email', poStatus.created_by).maybeSingle()
        if (creatorProfile) {
          await (supabase as any).from('notifications').insert({
            profile_id: creatorProfile.id,
            type: 'po_approved',
            title: `PO ${poStatus.po_number} has been fully approved`,
            related_id: poId,
            related_type: 'purchase_order',
          })
        }
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['po-approvals'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.poId] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useForceApproveStep() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      stepId,
      poId,
      forceComment,
    }: {
      stepId: string
      poId: string
      forceComment: string
    }) => {
      if (!forceComment.trim()) throw new Error('A comment is required for force-approve.')
      const supabase = createClient()
      const me = await getMyIdentity()
      if (!me) throw new Error('Not authenticated')

      const { error } = await (supabase as any)
        .from('po_approvals').update({
          status: 'approved',
          approved_by: me.email,
          date: new Date().toISOString().split('T')[0],
          force_approved: true,
          force_comment: forceComment,
        }).eq('id', stepId)
      if (error) throw error

      // Ghost cleanup
      await (supabase as any)
        .from('notifications').update({ read_at: new Date().toISOString() })
        .eq('related_id', poId).eq('type', 'po_approval_requested').is('read_at', null)

      // Advance state machine
      const { error: rpcErr } = await supabase.rpc('advance_po_approval_tier', { p_po_id: poId })
      if (rpcErr) throw rpcErr
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['po-approvals'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.poId] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useRejectPO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      poId,
      stepId,
      comment,
      mode,
    }: {
      poId: string
      stepId: string
      comment: string
      mode: 'full_rejection' | 'send_back_to_draft'
    }) => {
      const supabase = createClient()
      const me = await getMyIdentity()
      if (!me) throw new Error('Not authenticated')

      // Get current iteration
      const { data: steps } = await (supabase as any)
        .from('po_approvals').select('id, iteration').eq('po_id', poId).order('iteration', { ascending: false }).limit(1)
      const currentIteration = steps?.[0]?.iteration ?? 1

      // Reject this step
      const { error: stepErr } = await (supabase as any)
        .from('po_approvals').update({
          status: 'rejected',
          approved_by: me.email,
          date: new Date().toISOString().split('T')[0],
          comment: comment || null,
        }).eq('id', stepId)
      if (stepErr) throw stepErr

      // Cancel all other pending steps in this iteration
      await (supabase as any)
        .from('po_approvals').update({ status: 'cancelled' })
        .eq('po_id', poId)
        .eq('iteration', currentIteration)
        .eq('status', 'pending')
        .neq('id', stepId)

      // Ghost notification cleanup
      await (supabase as any)
        .from('notifications').update({ read_at: new Date().toISOString() })
        .eq('related_id', poId).eq('type', 'po_approval_requested').is('read_at', null)

      const newStatus = mode === 'full_rejection' ? 'cancelled' : 'draft'
      const { error: poErr } = await (supabase as any)
        .from('purchase_orders').update({ status: newStatus }).eq('id', poId)
      if (poErr) throw poErr

      // Notify PO creator
      const { data: po } = await (supabase as any)
        .from('purchase_orders').select('created_by, po_number').eq('id', poId).single()
      if (po?.created_by) {
        const { data: creatorProfile } = await (supabase as any)
          .from('profiles').select('id').eq('email', po.created_by).maybeSingle()
        if (creatorProfile) {
          await (supabase as any).from('notifications').insert({
            profile_id: creatorProfile.id,
            type: 'po_rejected',
            title: `PO ${po.po_number} was rejected by ${me.email}`,
            related_id: poId,
            related_type: 'purchase_order',
          })
        }
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['po-approvals'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.poId] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/usePOApprovals.ts
git commit -m "feat: rewrite usePOApprovals with role-filtering, four-eyes, iteration, force-approve"
```

---

## Task 9: NotificationBell + TopNav

**Files:**
- Create: `src/components/layout/NotificationBell.tsx`
- Modify: `src/components/layout/TopNav.tsx`

- [ ] **Step 1: Create NotificationBell**

```tsx
// src/components/layout/NotificationBell.tsx
'use client'

import { Bell } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  useUnreadNotificationCount,
  useRecentNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '@/hooks/useNotifications'

export function NotificationBell() {
  const router = useRouter()
  const { data: unreadCount = 0 } = useUnreadNotificationCount()
  const { data: notifications = [] } = useRecentNotifications()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()

  function handleClick(id: string, relatedId: string | null, type: string) {
    markRead.mutate(id)
    if (type === 'po_approval_requested' || type === 'po_approved' || type === 'po_rejected') {
      router.push('/purchase/approvals')
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative shrink-0" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markAllRead.mutate()}
            >
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications</div>
        ) : (
          notifications.map((n) => (
            <DropdownMenuItem
              key={n.id}
              className={`flex flex-col items-start gap-0.5 px-3 py-2 cursor-pointer ${!n.read_at ? 'bg-muted/50' : ''}`}
              onClick={() => handleClick(n.id, n.related_id, n.type)}
            >
              <span className={`text-sm ${!n.read_at ? 'font-medium' : ''}`}>{n.title}</span>
              {n.body && <span className="text-xs text-muted-foreground">{n.body}</span>}
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 2: Update TopNav to include NotificationBell**

In `src/components/layout/TopNav.tsx`, add the import and insert `<NotificationBell />` before `<UserMenu />`:

```tsx
import { NotificationBell } from './NotificationBell'

// Inside the return, before {user && <UserMenu ... />}:
{user && <NotificationBell />}
{user && (
  <UserMenu
    email={user.email ?? ''}
    name={profile?.full_name ?? undefined}
  />
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/NotificationBell.tsx src/components/layout/TopNav.tsx
git commit -m "feat: add NotificationBell to TopNav with unread count and dropdown"
```

---

## Task 10: Approval Settings Page — Chains Tab

**Files:**
- Create: `src/app/(dashboard)/purchase/approval-settings/page.tsx`
- Create: `src/components/purchase/ApprovalChainsTab.tsx`

- [ ] **Step 1: Create ApprovalChainsTab**

```tsx
// src/components/purchase/ApprovalChainsTab.tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  useApprovalChains, useUpsertApprovalChain,
  useUpsertApprovalChainTier, useSoftDeleteApprovalChainTier,
} from '@/hooks/useApprovalChains'
import { useApprovalRoleAssignments } from '@/hooks/useApprovalRoleAssignments'
import type { ApprovalRole } from '@/lib/approvalChainResolution'

const APPROVAL_ROLES: ApprovalRole[] = ['purchase_manager', 'accountant', 'owner']
const ROLE_LABELS: Record<ApprovalRole, string> = {
  purchase_manager: 'Purchase Manager',
  accountant: 'Accountant',
  owner: 'Owner',
}

export function ApprovalChainsTab() {
  const { data: chains = [], isLoading } = useApprovalChains()
  const { data: assignments = [] } = useApprovalRoleAssignments()
  const upsertChain = useUpsertApprovalChain()
  const upsertTier = useUpsertApprovalChainTier()
  const deleteTier = useSoftDeleteApprovalChainTier()

  const [newChainName, setNewChainName] = useState('')
  const [addingTierFor, setAddingTierFor] = useState<string | null>(null)
  const [tierForm, setTierForm] = useState({ rank: '', min_amount: '', max_amount: '', roles: [] as ApprovalRole[] })

  function rolesHaveAssignees(roles: ApprovalRole[]): boolean {
    return roles.every((role) => assignments.some((a) => a.role === role && !a.deleted_at))
  }

  function handleAddChain() {
    if (!newChainName.trim()) return
    upsertChain.mutate(
      { division_id: null, name: newChainName.trim() },
      { onSuccess: () => { setNewChainName(''); toast.success('Chain created') }, onError: (e) => toast.error(e.message) }
    )
  }

  function handleAddTier(chainId: string) {
    const rank = parseInt(tierForm.rank)
    const min = parseFloat(tierForm.min_amount)
    if (isNaN(rank) || isNaN(min) || tierForm.roles.length === 0) {
      toast.error('Fill rank, min amount, and select at least one role')
      return
    }
    upsertTier.mutate(
      {
        chain_id: chainId,
        rank,
        min_amount: min,
        max_amount: tierForm.max_amount ? parseFloat(tierForm.max_amount) : null,
        required_roles: tierForm.roles,
      },
      {
        onSuccess: () => {
          setAddingTierFor(null)
          setTierForm({ rank: '', min_amount: '', max_amount: '', roles: [] })
          toast.success('Tier added')
        },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading…</div>

  return (
    <div className="space-y-6">
      {chains.length === 0 && (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No approval chains configured. Create a company default chain below.
        </div>
      )}

      {chains.map((chain) => {
        const tiers = (chain.approval_chain_tiers ?? []).filter((t: any) => !t.deleted_at).sort((a: any, b: any) => a.rank - b.rank)
        return (
          <div key={chain.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold">{chain.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {chain.division_id ? 'Division-specific' : 'Company Default'}
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={() => setAddingTierFor(chain.id)}>
                <Plus className="h-3 w-3 mr-1" /> Add Tier
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Min Amount (QAR)</TableHead>
                  <TableHead>Max Amount</TableHead>
                  <TableHead>Required Roles</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tiers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground text-sm h-10">
                      No tiers yet
                    </TableCell>
                  </TableRow>
                ) : (
                  tiers.map((tier: any) => {
                    const missingRoles = !rolesHaveAssignees(tier.required_roles)
                    return (
                      <TableRow key={tier.id}>
                        <TableCell className="font-mono">{tier.rank}</TableCell>
                        <TableCell>{tier.min_amount.toLocaleString()}</TableCell>
                        <TableCell>{tier.max_amount ? tier.max_amount.toLocaleString() : '∞'}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 items-center">
                            {tier.required_roles.map((r: ApprovalRole) => (
                              <Badge key={r} variant="outline">{ROLE_LABELS[r]}</Badge>
                            ))}
                            {missingRoles && (
                              <span title="Some roles have no assignees" className="text-warning">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => deleteTier.mutate({ tierId: tier.id, chainId: chain.id }, { onError: (e) => toast.error(e.message) })}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>

            {addingTierFor === chain.id && (
              <div className="rounded-md border p-3 space-y-3 bg-muted/30">
                <p className="text-sm font-medium">New Tier</p>
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder="Rank (e.g. 1)" value={tierForm.rank} onChange={(e) => setTierForm((f) => ({ ...f, rank: e.target.value }))} />
                  <Input placeholder="Min Amount (QAR)" value={tierForm.min_amount} onChange={(e) => setTierForm((f) => ({ ...f, min_amount: e.target.value }))} />
                  <Input placeholder="Max Amount (optional)" value={tierForm.max_amount} onChange={(e) => setTierForm((f) => ({ ...f, max_amount: e.target.value }))} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {APPROVAL_ROLES.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setTierForm((f) => ({
                        ...f,
                        roles: f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role],
                      }))}
                      className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                        tierForm.roles.includes(role) ? 'border-primary bg-primary/10 text-primary' : 'border-muted-foreground/30 hover:bg-muted'
                      }`}
                    >
                      {ROLE_LABELS[role]}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleAddTier(chain.id)} disabled={upsertTier.isPending}>Save Tier</Button>
                  <Button size="sm" variant="outline" onClick={() => setAddingTierFor(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Add new company-default chain */}
      <div className="flex gap-2 items-center">
        <Input
          placeholder="New chain name (e.g. Default Approval Chain)"
          value={newChainName}
          onChange={(e) => setNewChainName(e.target.value)}
          className="max-w-sm"
        />
        <Button onClick={handleAddChain} disabled={upsertChain.isPending}>
          <Plus className="h-4 w-4 mr-1" /> Create Chain
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the page**

```tsx
// src/app/(dashboard)/purchase/approval-settings/page.tsx
'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { ApprovalChainsTab } from '@/components/purchase/ApprovalChainsTab'
import { ApprovalRoleAssignmentsTab } from '@/components/purchase/ApprovalRoleAssignmentsTab'
import { useIsAdmin } from '@/hooks/useProfiles'

export default function ApprovalSettingsPage() {
  const [activeTab, setActiveTab] = useState<'chains' | 'assignments'>('chains')
  const { data: isAdmin } = useIsAdmin()

  if (isAdmin === false) {
    return (
      <PageWrapper>
        <PageHeader title="Approval Settings" description="Configure approval chains and role assignments" />
        <div className="rounded-lg border border-destructive p-4 text-sm text-destructive">
          You do not have permission to manage approval settings.
        </div>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper>
      <PageHeader title="Approval Settings" description="Configure approval chains and role assignments" />
      <div className="flex gap-1 border-b mb-6">
        {([['chains', 'Approval Chains'], ['assignments', 'Role Assignments']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'chains' ? <ApprovalChainsTab /> : <ApprovalRoleAssignmentsTab />}
    </PageWrapper>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/purchase/ApprovalChainsTab.tsx src/app/(dashboard)/purchase/approval-settings/page.tsx
git commit -m "feat: add Approval Settings page with Approval Chains tab"
```

---

## Task 11: Role Assignments Tab + Navigation

**Files:**
- Create: `src/components/purchase/ApprovalRoleAssignmentsTab.tsx`
- Modify: `src/components/layout/nav-config.ts`

- [ ] **Step 1: Create ApprovalRoleAssignmentsTab**

```tsx
// src/components/purchase/ApprovalRoleAssignmentsTab.tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  useApprovalRoleAssignments,
  useAddApprovalRoleAssignment,
  useSoftDeleteApprovalRoleAssignment,
} from '@/hooks/useApprovalRoleAssignments'
import { useProfiles } from '@/hooks/useProfiles'
import type { ApprovalRole } from '@/lib/approvalChainResolution'

const APPROVAL_ROLES: ApprovalRole[] = ['purchase_manager', 'accountant', 'owner']
const ROLE_LABELS: Record<ApprovalRole, string> = {
  purchase_manager: 'Purchase Manager',
  accountant: 'Accountant',
  owner: 'Owner',
}

export function ApprovalRoleAssignmentsTab() {
  const { data: assignments = [], isLoading } = useApprovalRoleAssignments()
  const { data: profiles = [] } = useProfiles()
  const addAssignment = useAddApprovalRoleAssignment()
  const removeAssignment = useSoftDeleteApprovalRoleAssignment()

  const [form, setForm] = useState({ profile_id: '', role: '' as ApprovalRole | '' })
  const [showForm, setShowForm] = useState(false)

  function handleAdd() {
    if (!form.profile_id || !form.role) { toast.error('Select a user and a role'); return }
    addAssignment.mutate(
      { profile_id: form.profile_id, role: form.role as ApprovalRole, division_id: null },
      {
        onSuccess: () => { setForm({ profile_id: '', role: '' }); setShowForm(false); toast.success('Role assigned') },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading…</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1" /> Assign Role
        </Button>
      </div>

      {showForm && (
        <div className="rounded-md border p-3 space-y-3 bg-muted/30">
          <p className="text-sm font-medium">New Role Assignment</p>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">User</label>
              <Select value={form.profile_id} onValueChange={(v) => setForm((f) => ({ ...f, profile_id: v }))}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Select user…" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Role</label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as ApprovalRole }))}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select role…" />
                </SelectTrigger>
                <SelectContent>
                  {APPROVAL_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={handleAdd} disabled={addAssignment.isPending}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground h-16 text-sm">
                  No role assignments yet
                </TableCell>
              </TableRow>
            ) : (
              assignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.profiles?.full_name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{ROLE_LABELS[a.role as ApprovalRole] ?? a.role}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.division_id ? 'Division-specific' : 'Company-wide'}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => removeAssignment.mutate(a.id, { onError: (e) => toast.error(e.message) })}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add Approval Settings to nav-config**

In `src/components/layout/nav-config.ts`, in the `'Purchase & Sales'` entry, add to the second group:

```typescript
{ label: 'Approval Settings', href: '/purchase/approval-settings' },
```

Place it after `{ label: 'Approvals', href: '/purchase/approvals' }`.

- [ ] **Step 3: Commit**

```bash
git add src/components/purchase/ApprovalRoleAssignmentsTab.tsx src/components/layout/nav-config.ts
git commit -m "feat: add Role Assignments tab and Approval Settings nav link"
```

---

## Task 12: Update Approvals Page + PoApprovalChain Component

**Files:**
- Modify: `src/components/purchase/PoApprovalChain.tsx`
- Modify: `src/app/(dashboard)/purchase/approvals/page.tsx`

- [ ] **Step 1: Update PoApprovalChain to show tiers + force badge**

Replace the full content of `src/components/purchase/PoApprovalChain.tsx`:

```tsx
// src/components/purchase/PoApprovalChain.tsx
import { Check, X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { POApprovalStep } from '@/hooks/usePurchaseOrders'

const ROLE_LABELS: Record<string, string> = {
  purchase_manager: 'PM',
  accountant: 'AC',
  owner: 'OW',
}

export function PoApprovalChain({ steps, showIteration }: { steps: POApprovalStep[]; showIteration?: number }) {
  if (!steps || steps.length === 0) return null

  const iteration = showIteration ?? Math.max(...steps.map((s) => s.iteration ?? 1))
  const iterationSteps = steps.filter((s) => (s.iteration ?? 1) === iteration)

  // Group by tier_rank
  const tiers = [...new Set(iterationSteps.map((s) => s.tier_rank ?? 1))].sort((a, b) => a - b)

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {tiers.map((rank, ti) => {
        const tierSteps = iterationSteps.filter((s) => (s.tier_rank ?? 1) === rank)
        return (
          <div key={rank} className="flex items-center gap-1">
            {ti > 0 && <div className="h-px w-4 bg-muted-foreground/30" />}
            {tierSteps.map((step, idx) => (
              <div key={step.id} className="flex items-center gap-0.5">
                {idx > 0 && <div className="h-px w-1.5 bg-muted-foreground/20" />}
                <div
                  title={`${step.role}: ${step.status}${step.force_approved ? ' (force-approved)' : ''}`}
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold relative',
                    step.status === 'approved' && 'border-success bg-success/10 text-success',
                    step.status === 'rejected' && 'border-destructive bg-destructive/10 text-destructive',
                    step.status === 'cancelled' && 'border-muted-foreground/20 bg-muted/50 text-muted-foreground/40',
                    step.status === 'pending' && step.is_active && 'border-primary/40 bg-primary/5 text-primary animate-pulse',
                    step.status === 'pending' && !step.is_active && 'border-muted-foreground/20 bg-muted text-muted-foreground/50',
                  )}
                >
                  {step.status === 'approved' ? (
                    <Check className="h-3 w-3" />
                  ) : step.status === 'rejected' ? (
                    <X className="h-3 w-3" />
                  ) : (
                    <span>{ROLE_LABELS[step.role] ?? '?'}</span>
                  )}
                  {step.force_approved && (
                    <span className="absolute -top-1 -right-1">
                      <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Update the approvals page**

Replace the content of `src/app/(dashboard)/purchase/approvals/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { ShieldAlert } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { PoStatusBadge } from '@/components/purchase/PoStatusBadge'
import { PoApprovalChain } from '@/components/purchase/PoApprovalChain'
import {
  usePendingApprovals, useCompletedApprovals,
  useApproveStep, useRejectPO, useForceApproveStep,
} from '@/hooks/usePOApprovals'
import { useIsAdmin } from '@/hooks/useProfiles'
import { type PurchaseOrder, type POApprovalStep } from '@/hooks/usePurchaseOrders'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

interface ApprovalDialogState {
  po: PurchaseOrder
  step: POApprovalStep
  mode: 'approve' | 'force'
}

const ROLE_LABELS: Record<string, string> = {
  purchase_manager: 'Purchase Manager',
  accountant: 'Accountant',
  owner: 'Owner',
}

export default function ApprovalsPage() {
  const [dialogState, setDialogState] = useState<ApprovalDialogState | null>(null)
  const [comment, setComment] = useState('')
  const [rejectMode, setRejectMode] = useState<'full_rejection' | 'send_back_to_draft'>('full_rejection')
  const [showRejectOptions, setShowRejectOptions] = useState(false)
  const [showPrevIterations, setShowPrevIterations] = useState<Record<string, boolean>>({})

  const { data: pending, isLoading: pendingLoading } = usePendingApprovals()
  const { data: completed, isLoading: completedLoading } = useCompletedApprovals()
  const { data: isAdmin } = useIsAdmin()
  const approveStep = useApproveStep()
  const rejectPO = useRejectPO()
  const forceApprove = useForceApproveStep()

  function openDialog(po: PurchaseOrder, mode: 'approve' | 'force' = 'approve') {
    const allSteps = po.po_approvals ?? []
    const maxIteration = Math.max(...allSteps.map((s: any) => s.iteration ?? 1), 1)
    const step = allSteps.find((s: any) => s.status === 'pending' && s.is_active && (s.iteration ?? 1) === maxIteration)
    if (!step) return
    setDialogState({ po, step, mode })
    setComment('')
    setShowRejectOptions(false)
    setRejectMode('full_rejection')
  }

  function handleApprove() {
    if (!dialogState) return
    const { po, step, mode } = dialogState
    if (mode === 'force') {
      if (!comment.trim()) { toast.error('Comment is required for force-approve'); return }
      forceApprove.mutate(
        { stepId: step.id, poId: po.id, forceComment: comment },
        { onSuccess: () => { toast.success('Step force-approved'); setDialogState(null) }, onError: (e) => toast.error(e.message) }
      )
      return
    }
    approveStep.mutate(
      { stepId: step.id, poId: po.id, comment },
      { onSuccess: () => { toast.success('Step approved'); setDialogState(null) }, onError: (e) => toast.error(e.message) }
    )
  }

  function handleReject() {
    if (!dialogState) return
    const { po, step } = dialogState
    rejectPO.mutate(
      { poId: po.id, stepId: step.id, comment, mode: rejectMode },
      { onSuccess: () => { toast.success(rejectMode === 'full_rejection' ? 'PO cancelled' : 'PO sent back to draft'); setDialogState(null) }, onError: (e) => toast.error(e.message) }
    )
  }

  const isMutating = approveStep.isPending || rejectPO.isPending || forceApprove.isPending

  return (
    <PageWrapper>
      <PageHeader title="PO Approvals" description="Review and action pending purchase order approvals" />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pending Approvals</h2>
        {pendingLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}</div>
        ) : (pending ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">No pending approvals requiring your action</div>
        ) : (
          <div className="space-y-3">
            {(pending ?? []).map((po) => {
              const allSteps = po.po_approvals ?? []
              const maxIteration = Math.max(...allSteps.map((s: any) => s.iteration ?? 1), 1)
              const currentSteps = allSteps.filter((s: any) => (s.iteration ?? 1) === maxIteration)
              const pendingStep = currentSteps.find((s: any) => s.status === 'pending' && s.is_active)
              const showPrev = showPrevIterations[po.id]
              return (
                <div key={po.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{po.po_number}</span>
                      <PoStatusBadge status={po.status} />
                      {maxIteration > 1 && (
                        <Badge variant="outline" className="text-xs">Attempt #{maxIteration}</Badge>
                      )}
                    </div>
                    <div className="text-sm font-semibold">{formatCurrency(po.total_qar, 'QAR')}</div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">{po.supplier_name} · {formatDate(po.created_date)}</span>
                    <PoApprovalChain steps={allSteps} showIteration={maxIteration} />
                  </div>
                  {pendingStep && (
                    <div className="text-xs text-muted-foreground">
                      Waiting for: <span className="font-medium text-foreground">{ROLE_LABELS[pendingStep.role] ?? pendingStep.role}</span>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" onClick={() => openDialog(po)}>Review</Button>
                    {isAdmin && pendingStep && (
                      <Button size="sm" variant="outline" onClick={() => openDialog(po, 'force')} className="gap-1 text-amber-600 border-amber-300">
                        <ShieldAlert className="h-3.5 w-3.5" /> Force Approve
                      </Button>
                    )}
                    {maxIteration > 1 && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline"
                        onClick={() => setShowPrevIterations((s) => ({ ...s, [po.id]: !s[po.id] }))}
                      >
                        {showPrev ? 'Hide' : 'View'} Previous Attempts
                      </button>
                    )}
                  </div>
                  {showPrev && (
                    <div className="space-y-1 pt-1 border-t">
                      {Array.from({ length: maxIteration - 1 }, (_, i) => i + 1).map((iter) => (
                        <div key={iter} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Attempt #{iter}:</span>
                          <PoApprovalChain steps={allSteps} showIteration={iter} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Completed Approvals</h2>
        {completedLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden sm:table-cell">Approvals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(completed ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground h-16">No completed approvals</TableCell></TableRow>
                ) : (
                  (completed ?? []).map((po) => {
                    const allSteps = po.po_approvals ?? []
                    const maxIteration = Math.max(...allSteps.map((s: any) => s.iteration ?? 1), 1)
                    return (
                      <TableRow key={po.id}>
                        <TableCell className="font-mono text-sm font-medium">{po.po_number}</TableCell>
                        <TableCell>{po.supplier_name}</TableCell>
                        <TableCell><PoStatusBadge status={po.status} /></TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(po.total_qar, 'QAR')}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <PoApprovalChain steps={allSteps} showIteration={maxIteration} />
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <Dialog open={!!dialogState} onOpenChange={(open) => { if (!open) setDialogState(null) }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg">
          {dialogState && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {dialogState.mode === 'force' ? '⚠ Force Approve' : 'Approve / Reject'} — {dialogState.po.po_number}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Supplier</span>
                    <span className="font-medium">{dialogState.po.supplier_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total (QAR)</span>
                    <span className="font-semibold">{formatCurrency(dialogState.po.total_qar, 'QAR')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Approval step</span>
                    <Badge variant="outline">{ROLE_LABELS[dialogState.step.role] ?? dialogState.step.role}</Badge>
                  </div>
                </div>

                {(dialogState.po.po_line_items ?? []).length > 0 && (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(dialogState.po.po_line_items ?? []).map((li) => (
                          <TableRow key={li.id}>
                            <TableCell className="text-sm">{li.item_name}</TableCell>
                            <TableCell className="text-right text-sm">{li.qty}</TableCell>
                            <TableCell className="text-right text-sm font-medium">{formatCurrency(li.total_price, dialogState.po.currency)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Chain:</span>
                  <PoApprovalChain steps={dialogState.po.po_approvals ?? []} />
                </div>

                {dialogState.mode === 'force' && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                    Force-approve bypasses normal approval rules. A mandatory comment is required and will be logged for audit purposes.
                  </div>
                )}

                <div className="space-y-1">
                  <label htmlFor="approval-comment" className="text-sm font-medium">
                    Comment {dialogState.mode === 'force' && <span className="text-destructive">*</span>}
                  </label>
                  <Textarea
                    id="approval-comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={dialogState.mode === 'force' ? 'Required — explain why you are force-approving…' : 'Optional comment…'}
                    rows={3}
                  />
                </div>

                {showRejectOptions && dialogState.mode !== 'force' && (
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="text-sm font-medium">Rejection type:</p>
                    {[
                      { value: 'full_rejection' as const, label: 'Full Rejection', desc: 'Cancel the PO entirely' },
                      { value: 'send_back_to_draft' as const, label: 'Send Back to Draft', desc: 'Reset to draft for revision and resubmission' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={rejectMode === opt.value}
                        onClick={() => setRejectMode(opt.value)}
                        className={`flex w-full min-h-11 items-start gap-3 rounded-md border p-2 text-left transition-colors ${
                          rejectMode === opt.value ? 'border-destructive bg-destructive/5' : 'hover:bg-muted'
                        }`}
                      >
                        <div className={`mt-0.5 h-3 w-3 rounded-full border-2 shrink-0 ${rejectMode === opt.value ? 'border-destructive bg-destructive' : 'border-muted-foreground'}`} />
                        <div>
                          <div className="text-sm font-medium">{opt.label}</div>
                          <div className="text-xs text-muted-foreground">{opt.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                {dialogState.mode === 'force' ? (
                  <Button onClick={handleApprove} disabled={isMutating} className="bg-amber-500 hover:bg-amber-600 text-white">
                    {forceApprove.isPending ? 'Force Approving…' : '⚠ Confirm Force Approve'}
                  </Button>
                ) : !showRejectOptions ? (
                  <>
                    <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive/5" onClick={() => setShowRejectOptions(true)} disabled={isMutating}>
                      ✗ Reject
                    </Button>
                    <Button onClick={handleApprove} disabled={isMutating} className="bg-success hover:bg-success/90 text-white">
                      {approveStep.isPending ? 'Approving…' : '✓ Approve'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setShowRejectOptions(false)} disabled={isMutating}>Back</Button>
                    <Button variant="destructive" onClick={handleReject} disabled={isMutating}>
                      {rejectPO.isPending ? 'Rejecting…' : `Confirm — ${rejectMode === 'full_rejection' ? 'Cancel PO' : 'Send to Draft'}`}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageWrapper>
  )
}
```

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass (approvalChainResolution + permissions)

- [ ] **Step 4: Commit**

```bash
git add src/components/purchase/PoApprovalChain.tsx src/app/(dashboard)/purchase/approvals/page.tsx
git commit -m "feat: update approvals page with iteration history, force-approve, and updated PoApprovalChain"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| Configurable chains per division + company default | Task 4, 10 |
| Cumulative sequential tiers by rank | Task 2 (findApplicableTiers), Task 7 |
| Parallel any-one-of-role within tier | Task 8 (useApproveStep) |
| Role-based queue, no submit-time pinning | Task 8 (usePendingApprovals) |
| Self-approval guard | Task 8 (usePendingApprovals + useSubmitPOForApproval) |
| Four-eyes principle | Task 8 (useApproveStep) |
| Ghost notification cleanup | Task 8 (approve + reject) |
| Rejection short-circuits all steps | Task 8 (useRejectPO) |
| Iteration tracking on resubmission | Task 7, 8, 12 |
| Admin force-approve with mandatory comment | Task 8, 12 |
| In-app notification bell | Task 9 |
| Notification bell dedup (DISTINCT per user per PO) | Task 7 (getNotificationRecipients) |
| Soft deletes on tiers + assignments | Task 4, 5 |
| Block tier deletion with in-flight POs | Task 4 (useSoftDeleteApprovalChainTier) |
| Admin config UI — Chains tab | Task 10 |
| Admin config UI — Role Assignments tab | Task 11 |
| Zero-assignee warning in admin UI | Task 10 (ApprovalChainsTab) |
| Postgres state machine function | Task 1 |
| Indexes on notifications + po_approvals | Task 1 |
| Force-approve visual flag (⚠ badge) | Task 12 (PoApprovalChain) |
| Previous iteration history toggle | Task 12 (approvals page) |
