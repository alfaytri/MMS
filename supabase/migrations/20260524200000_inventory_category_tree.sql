-- ============================================================
-- Migration: Add parent_id to inventory_categories + auto-split
-- em-dash-delimited names into a proper ancestor tree.
-- Idempotent: guarded by "parent_id IS NULL AND name_en LIKE '% – %'"
-- ============================================================

BEGIN;

-- 1. Add parent_id column (self-referential FK)
ALTER TABLE inventory_categories
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES inventory_categories(id) ON DELETE RESTRICT;

-- 2. Index on parent_id for tree queries
CREATE INDEX IF NOT EXISTS idx_inventory_categories_parent_id
  ON inventory_categories (parent_id);

-- 3. Auto-split existing em-dash names into ancestor chains
DO $$
DECLARE
  rec        RECORD;
  segments   TEXT[];
  sku_parts  TEXT[];
  seg_count  INT;
  i          INT;
  running_parent UUID;
  running_sku    TEXT;
  seg_en     TEXT;
  seg_ar     TEXT;
  ancestor_id UUID;
  sort_counter INT;
  -- Arabic lookup via CASE (no temp table needed)
BEGIN

  -- Process every category that still has the em-dash separator and no parent
  FOR rec IN
    SELECT id, name_en, name_ar, sku, type, sort_order
    FROM inventory_categories
    WHERE parent_id IS NULL
      AND name_en LIKE '% ' || E'–' || ' %'
    ORDER BY name_en
  LOOP
    -- Split name_en on ' – ' (space + en-dash U+2013 + space)
    segments := string_to_array(rec.name_en, ' ' || E'–' || ' ');
    seg_count := array_length(segments, 1);

    -- Split SKU on '-'
    sku_parts := string_to_array(rec.sku, '-');

    -- Walk segments 1..N-1 to find-or-create ancestors
    running_parent := NULL;
    running_sku := '';

    FOR i IN 1 .. (seg_count - 1) LOOP
      seg_en := segments[i];

      -- Build running SKU from sku_parts
      IF i = 1 THEN
        running_sku := sku_parts[1];
      ELSE
        running_sku := running_sku || '-' || sku_parts[i];
      END IF;

      -- Arabic lookup
      seg_ar := CASE seg_en
        WHEN 'AC'                       THEN E'مكيف'
        WHEN 'Split'                    THEN E'سبلت'
        WHEN 'Window'                   THEN E'شباك'
        WHEN 'Stand'                    THEN E'ستاند'
        WHEN 'Floor Ceiling'            THEN E'أرضي سقفي'
        WHEN 'Rotary'                   THEN E'روتاري'
        WHEN 'Piston'                   THEN E'بيستون'
        WHEN 'Inverter'                 THEN E'إنفرتر'
        WHEN 'Copeland'                 THEN E'كوبلاند'
        WHEN 'Water Cooler'             THEN E'مبرد مياه'
        WHEN 'Water Heater'             THEN E'سخان مياه'
        WHEN 'Water Pump'               THEN E'مضخة'
        WHEN 'Electrical'               THEN E'كهرباء'
        WHEN 'Plumbing'                 THEN E'سباكة'
        WHEN 'Circulation'              THEN E'دوران'
        WHEN 'Potable'                  THEN E'شرب'
        WHEN 'Sewage'                   THEN E'صرف صحي'
        WHEN 'Rainwater'                THEN E'أمطار'
        WHEN 'Sockets & Switches'       THEN E'مقابس ومفاتيح'
        WHEN 'MCB & ELCB'               THEN E'قواطع'
        WHEN 'LED Lighting'             THEN E'إضاءة LED'
        WHEN 'Timer Switches'           THEN E'مؤقتات'
        WHEN 'Isolators & Outlets'      THEN E'معزلات'
        WHEN 'Valves'                   THEN E'صمامات'
        WHEN 'Hoses & Fittings'         THEN E'خراطيم وتوصيلات'
        WHEN 'Float Switches & Controls' THEN E'عوامات وضغط'
        WHEN 'In-line Normal'           THEN E'خط طبيعي'
        WHEN 'In-line Silent'           THEN E'صامتة'
        WHEN 'Submersible'              THEN E'غاطسة'
        ELSE seg_en  -- fallback: keep English
      END;

      -- Find existing ancestor with same name, type, and parent
      SELECT ic.id INTO ancestor_id
      FROM inventory_categories ic
      WHERE ic.name_en = seg_en
        AND ic.type = rec.type
        AND (ic.parent_id IS NOT DISTINCT FROM running_parent)
      LIMIT 1;

      -- Create if not found
      IF ancestor_id IS NULL THEN
        ancestor_id := gen_random_uuid();

        -- Compute sort_order: count existing siblings + 1
        SELECT COALESCE(MAX(ic.sort_order), 0) + 1
        INTO sort_counter
        FROM inventory_categories ic
        WHERE ic.parent_id IS NOT DISTINCT FROM running_parent
          AND ic.type = rec.type;

        INSERT INTO inventory_categories (id, name_en, name_ar, sku, type, parent_id, sort_order, status)
        VALUES (ancestor_id, seg_en, seg_ar, running_sku, rec.type, running_parent, sort_counter, 'active');
      END IF;

      running_parent := ancestor_id;
    END LOOP;

    -- Update the original row: name becomes last segment, parent_id set
    UPDATE inventory_categories
    SET name_en   = segments[seg_count],
        parent_id = running_parent
    WHERE id = rec.id;

    -- Also update name_ar for the leaf: use lookup if it matches a known segment
    UPDATE inventory_categories
    SET name_ar = CASE segments[seg_count]
        WHEN 'AC'                       THEN E'مكيف'
        WHEN 'Split'                    THEN E'سبلت'
        WHEN 'Window'                   THEN E'شباك'
        WHEN 'Stand'                    THEN E'ستاند'
        WHEN 'Floor Ceiling'            THEN E'أرضي سقفي'
        WHEN 'Rotary'                   THEN E'روتاري'
        WHEN 'Piston'                   THEN E'بيستون'
        WHEN 'Inverter'                 THEN E'إنفرتر'
        WHEN 'Copeland'                 THEN E'كوبلاند'
        WHEN 'Water Cooler'             THEN E'مبرد مياه'
        WHEN 'Water Heater'             THEN E'سخان مياه'
        WHEN 'Water Pump'               THEN E'مضخة'
        WHEN 'Electrical'               THEN E'كهرباء'
        WHEN 'Plumbing'                 THEN E'سباكة'
        WHEN 'Circulation'              THEN E'دوران'
        WHEN 'Potable'                  THEN E'شرب'
        WHEN 'Sewage'                   THEN E'صرف صحي'
        WHEN 'Rainwater'                THEN E'أمطار'
        WHEN 'Sockets & Switches'       THEN E'مقابس ومفاتيح'
        WHEN 'MCB & ELCB'               THEN E'قواطع'
        WHEN 'LED Lighting'             THEN E'إضاءة LED'
        WHEN 'Timer Switches'           THEN E'مؤقتات'
        WHEN 'Isolators & Outlets'      THEN E'معزلات'
        WHEN 'Valves'                   THEN E'صمامات'
        WHEN 'Hoses & Fittings'         THEN E'خراطيم وتوصيلات'
        WHEN 'Float Switches & Controls' THEN E'عوامات وضغط'
        WHEN 'In-line Normal'           THEN E'خط طبيعي'
        WHEN 'In-line Silent'           THEN E'صامتة'
        WHEN 'Submersible'              THEN E'غاطسة'
        ELSE name_ar  -- keep original Arabic if no match
      END
    WHERE id = rec.id;

  END LOOP;
END
$$;

COMMIT;
