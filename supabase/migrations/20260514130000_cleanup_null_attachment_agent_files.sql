-- Clean up broken duplicate agent file rows created by fetch-messages.
--
-- Before the fix in src/app/api/wati/fetch-messages/route.ts, when WATI's
-- getMessages API returned an agent-sent file whose wamid did not exactly
-- match the wati_<id> the MMS app had stored, the upsert path would INSERT
-- a duplicate row. Because the upsert OMITS the `attachments` column for
-- agent rows (to protect the canonical Supabase Storage URL on the original),
-- the duplicate landed with attachments=null. In the chat UI those rows
-- render as the placeholder "📎 Attachment".
--
-- Cleanup strategy: for each agent message row in a conversation that has
-- attachments=null AND empty/null text, find a sibling row in the same
-- conversation (different id) within ±10 minutes that DOES have attachments
-- and matching (or empty) text — that is the original. Delete the empty row.
--
-- The ±10 minute window is generous because WATI's reported timestamp on
-- getMessages items can drift slightly from the optimistic insert's
-- created_at (delivery vs send time).

DELETE FROM public.chat_messages a
WHERE a.from_type = 'agent'
  AND a.message_kind = 'message'
  AND a.attachments IS NULL
  AND (a.text IS NULL OR a.text = '')
  AND EXISTS (
    SELECT 1 FROM public.chat_messages b
    WHERE b.conversation_id = a.conversation_id
      AND b.from_type = 'agent'
      AND b.message_kind = 'message'
      AND b.id <> a.id
      AND b.attachments IS NOT NULL
      AND (
        b.text IS NULL
        OR b.text = ''
        OR b.text = a.text
      )
      AND ABS(EXTRACT(EPOCH FROM (b.created_at - a.created_at))) < 600
  );
