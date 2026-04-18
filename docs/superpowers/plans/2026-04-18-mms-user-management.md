# MMS User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Supabase invite-email round-trip with a fully admin-driven user lifecycle: create / edit / reset password, enforced by middleware that forces first-login password change. Harden all admin routes with authorization, rate limiting, audit logging, and atomic role replacement.

**Architecture:** New admin API routes (`/api/users/create`, `/api/users/[id]` PATCH, `/api/users/reset-password`, `/api/users/me/change-password`) each gated by a shared `requireAdmin()` helper and guarded by a DB-backed per-actor rate limiter. `must_change_password` is dual-written to both `auth.users.user_metadata` (JWT, read by middleware — zero DB overhead in the common path) and `profiles.must_change_password` (denormalized mirror, read as fallback and surfaced in admin UI). Role assignments are replaced atomically via a SECURITY DEFINER Postgres RPC. Three new dialog components (`AddUserDialog`, `EditUserDialog`, `ResetPasswordDialog`) drive the admin UX; a new `/change-password` page under the `(auth)` route group handles forced password changes.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (JS SDK + service_role admin client + Postgres RPC), TanStack Query v5, shadcn/ui (Base UI primitives), zod v4, react-hook-form, vitest.

**Spec:** `docs/superpowers/specs/2026-04-18-in-app-user-management-design.md`

---

## File Structure

### New files
| Path | Responsibility |
|---|---|
| `supabase/migrations/20260418120000_user_management_hardening.sql` | Add `profiles.must_change_password`; create `replace_user_custom_roles` RPC |
| `src/lib/auth/password-policy.ts` | Shared zod schema for password validation (10+ chars, upper/lower/digit/symbol) |
| `src/lib/auth/require-admin.ts` | Server-side helper that returns `{ok,user,profile}` or `{ok:false,status,message}` after checking `master_data.users.manage` permission + bootstrap-email fallback |
| `src/lib/auth/rate-limit.ts` | Server-side helper: count recent `activity_log` entries for an action+actor, return 429 if over threshold |
| `src/lib/auth/audit.ts` | Server-side helper: append a row to `activity_log` for admin user events |
| `src/app/api/users/create/route.ts` | POST — create auth user + profile + roles |
| `src/app/api/users/[id]/route.ts` | PATCH — update any subset of profile + optional role replace (RPC) |
| `src/app/api/users/reset-password/route.ts` | POST — admin resets another user's password |
| `src/app/api/users/me/change-password/route.ts` | POST — self-change password & clear `must_change_password` |
| `src/app/(auth)/change-password/page.tsx` | Forced password-change page (no dashboard chrome) |
| `src/components/master-data/AddUserDialog.tsx` | Admin dialog: full_name, email, password, confirm, user_type, roles[] |
| `src/components/master-data/EditUserDialog.tsx` | Admin dialog: same fields as AddUser minus passwords |
| `src/components/master-data/ResetPasswordDialog.tsx` | Admin dialog: new password + confirm |
| `src/lib/auth/password-policy.test.ts` | Unit tests for the password zod schema |

### Modified files
| Path | Change |
|---|---|
| `middleware.ts` | Add force-change-password gate with explicit allowlist + JWT→DB fallback |
| `src/hooks/useProfiles.ts` | Remove `useInviteUser`; add `useCreateUser`, `useUpdateUser`, `useResetUserPassword`, `useCompleteMyPasswordChange` |
| `src/app/(dashboard)/master-data/users/page.tsx` | "Invite User" → "Add User"; row actions dropdown (Edit User, Reset Password); wire three new dialogs; remove `InviteUserDialog` / `UserRoleDialog` imports |
| `src/types/database.types.ts` | Regenerated after migration (run `supabase gen types typescript`) |
| `PROGRESS.md` | Mark Phase 1 Cleanup item done at the end |

### Deleted files
| Path | Reason |
|---|---|
| `src/app/api/users/invite/route.ts` | Replaced by `/api/users/create` |
| `src/components/master-data/InviteUserDialog.tsx` | Replaced by `AddUserDialog` |

---

## Conventions used throughout this plan

**Package manager:** npm (verified from `package.json`).
**Branch:** `develop` — commit after every task. Never commit to `main`.
**Dev server path (for smoke tests):** `http://localhost:3000`.
**Supabase env vars** (all already present in `.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (admin client)
- `ADMIN_BOOTSTRAP_EMAIL` (**new — must be added before running any API route**; value = the admin's own email, e.g. `alfaytriit@alfaytri.com`)

**Type regeneration:** after each migration, run:
```bash
npx supabase gen types typescript --project-id "$SUPABASE_PROJECT_ID" > src/types/database.types.ts
```
(Falls back to the committed types file if the CLI fails — document both.)

**Stale-types workaround:** when TypeScript complains about a table/column that exists in the live DB but not yet in generated types, use `(supabase as any).from('foo')` — this is the established pattern in this codebase.

**shadcn/ui form note:** this codebase uses shadcn/ui built on **Base UI** (not Radix). `FormLabel` MUST be used inside a `<FormField>`; for standalone labels use `<Label>` from `@/components/ui/label`. Zod v4 with `zodResolver` requires `as never` on the resolver, e.g. `resolver: zodResolver(schema) as never`.

---

## Task 1: Migration + RPC + type regeneration

**Files:**
- Create: `supabase/migrations/20260418120000_user_management_hardening.sql`
- Modify: `src/types/database.types.ts` (regenerate)

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260418120000_user_management_hardening.sql` with exactly this content:

```sql
-- User management hardening (Phase 1 Cleanup)
-- 1. Force-change-password flag (denormalized mirror of JWT user_metadata)
-- 2. Atomic role replace RPC

BEGIN;

-- ─── 1. profiles.must_change_password ──────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.must_change_password IS
  'True when an admin-created password or admin-reset password is still in place; '
  'cleared when the user sets their own password via /change-password. '
  'JWT user_metadata is the enforcement source of truth; this column mirrors it '
  'for admin-UI visibility.';

-- ─── 2. replace_user_custom_roles RPC ──────────────────────────────────────
CREATE OR REPLACE FUNCTION replace_user_custom_roles(
  p_user_id UUID,            -- profiles.id (NOT auth_user_id)
  p_role_ids UUID[]          -- may be NULL or empty array to clear all roles
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM user_custom_roles WHERE user_id = p_user_id;
  IF p_role_ids IS NOT NULL AND array_length(p_role_ids, 1) IS NOT NULL THEN
    INSERT INTO user_custom_roles (user_id, role_id)
    SELECT p_user_id, unnest(p_role_ids);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION replace_user_custom_roles(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_user_custom_roles(UUID, UUID[]) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Apply the migration to the live Supabase project**

Run (adjust password prompt as needed):
```bash
cd /d/MMS
npx supabase db push
```
Expected output: "Finished `supabase db push`" with the new migration applied.

If the Supabase CLI is not configured for this project, apply via the Supabase dashboard SQL editor — paste the contents of the migration file and run.

- [ ] **Step 3: Regenerate TypeScript types**

Run:
```bash
npx supabase gen types typescript --project-id "$SUPABASE_PROJECT_ID" > src/types/database.types.ts
```
If that fails (no CLI creds), skip — the codebase already uses `(supabase as any).from(...)` for stale types, which will carry us. Note in the commit message that types were not regenerated.

- [ ] **Step 4: Verify the build still passes**

Run:
```bash
npx tsc --noEmit
```
Expected: no output (clean pass).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260418120000_user_management_hardening.sql src/types/database.types.ts
git commit -m "feat(db): profiles.must_change_password + replace_user_custom_roles RPC"
```

---

## Task 2: Shared password-policy zod schema (+ tests)

**Files:**
- Create: `src/lib/auth/password-policy.ts`
- Test: `src/lib/auth/password-policy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/password-policy.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { passwordSchema } from './password-policy'

describe('passwordSchema', () => {
  it('accepts a strong password', () => {
    expect(passwordSchema.safeParse('Str0ng!Pass').success).toBe(true)
  })

  it('rejects a password shorter than 10 characters', () => {
    const r = passwordSchema.safeParse('Sh0rt!A')
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toMatch(/10/)
  })

  it('rejects a password with no uppercase', () => {
    const r = passwordSchema.safeParse('str0ng!pass')
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toMatch(/uppercase/i)
  })

  it('rejects a password with no lowercase', () => {
    const r = passwordSchema.safeParse('STR0NG!PASS')
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toMatch(/lowercase/i)
  })

  it('rejects a password with no digit', () => {
    const r = passwordSchema.safeParse('Strong!Pass')
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toMatch(/digit|number/i)
  })

  it('rejects a password with no symbol', () => {
    const r = passwordSchema.safeParse('Str0ngPass1')
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0].message).toMatch(/symbol/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/auth/password-policy.test.ts
```
Expected: all tests fail with "Cannot find module './password-policy'".

- [ ] **Step 3: Write the schema**

Create `src/lib/auth/password-policy.ts`:

```ts
import { z } from 'zod'

/**
 * Shared password policy used by every write endpoint and client form.
 * Mirror of spec §Password policy (design 2026-04-18).
 */
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .refine((v) => /[A-Z]/.test(v), { message: 'Must contain an uppercase letter' })
  .refine((v) => /[a-z]/.test(v), { message: 'Must contain a lowercase letter' })
  .refine((v) => /\d/.test(v), { message: 'Must contain a digit' })
  .refine((v) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(v), {
    message: 'Must contain a symbol',
  })

export type Password = z.infer<typeof passwordSchema>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/auth/password-policy.test.ts
```
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/password-policy.ts src/lib/auth/password-policy.test.ts
git commit -m "feat(auth): shared password-policy zod schema + tests"
```

---

## Task 3: Admin-gate helper (`requireAdmin`)

**Files:**
- Create: `src/lib/auth/require-admin.ts`

- [ ] **Step 1: Write the helper**

Create `src/lib/auth/require-admin.ts`:

```ts
import { createClient as createServerClient } from '@/lib/supabase/server'

export type AdminGateSuccess = {
  ok: true
  authUserId: string
  email: string | null
  profileId: string // profiles.id
}
export type AdminGateFailure = {
  ok: false
  status: 401 | 403
  message: string
}

const REQUIRED_PERMISSION = 'master_data.users.manage'

/**
 * Server-side admin gate. Call at the top of every admin API route.
 * - 401 if not authenticated.
 * - 403 unless caller has the `master_data.users.manage` permission
 *   via any assigned custom role.
 * - Bootstrap: if caller's email === ADMIN_BOOTSTRAP_EMAIL, pass through
 *   even without the permission (first-run enablement).
 */
export async function requireAdmin(): Promise<AdminGateSuccess | AdminGateFailure> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, message: 'Unauthorized' }

  const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase()
  const callerEmail = user.email?.trim().toLowerCase() ?? null

  // Fetch profile + permissions via nested select.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('id, user_custom_roles(custom_roles(permissions))')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) {
    // No profile row yet — only bootstrap email can proceed (so first admin
    // can still create users before anyone has a profile).
    if (bootstrapEmail && callerEmail === bootstrapEmail) {
      return { ok: true, authUserId: user.id, email: callerEmail, profileId: '' }
    }
    return { ok: false, status: 403, message: 'Forbidden — no profile linked to this user' }
  }

  const perms: string[] = (profile.user_custom_roles ?? [])
    .flatMap((r: { custom_roles: { permissions: string[] } | null }) =>
      r.custom_roles?.permissions ?? []
    )

  if (perms.includes(REQUIRED_PERMISSION)) {
    return { ok: true, authUserId: user.id, email: callerEmail, profileId: profile.id }
  }

  // Bootstrap fallback.
  if (bootstrapEmail && callerEmail === bootstrapEmail) {
    return { ok: true, authUserId: user.id, email: callerEmail, profileId: profile.id }
  }

  return { ok: false, status: 403, message: 'Forbidden — admin permission required' }
}

/** Lighter gate for routes that any authenticated user can hit. */
export async function requireAuth(): Promise<
  | { ok: true; authUserId: string; email: string | null }
  | { ok: false; status: 401; message: string }
> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, message: 'Unauthorized' }
  return { ok: true, authUserId: user.id, email: user.email ?? null }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/require-admin.ts
git commit -m "feat(auth): requireAdmin() + requireAuth() server gates with ADMIN_BOOTSTRAP_EMAIL fallback"
```

---

## Task 4: Rate-limit and audit helpers

**Files:**
- Create: `src/lib/auth/rate-limit.ts`
- Create: `src/lib/auth/audit.ts`

- [ ] **Step 1: Write the rate limiter**

Create `src/lib/auth/rate-limit.ts`:

```ts
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Count activity_log entries for a given action by a given actor in the
 * last `windowSeconds`. Returns true if the caller is OVER the limit.
 *
 * Cheap and durable — works across serverless cold-starts and instances
 * because it uses the DB. Not high-throughput; fine for admin actions.
 */
export async function isRateLimited(params: {
  action: string            // e.g. 'user.admin_create'
  actorAuthUserId: string   // user's auth uid
  max: number               // e.g. 10
  windowSeconds: number     // e.g. 60
}): Promise<boolean> {
  const since = new Date(Date.now() - params.windowSeconds * 1000).toISOString()
  const admin = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (admin as any)
    .from('activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('action', params.action)
    .gte('created_at', since)
    .ilike('details', `%"actor_auth_user_id":"${params.actorAuthUserId}"%`)

  if (error) {
    // Fail open — if the audit table isn't reachable, don't block admin work.
    // The request is still gated by requireAdmin().
    console.error('rate-limit query failed:', error.message)
    return false
  }
  return (count ?? 0) >= params.max
}
```

- [ ] **Step 2: Write the audit helper**

Create `src/lib/auth/audit.ts`:

```ts
import { createAdminClient } from '@/lib/supabase/admin'

export type AuditAction =
  | 'user.admin_create'
  | 'user.admin_update'
  | 'user.admin_reset_password'
  | 'user.self_change_password'

/**
 * Append a row to activity_log. Never throws — failure to audit must not
 * break the primary operation.
 *
 * Uses only base columns (action, entity_type, entity_id, details, created_at)
 * to avoid coupling to activity_log schema extensions we can't verify.
 */
export async function logUserEvent(params: {
  action: AuditAction
  actorAuthUserId: string
  targetProfileId: string | null  // may be null for self-change where we don't know profile.id
  targetEmail: string | null
  changedFields?: string[]        // for update events
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const details = JSON.stringify({
      actor_auth_user_id: params.actorAuthUserId,
      target_email: params.targetEmail,
      ...(params.changedFields ? { changed_fields: params.changedFields } : {}),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('activity_log').insert({
      action: params.action,
      entity_type: 'profile',
      entity_id: params.targetProfileId ?? '00000000-0000-0000-0000-000000000000',
      details,
    })
  } catch (e) {
    // Swallow — audit is best-effort.
    console.error('audit log insert failed:', e)
  }
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/rate-limit.ts src/lib/auth/audit.ts
git commit -m "feat(auth): DB-backed rate limiter + best-effort audit logger"
```

---

## Task 5: POST /api/users/create route

**Files:**
- Create: `src/app/api/users/create/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/users/create/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { isRateLimited } from '@/lib/auth/rate-limit'
import { logUserEvent } from '@/lib/auth/audit'
import { passwordSchema } from '@/lib/auth/password-policy'

const bodySchema = z.object({
  full_name: z.string().trim().min(1, 'Full name is required'),
  email: z.string().trim().toLowerCase().email('Valid email required'),
  password: passwordSchema,
  user_type: z.enum(['internal', 'external']).default('internal'),
  role_ids: z.array(z.string().uuid()).default([]),
})

export async function POST(request: Request) {
  // 1. Admin gate.
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

  // 2. Validate.
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }
  const { full_name, email, password, user_type, role_ids } = parsed.data

  // 3. Rate limit.
  if (await isRateLimited({
    action: 'user.admin_create',
    actorAuthUserId: gate.authUserId,
    max: 10,
    windowSeconds: 60,
  })) {
    return NextResponse.json({ error: 'Rate limit: 10 creates per minute. Wait and retry.' }, { status: 429 })
  }

  // 4. Create auth user.
  const admin = createAdminClient()
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, must_change_password: true },
  })
  if (createErr || !created.user) {
    return NextResponse.json({ error: `Auth user creation failed: ${createErr?.message ?? 'unknown'}` }, { status: 400 })
  }
  const authUserId = created.user.id

  // 5. Insert profile (dual-write mirror of must_change_password).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile, error: profErr } = await (admin as any)
    .from('profiles')
    .insert({
      auth_user_id: authUserId,
      email,
      full_name,
      user_type,
      is_active: true,
      must_change_password: true,
      created_by: gate.authUserId,
    })
    .select('id')
    .single()
  if (profErr) {
    return NextResponse.json(
      { error: `Auth user created but profile insert failed: ${profErr.message}` },
      { status: 500 }
    )
  }

  // 6. Assign roles via atomic RPC (non-fatal on failure).
  let roleWarning: string | null = null
  if (role_ids.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcErr } = await (admin as any).rpc('replace_user_custom_roles', {
      p_user_id: profile.id,
      p_role_ids: role_ids,
    })
    if (rpcErr) roleWarning = `Roles not assigned: ${rpcErr.message}`
  }

  // 7. Audit.
  await logUserEvent({
    action: 'user.admin_create',
    actorAuthUserId: gate.authUserId,
    targetProfileId: profile.id,
    targetEmail: email,
  })

  return NextResponse.json({
    profile: { id: profile.id, auth_user_id: authUserId, email, full_name, user_type },
    assigned_role_ids: roleWarning ? [] : role_ids,
    ...(roleWarning ? { warning: roleWarning } : {}),
  })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Smoke test (manual)**

Start the dev server (`npm run dev`) and in the browser DevTools console of an authenticated admin session run:

```js
fetch('/api/users/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    full_name: 'Test User',
    email: `test+${Date.now()}@example.com`,
    password: 'Str0ng!Pass',
    user_type: 'internal',
    role_ids: [],
  }),
}).then(r => r.json()).then(console.log)
```
Expected: `{ profile: { id, auth_user_id, email, full_name: 'Test User', user_type: 'internal' }, assigned_role_ids: [] }`.

Check the Supabase dashboard → Authentication → Users: new user is present with "Confirmed" status.
Check `profiles` table: row present with `must_change_password = true`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/users/create/route.ts
git commit -m "feat(api): POST /api/users/create — admin-driven user creation"
```

---

## Task 6: PATCH /api/users/[id] route

**Files:**
- Create: `src/app/api/users/[id]/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/users/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { logUserEvent } from '@/lib/auth/audit'

const bodySchema = z.object({
  full_name: z.string().trim().min(1).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  user_type: z.enum(['internal', 'external']).optional(),
  is_active: z.boolean().optional(),
  role_ids: z.array(z.string().uuid()).optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: targetAuthUserId } = await params

  // 1. Admin gate.
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

  // 2. Parse + validate.
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }
  const changes = parsed.data

  // 3. Self-deactivation guard.
  if (targetAuthUserId === gate.authUserId && changes.is_active === false) {
    return NextResponse.json({ error: 'You cannot deactivate yourself' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 4. Email change (hits auth.users) — must not clobber user_metadata.
  if (changes.email) {
    const { data: existing } = await admin.auth.admin.getUserById(targetAuthUserId)
    const mergedMeta = { ...(existing.user?.user_metadata ?? {}) }
    const { error: emailErr } = await admin.auth.admin.updateUserById(targetAuthUserId, {
      email: changes.email,
      email_confirm: true,
      user_metadata: mergedMeta,
    })
    if (emailErr) return NextResponse.json({ error: `Email update failed: ${emailErr.message}` }, { status: 400 })
  }

  // 5. Profile updates (other than roles).
  const profileUpdates: Record<string, unknown> = {}
  if (changes.full_name !== undefined) profileUpdates.full_name = changes.full_name
  if (changes.email !== undefined) profileUpdates.email = changes.email
  if (changes.user_type !== undefined) profileUpdates.user_type = changes.user_type
  if (changes.is_active !== undefined) profileUpdates.is_active = changes.is_active

  let profileId: string | null = null
  if (Object.keys(profileUpdates).length > 0 || changes.role_ids !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingProfile, error: selErr } = await (admin as any)
      .from('profiles')
      .select('id')
      .eq('auth_user_id', targetAuthUserId)
      .maybeSingle()
    if (selErr || !existingProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }
    profileId = existingProfile.id as string

    if (Object.keys(profileUpdates).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updErr } = await (admin as any)
        .from('profiles')
        .update(profileUpdates)
        .eq('auth_user_id', targetAuthUserId)
      if (updErr) return NextResponse.json({ error: `Profile update failed: ${updErr.message}` }, { status: 500 })
    }
  }

  // 6. Role replace via atomic RPC (if role_ids supplied, even empty array).
  if (changes.role_ids !== undefined && profileId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcErr } = await (admin as any).rpc('replace_user_custom_roles', {
      p_user_id: profileId,
      p_role_ids: changes.role_ids,
    })
    if (rpcErr) return NextResponse.json({ error: `Role replace failed: ${rpcErr.message}` }, { status: 500 })
  }

  // 7. Audit.
  await logUserEvent({
    action: 'user.admin_update',
    actorAuthUserId: gate.authUserId,
    targetProfileId: profileId,
    targetEmail: changes.email ?? null,
    changedFields: Object.keys(changes),
  })

  return NextResponse.json({ ok: true, profile_id: profileId, changed_fields: Object.keys(changes) })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Smoke test (manual)**

With the test user created in Task 5, run in DevTools console:
```js
fetch(`/api/users/${TARGET_AUTH_USER_ID}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ full_name: 'Test User Renamed', user_type: 'external' }),
}).then(r => r.json()).then(console.log)
```
Expected: `{ ok: true, profile_id, changed_fields: ['full_name','user_type'] }`.

Then test self-deactivation guard (using your own auth uid):
```js
fetch(`/api/users/${MY_AUTH_USER_ID}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ is_active: false }),
}).then(r => r.json()).then(console.log)
```
Expected: `{ error: 'You cannot deactivate yourself' }` with HTTP 400.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/users/[id]/route.ts
git commit -m "feat(api): PATCH /api/users/[id] — update profile + role replace + self-deactivation guard"
```

---

## Task 7: POST /api/users/reset-password route

**Files:**
- Create: `src/app/api/users/reset-password/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/users/reset-password/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { isRateLimited } from '@/lib/auth/rate-limit'
import { logUserEvent } from '@/lib/auth/audit'
import { passwordSchema } from '@/lib/auth/password-policy'

const bodySchema = z.object({
  user_id: z.string().uuid(),           // profiles.auth_user_id
  password: passwordSchema,
})

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }
  const { user_id, password } = parsed.data

  if (await isRateLimited({
    action: 'user.admin_reset_password',
    actorAuthUserId: gate.authUserId,
    max: 10,
    windowSeconds: 60,
  })) {
    return NextResponse.json({ error: 'Rate limit: 10 resets per minute. Wait and retry.' }, { status: 429 })
  }

  const admin = createAdminClient()

  // Read existing metadata so we merge instead of overwrite.
  const { data: existing, error: getErr } = await admin.auth.admin.getUserById(user_id)
  if (getErr || !existing.user) {
    return NextResponse.json({ error: `User not found: ${getErr?.message ?? 'unknown'}` }, { status: 404 })
  }
  const mergedMeta = { ...(existing.user.user_metadata ?? {}), must_change_password: true }

  const { error: updErr } = await admin.auth.admin.updateUserById(user_id, {
    password,
    user_metadata: mergedMeta,
  })
  if (updErr) return NextResponse.json({ error: `Password reset failed: ${updErr.message}` }, { status: 400 })

  // Mirror to profiles.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from('profiles')
    .update({ must_change_password: true })
    .eq('auth_user_id', user_id)

  // Audit (no password in details).
  await logUserEvent({
    action: 'user.admin_reset_password',
    actorAuthUserId: gate.authUserId,
    targetProfileId: null,
    targetEmail: existing.user.email ?? null,
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Smoke test (manual)**

```js
fetch('/api/users/reset-password', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_id: TEST_USER_AUTH_ID, password: 'N3w!Str0ngPass' }),
}).then(r => r.json()).then(console.log)
```
Expected: `{ ok: true }`.

Check `profiles` row for that user: `must_change_password = true`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/users/reset-password/route.ts
git commit -m "feat(api): POST /api/users/reset-password — admin reset with JWT+DB dual-write"
```

---

## Task 8: POST /api/users/me/change-password route

**Files:**
- Create: `src/app/api/users/me/change-password/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/users/me/change-password/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuth } from '@/lib/auth/require-admin'
import { logUserEvent } from '@/lib/auth/audit'
import { passwordSchema } from '@/lib/auth/password-policy'

const bodySchema = z.object({
  new_password: passwordSchema,
})

export async function POST(request: Request) {
  const gate = await requireAuth()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }
  const { new_password } = parsed.data

  // User's OWN session — not admin client — so Supabase enforces they can
  // only change their own password.
  const supabase = await createServerClient()
  const { error: updErr } = await supabase.auth.updateUser({
    password: new_password,
    data: { must_change_password: false },
  })
  if (updErr) return NextResponse.json({ error: `Password update failed: ${updErr.message}` }, { status: 400 })

  // Mirror to profiles (via admin client so RLS doesn't bite).
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).from('profiles')
    .update({ must_change_password: false })
    .eq('auth_user_id', gate.authUserId)

  await logUserEvent({
    action: 'user.self_change_password',
    actorAuthUserId: gate.authUserId,
    targetProfileId: null,
    targetEmail: gate.email,
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/users/me/change-password/route.ts
git commit -m "feat(api): POST /api/users/me/change-password — self-change clears flag"
```

---

## Task 9: Middleware force-change-password gate

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 1: Read the current middleware**

Open `middleware.ts` and confirm it matches the version in the spec: after `const { data: { user } } = await supabase.auth.getUser()` and the `!user` redirect.

- [ ] **Step 2: Replace the whole file**

Replace `middleware.ts` with:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Explicit allowlist — no stringly-typed bypass, no startsWith surprises.
const ALLOWED_PATHS = new Set<string>([
  '/login',
  '/change-password',
  '/api/users/me/change-password',
])
const ALLOWED_PREFIXES = ['/api/auth/', '/_next/', '/favicon']

function isAllowedPath(path: string): boolean {
  if (ALLOWED_PATHS.has(path)) return true
  return ALLOWED_PREFIXES.some((p) => path.startsWith(p))
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // ─── Force-change-password gate ──────────────────────────────────────
  if (user) {
    // Primary: JWT user_metadata — no DB roundtrip.
    let mustChange = Boolean(user.user_metadata?.must_change_password)

    // Fallback: if the claim is completely missing (legacy sessions, or a
    // JWT that hasn't been refreshed yet), consult the DB mirror.
    if (user.user_metadata?.must_change_password === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('must_change_password')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      mustChange = Boolean(profile?.must_change_password)
    }

    if (mustChange && !isAllowedPath(request.nextUrl.pathname)) {
      const url = request.nextUrl.clone()
      url.pathname = '/change-password'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 4: Smoke test (manual)**

- Create a test user via /api/users/create in Task 5's step 3.
- Log out (or open a private window), log in as that user.
- Any URL you try lands on `/change-password` — confirm in the address bar.

- [ ] **Step 5: Commit**

```bash
git add middleware.ts
git commit -m "feat(middleware): force-change-password gate with JWT+DB fallback and explicit allowlist"
```

---

## Task 10: useProfiles hook additions

**Files:**
- Modify: `src/hooks/useProfiles.ts`

- [ ] **Step 1: Open the file and locate the end**

Open `src/hooks/useProfiles.ts`. The last export is `useRemoveDivision`. All new hooks go at the end (don't touch anything above).

- [ ] **Step 2: Add the four new hooks**

Append to `src/hooks/useProfiles.ts`:

```ts
// ─── Admin-driven user management ──────────────────────────────────────

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      full_name: string
      email: string
      password: string
      user_type?: 'internal' | 'external'
      role_ids?: string[]
    }) => {
      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Create failed')
      return json as { profile: Profile; assigned_role_ids: string[]; warning?: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      auth_user_id: string
      full_name?: string
      email?: string
      user_type?: 'internal' | 'external'
      is_active?: boolean
      role_ids?: string[]
    }) => {
      const { auth_user_id, ...body } = payload
      const res = await fetch(`/api/users/${auth_user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Update failed')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      queryClient.invalidateQueries({ queryKey: ['my-profile'] })
    },
  })
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: async (payload: { user_id: string; password: string }) => {
      const res = await fetch('/api/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Reset failed')
      return json
    },
  })
}

export function useCompleteMyPasswordChange() {
  return useMutation({
    mutationFn: async (payload: { new_password: string }) => {
      const res = await fetch('/api/users/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Change failed')
      // CRITICAL: refresh the client session so the middleware sees
      // must_change_password: false on the very next navigation.
      const supabase = createClient()
      await supabase.auth.refreshSession()
      return json
    },
  })
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useProfiles.ts
git commit -m "feat(hooks): add useCreateUser/useUpdateUser/useResetUserPassword/useCompleteMyPasswordChange"
```

---

## Task 11: /change-password page

**Files:**
- Create: `src/app/(auth)/change-password/page.tsx`

- [ ] **Step 1: Write the page**

Create `src/app/(auth)/change-password/page.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { passwordSchema } from '@/lib/auth/password-policy'
import { useCompleteMyPasswordChange } from '@/hooks/useProfiles'

const schema = z.object({
  new_password: passwordSchema,
  confirm: z.string(),
}).refine((v) => v.new_password === v.confirm, {
  message: 'Passwords do not match',
  path: ['confirm'],
})

type Values = z.infer<typeof schema>

export default function ChangePasswordPage() {
  const router = useRouter()
  const completeChange = useCompleteMyPasswordChange()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema) as never,
    defaultValues: { new_password: '', confirm: '' },
  })

  async function onSubmit(values: Values) {
    try {
      await completeChange.mutateAsync({ new_password: values.new_password })
      toast.success('Password changed')
      router.push('/')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Change failed')
    }
  }

  return (
    <div className="min-h-svh flex items-center justify-center p-4 bg-slate-50">
      <div className="w-full max-w-md bg-white border rounded-lg p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Set a new password</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your password was set by an administrator. Choose a new one to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new_password">New password</Label>
            <Input id="new_password" type="password" autoComplete="new-password" {...register('new_password')} />
            {errors.new_password && <p className="text-xs text-destructive">{errors.new_password.message}</p>}
            <p className="text-xs text-muted-foreground">
              At least 10 characters, with uppercase, lowercase, digit, and symbol.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" type="password" autoComplete="new-password" {...register('confirm')} />
            {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Saving…' : 'Save new password'}
          </Button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript + build**

```bash
npx tsc --noEmit
npm run build
```
Expected: `npm run build` succeeds and prints a route line for `/change-password`.

- [ ] **Step 3: Smoke test (manual)**

- Reset the test user's password via Task 7 smoke test.
- Log in as the test user.
- Middleware bounces to `/change-password` — the form is shown.
- Submit a weak password → zod error appears inline.
- Submit a strong password → redirect to `/`, subsequent navigation stays on the dashboard (no bounce loop).
- Log out, log back in → straight to dashboard.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(auth\)/change-password/page.tsx
git commit -m "feat(auth): /change-password page with refreshSession + policy-aligned form"
```

---

## Task 12: AddUserDialog component (rewrite InviteUserDialog)

**Files:**
- Create: `src/components/master-data/AddUserDialog.tsx` (overwrites InviteUserDialog in later task)

- [ ] **Step 1: Write the dialog**

Create `src/components/master-data/AddUserDialog.tsx`:

```tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { passwordSchema } from '@/lib/auth/password-policy'
import { useCreateUser } from '@/hooks/useProfiles'
import { useRoles } from '@/hooks/useRoles'

const schema = z.object({
  full_name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  password: passwordSchema,
  confirm: z.string(),
  user_type: z.enum(['internal', 'external']),
  role_ids: z.array(z.string().uuid()).default([]),
}).refine((v) => v.password === v.confirm, {
  message: 'Passwords do not match', path: ['confirm'],
})

type Values = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function AddUserDialog({ open, onOpenChange }: Props) {
  const createUser = useCreateUser()
  const { data: roles } = useRoles()

  const form = useForm<Values>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      full_name: '', email: '', password: '', confirm: '',
      user_type: 'internal', role_ids: [],
    },
  })

  const selectedRoles = form.watch('role_ids') ?? []

  function onSubmit(values: Values) {
    createUser.mutate(
      {
        full_name: values.full_name,
        email: values.email,
        password: values.password,
        user_type: values.user_type,
        role_ids: values.role_ids,
      },
      {
        onSuccess: (res) => {
          if (res.warning) toast.warning(res.warning)
          else toast.success(`User created — share credentials with ${values.email}`)
          onOpenChange(false)
          form.reset()
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add User</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name *</FormLabel>
                  <FormControl><Input placeholder="Ahmed Al-Thani" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl><Input type="email" placeholder="ahmed@example.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="user_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>User Type</FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    >
                      <option value="internal">Internal (staff)</option>
                      <option value="external">External (client)</option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password *</FormLabel>
                  <FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl>
                  <p className="text-xs text-muted-foreground">10+ chars, uppercase, lowercase, digit, symbol.</p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password *</FormLabel>
                  <FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <Label>Roles</Label>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border rounded-md p-3">
                {(roles ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">No roles defined yet.</p>
                )}
                {(roles ?? []).map((role) => (
                  <label key={role.id} className="flex items-center gap-2 py-0.5 px-2 rounded hover:bg-muted cursor-pointer min-w-[170px]">
                    <Checkbox
                      className="shrink-0"
                      checked={selectedRoles.includes(role.id)}
                      onCheckedChange={(checked) => {
                        const current = form.getValues('role_ids')
                        form.setValue(
                          'role_ids',
                          checked ? [...current, role.id] : current.filter((id) => id !== role.id)
                        )
                      }}
                    />
                    <span className="text-xs whitespace-nowrap">{role.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={createUser.isPending}>
                {createUser.isPending ? 'Creating…' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/master-data/AddUserDialog.tsx
git commit -m "feat(master-data): AddUserDialog with roles + password-policy enforcement"
```

---

## Task 13: EditUserDialog component

**Files:**
- Create: `src/components/master-data/EditUserDialog.tsx`

- [ ] **Step 1: Write the dialog**

Create `src/components/master-data/EditUserDialog.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { useUpdateUser, type Profile } from '@/hooks/useProfiles'
import { useRoles } from '@/hooks/useRoles'

const schema = z.object({
  full_name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  user_type: z.enum(['internal', 'external']),
  is_active: z.boolean(),
  role_ids: z.array(z.string().uuid()).default([]),
})

type Values = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  profile: (Profile & { user_custom_roles?: Array<{ role_id: string }> }) | null
}

export function EditUserDialog({ open, onOpenChange, profile }: Props) {
  const updateUser = useUpdateUser()
  const { data: roles } = useRoles()

  const form = useForm<Values>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      full_name: '', email: '', user_type: 'internal', is_active: true, role_ids: [],
    },
  })

  useEffect(() => {
    if (profile && open) {
      form.reset({
        full_name: profile.full_name ?? '',
        email: profile.email ?? '',
        user_type: (profile.user_type as 'internal' | 'external') ?? 'internal',
        is_active: profile.is_active ?? true,
        role_ids: (profile.user_custom_roles ?? []).map((r) => r.role_id),
      })
    }
  }, [profile, open, form])

  const selectedRoles = form.watch('role_ids') ?? []
  const isActive = form.watch('is_active')

  function onSubmit(values: Values) {
    if (!profile) return
    updateUser.mutate(
      { auth_user_id: profile.auth_user_id, ...values },
      {
        onSuccess: () => {
          toast.success('User updated')
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl><Input type="email" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="user_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>User Type</FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    >
                      <option value="internal">Internal (staff)</option>
                      <option value="external">External (client)</option>
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={isActive}
                onCheckedChange={(checked) => form.setValue('is_active', Boolean(checked))}
              />
              <span className="text-sm">Active</span>
            </label>

            <div>
              <Label>Roles</Label>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border rounded-md p-3">
                {(roles ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">No roles defined yet.</p>
                )}
                {(roles ?? []).map((role) => (
                  <label key={role.id} className="flex items-center gap-2 py-0.5 px-2 rounded hover:bg-muted cursor-pointer min-w-[170px]">
                    <Checkbox
                      className="shrink-0"
                      checked={selectedRoles.includes(role.id)}
                      onCheckedChange={(checked) => {
                        const current = form.getValues('role_ids')
                        form.setValue(
                          'role_ids',
                          checked ? [...current, role.id] : current.filter((id) => id !== role.id)
                        )
                      }}
                    />
                    <span className="text-xs whitespace-nowrap">{role.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={updateUser.isPending}>
                {updateUser.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/master-data/EditUserDialog.tsx
git commit -m "feat(master-data): EditUserDialog — name/email/type/active/roles"
```

---

## Task 14: ResetPasswordDialog component

**Files:**
- Create: `src/components/master-data/ResetPasswordDialog.tsx`

- [ ] **Step 1: Write the dialog**

Create `src/components/master-data/ResetPasswordDialog.tsx`:

```tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { passwordSchema } from '@/lib/auth/password-policy'
import { useResetUserPassword, type Profile } from '@/hooks/useProfiles'

const schema = z.object({
  password: passwordSchema,
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, {
  message: 'Passwords do not match', path: ['confirm'],
})

type Values = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  profile: Profile | null
}

export function ResetPasswordDialog({ open, onOpenChange, profile }: Props) {
  const resetPw = useResetUserPassword()

  const form = useForm<Values>({
    resolver: zodResolver(schema) as never,
    defaultValues: { password: '', confirm: '' },
  })

  function onSubmit(values: Values) {
    if (!profile) return
    resetPw.mutate(
      { user_id: profile.auth_user_id, password: values.password },
      {
        onSuccess: () => {
          toast.success('Password reset — user will be prompted to change it on next login')
          onOpenChange(false)
          form.reset()
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Password {profile?.full_name ? `— ${profile.full_name}` : ''}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password *</FormLabel>
                  <FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl>
                  <p className="text-xs text-muted-foreground">10+ chars, uppercase, lowercase, digit, symbol.</p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password *</FormLabel>
                  <FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={resetPw.isPending}>
                {resetPw.isPending ? 'Resetting…' : 'Reset Password'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/master-data/ResetPasswordDialog.tsx
git commit -m "feat(master-data): ResetPasswordDialog"
```

---

## Task 15: Wire dialogs into Users page

**Files:**
- Modify: `src/app/(dashboard)/master-data/users/page.tsx`

- [ ] **Step 1: Update imports + state**

Open `src/app/(dashboard)/master-data/users/page.tsx`.

Replace the import of `InviteUserDialog` with the three new dialogs and remove `UserRoleDialog`:

```tsx
// DELETE these lines:
import { UserRoleDialog } from '@/components/master-data/UserRoleDialog'
import { InviteUserDialog } from '@/components/master-data/InviteUserDialog'

// ADD:
import { AddUserDialog } from '@/components/master-data/AddUserDialog'
import { EditUserDialog } from '@/components/master-data/EditUserDialog'
import { ResetPasswordDialog } from '@/components/master-data/ResetPasswordDialog'
```

Replace state:
```tsx
// DELETE:
const [userRoleDialog, setUserRoleDialog] = useState<{ open: boolean; profile: Profile | null }>({ open: false, profile: null })
const [inviteOpen, setInviteOpen] = useState(false)

// ADD:
const [addOpen, setAddOpen] = useState(false)
const [editDialog, setEditDialog] = useState<{ open: boolean; profile: Profile | null }>({ open: false, profile: null })
const [resetDialog, setResetDialog] = useState<{ open: boolean; profile: Profile | null }>({ open: false, profile: null })
```

- [ ] **Step 2: Replace the user row actions dropdown**

In the `userColumns` `useMemo`, change the `actions` column's dropdown content from:
```tsx
<DropdownMenuItem onClick={() => setUserRoleDialog({ open: true, profile: row.original })}>
  <Shield className="h-4 w-4 mr-2" />Manage Roles
</DropdownMenuItem>
```
to:
```tsx
<DropdownMenuItem onClick={() => setEditDialog({ open: true, profile: row.original })}>
  <Shield className="h-4 w-4 mr-2" />Edit User
</DropdownMenuItem>
<DropdownMenuItem onClick={() => setResetDialog({ open: true, profile: row.original })}>
  <Shield className="h-4 w-4 mr-2" />Reset Password
</DropdownMenuItem>
```

- [ ] **Step 3: Rename the button**

Find:
```tsx
<Button onClick={() => setInviteOpen(true)}>
  <UserPlus className="h-4 w-4 mr-2" />
  Invite User
</Button>
```
Replace with:
```tsx
<Button onClick={() => setAddOpen(true)}>
  <UserPlus className="h-4 w-4 mr-2" />
  Add User
</Button>
```

- [ ] **Step 4: Swap the mounted dialogs at the bottom**

Replace:
```tsx
<UserRoleDialog open={userRoleDialog.open} onOpenChange={(open) => setUserRoleDialog((s) => ({ ...s, open }))} profile={userRoleDialog.profile} />
<InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
```
with:
```tsx
<AddUserDialog open={addOpen} onOpenChange={setAddOpen} />
<EditUserDialog
  open={editDialog.open}
  onOpenChange={(open) => setEditDialog((s) => ({ ...s, open }))}
  profile={editDialog.profile as (Profile & { user_custom_roles?: Array<{ role_id: string }> }) | null}
/>
<ResetPasswordDialog
  open={resetDialog.open}
  onOpenChange={(open) => setResetDialog((s) => ({ ...s, open }))}
  profile={resetDialog.profile}
/>
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/master-data/users/page.tsx
git commit -m "feat(master-data): wire Add/Edit/Reset dialogs into Users page"
```

---

## Task 16: Delete the invite path

**Files:**
- Delete: `src/app/api/users/invite/route.ts`
- Delete: `src/components/master-data/InviteUserDialog.tsx`
- Modify: `src/hooks/useProfiles.ts` (remove `useInviteUser`)

- [ ] **Step 1: Delete invite route and dialog**

```bash
rm -r src/app/api/users/invite
rm src/components/master-data/InviteUserDialog.tsx
```

- [ ] **Step 2: Remove useInviteUser from hooks**

Open `src/hooks/useProfiles.ts` and delete the entire `useInviteUser` function (the `export function useInviteUser() { … }` block, including the 2-line comment above it).

- [ ] **Step 3: Verify TypeScript (build must still pass)**

```bash
npx tsc --noEmit
```
Expected: no output. If TypeScript complains about a leftover `useInviteUser` import, remove it.

- [ ] **Step 4: Full build check**

```bash
npm run build
```
Expected: build succeeds. Take note of the final route list; `/api/users/invite` should NOT be in it, and `/api/users/create`, `/api/users/[id]`, `/api/users/reset-password`, `/api/users/me/change-password`, `/change-password` SHOULD be.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: delete invite route + InviteUserDialog + useInviteUser (replaced by Add/Edit/Reset flow)"
```

---

## Task 17: End-to-end smoke test + PROGRESS.md update

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Full smoke test as admin**

Set `ADMIN_BOOTSTRAP_EMAIL` in `.env.local` to your admin email (if not already set). Restart dev server (`npm run dev`).

Run through this script in a browser logged in as the admin:

1. **Navigate** to `/master-data/users`. Click **Add User**.
2. **Fill** name=`Smoke Test`, email=`smoke+<timestamp>@example.com`, user_type=Internal, password=`Str0ng!Pass`, confirm=same. Leave roles empty. Submit. → toast "User created — share credentials with …".
3. **Copy** the new user's email and password. Open a private window, go to `/login`, sign in.
4. **Verify** you land on `/change-password`, not the dashboard. Try typing `/dashboard` in the URL — you get bounced back.
5. **Submit** a weak password (e.g. `short`) → inline zod errors.
6. **Submit** a strong password (e.g. `Chang3d!NewP`) → land on `/`.
7. **Log out**, log back in → land directly on dashboard. Gate cleared.
8. **Back in admin window**, click **Edit User** on the smoke test row. Add a role. Save. → toast "User updated".
9. **Click** **Reset Password** on the smoke test row. Enter `Res3t!NewPass`, confirm, submit. → toast.
10. **In the private window**, navigate anywhere → bounced to `/change-password` again. Change it. → back on dashboard.
11. **Back in admin window**, try to edit your own row and uncheck Active. → error toast "You cannot deactivate yourself".
12. **Rate limit check:** in DevTools, fire 11 rapid creates in a for-loop. The 11th should return 429.
13. **Forbidden check:** log in as a NON-admin user (one without `master_data.users.manage`). In DevTools, try to POST `/api/users/create`. → 403 Forbidden.

Every step must pass. If any doesn't, fix the specific task before proceeding.

- [ ] **Step 2: Mark PROGRESS.md done**

Open `PROGRESS.md`. In the Phase 1 Cleanup section, find:
```md
- [ ] **[2026-04-18] In-app user management rework** — replace invite-email flow with admin-driven create / edit / reset password.
  - Design spec: `docs/superpowers/specs/2026-04-18-in-app-user-management-design.md`
  - Implementation plan: *(pending — next step)*
```
Replace with:
```md
- [x] **[2026-04-18] In-app user management rework** — admin-driven create / edit / reset password; middleware force-change gate; audit logging; rate limiting; atomic role replace.
  - Design spec: `docs/superpowers/specs/2026-04-18-in-app-user-management-design.md`
  - Implementation plan: `docs/superpowers/plans/2026-04-18-mms-user-management.md`
```

- [ ] **Step 3: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: mark Phase 1 Cleanup — in-app user management — complete"
```

- [ ] **Step 4: Verify the Phase 1 Cleanup section is otherwise clean**

Re-read the Phase 1 Cleanup section. Confirm only the "Verify self-provision banner" item remains unchecked. If any smoke-test step surfaced new bugs, record them there.

---

## Plan complete

All tasks produce independently testable commits. The flow is:

```
Migration → shared libs → routes → middleware → page → hooks → dialogs → wiring → cleanup → smoke + docs
```

Each task's TypeScript check keeps the build green between commits. The smoke test in Task 17 exercises every path in the spec's flow diagram plus the seven security concerns from the addendum.
