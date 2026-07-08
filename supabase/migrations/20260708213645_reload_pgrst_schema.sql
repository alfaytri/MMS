-- Force PostgREST to reload its schema cache so newly-created RPCs
-- are picked up without waiting for the periodic refresh.
notify pgrst, 'reload schema';
