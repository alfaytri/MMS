-- Part 2: Add missing FK constraints (idempotent) and convert text columns to enums.
-- Depends on 20260716120000 (adds 'booking' to notification_category).

-- ── 1. cogs_entries — FK on sale_delivery_id ─────────────────────────────────

DO $$ BEGIN
  ALTER TABLE public.cogs_entries
    ADD CONSTRAINT cogs_entries_sale_delivery_id_fkey
    FOREIGN KEY (sale_delivery_id) REFERENCES public.sale_deliveries(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_cogs_entries_sale_delivery_id
  ON public.cogs_entries(sale_delivery_id)
  WHERE sale_delivery_id IS NOT NULL;

-- ── 2. cogs_entries — FK on sale_order_id ────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE public.cogs_entries
    ADD CONSTRAINT cogs_entries_sale_order_id_fkey
    FOREIGN KEY (sale_order_id) REFERENCES public.sale_orders(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_cogs_entries_sale_order_id
  ON public.cogs_entries(sale_order_id)
  WHERE sale_order_id IS NOT NULL;

-- ── 3. po_line_items — FK on brand_id ────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE public.po_line_items
    ADD CONSTRAINT po_line_items_brand_id_fkey
    FOREIGN KEY (brand_id) REFERENCES public.brands(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_po_line_items_brand_id
  ON public.po_line_items(brand_id)
  WHERE brand_id IS NOT NULL;

-- ── 4. customer_addresses.address_type — varchar → enum (idempotent) ─────────

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_addresses'
      AND column_name = 'address_type'
      AND udt_name != 'address_type'
  ) THEN
    ALTER TABLE public.customer_addresses
      ALTER COLUMN address_type TYPE public.address_type
      USING address_type::public.address_type;
  END IF;
END $$;

-- ── 5. notification_config.category — text → enum ────────────────────────────

ALTER TABLE public.notification_config
  ALTER COLUMN category TYPE public.notification_category
  USING category::public.notification_category;

-- ── 6. notification_config.trigger_type — text → enum ────────────────────────

ALTER TABLE public.notification_config
  ALTER COLUMN trigger_type TYPE public.notification_trigger
  USING trigger_type::public.notification_trigger;

NOTIFY pgrst, 'reload schema';
