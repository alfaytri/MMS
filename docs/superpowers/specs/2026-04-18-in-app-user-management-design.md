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

One migration, one column:

```sql
-- supabase/migrations/<timestamp>_profiles_must_change_password.sql
ALTER TABLE profiles
  ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.must_change_password IS
  'True when an admin-created password or admin-reset password is still in place; '
  'cleared when the user sets their own password via /change-password.';
```

Notes:
- Default `false` so existing rows are unaffected — they set their own passwords under the old flow.
- **Primary read path is JWT (`user_metadata`), not this column.** Middleware reads the flag from the session claims to avoid a DB query per request (see Middleware section). This column is a denormalized mirror kept in sync by the API routes so the admin UI can surface a "pending password change" badge in the users list without hitting `auth.users`.
- RLS policies on `profiles` already allow authenticated reads/writes (existing `FOR ALL USING (true)` policy on the admin client side; self-read/update for users). No new policy is needed — server routes use the admin client and bypass RLS anyway.

---

## API surface

All three routes live under `src/app/api/users/` and use `createAdminClient()` + a server-side `auth.getUser()` gate on every request.

### `POST /api/users/create`

**Replaces:** the deleted `/api/users/invite` route.

Request body (JSON):
```ts
{
  full_name: string          // required, min 1 char
  email: string              // required, valid email
  password: string           // required, min 8 chars, ≥1 digit (client + server zod)
  user_type: 'internal' | 'external'   // default 'internal'
  role_ids: string[]         // optional, may be empty
}
```

Server steps:
1. Verify caller is authenticated; 401 otherwise.
2. Validate body with zod; 400 on failure.
3. `admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } })`.
4. If auth user creation fails (duplicate email etc.), return 400 with the Supabase error.
5. Insert profile with `must_change_password: true`, `is_active: true`, `created_by: caller.id`.
6. If `role_ids.length > 0`, insert `user_custom_roles` rows in bulk. Failures here are **non-fatal** — return 200 but include `{ warning: "Roles not assigned: ..." }` so the admin can retry from the Edit dialog.
7. Return `{ profile, assigned_role_ids }`.

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
1. Auth-gate + zod-validate.
2. If `email` is in the body, `admin.auth.admin.updateUserById(id, { email, email_confirm: true })`.
3. `UPDATE profiles SET (...supplied fields...) WHERE auth_user_id = id`.
4. If `role_ids` supplied: resolve `profile.id` from `auth_user_id`, then `DELETE FROM user_custom_roles WHERE user_id = <profile.id>` followed by `INSERT` of the new set. Supabase JS has no client-side transaction; we accept eventual consistency (a race where the delete succeeds and insert fails leaves the user with zero roles — admin re-opens Edit and saves again to retry). If this becomes a real problem, wrap in a Postgres RPC.
5. Return the updated profile + role ids.

### `POST /api/users/reset-password`

**New.** Used by the admin-triggered reset dialog.

Request body:
```ts
{
  user_id: string     // profiles.auth_user_id
  password: string    // min 8, ≥1 digit
}
```

Server steps:
1. Auth-gate + zod-validate.
2. `admin.auth.admin.updateUserById(user_id, { password })`.
3. `UPDATE profiles SET must_change_password = true WHERE auth_user_id = user_id`.
4. Return `{ ok: true }`.

### `POST /api/users/me/change-password`

**New.** Used by the `/change-password` page to finalize the user's own password change and clear the flag.

Request body:
```ts
{
  new_password: string
}
```

Server steps:
1. Get current user via server client (NOT admin client — this must run in the user's session).
2. `supabase.auth.updateUser({ password: new_password })` against the user's own session.
3. `UPDATE profiles SET must_change_password = false WHERE auth_user_id = auth.uid()`.
4. Return `{ ok: true }`.

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

### Middleware change: `src/middleware.ts`

After the existing session-refresh logic, add a force-change-password gate. To avoid a database round-trip on every request, the middleware reads the flag from the JWT's `user_metadata`, not from `profiles`. The `profiles.must_change_password` column is kept as a denormalized mirror for potential admin-UI badges — the API routes **dual-write** on every change:

- `create`: `createUser({ user_metadata: { full_name, must_change_password: true } })` + profile insert.
- `reset-password`: `updateUserById(id, { user_metadata: { must_change_password: true } })` + profile update.
- `me/change-password`: `supabase.auth.updateUser({ password, data: { must_change_password: false } })` + profile update.

Middleware pseudocode:
```ts
if (session?.user) {
  const mustChange = Boolean(session.user.user_metadata?.must_change_password)

  const path = request.nextUrl.pathname
  const isChangePasswordPath =
    path === '/change-password' ||
    path === '/api/users/me/change-password' ||
    path === '/login' ||
    path.startsWith('/api/auth/')

  if (mustChange && !isChangePasswordPath) {
    return NextResponse.redirect(new URL('/change-password', request.url))
  }
}
```

Matcher config excludes static assets as usual. No extra DB query is introduced by this gate.

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
| Admin creates a user with a duplicate email | Supabase returns 422; we surface the message in the toast. No row inserted. |
| Role assignment fails after auth+profile succeed | Auth + profile persist; response includes a warning. Admin fixes via Edit User. |
| Admin edits their own email / role / active flag | Allowed — no special casing. If they deactivate themselves they still have their session; next login will fail. Acceptable risk. |
| Admin resets their own password | Works; on their next request the middleware redirects them to `/change-password`. |
| User on the change-password screen opens a new tab to `/dashboard` | Middleware redirects back to `/change-password`. Guaranteed by server-side check. |
| User closes the change-password tab without changing | Next navigation hits middleware → back to `/change-password`. No escape. |
| Profile row missing for a logged-in auth user | Handled by the existing self-provision banner; middleware treats `must_change_password` as `false` when profile is `null` (they'll see the banner, not the change-password gate). |
| Email confirmation setting flipped on in Supabase dashboard | `email_confirm: true` at creation still bypasses it (we're the admin). No runtime surprises. |
| Password policy changed in Supabase dashboard | Supabase rejects the `createUser` / `updateUserById` call; we surface its error. Our own zod check is a pre-filter. |

---

## Non-goals (explicitly out of scope for this spec)

- Password strength meter (zod rule is enough).
- Password expiry / rotation.
- Account lockout after N failed logins.
- Self-service "Forgot my password" flow. (Supabase has `resetPasswordForEmail` — we'll wire it as a follow-up when the product needs it.)
- Audit log entries for admin resets. (Generic audit pattern exists; add when the audit UI is reviewed.)
- Hard-delete user. (Soft-deactivation via `is_active = false` covers this phase's needs.)
- Multi-tenant scoping for role visibility. (Current app is single-tenant.)

---

## Implementation order (for the plan that follows)

1. Migration: add `must_change_password` column.
2. Server routes: `create`, `[id]` PATCH, `reset-password`, `me/change-password`. Delete `invite`.
3. Middleware: force-change-password redirect.
4. `/change-password` page.
5. Hooks: `useCreateUser`, `useUpdateUser`, `useResetUserPassword`, `useCompleteMyPasswordChange`. Delete `useInviteUser`.
6. Components: `AddUserDialog` (rewrite), `EditUserDialog` (new), `ResetPasswordDialog` (new). Delete `InviteUserDialog`.
7. Users page: button rename, row dropdown menu with Edit / Reset Password.
8. Smoke test: create, log in as new user, change password, log out, admin resets, log back in, change again. End-to-end.
9. Commit progress, mark Phase 1 Cleanup checklist item done.
