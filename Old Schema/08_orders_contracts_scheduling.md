# 08 — Orders, Contracts, Quotations & Scheduling

> **Source**: Live public schema snapshot generated from the database on 2026-03-26.

Central order table (all types), detail/line-item tables, contracts, quotations, signatures, and the unified scheduling hub (`visits`).

---

## Relationship Overview

```text
                     ┌──────────────┐
                     │  customers   │
                     └──────┬───────┘
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
     ┌────────────┐   ┌──────────┐  ┌─────────────┐
     │ quotations │   │  orders  │  │  contracts   │
     └─────┬──────┘   └────┬─────┘  └──────┬──────┘
           │               │               │
    quotation_        ┌────┼────┐          (no child
    line_items        │    │    │           tables yet)
           │          ▼    ▼    ▼
    quotation_   order_  backwork_ follow_up_
    signatures   details line_     line_
           │             items     items
    signing_                │
    otp_codes        order_report
                     (notes + photos)

    ALL feed into:

    ┌─────────────────────────────────────────────┐
    │              visits (unified)                │
    │  visit_type + source_type + source_id        │
    │  replaces: order_team_assignments,           │
    │            contract_visits                    │
    └───────────────────┬─────────────────────────┘
                        │
             ┌──────────┼──────────┐
             ▼          ▼          ▼
        contact_   team_live_  visit_timeline_
        center_    locations   events
        tasks
```

---

## `orders`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `order_id` | `text` | NO | `—` |
| `order_type` | `text` | NO | `'normal'::text` |
| `parent_order_id` | `uuid` | YES | `—` |
| `source_contract_id` | `uuid` | YES | `—` |
| `customer_id` | `uuid` | NO | `—` |
| `division_id` | `uuid` | YES | `—` |
| `status` | `order_status` | YES | `'scheduled'::order_status` |
| `scheduled_date` | `date` | NO | `—` |
| `scheduled_end_date` | `date` | YES | `—` |
| `total_amount` | `numeric` | YES | `0` |
| `agent_name` | `text` | YES | `—` |
| `notes` | `text` | YES | `—` |
| `address` | `text` | YES | `—` |
| `has_invoice` | `boolean` | YES | `false` |
| `invoice_number` | `text` | YES | `—` |
| `discount_amount` | `numeric` | YES | `0` |
| `discount_reason` | `text` | YES | `—` |
| `voucher_code` | `text` | YES | `—` |
| `voucher_id` | `uuid` | YES | `—` |
| `promotion_summary` | `jsonb` | YES | `—` |
| `created_by` | `uuid` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `orders_customer_id_fkey`: `customer_id` → `customers` (`id`); `orders_created_by_fkey`: `created_by` → `profiles` (`id`); `orders_division_id_fkey`: `division_id` → `divisions` (`id`); `orders_parent_order_id_fkey`: `parent_order_id` → `orders` (`id`); `orders_source_contract_id_fkey`: `source_contract_id` → `contracts` (`id`); `orders_voucher_id_fkey`: `voucher_id` → `vouchers` (`id`)
**Unique constraints**: `orders_order_id_key` (`order_id`)
**Indexes**: `idx_orders_customer`, `idx_orders_division_id`, `idx_orders_order_id`, `idx_orders_order_type`, `idx_orders_parent` (partial, WHERE parent_order_id IS NOT NULL), `idx_orders_scheduled`, `idx_orders_source_contract` (partial, WHERE source_contract_id IS NOT NULL), `idx_orders_status`
**RLS enabled**: Yes
**Policies**: `Internal can insert orders` (INSERT); `Internal can select orders` (SELECT); `Internal can update orders` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

**`order_type` values**: `normal`, `emergency`, `backwork`, `follow_up`

---

## `order_details`

Booked services per order. Replaces the former `order_services` table.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `order_id` | `uuid` | NO | `—` |
| `service_id` | `uuid` | YES | `—` |
| `name` | `text` | NO | `—` |
| `path` | `text[]` | YES | `'{}'::text[]` |
| `qty` | `integer` | YES | `1` |
| `price` | `numeric` | YES | `0` |
| `duration` | `integer` | YES | `—` |
| `configuration` | `jsonb` | YES | `—` |
| `promotion_discount` | `numeric` | YES | `0` |
| `promotion_label` | `text` | YES | `—` |
| `is_free_addon` | `boolean` | YES | `false` |
| `created_by` | `uuid` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `order_details_order_id_fkey`: `order_id` → `orders` (`id`); `order_details_service_id_fkey`: `service_id` → `services` (`id`); `order_details_created_by_fkey`: `created_by` → `profiles` (`id`)
**Indexes**: `idx_order_details_order`
**RLS enabled**: Yes
**Policies**: `Internal can insert order_details` (INSERT); `Internal can select order_details` (SELECT); `Internal can update order_details` (UPDATE)
**Triggers**: None

---

## `backwork_line_items`

Backwork-specific detail lines, attached to orders with `order_type = 'backwork'`.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `order_id` | `uuid` | NO | `—` |
| `invoice_line_id` | `uuid` | YES | `—` |
| `service_id` | `uuid` | YES | `—` |
| `name` | `text` | NO | `—` |
| `qty` | `integer` | YES | `1` |
| `customer_reason` | `text` | YES | `—` |
| `customer_note` | `text` | YES | `—` |
| `team_reason` | `text` | YES | `—` |
| `team_note` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `backwork_line_items_order_id_fkey`: `order_id` → `orders` (`id`); `backwork_line_items_invoice_line_id_fkey`: `invoice_line_id` → `invoice_line_items` (`id`); `backwork_line_items_service_id_fkey`: `service_id` → `services` (`id`)
**Indexes**: `idx_backwork_lines_order`
**RLS enabled**: Yes
**Policies**: `Internal can insert backwork_line_items` (INSERT); `Internal can select backwork_line_items` (SELECT); `Internal can update backwork_line_items` (UPDATE)
**Triggers**: None

---

## `follow_up_line_items`

Follow-up-specific detail lines, attached to orders with `order_type = 'follow_up'`.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `order_id` | `uuid` | NO | `—` |
| `invoice_line_id` | `uuid` | YES | `—` |
| `service_id` | `uuid` | YES | `—` |
| `name` | `text` | NO | `—` |
| `qty` | `integer` | YES | `1` |
| `follow_up_reason` | `text` | YES | `—` |
| `follow_up_note` | `text` | YES | `—` |
| `results` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `follow_up_line_items_order_id_fkey`: `order_id` → `orders` (`id`); `follow_up_line_items_invoice_line_id_fkey`: `invoice_line_id` → `invoice_line_items` (`id`); `follow_up_line_items_service_id_fkey`: `service_id` → `services` (`id`)
**Indexes**: `idx_followup_lines_order`
**RLS enabled**: Yes
**Policies**: `Internal can insert follow_up_line_items` (INSERT); `Internal can select follow_up_line_items` (SELECT); `Internal can update follow_up_line_items` (UPDATE)
**Triggers**: None

---

## `order_report`

Field report entries (notes + before/after photos). Replaces the former `order_service_photos` table.

- **Before + After**: Two rows per service — one `photo_type = 'before'`, one `photo_type = 'after'`
- **Single photo**: One row with `photo_type = 'general'`
- **Notes only**: `storage_path = NULL`, text in `notes`
- **Damage**: `photo_type = 'damage'`, damage description goes in `notes`, optional photo in `storage_path`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `order_id` | `uuid` | NO | `—` |
| `service_id` | `uuid` | YES | `—` |
| `photo_type` | `text` | NO | `'general'::text` |
| `storage_path` | `text` | YES | `—` |
| `caption` | `text` | YES | `—` |
| `notes` | `text` | YES | `—` |
| `created_by` | `uuid` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `order_report_order_id_fkey`: `order_id` → `orders` (`id`); `order_report_service_id_fkey`: `service_id` → `services` (`id`); `order_report_created_by_fkey`: `created_by` → `profiles` (`id`)
**Indexes**: `idx_order_report_order`
**RLS enabled**: Yes
**Policies**: `Internal can manage order_report` (ALL)
**Triggers**: `trg_updated_at` → `set_updated_at`

**`photo_type` values**: `before`, `after`, `general`, `damage`

---

> **Note**: `order_returns` has been replaced by the unified `returns` table (see `12_sales.md`). Order returns use `source_type = 'order'` in the `returns` table.

---

## `contracts`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `contract_id` | `text` | NO | `—` |
| `customer_id` | `uuid` | NO | `—` |
| `site_name` | `text` | NO | `—` |
| `services_summary` | `text` | YES | `—` |
| `agent_name` | `text` | YES | `—` |
| `start_date` | `date` | NO | `—` |
| `end_date` | `date` | NO | `—` |
| `status` | `contract_status` | YES | `'active'::contract_status` |
| `monthly_value` | `numeric` | YES | `0` |
| `total_value` | `numeric` | YES | `0` |
| `total_visits` | `integer` | YES | `0` |
| `completed_visits` | `integer` | YES | `0` |
| `total_payments` | `numeric` | YES | `0` |
| `paid_amount` | `numeric` | YES | `0` |
| `payment_schedule` | `text` | YES | `—` |
| `has_signed_doc` | `boolean` | YES | `false` |
| `area_count` | `integer` | YES | `0` |
| `cancelled_date` | `date` | YES | `—` |
| `cancel_reason` | `text` | YES | `—` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `division_ids` | `uuid[]` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `contracts_created_by_fkey`: `created_by` → `profiles` (`id`); `contracts_customer_id_fkey`: `customer_id` → `customers` (`id`)
**Unique constraints**: `contracts_contract_id_key` (`contract_id`)
**RLS enabled**: Yes
**Policies**: `Internal can insert contracts` (INSERT); `Internal can select contracts` (SELECT); `Internal can update contracts` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

> **Note**: Phase 3 will merge `quotations` into this table and add columns like `contract_type`, `stage`, `source_type`, etc.

---

## `quotations`

> **Phase 3 pending**: This table will be merged into `contracts`.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `quotation_id` | `text` | NO | `—` |
| `customer_id` | `uuid` | NO | `—` |
| `services_summary` | `text` | YES | `—` |
| `agent_name` | `text` | YES | `—` |
| `created_date` | `date` | NO | `—` |
| `expiry_date` | `date` | NO | `—` |
| `sent_date` | `date` | YES | `—` |
| `status` | `quotation_status` | YES | `'draft'::quotation_status` |
| `total_amount` | `numeric` | YES | `0` |
| `line_item_count` | `integer` | YES | `0` |
| `has_configurable` | `boolean` | YES | `false` |
| `converted_order_id` | `uuid` | YES | `—` |
| `approved_by_manager` | `boolean` | YES | `false` |
| `approved_by_customer` | `boolean` | YES | `false` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `address` | `text` | YES | `—` |
| `signed_at` | `timestamp with time zone` | YES | `—` |
| `signature_id` | `uuid` | YES | `—` |
| `division_id` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `quotations_converted_order_id_fkey`: `converted_order_id` → `orders` (`id`); `quotations_created_by_fkey`: `created_by` → `profiles` (`id`); `quotations_customer_id_fkey`: `customer_id` → `customers` (`id`); `quotations_division_id_fkey`: `division_id` → `divisions` (`id`); `quotations_signature_id_fkey`: `signature_id` → `quotation_signatures` (`id`)
**Unique constraints**: `quotations_quotation_id_key` (`quotation_id`)
**RLS enabled**: Yes
**Policies**: `Internal can insert quotations` (INSERT); `Internal can select quotations` (SELECT); `Internal can update quotations` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---

## `quotation_line_items`

> **Phase 3 pending**: Will be replaced by `contract_line_items`.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `quotation_id` | `uuid` | NO | `—` |
| `type` | `text` | NO | `'service'::text` |
| `name` | `text` | NO | `—` |
| `name_ar` | `text` | YES | `—` |
| `code` | `text` | YES | `—` |
| `description` | `text` | YES | `—` |
| `path` | `text[]` | YES | `—` |
| `has_photo` | `boolean` | YES | `false` |
| `photo_url` | `text` | YES | `—` |
| `qty` | `numeric` | NO | `1` |
| `unit_price` | `numeric` | NO | `0` |
| `total` | `numeric` | NO | `0` |
| `warranty_months` | `integer` | YES | `0` |
| `needs_approval` | `boolean` | YES | `false` |
| `service_type` | `text` | YES | `'standard'::text` |
| `configuration` | `jsonb` | YES | `—` |
| `sort_order` | `integer` | YES | `0` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `division_id` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `quotation_line_items_created_by_fkey`: `created_by` → `profiles` (`id`); `quotation_line_items_division_id_fkey`: `division_id` → `divisions` (`id`); `quotation_line_items_quotation_id_fkey`: `quotation_id` → `quotations` (`id`)
**RLS enabled**: Yes
**Policies**: `Anon can read quotation line items` (SELECT); `Internal users manage quotation line items` (ALL)
**Triggers**: `trg_updated_at` → `set_updated_at`

---

## `quotation_signatures`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `quotation_id` | `uuid` | NO | `—` |
| `signer_name` | `text` | NO | `—` |
| `signer_phone` | `text` | NO | `—` |
| `otp_verified` | `boolean` | NO | `false` |
| `otp_verified_at` | `timestamp with time zone` | YES | `—` |
| `consent_accepted` | `boolean` | NO | `false` |
| `signature_hash` | `text` | NO | `—` |
| `signed_pdf_path` | `text` | YES | `—` |
| `ip_address` | `text` | YES | `—` |
| `user_agent` | `text` | YES | `—` |
| `signed_at` | `timestamp with time zone` | NO | `now()` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `quotation_signatures_quotation_id_fkey`: `quotation_id` → `quotations` (`id`)
**RLS enabled**: Yes
**Policies**: `Anon can insert verified signatures` (INSERT); `Anon can read signatures` (SELECT); `Internal users manage signatures` (ALL)
**Triggers**: `trg_updated_at` → `set_updated_at`

> **Phase 3 pending**: FK will change from `quotation_id` → `contract_id` pointing to unified `contracts` table.

---

## `signing_otp_codes`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `quotation_id` | `uuid` | NO | `—` |
| `phone` | `text` | NO | `—` |
| `code` | `text` | NO | `—` |
| `expires_at` | `timestamp with time zone` | NO | `—` |
| `verified` | `boolean` | NO | `false` |
| `attempts` | `integer` | NO | `0` |
| `created_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `signing_otp_codes_quotation_id_fkey`: `quotation_id` → `quotations` (`id`)
**RLS enabled**: Yes
**Policies**: `Service role manages OTP codes` (ALL)
**Triggers**: None

> **Phase 3 pending**: FK will change from `quotation_id` → `contract_id`.

---

## `visits`

Unified scheduling hub. Replaces the former `order_team_assignments` and `contract_visits` tables. All visit types feed through this single table via polymorphic `source_type` + `source_id`.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `visit_type` | `visit_type` | NO | `—` |
| `source_type` | `text` | NO | `—` |
| `source_id` | `uuid` | NO | `—` |
| `team_id` | `uuid` | YES | `—` |
| `scheduled_date` | `date` | NO | `—` |
| `booked_start_at` | `timestamp with time zone` | YES | `—` |
| `booked_end_at` | `timestamp with time zone` | YES | `—` |
| `actual_start_at` | `timestamp with time zone` | YES | `—` |
| `actual_end_at` | `timestamp with time zone` | YES | `—` |
| `status` | `visit_status` | NO | `'scheduled'::visit_status` |
| `confirmation_status` | `confirmation_status` | YES | `'not_sent'::confirmation_status` |
| `confirmation_sent_at` | `timestamp with time zone` | YES | `—` |
| `services` | `jsonb` | YES | `—` |
| `notes` | `text` | YES | `—` |
| `created_by` | `uuid` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `visits_team_id_fkey`: `team_id` → `teams` (`id`); `visits_created_by_fkey`: `created_by` → `profiles` (`id`)
**Indexes**: `idx_visits_type_source` (`visit_type`, `source_id`); `idx_visits_team_date` (`team_id`, `scheduled_date`); `idx_visits_scheduled` (`scheduled_date`); `idx_visits_status` (`status`)
**RLS enabled**: Yes
**Policies**: `Internal can insert visits` (INSERT); `Internal can select visits` (SELECT); `Internal can update visits` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

**`source_type` values**: `order`, `contract`
**`visit_type` enum**: `normal_order`, `emergency_order`, `follow_up`, `backwork`, `site_visit_single`, `site_visit_contract`, `contract_visit`, `quality_control`
**`visit_status` enum**: `scheduled`, `confirmed`, `in_progress`, `completed`, `cancelled`, `no_show`

---
