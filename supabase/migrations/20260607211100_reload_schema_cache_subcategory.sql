-- Reload PostgREST schema cache to expose subcategory_name on warehouse_stock_view
NOTIFY pgrst, 'reload schema';
