-- Contact Centre monitoring — Phase 2 data layer.
-- Two SECURITY DEFINER RPCs, both gated by _auth_has_cc_monitoring() (which
-- bypasses for system admins), so a monitor sees across all conversations
-- regardless of per-table RLS.
--   • cc_monitoring_feed()        — per-conversation: customer, who spoke,
--                                   message + media counts, last activity.
--   • cc_conversation_transcript()— the full message list for one conversation
--                                   (text + media), for the read-only viewer.
--
-- APPLIED DEV ONLY (wkmvjxxmzstsvahuiwsz).

BEGIN;

CREATE OR REPLACE FUNCTION public.cc_monitoring_feed(p_limit integer DEFAULT 200)
RETURNS TABLE (
  conversation_id   uuid,
  wati_phone        text,
  customer_name     text,
  provider          text,
  last_message_at   timestamptz,
  total_messages    bigint,
  customer_messages bigint,
  agent_messages    bigint,
  media_messages    bigint,
  handlers          jsonb,   -- [{ name, msgs, last }]  agents who actually replied
  last_handler      text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
STABLE
AS $$
BEGIN
  IF NOT public._auth_has_cc_monitoring() THEN
    RAISE EXCEPTION 'not authorized for contact centre monitoring';
  END IF;

  RETURN QUERY
  WITH convs AS (
    SELECT c.id, c.wati_phone, c.provider, c.last_message_at,
           COALESCE(NULLIF(c.wati_contact_name, ''), sc.name) AS customer_name
    FROM public.chat_conversations c
    LEFT JOIN public.service_customers sc ON sc.id = c.customer_id_v2
    WHERE c.is_deleted = false AND c.last_message_at IS NOT NULL
    ORDER BY c.last_message_at DESC NULLS LAST
    LIMIT p_limit
  ),
  msg_stats AS (
    SELECT m.conversation_id,
           count(*)                                                                   AS total,
           count(*) FILTER (WHERE m.from_type = 'customer')                           AS cust,
           count(*) FILTER (WHERE m.from_type = 'agent')                              AS agent,
           count(*) FILTER (WHERE m.attachments IS NOT NULL
                              AND jsonb_typeof(m.attachments) = 'array'
                              AND jsonb_array_length(m.attachments) > 0)               AS media
    FROM public.chat_messages m
    WHERE m.conversation_id IN (SELECT id FROM convs) AND m.deleted_at IS NULL
    GROUP BY m.conversation_id
  ),
  handler_stats AS (
    SELECT h.conversation_id,
           jsonb_agg(jsonb_build_object('name', h.agent_name, 'msgs', h.cnt, 'last', h.last_at)
                     ORDER BY h.last_at DESC)                     AS handlers,
           (array_agg(h.agent_name ORDER BY h.last_at DESC))[1]   AS last_handler
    FROM (
      SELECT m.conversation_id,
             COALESCE(NULLIF(m.agent_name, ''), '(unknown agent)') AS agent_name,
             count(*) AS cnt, max(m.created_at) AS last_at
      FROM public.chat_messages m
      WHERE m.conversation_id IN (SELECT id FROM convs)
        AND m.from_type = 'agent' AND m.deleted_at IS NULL
        AND m.message_kind = 'message'
      GROUP BY m.conversation_id, COALESCE(NULLIF(m.agent_name, ''), '(unknown agent)')
    ) h
    GROUP BY h.conversation_id
  )
  SELECT cv.id, cv.wati_phone, cv.customer_name, cv.provider, cv.last_message_at,
         COALESCE(ms.total, 0), COALESCE(ms.cust, 0), COALESCE(ms.agent, 0), COALESCE(ms.media, 0),
         COALESCE(hs.handlers, '[]'::jsonb), hs.last_handler
  FROM convs cv
  LEFT JOIN msg_stats     ms ON ms.conversation_id = cv.id
  LEFT JOIN handler_stats hs ON hs.conversation_id = cv.id
  ORDER BY cv.last_message_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cc_monitoring_feed(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.cc_conversation_transcript(p_conversation_id uuid)
RETURNS TABLE (
  id              uuid,
  from_type       text,
  agent_name      text,
  text            text,
  attachments     jsonb,
  reactions       jsonb,
  message_kind    text,
  delivery_status text,
  created_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
STABLE
AS $$
BEGIN
  IF NOT public._auth_has_cc_monitoring() THEN
    RAISE EXCEPTION 'not authorized for contact centre monitoring';
  END IF;

  RETURN QUERY
    SELECT m.id, m.from_type, m.agent_name, m.text, m.attachments, m.reactions,
           m.message_kind, m.delivery_status, m.created_at
    FROM public.chat_messages m
    WHERE m.conversation_id = p_conversation_id AND m.deleted_at IS NULL
    ORDER BY m.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cc_conversation_transcript(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
