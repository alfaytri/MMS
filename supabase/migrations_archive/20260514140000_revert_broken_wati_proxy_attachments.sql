-- Revert agent attachment rows that were overwritten with broken WATI proxy URLs.
--
-- The auto-heal logic in fetch-messages wrote /api/wati/media?path=... URLs to
-- agent rows that had null attachments. These proxy URLs don't work for outbound
-- agent files (WATI doesn't serve them). Reset these to null so the recovery
-- script can re-match them to files in Supabase Storage.

UPDATE public.chat_messages
SET attachments = NULL
WHERE from_type = 'agent'
  AND message_kind = 'message'
  AND attachments IS NOT NULL
  AND attachments::text LIKE '%/api/wati/media%';
