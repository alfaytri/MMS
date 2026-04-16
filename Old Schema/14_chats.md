# 14 — Chats & Contact Center

> **Source**: Live public schema snapshot generated from the database on 2026-03-25.

Chat, call tracking, and contact center tables.

---

## `chat_conversations`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `customer_id` | `uuid` | NO | `—` |
| `last_message` | `text` | YES | `—` |
| `last_message_at` | `timestamp with time zone` | YES | `—` |
| `unread_count` | `integer` | YES | `0` |
| `channel` | `message_source` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `conversation_type` | `text` | YES | `'customer'::text` |
| `team_id` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `chat_conversations_created_by_fkey`: `created_by` → `profiles` (`id`); `chat_conversations_customer_id_fkey`: `customer_id` → `customers` (`id`); `chat_conversations_team_id_fkey`: `team_id` → `teams` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert chat_conversations` (INSERT); `Internal can select chat_conversations` (SELECT); `Internal can update chat_conversations` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `chat_messages`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `conversation_id` | `uuid` | NO | `—` |
| `text` | `text` | NO | `''::text` |
| `from_type` | `text` | NO | `—` |
| `agent_name` | `text` | YES | `—` |
| `source` | `message_source` | NO | `—` |
| `attachments` | `jsonb` | YES | `—` |
| `call_metadata` | `jsonb` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `external_id` | `text` | YES | `—` |
| `media_url` | `text` | YES | `—` |
| `handled_by` | `uuid` | YES | `—` |
| `sender_phone` | `text` | YES | `—` |
| `reaction_to_external_id` | `text` | YES | `—` |
| `reaction_emoji` | `text` | YES | `—` |
| `delivery_status` | `text` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `chat_messages_conversation_id_fkey`: `conversation_id` → `chat_conversations` (`id`); `chat_messages_created_by_fkey`: `created_by` → `profiles` (`id`); `chat_messages_handled_by_fkey`: `handled_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert chat_messages` (INSERT); `Internal can select chat_messages` (SELECT)
**Triggers**: None

---
## `active_agent_calls`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `agent_id` | `uuid` | NO | `—` |
| `agent_name` | `text` | NO | `—` |
| `customer_id` | `uuid` | YES | `—` |
| `customer_phone` | `text` | NO | `—` |
| `conversation_id` | `uuid` | YES | `—` |
| `direction` | `text` | NO | `'outbound'::text` |
| `call_metadata` | `jsonb` | YES | `'{}'::jsonb` |
| `started_at` | `timestamp with time zone` | YES | `now()` |
| `ended_at` | `timestamp with time zone` | YES | `—` |
| `created_at` | `timestamp with time zone` | YES | `now()` |
| `updated_at` | `timestamp with time zone` | YES | `now()` |

**Primary key**: `id`
**Foreign keys**: `active_agent_calls_agent_id_fkey`: `agent_id` → `profiles` (`id`); `active_agent_calls_conversation_id_fkey`: `conversation_id` → `chat_conversations` (`id`); `active_agent_calls_customer_id_fkey`: `customer_id` → `customers` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can manage active_agent_calls` (ALL)
**Triggers**: `trg_active_agent_calls_updated_at` → `set_updated_at`

---
## `cx_call_journal`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `external_number` | `text` | NO | `—` |
| `agent_extension` | `text` | YES | `—` |
| `agent_name` | `text` | YES | `—` |
| `call_type` | `text` | YES | `—` |
| `direction` | `text` | YES | `—` |
| `duration` | `integer` | YES | `0` |
| `start_time_utc` | `timestamp with time zone` | YES | `—` |
| `end_time_utc` | `timestamp with time zone` | YES | `—` |
| `queue_extension` | `text` | YES | `—` |
| `processed` | `boolean` | YES | `false` |
| `processed_at` | `timestamp with time zone` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: None
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can read call journal` (SELECT); `Service role can insert call journal` (INSERT)
**Triggers**: `trg_process_cx_call_journal` → `process_cx_call_journal`

---
## `contact_center_tasks`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `visit_id` | `uuid` | NO | `—` |
| `customer_id` | `uuid` | NO | `—` |
| `task_type` | `text` | NO | `—` |
| `status` | `text` | NO | `'open'::text` |
| `notes` | `text` | YES | `—` |
| `resolved_by` | `uuid` | YES | `—` |
| `resolved_at` | `timestamp with time zone` | YES | `—` |
| `created_by` | `uuid` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `contact_center_tasks_created_by_fkey`: `created_by` → `profiles` (`id`); `contact_center_tasks_customer_id_fkey`: `customer_id` → `customers` (`id`); `contact_center_tasks_visit_id_fkey`: `visit_id` → `visits` (`id`); `contact_center_tasks_resolved_by_fkey`: `resolved_by` → `profiles` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert contact_center_tasks` (INSERT); `Internal can select contact_center_tasks` (SELECT); `Internal can update contact_center_tasks` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `agent_resources`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `title` | `text` | NO | `—` |
| `title_ar` | `text` | YES | `—` |
| `type` | `text` | NO | `—` |
| `file_url` | `text` | NO | `—` |
| `category` | `text` | YES | `—` |
| `division_id` | `uuid` | YES | `—` |
| `sort_order` | `integer` | NO | `0` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `agent_resources_created_by_fkey`: `created_by` → `profiles` (`id`); `agent_resources_division_id_fkey`: `division_id` → `divisions` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can manage agent_resources` (ALL); `Internal users can read agent_resources` (SELECT)
**Triggers**: `set_agent_resources_updated_at` → `set_updated_at`

---
## `agent_qa`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `question_en` | `text` | NO | `—` |
| `question_ar` | `text` | YES | `—` |
| `answer_en` | `text` | NO | `—` |
| `answer_ar` | `text` | YES | `—` |
| `category` | `text` | YES | `—` |
| `division_id` | `uuid` | YES | `—` |
| `sort_order` | `integer` | NO | `0` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `agent_qa_created_by_fkey`: `created_by` → `profiles` (`id`); `agent_qa_division_id_fkey`: `division_id` → `divisions` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal users can manage agent_qa` (ALL); `Internal users can read agent_qa` (SELECT)
**Triggers**: `set_agent_qa_updated_at` → `set_updated_at`

---
