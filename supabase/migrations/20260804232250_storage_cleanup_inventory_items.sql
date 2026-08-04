-- Storage cascade — inventory_items.image_url.
-- Bucket: inventory-item-photos (public). Column stores full public URL.
--
-- This closes the biggest ongoing storage leak — every "Change photo" on
-- the item edit dialog previously orphaned the old file forever.

CREATE OR REPLACE FUNCTION public.trg_cleanup_inventory_item_image_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM storage_delete_object('inventory-item-photos', OLD.image_url, 'inventory_items', OLD.id::text);
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS cleanup_inventory_item_image_after_delete ON public.inventory_items;
CREATE TRIGGER cleanup_inventory_item_image_after_delete
  AFTER DELETE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_inventory_item_image_after_delete();

CREATE OR REPLACE FUNCTION public.trg_cleanup_inventory_item_image_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.image_url IS DISTINCT FROM NEW.image_url AND OLD.image_url IS NOT NULL THEN
    PERFORM storage_delete_object('inventory-item-photos', OLD.image_url, 'inventory_items', OLD.id::text);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cleanup_inventory_item_image_after_update ON public.inventory_items;
CREATE TRIGGER cleanup_inventory_item_image_after_update
  AFTER UPDATE OF image_url ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_cleanup_inventory_item_image_after_update();
