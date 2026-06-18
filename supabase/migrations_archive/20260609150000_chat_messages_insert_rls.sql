-- Tighten chat_messages INSERT policy.
--
-- The local-first rollout starts sending client-generated UUIDs as
-- chat_messages.id (instead of letting gen_random_uuid() fire on the
-- server). That means the API/edge function can no longer be the
-- gatekeeper — the row's payload is taken as-is from the client.
--
-- This migration guarantees the policy itself verifies that
-- auth.uid() has permission to write into the referenced
-- conversation_id, regardless of what the client passes.

-- Drop any pre-existing INSERT policies (idempotent if missing).
DROP POLICY IF EXISTS "chat_messages_insert_strict" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_insert" ON public.chat_messages;
DROP POLICY IF EXISTS "cc_messages_insert" ON public.chat_messages;
DROP POLICY IF EXISTS "Internal users can manage chat_messages" ON public.chat_messages;

-- New strict policy:
-- Inserts are allowed only when the auth.uid() user has a profile
-- with the contact_centre.view permission AND the conversation_id
-- exists. (We deliberately do NOT additionally scope by division
-- here — division gating belongs in higher-level conversation
-- access rules, not at the per-message layer.)
CREATE POLICY chat_messages_insert_strict
ON public.chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.chat_conversations cc
    WHERE cc.id = conversation_id
  )
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_custom_roles ur ON ur.profile_id = p.id
    JOIN public.custom_roles      cr ON cr.id        = ur.role_id
    WHERE p.auth_user_id = auth.uid()
      AND 'contact_centre.view' = ANY (cr.permissions)
  )
);

-- Note: webhook routes use the service-role key, which bypasses RLS,
-- so they are unaffected. The policy only constrains anon/authenticated
-- clients — which is exactly the surface that just gained client-UUID
-- write capability.
