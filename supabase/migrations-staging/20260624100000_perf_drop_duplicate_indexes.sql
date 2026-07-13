-- Wave 1 of the Supabase performance cleanup.
--
-- Supabase's linter flagged two pairs of identical indexes. Identical indexes
-- waste write throughput (every INSERT/UPDATE must update both) and disk space
-- without giving the planner any new option. We drop one of each pair, keeping
-- the more descriptive `idx_<table>_<col>` name.
--
-- Source: lint 0009_duplicate_index
--   * chat_messages: chat_messages_conv_created_idx ≡ idx_chat_messages_conversation_created
--   * team_schedule_assignments: idx_tsa_team ≡ idx_team_sched_team_id

DROP INDEX IF EXISTS public.chat_messages_conv_created_idx;
DROP INDEX IF EXISTS public.idx_tsa_team;
