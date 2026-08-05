-- Force PostgREST to reload its schema cache after the Pass 3 enum retypes.
-- Without this, PostgREST may keep serving the old text-column signatures
-- and silently reject enum-column inserts (e.g. inventory_check_log
-- 'user_completed' rows) even though the schema itself is correct.

NOTIFY pgrst, 'reload schema';
