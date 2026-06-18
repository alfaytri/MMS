-- Set the contact center provider to Wati.
-- The provider toggle is exposed in the sidebar UI; this just sets the default.
INSERT INTO public.app_settings (key, value)
VALUES ('cc_provider', '"wati"'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = '"wati"'::jsonb;
