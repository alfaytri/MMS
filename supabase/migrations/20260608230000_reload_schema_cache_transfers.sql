-- Reload PostgREST schema cache so it discovers the new
-- warehouse_transfer_items FK relationship
NOTIFY pgrst, 'reload schema';
