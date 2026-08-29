# Supabase Query Performance Audit

**Date:** 2026-06-08
**Project:** wkmvjxxmzstsvahuiwsz
**Source:** Supabase Query Performance Statements export

---

## Overview

93% of total DB time is consumed by a single Supabase Realtime query (`list_changes`). App queries account for ~4% of total load. The rest is Supabase infrastructure (PostgREST schema cache, dashboard introspection, backups).

---

## Active Realtime Subscriptions (93% of DB load)

The `realtime.list_changes` query runs 208,208 times with a total time of 3,966 seconds.

| Channel | File | Table(s) | Event Filter | Severity |
|---------|------|----------|-------------|----------|
| `calendar-realtime` | `components/calendar/CalendarPage.tsx:177` | `calendar_visits` | `*` (all events, no row filter) | HIGH |
| `stock-value-live` | `components/purchase/wh/WhStockValueTab.tsx:239` | `fifo_cost_layers` + `cogs_entries` | `*` (all events, 2 tables) | HIGH |
| `thread-{id}` | `hooks/contact-center/useLiveThread.ts:173` | `chat_messages` | filtered by `conversation_id` | OK |
| `global-inbound-sound` | `hooks/contact-center/useContactCenterState.ts:100` | `chat_messages` | filtered by `from_type=customer` | OK |
| `app_settings_provider` | `hooks/useProviderSetting.ts:40` | `app_settings` | filtered by `key=cc_provider` | OK |

### Actions

1. **Switch `calendar-realtime` to polling** — calendar data doesn't need sub-second freshness; a 10-15s poll interval is fine (same pattern as `useLiveConversations` which already uses polling intentionally).
2. **Switch `stock-value-live` to polling** — stock values don't change every second. Alternatively, filter to `INSERT` only since FIFO layers are append-mostly.
3. **Audit the `supabase_realtime` publication** — in Supabase dashboard under Replication, remove any tables that don't need realtime. Each table in the publication adds WAL processing overhead even if nobody subscribes.

---

## App Queries — Actionable

### 1. `chat_conversations` UPSERT (ON CONFLICT)

- **Calls:** 6,788 | **Mean:** 20ms | **Total:** 137s | **Prop:** 3.2%
- **Role:** service_role
- **Query:** INSERT INTO chat_conversations ... ON CONFLICT(wati_phone, provider) DO UPDATE
- **Root cause:** Wati webhook volume — every inbound/outbound message triggers this upsert.
- **Action:** Ensure the composite unique index on `(wati_phone, provider)` is healthy. If mean time grows, consider batching webhook processing or debouncing duplicate messages.

### 2. `chat_conversations` SELECT with join

- **Calls:** 9,367 | **Mean:** 2.7ms | **Total:** 26s | **Prop:** 0.6%
- **Role:** authenticated
- **Query:** SELECT chat_conversations with LEFT JOIN to service_customers, ordered by last_message_at DESC
- **Action:** No action needed — 2.7ms is fine.

### 3. `backfill_conversation_last_messages()` function

- **Calls:** 260 | **Mean:** 62ms | **Total:** 16s | **Prop:** 0.38%
- **Role:** service_role
- **Root cause:** Full-table scan function that backfills `last_message` across all conversations.
- **Action:** Check if this is still needed (backfill may be complete). If still needed, make it incremental (only process conversations updated since last run) and add index on `chat_messages(conversation_id, created_at DESC)`.

### 4. `service_customer_phones` lookup (triple nested join)

- **Calls:** 8 | **Mean:** 304ms | **Total:** 2.4s | **Prop:** 0.06%
- **Role:** authenticated
- **Query:** SELECT service_customer_phones JOIN service_customers JOIN service_customer_addresses WHERE phone = $5
- **Root cause:** Missing index on `phone` column causes sequential scan.
- **Action:**
  ```sql
  CREATE INDEX IF NOT EXISTS idx_service_customer_phones_phone
  ON service_customer_phones (phone);
  ```

### 5. `custom_access_token_hook`

- **Calls:** 62 | **Mean:** 39ms | **Total:** 2.4s | **Prop:** 0.06%
- **Role:** supabase_auth_admin
- **Root cause:** Auth hook runs on every token refresh. 39ms adds latency to every login/refresh.
- **Action:** Review the function body — if it does extra SELECTs (role lookups, permission checks), ensure those inner tables have indexes.

---

## Supabase Infrastructure Queries (no action needed)

These are normal Supabase overhead — PostgREST schema introspection, dashboard queries, and backup operations. They run infrequently (3-71 calls) and only on deploy or dashboard access.

| Query | Calls | Mean | Total | Notes |
|-------|-------|------|-------|-------|
| `pg_timezone_names` | 71 | 654ms | 46s | PostgREST startup |
| PostgREST schema cache (tables+columns) | 71 | 188ms | 13s | Schema reload on deploy |
| Realtime subscription insert | 1,791 | 45ms | 11s | Subscription management |
| PostgREST schema cache (tables detail) | 11 | 770ms | 8.5s | Dashboard introspection |
| `pg_available_extensions` | 11 | 542ms | 6s | Dashboard query |
| PostgREST schema cache (functions) | 71 | 68ms | 4.8s | Schema reload |
| `publication_tables` | 1,791 | 2.5ms | 4.6s | Realtime publication lookups |
| PostgREST view dependencies | 71 | 49ms | 3.5s | Schema reload |
| `set_config` (request context) | 18,526 | 0.1ms | 2.4s | Normal per-request overhead |
| `table_privileges` | 4 | 556ms | 2.2s | Dashboard query |
| `schema_migrations` | 3 | 666ms | 2s | Dashboard query |
| `pg_type` introspection | 22 | 80ms | 1.8s | Type catalog |
| Columns introspection | 11 | 152ms | 1.7s | Dashboard query |
| `pg_backup_start` | 5 | 285ms | 1.4s | Scheduled backups |

---

## Priority Summary

| Priority | Action | Expected Impact |
|----------|--------|-----------------|
| 1 | Switch `calendar-realtime` and `stock-value-live` to polling | 30-50% reduction of the 93% Realtime load |
| 2 | Remove unnecessary tables from `supabase_realtime` publication | Reduces WAL processing across all Realtime queries |
| 3 | Add index on `service_customer_phones(phone)` | 304ms down to <5ms |
| 4 | Make `backfill_conversation_last_messages` incremental or disable if done | 62ms per call, 260 calls saved |
| 5 | Optimize `custom_access_token_hook` inner queries | 39ms per auth token refresh |

---

## Raw Stats Reference

| Query (short name) | Role | Calls | Mean (ms) | Total (s) | Cache Hit % | Prop Total Time % |
|---------------------|------|-------|-----------|-----------|-------------|-------------------|
| Realtime list_changes | supabase_admin | 208,208 | 19.0 | 3,966 | 100% | 93.10% |
| chat_conversations UPSERT | service_role | 6,788 | 20.2 | 137 | 100% | 3.22% |
| pg_timezone_names | authenticator | 71 | 654.6 | 46 | 0% | 1.09% |
| chat_conversations SELECT | authenticated | 9,367 | 2.8 | 26 | 100% | 0.61% |
| backfill_conversation_last_messages | service_role | 260 | 62.6 | 16 | 100% | 0.38% |
| PostgREST schema cache (cols) | authenticator | 71 | 188.9 | 13 | 100% | 0.31% |
| Realtime subscription insert | supabase_admin | 243 | 45.1 | 11 | 100% | 0.26% |
| PostgREST tables detail | supabase_admin | 11 | 770.9 | 8.5 | 100% | 0.20% |
| pg_available_extensions | postgres | 11 | 542.6 | 6 | 100% | 0.14% |
| PostgREST schema cache (funcs) | authenticator | 71 | 68.2 | 4.8 | 100% | 0.11% |
| publication_tables | supabase_admin | 1,791 | 2.6 | 4.6 | 100% | 0.11% |
| PostgREST view deps | authenticator | 71 | 49.0 | 3.5 | 100% | 0.08% |
| service_customer_phones | authenticated | 8 | 304.6 | 2.4 | 100% | 0.06% |
| custom_access_token_hook | supabase_auth_admin | 62 | 39.2 | 2.4 | 100% | 0.06% |
| set_config | authenticated | 18,526 | 0.1 | 2.4 | 100% | 0.06% |
| table_privileges | postgres | 4 | 556.7 | 2.2 | 100% | 0.05% |
| schema_migrations | postgres | 3 | 666.4 | 2.0 | 100% | 0.05% |
| pg_type | supabase_admin | 22 | 80.1 | 1.8 | 100% | 0.04% |
| columns introspection | supabase_admin | 11 | 152.4 | 1.7 | 100% | 0.04% |
| pg_backup_start | supabase_admin | 5 | 285.1 | 1.4 | 100% | 0.03% |
