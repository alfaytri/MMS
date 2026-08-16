# Gate 4 — Deferred DEFINER Create/Action RPCs (handoff data)

> **Purpose.** Standalone handoff so this task can be picked up in a fresh session
> after `/clear`. Read this file + the two security docs + the memory index
> (`C:\Users\IT\.claude\projects\D--MMS\memory\MEMORY.md` and the `feedback_*.md`
> rules), then proceed. Captured 2026-08-16. Live DB is the source of truth —
> re-verify signatures/bodies before writing (baseline + `database.types.ts` are stale).

## TL;DR
- Final piece of the RPC permission-hardening effort (P0 + batches 1–5 already done + live).
- 4 RPCs were deferred. After inspection: **3 need a fix; the 4th (`rpc_create_custody_return`) is already RP-gated → just document it.**
- Each of the 3 needs a **product decision first**: *which role/permission should be allowed to do the action.* Then grant the key + add the in-body guard.
- Task chip id: `task_ef3c18a1`.

---

## Why these were deferred (the important bit)
App RPCs are `SECURITY DEFINER` → they **bypass RLS**, so an ungated one enforces **nothing**: any authenticated user can call it via the Data API. Batches 2–5 fixed ~45 of them by adding an in-body guard **matched to a key the target roles already held** → no regression.

These 4 were held back because **no role currently holds a matching key**. Guarding them blindly would make them **admin-only** and could surprise-break whoever uses the flow today. So each needs: **decide the key + which roles get it → grant → then guard.**

**Guard helper:** `public._auth_user_has_permission('<key>')` — reads the CALLER's `auth.uid()` even inside a DEFINER function; passes for admins + holders of the key. (Also `_user_has_permission(profile_id, key)` and `_current_user_data_id()`.)

---

## The RPCs — live state (staging `mwvblpgbgxipvrevkeff` + new-prod `optishfnnctrhffpoywg`, identical 2026-08-16)

### 1. `create_service_customer(text, text, text)` — ⚠️ NEEDS FIX
- `SECURITY DEFINER`, **ungated**, `authenticated`-callable. ACL: `postgres | authenticated | service_role`.
- **Does:** get-or-create a `service_customers` row + `service_customer_phones` (primary + optional link phone). Returns `{customer_id, phone_id, customer_name}`.
- **Module:** Services / Contact Centre (service customers — distinct from `master_data` customers).
- **Call-site:** none found in a first `src/` grep → **re-grep + confirm caller** (may be a contact-centre/services screen, or low-use).
- **Decision needed:** which permission gates service-customer creation? Candidates: a contact-centre/services create key, or reuse `master_data.customers.create`.
- **Then:** grant to the creating role(s) + add guard.

### 2. `upsert_package_with_services(jsonb, jsonb)` — ⚠️ NEEDS FIX
- `SECURITY DEFINER`, **ungated**, `authenticated`-callable.
- **Does:** insert/update a `subscription_packages` row + atomically replace its `subscription_package_services` links.
- **Module:** Subscriptions / service packages (config/master-data admin).
- **Call-site:** none found in a first `src/` grep → **re-grep + confirm caller** (likely a packages admin screen).
- **Decision needed:** which permission gates managing subscription packages? Candidate: a services/subscriptions `.manage` key.
- **Then:** grant + guard.

### 3. `rpc_cancel_consumption(uuid)` — ⚠️ NEEDS FIX (money/stock path — highest value)
- `SECURITY DEFINER`, **ungated**, `authenticated`-callable. Uses `_current_user_data_id()` for attribution (`cancelled_by`) but checks **no permission**.
- **Does:** reverses a **posted** consumption — re-adds FIFO layers (`source_type='consumption_cancel'`), restores `stock_level`, deletes `inventory_stock_movements` + `cogs_entries`, recalcs average cost, marks the entry `cancelled`. Guards `status='posted'`.
- **Call-site:** `src/hooks/useConsumption.ts:307` (`useCancelConsumption`).
- **Decision needed:** who may cancel a posted consumption? Candidates: the creator, a `consumption.manage`-style key, or a manager. NOTE: a `consumption.cost.view` permission exists but it's a **view** key — cancellation is a mutation, so it likely needs a different/new key.
- **Then:** grant + guard.

### 4. `rpc_create_custody_return(uuid,uuid,uuid,jsonb,text,uuid,text)` — ✅ ALREADY GATED (no fix — document only)
- `SECURITY DEFINER`, `has_any_authz=true`.
- **Verified RP-gated:** body checks `responsible_person_profile_id is distinct from v_creator` → raises `"Only <name> can return stock from this custody sub-container"` (or `"…no responsible person set…"` if null). Only the source sub-container's **responsible person** can return.
- **Call-site:** `src/hooks/useCustodyMoves.ts:207` (`useCreateCustodyReturn`); comment `warehouse/custody/page.tsx:270` = "→ source RP".
- **Note:** the check is strict — **no admin/inventory-manager bypass**. If the operator wants an admin override, that's a separate product tweak, not a security fix.
- **Action:** document as **Pattern C (leave, verified gated)** in the plan/audit docs. No migration.

---

## How to apply (mirror Batch 5)
1. **Re-fetch the live body:** `npx supabase db query --linked "SELECT pg_get_functiondef('public.<sig>'::regprocedure);"`.
2. **Confirm caller + roles:** grep `src/` for the RPC name; check `custom_roles.permissions` in the live DB for who should hold the chosen key.
3. **Grant the key** to those roles (if not already), then **add the guard** using the byte-faithful injector pattern (guard spliced right after the outer `BEGIN` via `regexp_replace`). Template: `supabase/migrations/20260906000000_perm_harden_batch2_creates.sql`.
4. **Mirror** the migration to BOTH `supabase/migrations/` AND `supabase/migrations-staging/` (mandatory rule).
5. **Apply to staging:** `npx supabase db push` (linked = staging).
6. **Apply to new-prod — DO NOT `db push`** (its migration ledger has drifted; `db push --db-url` would replay ~24 migrations). Use raw SQL:
   - Multi-statement files → full-path psql (not on PATH): `& "C:\Program Files\PostgreSQL\18\bin\psql.exe" "postgresql://postgres:<pw>@db.optishfnnctrhffpoywg.supabase.co:5432/postgres" -f <file>`
   - Single statements → `npx supabase db query --db-url "…" -f <one-statement-file>` (a whole `CREATE FUNCTION … $function$;` = one statement). Multi-statement `-f`/inline → `ERROR 42601: cannot insert multiple commands`.
   - Password: user-provided (being rotated); percent-encode `@`→`%40`. **Do not write the literal password into any repo file.** Canonical URL: gitignored `supabase/.temp/migrate.env`. See memory `reference_new_prod_db.md`.
7. **Verify** with a rolled-back JWT probe (key holder passes; non-holder → `42501`) + an ACL check.
8. **Docs:** update the plan (`§ Batch 6`), audit (`§F`/`§G`), `PROGRESS.md` (Security Audit Log + Completed — PROGRESS commit is docs-only), and today's `EOD/EOD-YYYY-MM-DD.md`.
9. **Commit** with the co-author trailer:
   ```
   Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
   ```

## Reference files
- `docs/security/2026-08-16-permission-audit.md` — §F (approval-execution) + the Batch-4 deferred note.
- `docs/security/2026-08-16-rpc-permission-hardening-plan.md` — § Batch 4 (deferred list) + § Batch 5.
- `supabase/migrations/20260906000000_perm_harden_batch2_creates.sql` — injector guard template.
- `supabase/migrations/20260909000000` + `20260909000100` — Batch 5 examples (function rewrite + REVOKE).
- Task chip: `task_ef3c18a1` ("Gate 4 deferred DEFINER create-RPCs").
