-- Backfill: WHAPI inbound/outbound rows were inserted with source='whatsapp_api'
-- (the WATI value) because the WHAPI webhook, fetch-messages, and send-message
-- routes hard-coded the wrong enum. The UnifiedThread splits sections by source,
-- so historical WHAPI messages render under a "WATI" divider instead of "WHAPI".
--
-- The conversation row carries the correct provider ('whapi'), so use it to
-- repair every mis-tagged message in one pass.

UPDATE chat_messages m
SET    source = 'whatsapp_whapi'
FROM   chat_conversations c
WHERE  m.conversation_id = c.id
  AND  c.provider = 'whapi'
  AND  m.source   = 'whatsapp_api';
