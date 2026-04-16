# 9 — Invoices & Payments

> **Source**: Live public schema snapshot generated from the database on 2026-03-25.

Invoice, payment, session, and credit note tables.

---

## `invoices`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `invoice_id` | `text` | NO | `—` |
| `customer_id` | `uuid` | NO | `—` |
| `source` | `invoice_source` | NO | `—` |
| `source_id` | `text` | NO | `—` |
| `source_label` | `text` | YES | `—` |
| `issued_date` | `date` | NO | `—` |
| `due_date` | `date` | NO | `—` |
| `status` | `invoice_status` | YES | `'draft'::invoice_status` |
| `subtotal` | `numeric` | YES | `0` |
| `tax` | `numeric` | YES | `0` |
| `total_amount` | `numeric` | YES | `0` |
| `paid_amount` | `numeric` | YES | `0` |
| `agent_name` | `text` | YES | `—` |
| `notes` | `text` | YES | `—` |
| `qb_synced` | `boolean` | YES | `false` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `division_id` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `invoices_created_by_fkey`: `created_by` → `profiles` (`id`); `invoices_customer_id_fkey`: `customer_id` → `customers` (`id`); `invoices_division_id_fkey`: `division_id` → `divisions` (`id`)
**Unique constraints**: `invoices_invoice_id_key` (`invoice_id`)
**RLS enabled**: Yes
**Policies**: `Internal can insert invoices` (INSERT); `Internal can select invoices` (SELECT); `Internal can update invoices` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `invoice_line_items`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `invoice_id` | `uuid` | NO | `—` |
| `description` | `text` | NO | `—` |
| `qty` | `integer` | YES | `1` |
| `unit_price` | `numeric` | YES | `0` |
| `total` | `numeric` | YES | `0` |
| `team_name` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `promotion_discount` | `numeric` | YES | `0` |
| `promotion_label` | `text` | YES | `—` |
| `is_free_addon` | `boolean` | YES | `false` |

**Primary key**: `id`
**Foreign keys**: `invoice_line_items_created_by_fkey`: `created_by` → `profiles` (`id`); `invoice_line_items_invoice_id_fkey`: `invoice_id` → `invoices` (`id`)
**Unique constraints**: None
**RLS enabled**: Yes
**Policies**: `Internal can insert invoice_line_items` (INSERT); `Internal can select invoice_line_items` (SELECT); `Internal can update invoice_line_items` (UPDATE)
**Triggers**: None

---
## `payments`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `payment_id` | `text` | YES | `—` |
| `invoice_id` | `uuid` | YES | `—` |
| `amount` | `numeric` | NO | `—` |
| `method` | `payment_method` | NO | `—` |
| `status` | `payment_status` | YES | `'pending'::payment_status` |
| `date` | `date` | NO | `—` |
| `reference` | `text` | YES | `—` |
| `cheque_number` | `text` | YES | `—` |
| `cheque_date` | `date` | YES | `—` |
| `bank_name` | `text` | YES | `—` |
| `transaction_id` | `text` | YES | `—` |
| `agent_name` | `text` | YES | `—` |
| `notes` | `text` | YES | `—` |
| `qb_synced` | `boolean` | YES | `false` |
| `deleted_at` | `timestamp with time zone` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |
| `dibsy_payment_id` | `text` | YES | `—` |
| `dibsy_checkout_url` | `text` | YES | `—` |
| `source_type` | `text` | NO | `'invoice'::text` |
| `source_id` | `uuid` | YES | `—` |
| `supplier_id` | `uuid` | YES | `—` |
| `currency` | `text` | YES | `'QAR'::text` |
| `exchange_rate` | `numeric` | YES | `1` |
| `amount_qar` | `numeric` | YES | `—` |
| `due_date` | `date` | YES | `—` |
| `voided_at` | `timestamp with time zone` | YES | `—` |
| `voided_reason` | `text` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `payments_created_by_fkey`: `created_by` → `profiles` (`id`); `payments_invoice_id_fkey`: `invoice_id` → `invoices` (`id`); `payments_supplier_id_fkey`: `supplier_id` → `suppliers` (`id`)
**Unique constraints**: `payments_payment_id_key` (`payment_id`)
**RLS enabled**: Yes
**Policies**: `Internal can insert payments` (INSERT); `Internal can select payments` (SELECT); `Internal can update payments` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
## `payment_sessions`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `dibsy_payment_id` | `text` | YES | `—` |
| `customer_id` | `uuid` | NO | `—` |
| `amount` | `numeric` | NO | `—` |
| `currency` | `text` | NO | `'QAR'::text` |
| `status` | `text` | NO | `'open'::text` |
| `checkout_url` | `text` | YES | `—` |
| `redirect_url` | `text` | YES | `—` |
| `receipt_sent` | `boolean` | NO | `false` |
| `dibsy_response` | `jsonb` | YES | `—` |
| `invoice_allocations` | `jsonb` | NO | `'[]'::jsonb` |
| `created_by` | `uuid` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |

**Primary key**: `id`
**Foreign keys**: `payment_sessions_created_by_fkey`: `created_by` → `profiles` (`id`); `payment_sessions_customer_id_fkey`: `customer_id` → `customers` (`id`)
**Unique constraints**: `payment_sessions_dibsy_payment_id_key` (`dibsy_payment_id`)
**RLS enabled**: Yes
**Policies**: `Internal users can manage payment sessions` (ALL); `Service role full access to payment sessions` (ALL)
**Triggers**: `set_payment_sessions_updated_at` → `set_updated_at`

---
## `credit_notes`

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `credit_note_id` | `text` | NO | `—` |
| `invoice_id` | `uuid` | NO | `—` |
| `customer_name` | `text` | NO | `—` |
| `phone` | `text` | YES | `—` |
| `type` | `text` | NO | `'full'::text` |
| `reason` | `text` | NO | `—` |
| `line_items` | `jsonb` | YES | `'[]'::jsonb` |
| `total_amount` | `numeric` | NO | `0` |
| `status` | `credit_note_status` | YES | `'draft'::credit_note_status` |
| `approved_by` | `text` | YES | `—` |
| `refund_method` | `payment_method` | YES | `—` |
| `refund_reference` | `text` | YES | `—` |
| `notes` | `text` | YES | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `updated_at` | `timestamp with time zone` | NO | `now()` |
| `created_by` | `uuid` | YES | `—` |

**Primary key**: `id`
**Foreign keys**: `credit_notes_created_by_fkey`: `created_by` → `profiles` (`id`); `credit_notes_invoice_id_fkey`: `invoice_id` → `invoices` (`id`)
**Unique constraints**: `credit_notes_credit_note_id_key` (`credit_note_id`)
**RLS enabled**: Yes
**Policies**: `Internal can insert credit_notes` (INSERT); `Internal can select credit_notes` (SELECT); `Internal can update credit_notes` (UPDATE)
**Triggers**: `trg_updated_at` → `set_updated_at`

---
