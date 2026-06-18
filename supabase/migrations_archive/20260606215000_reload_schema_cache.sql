-- Force PostgREST to reload its schema cache so new columns
-- (variance_type, assignment_id, category_name, etc.) are visible via the REST API.
NOTIFY pgrst, 'reload schema';
