# Storage Cascade Cleanup — Vault Bootstrap

**Owner:** Storage-audit deferred item 3C
**Plan:** [docs/superpowers/plans/2026-08-04-storage-cascade-triggers.md](../superpowers/plans/2026-08-04-storage-cascade-triggers.md)
**Introduced:** 2026-08-04 on `deploy/warehouse-shipping`

---

## What this is

The cascade-cleanup triggers on 7 tables (`customers`, `companies`, `company_divisions`, `inventory_items`, `stock_adjustments`, `consumption_entries`, `landed_cost_lines`) call the `storage_delete_object()` helper, which reads a service-role key from Vault to authorize a Storage `DELETE`.

The migrations do **not** persist the service-role key. The key is loaded from a session GUC (`app.storage_cleanup_service_role_key`) if set at migration time, or you set it manually afterward. Either way, **you have to do this step once per environment** before triggers can succeed.

Without the secret in Vault, triggers still fire, they just log a `Vault secret ... missing` row to `storage_cleanup_failures` and the parent DML still commits — so no data corruption, just dormant cleanup.

---

## The one-time bootstrap step (per environment)

Open the Supabase SQL editor for the target project and run:

```sql
SELECT vault.create_secret(
  '<PASTE THE ENVIRONMENT-SPECIFIC SUPABASE_SERVICE_ROLE_KEY HERE>',
  'storage_cleanup_service_role_key'
);
```

**Critical:** the key must be the service-role key of the *same* Supabase project you're running the SQL in — the helper hits `https://<project-ref>.supabase.co/storage/v1/...` and the key must authorize that project.

---

## Environment key sources

| Environment | Project ref | Where to get the key |
|---|---|---|
| **Staging (current active target)** | `mwvblpgbgxipvrevkeff` | `.env.local` → `SUPABASE_SERVICE_ROLE_KEY` |
| **Dev (frozen)** | `wkmvjxxmzstsvahuiwsz` | N/A — do not bootstrap until dev is un-frozen |
| **Production** (when we get there) | TBD | Vercel env → `SUPABASE_SERVICE_ROLE_KEY` (production scope); NOT the staging key |

---

## Verify the secret was created

```sql
SELECT name, created_at
FROM vault.secrets
WHERE name = 'storage_cleanup_service_role_key';
```

Expected: exactly one row.

---

## Smoke test the plumbing

Upload a throwaway file to the `division-assets` bucket via the Storage dashboard (any small `.txt` or `.jpg`; name it `smoke-test.txt`), then run:

```sql
-- Call the helper directly, bypassing any table trigger.
SELECT public.storage_delete_object('division-assets', 'smoke-test.txt', 'smoke', NULL);
-- pg_net is async — give it a moment.
SELECT pg_sleep(3);
-- Any failures logged?
SELECT * FROM public.storage_cleanup_failures ORDER BY id DESC LIMIT 5;
```

Expected:
1. The file is gone from `division-assets` in the dashboard.
2. `storage_cleanup_failures` has no new rows (older rows from before you set the secret are fine — you can `TRUNCATE storage_cleanup_failures;` if you want a clean slate).

If the file did not delete and no failure row appeared: `pg_net` may not have flushed yet — wait 10s and re-check. If it still didn't delete, verify the base URL in the helper matches the project you're bootstrapping (see next section).

---

## When you push these migrations to a new environment

Prod cutover (or any new environment) checklist:

1. **Update the base URL literal in the helper** if you're pointing at a project other than `mwvblpgbgxipvrevkeff`. Open `supabase/migrations/20260804232123_storage_cleanup_infra.sql` and search for `v_base_url text := 'https://mwvblpgbgxipvrevkeff.supabase.co';` — either:
   - Change it in a follow-up migration that does `CREATE OR REPLACE FUNCTION storage_delete_object(...)` with the correct base URL, OR
   - Refactor the helper to derive the base URL from a Vault secret too (e.g. `storage_cleanup_base_url`) and set it per environment. Recommended for prod.
2. **Apply the migrations** via `npx supabase db push`.
3. **Run the `vault.create_secret(...)` line above** with that environment's service-role key.
4. **Smoke test** as documented above.
5. **Confirm no dormant failures accrue** — see the monitoring query below, expect zero rows after 1 hour of normal activity.

---

## Monitoring — is cleanup working?

Non-zero result = something is off (missing/expired Vault secret, bad key, network to Storage broken, wrong base URL).

```sql
-- Cleanup failures in the last hour.
SELECT count(*) AS recent_failures,
       max(occurred_at) AS last_failure,
       max(error_text)  AS last_error
FROM public.storage_cleanup_failures
WHERE occurred_at > now() - interval '1 hour';
```

Rotate the key: after rotating the service-role key in the Supabase dashboard, delete + re-create the Vault secret:

```sql
DELETE FROM vault.secrets WHERE name = 'storage_cleanup_service_role_key';
SELECT vault.create_secret('<new key>', 'storage_cleanup_service_role_key');
```

---

## Rollback

To disable cascade cleanup entirely without dropping the triggers, delete the Vault secret. Every trigger call will then log a "Vault secret missing" row and the DML will still succeed — the world reverts to the pre-3C behavior (orphans accumulate) without any code change.

```sql
DELETE FROM vault.secrets WHERE name = 'storage_cleanup_service_role_key';
```

To fully remove the triggers, `git revert` commits `61bf1bc9`..`25236412` (or the appropriate range) and `npx supabase db push`.
