-- Fix: the previous version of cc_dedup_insert_message took `p_source text`
-- and passed it straight into the INSERT, but chat_messages.source is the
-- `message_source` enum — Postgres won't implicitly cast text → enum, so
-- every webhook call failed with SQLSTATE 42804.
--
-- Recreate the function with an explicit cast on INSERT. Argument signature
-- stays `text` so the JS .rpc() call needs no change.

CREATE OR REPLACE FUNCTION public.cc_dedup_insert_message(
  p_conversation_id uuid,
  p_from_type       text,
  p_source          text,
  p_text            text,
  p_agent_name      text,
  p_attachments     jsonb,
  p_delivery_status text,
  p_external_id     text,
  p_wamid           text,
  p_wati_id         text,
  p_created_at      timestamptz,
  p_message_kind    text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key  bigint;
  v_existing  uuid;
  v_new_id    uuid;
BEGIN
  v_lock_key := hashtext(
    coalesce(p_conversation_id::text, '') || ':' ||
    coalesce(p_from_type, '')              || ':' ||
    coalesce(p_text, '')
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  IF p_external_id IS NOT NULL THEN
    SELECT id INTO v_existing
    FROM chat_messages
    WHERE external_id = p_external_id
       OR external_id = 'wati_' || p_external_id
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE chat_messages
      SET external_id    = p_external_id,
          wamid          = COALESCE(wamid, p_wamid),
          wati_id        = COALESCE(wati_id, p_wati_id),
          delivery_status = CASE
            WHEN p_from_type = 'agent' AND p_delivery_status IS NOT NULL
              THEN p_delivery_status
            ELSE delivery_status
          END
      WHERE id = v_existing;
      RETURN v_existing;
    END IF;
  END IF;

  IF p_from_type = 'agent' AND p_message_kind = 'message' THEN
    SELECT id INTO v_existing
    FROM chat_messages
    WHERE conversation_id = p_conversation_id
      AND from_type        = 'agent'
      AND delivery_status IN ('sending', 'sent')
      AND (external_id IS NULL OR external_id LIKE 'wati_%')
      AND (
        (p_text IS NOT NULL AND p_text <> '' AND text = p_text)
        OR (p_text IS NULL OR p_text = '')
      )
      AND created_at >= now() - interval '60 seconds'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE chat_messages
      SET external_id     = COALESCE(p_external_id, external_id),
          wamid           = COALESCE(wamid, p_wamid),
          wati_id         = COALESCE(wati_id, p_wati_id),
          delivery_status = COALESCE(p_delivery_status, delivery_status),
          agent_name      = COALESCE(p_agent_name, agent_name)
      WHERE id = v_existing;
      RETURN v_existing;
    END IF;
  END IF;

  IF p_text IS NOT NULL AND p_text <> '' AND p_message_kind = 'message' THEN
    SELECT id INTO v_existing
    FROM chat_messages
    WHERE conversation_id = p_conversation_id
      AND from_type        = p_from_type
      AND text             = p_text
      AND created_at >= now() - interval '2 minutes'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE chat_messages
      SET external_id = COALESCE(p_external_id, external_id),
          wamid       = COALESCE(wamid, p_wamid),
          wati_id     = COALESCE(wati_id, p_wati_id),
          delivery_status = CASE
            WHEN p_from_type = 'agent' AND p_delivery_status IS NOT NULL
              THEN p_delivery_status
            ELSE delivery_status
          END
      WHERE id = v_existing;
      RETURN v_existing;
    END IF;
  END IF;

  IF p_wamid IS NOT NULL AND p_from_type = 'customer' AND p_message_kind = 'message' THEN
    SELECT id INTO v_existing
    FROM chat_messages
    WHERE conversation_id = p_conversation_id
      AND (wamid = p_wamid OR external_id = p_wamid)
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      UPDATE chat_messages
      SET external_id = COALESCE(p_external_id, external_id),
          wamid       = COALESCE(wamid, p_wamid)
      WHERE id = v_existing;
      RETURN v_existing;
    END IF;
  END IF;

  -- Explicit cast: text → message_source enum.
  INSERT INTO chat_messages (
    conversation_id, from_type, source, text, agent_name, attachments,
    delivery_status, external_id, wamid, wati_id, created_at, message_kind
  ) VALUES (
    p_conversation_id, p_from_type, p_source::message_source, p_text, p_agent_name, p_attachments,
    p_delivery_status, p_external_id, p_wamid, p_wati_id, p_created_at, p_message_kind
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;
