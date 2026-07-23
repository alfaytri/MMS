-- ============================================================
-- MMS Staging Seed Data
-- Generated: 2026-07-24
-- Applies AFTER the baseline. All inserts are idempotent
-- (ON CONFLICT DO NOTHING) so this can be re-run safely.
-- ============================================================
--
-- What this seed covers:
--   ✓ Company + divisions (NOT covered by any baseline migration)
--   ✓ Re-affirms country codes, currencies, reason list categories,
--     payment methods, and system roles (already seeded by
--     fresh_db_bootstrap + seed_country_codes_and_currencies —
--     included here for documentation and re-run safety).
--
-- The admin USER must be created manually after this seed runs:
--   1. Supabase Dashboard → Authentication → Add User
--   2. Use the email matching your .env.local ADMIN_BOOTSTRAP_EMAIL
--   3. The bootstrap_first_user_trg trigger auto-creates the profile
--      and assigns the Admin role to the very first user.
-- ============================================================

BEGIN;

-- ── 1. Company ────────────────────────────────────────────────
INSERT INTO public.companies (id, name_en, name_ar, cr_number, vat_id, default_currency, default_tax_rate, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Alfaytri Trading',
  'الفيتري للتجارة',
  'CR-STAGING-001',
  NULL,
  'QAR',
  0,
  true
)
ON CONFLICT (id) DO NOTHING;

-- ── 2. Divisions ──────────────────────────────────────────────
INSERT INTO public.company_divisions (id, slug, name, short_name, color, company_name_en, is_active, sort_order)
VALUES
  ('00000000-0000-0000-0000-000000000010', 'inventory', 'Inventory & Warehouse',   'INV', '#2563eb', 'Alfaytri Trading', true, 1),
  ('00000000-0000-0000-0000-000000000011', 'trading',   'Trading & Sales',         'TRD', '#16a34a', 'Alfaytri Trading', true, 2)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Payment methods (already seeded by fresh_db_bootstrap; re-affirm) ──
INSERT INTO public.payment_methods (name, slug, sort_order, is_active)
VALUES
  ('Cash',            'cash',            1, true),
  ('Bank Transfer',   'bank_transfer',   2, true),
  ('Cheque',          'cheque',          3, true),
  ('Credit Card',     'credit_card',     4, true),
  ('Debit Card',      'debit_card',      5, true)
ON CONFLICT (slug) DO NOTHING;

-- ── 4. Reason list categories (already seeded; re-affirm) ────
INSERT INTO public.reason_list_categories (slug, label, sort_order, active)
VALUES
  ('cancellation',      'Cancellation',       1, true),
  ('void',              'Void',               2, true),
  ('refund',            'Refund',             3, true),
  ('adjustment',        'Stock Adjustment',   4, true),
  ('return',            'Return',             5, true),
  ('damage',            'Damage / Write-off', 6, true),
  ('transfer',          'Warehouse Transfer', 7, true),
  ('receival_edit',     'Receival Edit',      8, true),
  ('po_edit',           'PO Edit',            9, true)
ON CONFLICT (slug) DO NOTHING;

-- ── 5. Note: country_codes, currencies, custom_roles ─────────
-- These are seeded by baseline migrations:
--   * country_codes + currencies — 20260709140342_seed_country_codes_and_currencies.sql
--   * custom_roles (Admin, field_rp, inventory_manager, approval slots)
--     — 20260706130000_fresh_db_bootstrap.sql
--
-- Nothing to insert here — they are already present after the
-- baseline runs.  Left as a note so the staging seed's coverage
-- is easy to audit.

COMMIT;
