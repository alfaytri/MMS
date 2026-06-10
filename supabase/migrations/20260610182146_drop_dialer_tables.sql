-- Drop the dialer + dead phone-line tables.
--
-- Decision: 3CX dialer + agent admin + outbound/inbound popup were ripped out
-- in favor of letting agents use the 3CX softphone directly. The MMS app no
-- longer needs the transient live_calls mirror, the cron cleanup, or the
-- never-wired phone_lines / phone_line_permissions tables.
--
-- Webhook still records calls into chat_messages + call_records — those
-- tables are kept. Only the dialer-side data goes.

-- Unschedule the live_calls cleanup jobs (must run before DROP TABLE
-- otherwise the cron rows reference a missing table).
SELECT cron.unschedule('live_calls_orphan_ringing')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'live_calls_orphan_ringing');
SELECT cron.unschedule('live_calls_stale_connected')  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'live_calls_stale_connected');

DROP TABLE IF EXISTS live_calls;

DROP TABLE IF EXISTS phone_line_permissions_3cx;  -- FK depends on phone_lines_3cx
DROP TABLE IF EXISTS phone_lines_3cx;
