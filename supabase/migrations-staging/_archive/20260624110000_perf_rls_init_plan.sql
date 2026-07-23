-- Wave 2 of the Supabase performance cleanup.
--
-- Supabase lint 0003_auth_rls_initplan flagged 14 RLS policies that call
-- auth.<fn>() directly inside USING / WITH CHECK clauses. Postgres re-evaluates
-- such calls once per scanned row instead of caching the result for the whole
-- statement. Wrapping the call in (SELECT auth.<fn>()) turns it into a stable
-- initplan that runs exactly once per query.
--
-- Semantics are identical — auth.uid() and auth.role() return the same value
-- for the duration of a single query — so each policy is dropped and recreated
-- with the wrapped form. No row visibility changes.
--
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

------------------------------------------------------------------------------
-- service_brands ------------------------------------------------------------
------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Manage services write service_brands" ON public.service_brands;

CREATE POLICY "Manage services write service_brands"
  ON public.service_brands FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.user_custom_roles ucr ON ucr.profile_id = p.id
      JOIN public.custom_roles cr ON cr.id = ucr.role_id
      WHERE p.auth_user_id = (SELECT auth.uid())
        AND (cr.is_system = true OR 'master_data.services.manage' = ANY(cr.permissions))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.user_custom_roles ucr ON ucr.profile_id = p.id
      JOIN public.custom_roles cr ON cr.id = ucr.role_id
      WHERE p.auth_user_id = (SELECT auth.uid())
        AND (cr.is_system = true OR 'master_data.services.manage' = ANY(cr.permissions))
    )
  );

------------------------------------------------------------------------------
-- traccar_geofences ---------------------------------------------------------
------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can read geofences"   ON public.traccar_geofences;
DROP POLICY IF EXISTS "Authenticated users can insert geofences" ON public.traccar_geofences;
DROP POLICY IF EXISTS "Authenticated users can update geofences" ON public.traccar_geofences;
DROP POLICY IF EXISTS "Authenticated users can delete geofences" ON public.traccar_geofences;

CREATE POLICY "Authenticated users can read geofences"
  ON public.traccar_geofences FOR SELECT
  USING ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "Authenticated users can insert geofences"
  ON public.traccar_geofences FOR INSERT
  WITH CHECK ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "Authenticated users can update geofences"
  ON public.traccar_geofences FOR UPDATE
  USING ((SELECT auth.role()) = 'authenticated');

CREATE POLICY "Authenticated users can delete geofences"
  ON public.traccar_geofences FOR DELETE
  USING ((SELECT auth.role()) = 'authenticated');

------------------------------------------------------------------------------
-- user_ui_preferences -------------------------------------------------------
------------------------------------------------------------------------------
DROP POLICY IF EXISTS user_ui_preferences_self_select ON public.user_ui_preferences;
DROP POLICY IF EXISTS user_ui_preferences_self_upsert ON public.user_ui_preferences;
DROP POLICY IF EXISTS user_ui_preferences_self_update ON public.user_ui_preferences;

CREATE POLICY user_ui_preferences_self_select
  ON public.user_ui_preferences FOR SELECT
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY user_ui_preferences_self_upsert
  ON public.user_ui_preferences FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY user_ui_preferences_self_update
  ON public.user_ui_preferences FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

------------------------------------------------------------------------------
-- service_change_requests ---------------------------------------------------
------------------------------------------------------------------------------
DROP POLICY IF EXISTS scr_select ON public.service_change_requests;

CREATE POLICY scr_select
  ON public.service_change_requests FOR SELECT TO authenticated
  USING (
    requested_by = (SELECT id FROM public.profiles WHERE auth_user_id = (SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.user_custom_roles ucr
      JOIN public.custom_roles cr ON cr.id = ucr.role_id
      WHERE ucr.profile_id = (SELECT id FROM public.profiles WHERE auth_user_id = (SELECT auth.uid()))
        AND cr.deleted_at IS NULL
        AND (cr.is_system = true OR 'master_data.services.approve' = ANY(cr.permissions))
    )
  );

------------------------------------------------------------------------------
-- purge_batches -------------------------------------------------------------
------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins read purge batches" ON public.purge_batches;

CREATE POLICY "Admins read purge batches"
  ON public.purge_batches FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_custom_roles ur
      JOIN public.custom_roles cr ON cr.id = ur.role_id
      WHERE ur.profile_id = (SELECT auth.uid())
        AND 'contact_centre.admin.purge' = ANY(cr.permissions)
    )
  );

------------------------------------------------------------------------------
-- team_live_locations -------------------------------------------------------
------------------------------------------------------------------------------
DROP POLICY IF EXISTS tll_insert ON public.team_live_locations;
DROP POLICY IF EXISTS tll_update ON public.team_live_locations;

CREATE POLICY tll_insert
  ON public.team_live_locations FOR INSERT TO authenticated
  WITH CHECK (
    team_id = (
      SELECT t.id FROM public.teams t
      JOIN public.employees e ON e.id = t.leader_id
      JOIN public.profiles p ON p.id = e.profile_id
      WHERE p.auth_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY tll_update
  ON public.team_live_locations FOR UPDATE TO authenticated
  USING (
    team_id = (
      SELECT t.id FROM public.teams t
      JOIN public.employees e ON e.id = t.leader_id
      JOIN public.profiles p ON p.id = e.profile_id
      WHERE p.auth_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    team_id = (
      SELECT t.id FROM public.teams t
      JOIN public.employees e ON e.id = t.leader_id
      JOIN public.profiles p ON p.id = e.profile_id
      WHERE p.auth_user_id = (SELECT auth.uid())
    )
  );

------------------------------------------------------------------------------
-- chat_messages -------------------------------------------------------------
------------------------------------------------------------------------------
DROP POLICY IF EXISTS chat_messages_insert_strict ON public.chat_messages;

CREATE POLICY chat_messages_insert_strict
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_conversations cc
      WHERE cc.id = chat_messages.conversation_id
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.user_custom_roles ur ON ur.profile_id = p.id
      JOIN public.custom_roles cr ON cr.id = ur.role_id
      WHERE p.auth_user_id = (SELECT auth.uid())
        AND 'contact_centre.view' = ANY(cr.permissions)
    )
  );

------------------------------------------------------------------------------
-- follow_up_requests --------------------------------------------------------
------------------------------------------------------------------------------
DROP POLICY IF EXISTS fur_insert ON public.follow_up_requests;

CREATE POLICY fur_insert
  ON public.follow_up_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by_user_id = (SELECT auth.uid()));
