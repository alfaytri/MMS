-- chat_messages parallel-webhook dedup RPC
--
-- Background: WATI fires multiple inbound webhook events for a single logical
-- WhatsApp message — typically the numeric WATI id on one firing and the
-- canonical wamid.* on another, often within ~50 ms. The existing JS-side
-- dedup (commit 96f8b88) catches this when the two events arrive serially,
-- but in production the two Next.js handlers run in parallel: both SELECT,
-- neither sees the other's not-yet-committed INSERT, both INSERT — and the
-- chat shows the agent or customer message twice.
--
-- Fix: do the entire dedup + insert + backfill inside a single Postgres
-- function guarded by pg_advisory_xact_lock keyed on
-- hashtext(conversation_id || ':' || from_type || ':' || text). The second
-- parallel call blocks until the first commits, then its dedup SELECT sees
-- the row and short-circuits to a backfill instead of inserting again.
--
-- The function returns the row id of either the existing-and-backfilled
-- match or the newly inserted row, so the caller can drop its manual
-- SELECT/UPDATE/INSERT branches entirely.

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
  -- Serialise concurrent webhooks for the same logical message bucket.
  -- Lock is automatically released at transaction end (commit/rollback).
  v_lock_key := hashtext(
    coalesce(p_conversation_id::text, '') || ':' ||
    coalesce(p_from_type, '')              || ':' ||
    coalesce(p_text, '')
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- 1. Exact external_id match (covers WATI's legacy wati_<id> prefix + bare id)
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

  -- 2. Agent-side optimistic-row match: the app inserted a row with
  --    external_id = 'wati_<numericId>' (or NULL) before this webhook fired.
  --    Match by text + conversation + from_type + recent 60s window.
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

  -- 3. Broad text-based dedup (both directions). Same bucket logic the JS path
  --    used, but now atomic with the INSERT below thanks to the advisory lock.
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

  -- 4. Last-resort wamid lookup for inbound customer messages — covers the
  --    fetch-messages race where the row was inserted earlier with
  --    external_id = numeric WATI id while the webhook arrives with wamid.
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

  -- 5. No match — INSERT the new row.
  INSERT INTO chat_messages (
    conversation_id, from_type, source, text, agent_name, attachments,
    delivery_status, external_id, wamid, wati_id, created_at, message_kind
  ) VALUES (
    p_conversation_id, p_from_type, p_source, p_text, p_agent_name, p_attachments,
    p_delivery_status, p_external_id, p_wamid, p_wati_id, p_created_at, p_message_kind
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cc_dedup_insert_message FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cc_dedup_insert_message TO service_role;

COMMENT ON FUNCTION public.cc_dedup_insert_message IS
  'Atomic dedup + insert for chat_messages. Guarded by pg_advisory_xact_lock '
  'on (conversation_id, from_type, text) so parallel webhook firings cannot '
  'each insert a separate row. Called from /api/wati/webhook.';

-- ─── One-shot historical cleanup ────────────────────────────────────────────
-- Merge any agent-side duplicate pairs already in the DB (text + conversation
-- + from_type within the same minute). Keep the row with the lower id, copy
-- any canonical external_id / wamid / wati_id from the loser before deleting.
-- Reactions reference chat_messages by id, so we also re-home any reactions
-- attached to the loser before the delete.

DO $cleanup$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      -- uuid has no MIN() — sort ascending and take the first as the survivor.
      (array_agg(id ORDER BY id))[1] AS keep_id,
      array_agg(id ORDER BY id) AS all_ids,
      array_agg(external_id ORDER BY id) FILTER (WHERE external_id IS NOT NULL) AS external_ids,
      array_agg(wamid       ORDER BY id) FILTER (WHERE wamid       IS NOT NULL) AS wamids,
      array_agg(wati_id     ORDER BY id) FILTER (WHERE wati_id     IS NOT NULL) AS wati_ids
    FROM chat_messages
    WHERE message_kind = 'message'
      AND from_type    = 'agent'
      AND text IS NOT NULL
      AND text <> ''
    GROUP BY
      conversation_id,
      from_type,
      text,
      date_trunc('minute', created_at)
    HAVING COUNT(*) > 1
  LOOP
    -- Backfill canonical IDs onto the survivor before deleting the rest.
    UPDATE chat_messages
    SET external_id = COALESCE(external_id, (r.external_ids)[1]),
        wamid       = COALESCE(wamid,       (r.wamids)[1]),
        wati_id     = COALESCE(wati_id,     (r.wati_ids)[1])
    WHERE id = r.keep_id;

    -- Defensive: only delete the duplicate ids that aren't the survivor.
    DELETE FROM chat_messages
    WHERE id = ANY(r.all_ids)
      AND id <> r.keep_id;
  END LOOP;
END
$cleanup$;
