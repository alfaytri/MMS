-- supabase/migrations/20260517082712_performance_indexes_chat_and_services.sql
-- Performance indexes identified from query stats report (2026-05-17).
--
-- Problems fixed:
--   1. chat_conversations: no index on last_message_at — full-scan on every
--      contact-centre poll (11,645 calls/day, avg 12ms each).
--   2. chat_messages: single-column index on conversation_id forces a
--      post-filter by created_at; composite index eliminates the filter step.
--   3. services: no index on tree_type/deleted_at — table-scan on every
--      service-tree load (208 calls, avg 42ms).

-- 1. Partial index on chat_conversations(last_message_at DESC)
--    Covers both the WHERE last_message_at >= $4 range filter and the
--    ORDER BY last_message_at DESC sort used by the contact-centre feed.
--    Partial because rows with NULL last_message_at are never returned.
CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_message_at
  ON public.chat_conversations (last_message_at DESC NULLS LAST)
  WHERE last_message_at IS NOT NULL;

-- 2. Composite index on chat_messages(conversation_id, created_at)
--    The query always filters conversation_id = $3 AND created_at >= $4,
--    then ORDER BY created_at ASC. This index satisfies the filter and
--    sort in one pass, replacing the old single-column idx_chat_messages_conversation
--    for that query shape (the prefix still covers plain conversation_id lookups).
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_created_at
  ON public.chat_messages (conversation_id, created_at ASC);

-- 3. Partial composite index on services(tree_type, sort_order)
--    The query is always WHERE tree_type = $1 AND deleted_at IS NULL
--    ORDER BY sort_order ASC. Partial on deleted_at IS NULL keeps the
--    index small (active rows only) and covers both filter columns and sort.
CREATE INDEX IF NOT EXISTS idx_services_tree_type_sort
  ON public.services (tree_type, sort_order ASC)
  WHERE deleted_at IS NULL;
