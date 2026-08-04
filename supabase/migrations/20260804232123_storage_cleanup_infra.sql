-- Storage cascade cleanup — infrastructure only.
--
-- Enables pg_net + supabase_vault, creates the storage_cleanup_failures
-- audit table, and installs the storage_delete_object() helper used by
-- every subsequent cleanup migration.
--
-- The service-role key is stored in Vault under the name
-- 'storage_cleanup_service_role_key'. This migration will attempt to
-- create it from a session GUC (`app.storage_cleanup_service_role_key`);
-- if the GUC is not set (usual case), the operator must call
-- vault.create_secret manually before the triggers can succeed.

CREATE EXTENSION IF NOT EXISTS pg_net           WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

CREATE TABLE IF NOT EXISTS public.storage_cleanup_failures (
  id           BIGSERIAL PRIMARY KEY,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  bucket       TEXT        NOT NULL,
  path         TEXT        NOT NULL,
  source_table TEXT,
  source_id    TEXT,
  error_text   TEXT
);
ALTER TABLE public.storage_cleanup_failures ENABLE ROW LEVEL SECURITY;
-- No policies = deny to everyone but the service role bypass. Intentional.

DO $$
DECLARE
  v_key text;
BEGIN
  BEGIN
    v_key := current_setting('app.storage_cleanup_service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    v_key := NULL;
  END;

  IF v_key IS NULL OR v_key = '' THEN
    RAISE NOTICE 'storage_cleanup_service_role_key GUC not set — Vault secret not created by this migration. Run vault.create_secret manually before enabling cascade smoke tests.';
  ELSIF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'storage_cleanup_service_role_key') THEN
    PERFORM vault.create_secret(v_key, 'storage_cleanup_service_role_key');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.storage_delete_object(
  p_bucket       text,
  p_path         text,
  p_source_table text DEFAULT NULL,
  p_source_id    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_key      text;
  v_base_url text := 'https://mwvblpgbgxipvrevkeff.supabase.co';
  v_url      text;
BEGIN
  IF p_path IS NULL OR p_path = '' THEN RETURN; END IF;

  IF p_path LIKE 'http%' THEN
    p_path := regexp_replace(p_path, '^.*/storage/v1/object/(public/)?[^/]+/', '');
    p_path := regexp_replace(p_path, '\?.*$', '');
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'storage_cleanup_service_role_key';

  IF v_key IS NULL THEN
    INSERT INTO public.storage_cleanup_failures(bucket, path, source_table, source_id, error_text)
    VALUES (p_bucket, p_path, p_source_table, p_source_id,
            'Vault secret storage_cleanup_service_role_key missing');
    RETURN;
  END IF;

  v_url := v_base_url || '/storage/v1/object/' || p_bucket || '/' || p_path;

  BEGIN
    PERFORM net.http_delete(
      url     := v_url,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_key,
        'apikey',        v_key
      )
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.storage_cleanup_failures(bucket, path, source_table, source_id, error_text)
    VALUES (p_bucket, p_path, p_source_table, p_source_id, SQLERRM);
  END;
END $$;

REVOKE ALL     ON FUNCTION public.storage_delete_object(text, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.storage_delete_object(text, text, text, text) TO postgres, service_role;
