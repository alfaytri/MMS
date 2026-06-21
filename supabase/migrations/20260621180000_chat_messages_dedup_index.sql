-- Composite partial index supporting the text-based duplicate-message guard in
-- the Wati webhook + fetch-messages routes. Without it, every inbound message
-- triggers a recent-row scan on chat_messages — fast at first, painfully slow
-- as history grows.
--
-- Covers the WHERE clause: conversation_id = ? AND from_type = ? AND text = ?
--                          AND created_at >= ? AND message_kind = 'message'
--
-- The `created_at DESC` ordering lets the planner stop after the first match
-- (the dedup query uses .limit(1) ordered by created_at desc).
--
-- Partial WHERE message_kind = 'message' keeps the index tiny — event /
-- activity / note rows never participate in the dedup check.

CREATE INDEX IF NOT EXISTS idx_chat_messages_dedup
  ON public.chat_messages (conversation_id, from_type, created_at DESC, text)
  WHERE message_kind = 'message';

COMMENT ON INDEX public.idx_chat_messages_dedup IS
  'Supports the (conversation, direction, text, recent-time) lookup used by the
   Wati webhook + fetch-messages duplicate-message guard. Partial on
   message_kind = ''message'' to keep the index minimal.';
