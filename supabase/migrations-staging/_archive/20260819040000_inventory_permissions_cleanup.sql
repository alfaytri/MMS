-- Inventory permissions cleanup: strip dead legacy keys, preserve access.
-- View = look, Manage = do everything. Enforced keys (inventory.catalog.*,
-- inventory.pricing.*) unchanged. Does NOT restore catalog write power that
-- Brands & Origin Task 6 intentionally removed.
UPDATE public.custom_roles AS cr
SET permissions =
  -- kept keys, original order preserved
  COALESCE((
    SELECT array_agg(p ORDER BY ord)
    FROM unnest(cr.permissions) WITH ORDINALITY AS t(p, ord)
    WHERE p <> ALL (ARRAY[
      'master_data.inventory.view',
      'master_data.inventory.create',
      'master_data.inventory.manage',
      'master_data.inventory.attributes.create',
      'master_data.inventory.attributes.edit'
    ]::text[])
  ), '{}'::text[])
  -- preserve Inventory page access
  || CASE
       WHEN 'master_data.inventory.view' = ANY (cr.permissions)
        AND NOT ('inventory.catalog.view' = ANY (cr.permissions))
       THEN ARRAY['inventory.catalog.view']::text[]
       ELSE ARRAY[]::text[]
     END
  -- preserve attribute-management capability
  || CASE
       WHEN ('master_data.inventory.attributes.create' = ANY (cr.permissions)
             OR 'master_data.inventory.attributes.edit' = ANY (cr.permissions))
        AND NOT ('master_data.inventory.attributes.manage' = ANY (cr.permissions))
       THEN ARRAY['master_data.inventory.attributes.manage']::text[]
       ELSE ARRAY[]::text[]
     END
WHERE cr.permissions && ARRAY[
  'master_data.inventory.view',
  'master_data.inventory.create',
  'master_data.inventory.manage',
  'master_data.inventory.attributes.create',
  'master_data.inventory.attributes.edit'
]::text[];
