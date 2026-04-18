# In-App User Management Design

**Date:** 2026-04-18
**Author:** Brainstorming session (Mohamed Ismail + Claude)
**Status:** Approved — ready for implementation planning
**Branch:** `develop`
**Phase:** Phase 1 cleanup (must ship before Phase 2 starts)

---

## Goal

Replace the email-invite round-trip with a fully admin-driven user lifecycle. An admin can:

1. **Create** a user with full name, email, password, user type, and role(s) in one dialog. The user can log in immediately — no email verification, no invite link.
2. **Edit** a user's profile fields (name, email, user type, active state, role assignments) at any time.
3. **Reset** any user's password. The user is forced to pick a new password on their next login.

The user themselves is forced through a change-password screen on their first login (and again whenever the admin resets their password), so admin-chosen passwords never persist.

## Success criteria

- Zero email round-trips in the normal create / edit / reset flows.
- `InviteUserDialog`, `useInviteUser`, and `/api/users/invite` are **deleted** — not shimmed, not deprecated.
- A newly created user with `must_change_password = true` cannot access any dashboard page until they change their password; deep links are blocked at the middleware layer, not just the client.
- Existing profile rows (created under the old invite flow) continue to work with `must_change_password = false`.

---

## Flow diagram

```
Admin clicks "Add User"
  └─ fills: full_name, email, user_type, password, confirm_password, roles[]
  └─ POST /api/users/create
      ├─ admin.auth.admin.createUser({
      │    email, password,
      │    email_confirm: true,
      │    user_metadata: { full_name }
      │  })
      ├─ INSERT profiles (auth_user_id, email, full_name, user_type,
      │                  is_active=true, must_change_password=true,
      │                  created_by=<admin>)
      └─ INSERT user_custom_roles (one per selected role_id)

User logs in for the first time
  └─ next/middleware reads session + profile.must_change_password
      ├─ true  → 307 to /change-password (all other paths blocked)
      └─ false → normal dashboard

User submits /change-password form
  └─ POST /api/users/me/change-password { new_password }
      ├─ supabase.auth.updateUser({ password: new_password })
      └─ UPDATE profiles SET must_change_password=false
         WHERE auth_user_id=auth.uid()
  └─ 302 to /

Admin clicks "Edit User" on a row
  └─ opens EditUserDialog (pre-filled)
  └─ admin edits any subset of fields
  └─ PATCH /api/users/[id]  { full_name?, email?, user_type?,
                               is_active?, role_ids? }
      ├─ if email changed:
      │    admin.auth.admin.updateUserById(id, { email, email_confirm:true })
      ├─ UPDATE profiles SET (...) WHERE auth_user_id = <id>
      └─ if role_ids sent:
           DELETE user_custom_roles WHERE user_id=<profile.id>
           INSERT user_custom_roles (new set)

Admin clicks "Reset Password" on a row
  └─ opens ResetPasswordDialog
  └─ admin enters new_password + confirm
  └─ POST /api/users/reset-password { user_id, password }
      ├─ admin.auth.admin.updateUserById(user_id, { password })
      └─ UPDATE profiles SET must_change_password=true
         WHERE auth_user_id = user_id
  └─ next login for that user lands on /change-password
```

---

## Data model change

One migration with two changes:

```sql
-- supabase/migrations/<timestamp>_user_management_hardening.sql

-- 1. Flag column for the force-change-password gate (denormalized mirror of JWT).
ALTER TABLE profiles
  ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.must_change_password IS
  'True when an admin-created password or admin-reset password is still in place; '
  'cleared when the user sets their own password via /change-password. '
  'JWT user_metadata is the enforcement source of truth; this column mirrors it '
  'for admin-UI visibility.';

-- 2. Atomic role-replace RPC — DELETE + INSERT in one transaction.
CREATE OR REPLACE FUNCTION replace_user_custom_roles(
  p_user_id UUID,            -- profiles.id (NOT auth_user_id)
  p_role_ids UUID[]          -- may be empty array to clear all roles
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM user_custom_roles WHERE user_id = p_user_id;
  IF array_length(p_role_ids, 1) IS NOT NULL THEN
    INSERT INTO user_custom_roles (user_id, role_id)
    SELECT p_user_id, unnest(p_role_ids);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION replace_user_custom_roles(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_user_custom_roles(UUID, UUID[]) TO authenticated;
```

Notes:
- Default `false` so existing rows are unaffected — they set their own passwords under the old flow.
- **Primary read path is JWT (`user_metadata`), not the column.** Middleware reads the flag from session claims to avoid a DB query per request. The column is a denormalized mirror kept in sync by the API routes.
- The RPC is `SECURITY DEFINER` so it runs with the owner's rights; combined with server-side admin gating (see below) it's safe. The admin API route is the only caller.
- RLS policies on `profiles` already allow authenticated reads/writes (`FOR ALL USING (true)` plus self-scoped policies). No new policy needed — API routes use the admin client and bypass RLS anyway.

### Audit logging (reuses existing `activity_log` table)

All admin-initiated user events are written to the existing `activity_log` table using its base columns (`action`, `entity_type`, `entity_id`, `details`, `created_at`). No schema change for the audit table.

Event format:
```ts
{
  action: 'user.admin_create' | 'user.admin_update' | 'user.admin_reset_password' | 'user.self_change_password',
  entity_type: 'profile',
  entity_id: <target profile.id>,
  details: JSON.stringify({ actor_auth_user_id, target_email, changed_fields? })
}
```

No plaintext passwords are ever written to the log.

---

## API surface

### Authorization helper (new)

All admin routes run through a single gate: `src/lib/auth/require-admin.ts`.

```ts
// Pseudocode shape
export async function requireAdmin(): Promise<
  | { ok: true; user: AuthUser; profile: Profile }
  | { ok: false; status: 401 | 403; message: string }
> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, message: 'Unauthorized' }

  // Fetch profile with role permissions in one join.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, user_custom_roles(custom_roles(permissions))')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  const perms: string[] = (profile?.user_custom_roles ?? [])
    .flatMap((r) => r.custom_roles?.permissions ?? [])

  if (!perms.includes('master_data.users.manage')) {
    return { ok: false, status: 403, message: 'Forbidden — admin permission required' }
  }
  return { ok: true, user, profile }
}
```

**Bootstrapping:** if zero users have `master_data.users.manage` (first-run state), the check allows any authenticated user whose email matches `ADMIN_BOOTSTRAP_EMAIL` (env var). This lets the very first admin grant themselves the role. Documented as a note in the code and the onboarding README.

### Rate limiting (in-route, DB-backed)

Sensitive endpoints (`create`, `reset-password`) also go through a lightweight DB-backed counter before acting:

```ts
// Pseudocode inside each protected route
const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
const { count } = await admin.from('activity_log')
  .select('id', { count: 'exact', head: true })
  .eq('action', 'user.admin_create') // or 'user.admin_reset_password'
  .gte('created_at', oneMinuteAgo)
  .filter('details', 'ilike', `%"actor_auth_user_id":"${user.id}"%`)

if ((count ?? 0) >= 10) {
  return NextResponse.json({ error: 'Rate limit: 10/min' }, { status: 429 })
}
```

Simple, durable across instances, reuses the audit table. Threshold: **10 create-or-reset events per admin per minute**. Tighten later if abuse appears.

### The three admin routes + one self route

All four routes live under `src/app/api/users/` and follow the same shape:
1. `requireAdmin()` gate (except `me/change-password`, which uses a lighter `requireAuth()`).
2. Zod-validate body.
3. For `create` / `reset-password`: rate-limit check.
4. Perform the Supabase admin operations (dual-write JWT + profile + audit log entry).
5. Return the operation result.

All use `createAdminClient()` for the privileged bits.

### `POST /api/users/create`

**Replaces:** the deleted `/api/users/invite` route.

Request body (JSON):
```ts
{
  full_name: string          // required, min 1 char
  email: string              // required, valid email
  password: string           // required — policy below
  user_type: 'internal' | 'external'   // default 'internal'
  role_ids: string[]         // optional, may be empty
}
```

**Password policy (shared zod schema in `src/lib/auth/password-policy.ts`, reused by every write endpoint and both dialogs):**
- Minimum 10 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one symbol (`!@#$%^&*()_+-=[]{};':"\|,.<>/?`)

Server steps:
1. `requireAdmin()` — 401/403 short-circuit.
2. Validate body with zod; 400 on failure.
3. Rate-limit check (10 create/min per actor); 429 if exceeded.
4. `admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, must_change_password: true } })`.
5. If auth user creation fails (duplicate email etc.), return 400 with the Supabase error. Log nothing.
6. Insert profile with `must_change_password: true`, `is_active: true`, `created_by: caller.id`.
7. If `role_ids.length > 0`, call RPC `replace_user_custom_roles(profile.id, role_ids)`. Failures here are non-fatal — the route returns 200 with a `{ warning: "Roles not assigned: ..." }` field so the admin can retry via Edit User.
8. Write audit log entry `action='user.admin_create'` with `details={actor_auth_user_id, target_email}`.
9. Return `{ profile, assigned_role_ids, warning? }`.

### `PATCH /api/users/[id]`

**New.** `id` is `profiles.auth_user_id`.

Request body (all fields optional; only supplied fields are updated):
```ts
{
  full_name?: string
  email?: string
  user_type?: 'internal' | 'external'
  is_active?: boolean
  role_ids?: string[]   // when provided, REPLACES existing assignments
}
```

Server steps:
1. `requireAdmin()` — 401/403 short-circuit.
2. **Self-deactivation guard**: if `id === caller.auth_user_id && is_active === false`, return 400 `{ error: 'You cannot deactivate yourself' }`.
3. Zod-validate (no rate limit on PATCH — it's idempotent).
4. If `email` in body, `admin.auth.admin.updateUserById(id, { email, email_confirm: true })`.
5. `UPDATE profiles SET (...supplied fields...) WHERE auth_user_id = id`.
6. If `role_ids` supplied: resolve `profile.id` from `auth_user_id`, then call RPC `replace_user_custom_roles(profile.id, role_ids)`. The RPC is a single transaction — no partial-failure state.
7. Write audit log `action='user.admin_update'`, `details={actor_auth_user_id, target_email, changed_fields}`.
8. Return the updated profile + current role ids.

### `POST /api/users/reset-password`

**New.** Used by the admin-triggered reset dialog.

Request body:
```ts
{
  user_id: string     // profiles.auth_user_id
  password: string    // enforced by shared password-policy zod schema
}
```

Server steps:
1. `requireAdmin()` — 401/403 short-circuit.
2. Zod-validate.
3. Rate-limit check (10 reset/min per actor); 429 if exceeded.
4. `admin.auth.admin.updateUserById(user_id, { password, user_metadata: { must_change_password: true } })`. Pass `user_metadata` so the existing full_name/etc aren't clobbered — **must merge with existing metadata**, not overwrite. Pattern: first `admin.auth.admin.getUserById(user_id)` to read current metadata, then spread `{ ...existing, must_change_password: true }`.
5. `UPDATE profiles SET must_change_password = true WHERE auth_user_id = user_id`.
6. Write audit log `action='user.admin_reset_password'`, `details={actor_auth_user_id, target_email}` (never the password).
7. Return `{ ok: true }`.

### `POST /api/users/me/change-password`

**New.** Used by the `/change-password` page to finalize the user's own password change and clear the flag. This route uses a lighter `requireAuth()` gate (any authenticated user may change their own password) — NOT `requireAdmin()`.

Request body:
```ts
{
  new_password: string    // enforced by shared password-policy zod schema
}
```

Server steps:
1. Get current user via server client (NOT admin client — this must run in the user's session). 401 if none.
2. Zod-validate.
3. `supabase.auth.updateUser({ password: new_password, data: { must_change_password: false } })` against the user's own session. This clears the JWT flag AND changes the password in one round-trip.
4. `UPDATE profiles SET must_change_password = false WHERE auth_user_id = auth.uid()`.
5. Write audit log `action='user.self_change_password'`, `details={actor_auth_user_id}`.
6. Return `{ ok: true }`.

**Client-side follow-up (important):** the `/change-password` page must call `supabase.auth.refreshSession()` after this route returns `ok`, so the new JWT (with `must_change_password: false`) replaces the stale one. Without the refresh, the very next navigation hits the middleware with the old JWT and bounces back. See Middleware section.

### `DELETE /api/users/invite`

Deleted. The entire `src/app/api/users/invite/` folder is removed.

---

## UI changes

### New component: `AddUserDialog.tsx`

Replaces `InviteUserDialog.tsx` (same file path, renamed + rewritten).

Fields:
- Full name (Input, required)
- Email (Input, type email, required)
- User type (select: Internal / External, default Internal)
- Password (Input, type password, min 8 + ≥1 digit)
- Confirm password (Input, type password, must match)
- Roles (checkbox list — same visual pattern as the RoleFormDialog permission list; single flex-wrap box, each role is a labeled checkbox)

Submit calls `useCreateUser` which POSTs `/api/users/create`. On success: toast "User created — share credentials with <email>", close dialog, invalidate the users query.

### New component: `EditUserDialog.tsx`

Same layout as `AddUserDialog` **minus** the two password fields.

Pre-fills from the row's current profile. Submit calls `useUpdateUser` which PATCHes `/api/users/[id]`. On success: toast, close, invalidate.

### New component: `ResetPasswordDialog.tsx`

Small dialog with:
- New password (min 8 + ≥1 digit)
- Confirm password

Submit calls `useResetUserPassword` which POSTs `/api/users/reset-password`. On success: toast "Password reset — user will be prompted to change it on next login".

### New page: `/change-password`

Lives under `src/app/(auth)/change-password/page.tsx` so it uses the `(auth)` layout (no dashboard chrome, no TopNav). Centered card with:
- Heading: "Set a new password"
- Explanation: "Your password was set by an administrator. Choose a new one to continue."
- New password + Confirm
- Save button

Submit calls `useCompleteMyPasswordChange` which POSTs `/api/users/me/change-password`. On success: router.push('/').

### Middleware change: `middleware.ts` (repo root)

After the existing session-refresh logic, add a force-change-password gate with **explicit allowlist** and **JWT-with-DB-fallback**:

```ts
// EXPLICIT allowlist — no string-startsWith surprises
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

// Inside middleware, after getting `user`:
if (user) {
  // Primary: read from JWT user_metadata — no DB roundtrip.
  let mustChange = Boolean(user.user_metadata?.must_change_password)

  // Fallback: if the JWT is missing the claim entirely (legacy session, or
  // metadata edit that hasn't propagated), consult the denormalized DB mirror.
  // This runs only when the claim is undefined — not every request.
  if (user.user_metadata?.must_change_password === undefined) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('must_change_password')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    mustChange = Boolean(profile?.must_change_password)
  }

  if (mustChange && !isAllowedPath(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/change-password', request.url))
  }
}
```

**Dual-write discipline:** every API route that touches `must_change_password` must write to both the JWT (`user_metadata`) AND `profiles.must_change_password`. The JWT is the enforcement source of truth; the DB column is the visibility mirror. They must never diverge on a successful write.

**Client-side `refreshSession` discipline:** after the `/change-password` page submits successfully, the page calls `supabase.auth.refreshSession()` before `router.push('/')`. Without this, the user's current session still carries `must_change_password: true` in its JWT claims and the middleware redirects them back. Reset and create flows don't need a client-side refresh because they affect *other* users whose next login will pick up the new JWT.

Matcher config excludes static assets as usual. No extra DB query in the common case (JWT path).

### Users page (`src/app/(dashboard)/master-data/users/page.tsx`)

- **Button rename:** "Invite User" → "Add User" (icon stays).
- **Action column per row:** replace the current single button (if any) with a shadcn `DropdownMenu` containing:
  - Edit User — opens `EditUserDialog` with the row's data
  - Reset Password — opens `ResetPasswordDialog` for the row
- Existing "Create My Profile" self-provision banner is unaffected.

### Hook layer (`src/hooks/useProfiles.ts`)

- **Remove:** `useInviteUser`
- **Add:** `useCreateUser` → POST `/api/users/create`
- **Add:** `useUpdateUser` → PATCH `/api/users/[id]`
- **Add:** `useResetUserPassword` → POST `/api/users/reset-password`
- **Add:** `useCompleteMyPasswordChange` → POST `/api/users/me/change-password`

All four follow the existing mutation pattern (TanStack Query, invalidate `['profiles']` on success).

---

## Edge cases and explicit decisions

| Case | Decision |
|---|---|
| A non-admin authenticated user calls `/api/users/create` | 403 Forbidden from `requireAdmin()` — before any Supabase writes. |
| Admin creates a user with a duplicate email | Supabase returns 422; we surface the message in the toast. No row inserted, no audit entry. |
| Role assignment fails (RPC error) after auth+profile succeed | Auth + profile persist; response includes a warning. Admin fixes via Edit User. |
| Admin tries to deactivate themselves (`is_active = false` on own row) | PATCH route returns 400 with `'You cannot deactivate yourself'` before touching anything. |
| Admin edits their own email / name / user_type / roles | Allowed. Changing own email triggers `email_confirm: true`, so their next login uses the new email. |
| Admin resets their own password | Works; on their next request the middleware redirects them to `/change-password`. JWT auto-refreshes on next `getUser()` or they log out/in. |
| User on the change-password screen opens a new tab to `/dashboard` | Middleware checks JWT — still `must_change_password: true` — redirects back. |
| User closes the change-password tab without changing | Next navigation hits middleware → back to `/change-password`. No escape. |
| User finishes change-password but the client forgot to `refreshSession()` | The next navigation still carries the old JWT; middleware falls back to the DB mirror (which was updated to `false`) and lets them through. Belt-and-suspenders. |
| Profile row missing for a logged-in auth user | Handled by the self-provision banner on the Users page; middleware treats a null `must_change_password` as `false` when the DB fallback also returns null. |
| Admin exceeds 10 creates-or-resets in a minute | 429 with retry-after text. Threshold picked so a burst of onboarding is fine but scripted abuse isn't. |
| Email confirmation setting flipped on in Supabase dashboard | `email_confirm: true` at creation still bypasses it (we're the admin). No runtime surprises. |
| Supabase's own password policy rejects what zod accepted | Server returns the Supabase error verbatim; admin sees it and adjusts. |
| Bootstrap: zero users have `master_data.users.manage` permission | `requireAdmin()` allows the caller if their email matches `ADMIN_BOOTSTRAP_EMAIL` env var. Otherwise 403 — no one can create users until the bootstrap email is set. |

---

## Non-goals (explicitly out of scope for this spec)

- Visual password strength meter (policy is enforced, just not visualised).
- Password expiry / rotation.
- Account lockout after N failed logins. (Supabase has its own brute-force protection on `signInWithPassword`.)
- Self-service "Forgot my password" flow. (Supabase has `resetPasswordForEmail` — we'll wire it as a follow-up when the product needs it.)
- Hard-delete user. (Soft-deactivation via `is_active = false` covers this phase's needs.)
- Multi-tenant scoping for role visibility. (Current app is single-tenant.)
- Distributed rate limiting via Redis/Upstash. (DB-backed in-process limiter is good enough at this scale; revisit when multi-instance / cold-start amplifies the problem.)
- Enriching `activity_log` schema with `module` / `severity` / `performer_name` / `old_data` / `new_data` columns. (The existing audit hook references these; whether they exist in prod or are silently missing is a pre-existing issue. We log using only the base columns to avoid coupling to unknown schema state.)

---

## Implementation order (for the plan that follows)

1. Migration: add `must_change_password` column + `replace_user_custom_roles` RPC.
2. Shared libs: `src/lib/auth/password-policy.ts` (zod schema) and `src/lib/auth/require-admin.ts` (admin gate helper with bootstrap email fallback).
3. Server routes: `POST /api/users/create`, `PATCH /api/users/[id]`, `POST /api/users/reset-password`, `POST /api/users/me/change-password`. All dual-write (JWT + profile + audit log) and rate-limited where applicable.
4. Middleware: force-change-password redirect with explicit allowlist and JWT→DB fallback.
5. `/change-password` page with `refreshSession()` after submit.
6. Hooks: `useCreateUser`, `useUpdateUser`, `useResetUserPassword`, `useCompleteMyPasswordChange`.
7. Components: `AddUserDialog` (rewrite), `EditUserDialog` (new), `ResetPasswordDialog` (new). All import the shared password-policy zod schema.
8. Users page: button rename, row dropdown with Edit / Reset Password.
9. Delete the invite path: `src/app/api/users/invite/`, `src/components/master-data/InviteUserDialog.tsx`, `useInviteUser` from `useProfiles.ts`.
10. Smoke test end-to-end: as non-admin → 403; as admin → create → new user logs in → gets bounced to /change-password → changes → dashboard; admin resets → user bounced again; admin tries to deactivate self → blocked; burst of 11 creates → 429 on #11.
11. Commit progress, mark Phase 1 Cleanup checklist item done.

## Source-of-truth discipline (design note)

| Aspect | Source of truth | Mirror |
|---|---|---|
| `must_change_password` | JWT `user_metadata` (enforcement path: middleware) | `profiles.must_change_password` (visibility path: admin UI) |
| `full_name`, `email`, `user_type`, `is_active`, `created_by` | `profiles` | — |
| Password hash | `auth.users` (never readable by us) | — |
| Role assignments | `user_custom_roles` | — |
| Admin action history | `activity_log` (append-only) | — |

Rule: **any API route that writes `must_change_password` writes to BOTH the JWT and the DB column in the same request.** No code path touches one without the other. Reviewers must flag any violation.
