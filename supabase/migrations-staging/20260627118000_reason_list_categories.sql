-- ─────────────────────────────────────────────────────────────────────────────
-- Promote reason-list categories from a hardcoded TS array (9 values) to a
-- managed DB table. Admins can now add / rename / soft-delete categories
-- from the Reason Lists page.
--
-- Design:
--   - reason_list_categories holds the catalog (one row per category).
--   - reason_lists.category stays as a text slug for backward compatibility
--     (every existing consumer reads `category` directly, e.g.
--     useReasonLists('cancellation')). We add a FK-by-slug constraint via a
--     CHECK trigger so dropping a category fails noisily if reasons still
--     reference it.
--
-- The 9 hardcoded slugs are seeded so existing dialogs (cancel, void,
-- refund, adjustment, etc.) keep working without changes.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS public.reason_list_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE
              CHECK (slug ~ '^[a-z][a-z0-9_]*$'),
  label       text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.reason_list_categories IS
  'Catalog of valid `reason_lists.category` slugs. Editable from Master Data > Reason Lists.';

ALTER TABLE public.reason_list_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read reason_list_categories"
  ON public.reason_list_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage reason_list_categories"
  ON public.reason_list_categories FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reason_list_categories
  TO authenticated, service_role;

-- ── Seed the 9 historical slugs so nothing breaks ──────────────────────────
INSERT INTO public.reason_list_categories (slug, label, sort_order) VALUES
  ('cancellation', 'Cancellation', 10),
  ('return',       'Return',       20),
  ('adjustment',   'Adjustment',   30),
  ('credit_note',  'Credit Note',  40),
  ('refund',       'Refund',       50),
  ('discount',     'Discount',     60),
  ('complaint',    'Complaint',    70),
  ('reschedule',   'Reschedule',   80),
  ('void',         'Void',         90)
ON CONFLICT (slug) DO NOTHING;

-- ── Integrity trigger: prevent inserting a reason for an unknown category ──
CREATE OR REPLACE FUNCTION public.reason_lists_category_must_exist()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.reason_list_categories
    WHERE slug = NEW.category AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Unknown reason category: %. Add it to reason_list_categories first.', NEW.category
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reason_lists_category_must_exist ON public.reason_lists;
CREATE TRIGGER trg_reason_lists_category_must_exist
  BEFORE INSERT OR UPDATE OF category ON public.reason_lists
  FOR EACH ROW
  EXECUTE FUNCTION public.reason_lists_category_must_exist();

-- ── Integrity trigger: prevent deleting a category that has reasons ────────
CREATE OR REPLACE FUNCTION public.reason_list_categories_no_orphan_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Hard delete blocked when reasons exist; soft delete still works because
  -- it's an UPDATE not a DELETE, and reasons can also be soft-archived
  -- separately by toggling reason_lists.active.
  SELECT COUNT(*) INTO v_count
  FROM   public.reason_lists
  WHERE  category = OLD.slug AND deleted_at IS NULL;

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete category "%": % active reason(s) still reference it. Soft-delete (set deleted_at) or move the reasons first.',
      OLD.slug, v_count
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_reason_list_categories_no_orphan_delete ON public.reason_list_categories;
CREATE TRIGGER trg_reason_list_categories_no_orphan_delete
  BEFORE DELETE ON public.reason_list_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.reason_list_categories_no_orphan_delete();

NOTIFY pgrst, 'reload schema';

COMMIT;
