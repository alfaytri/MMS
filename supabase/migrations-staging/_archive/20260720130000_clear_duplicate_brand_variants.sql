-- Backfill: clear brand values that duplicate the item's family name.
--
-- Context: `inventory_brand_variants.brand` was seeded with product-family
-- strings (e.g. "FLARE NUT" on an item named "FLARE NUT 3/8''") instead of
-- manufacturer names. The Brand column in the Dead Stock report and elsewhere
-- ended up echoing the item name.
--
-- Strategy: replace `brand` with an empty string wherever it exactly matches
-- the item's `name_en` OR is a whole-word prefix of it (i.e. followed by a
-- space in the item name). Empty strings preserve the existing NOT NULL
-- constraint. Frontend code already treats empty strings as "no brand".
--
-- Users can then enter real manufacturer names via the brand variant form
-- (which shows placeholder "e.g. LG, Alfacool").

DO $$
DECLARE
  v_affected INT;
BEGIN
  SELECT COUNT(*) INTO v_affected
  FROM inventory_brand_variants ibv
  JOIN inventory_items ii ON ii.id = ibv.item_id
  WHERE ibv.brand IS NOT NULL
    AND TRIM(ibv.brand) <> ''
    AND (
         LOWER(TRIM(ibv.brand)) = LOWER(TRIM(ii.name_en))
      OR LOWER(TRIM(ii.name_en)) LIKE LOWER(TRIM(ibv.brand)) || ' %'
    );

  RAISE NOTICE 'Clearing brand on % rows where it duplicates the item family name', v_affected;

  UPDATE inventory_brand_variants ibv
     SET brand = ''
    FROM inventory_items ii
   WHERE ii.id = ibv.item_id
     AND ibv.brand IS NOT NULL
     AND TRIM(ibv.brand) <> ''
     AND (
          LOWER(TRIM(ibv.brand)) = LOWER(TRIM(ii.name_en))
       OR LOWER(TRIM(ii.name_en)) LIKE LOWER(TRIM(ibv.brand)) || ' %'
     );
END $$;
