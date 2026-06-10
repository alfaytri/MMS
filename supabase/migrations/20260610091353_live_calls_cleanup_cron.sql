CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Orphan-ringing cleanup: ringing rows older than 2 minutes are stale.
-- Runs every minute.
SELECT cron.schedule(
  'live_calls_orphan_ringing',
  '* * * * *',
  $$ DELETE FROM live_calls
     WHERE state = 'ringing'
       AND started_at < now() - interval '2 minutes' $$
);

-- Stale-connected cleanup: connected rows older than 4 hours are dropped.
-- Runs every 5 minutes.
SELECT cron.schedule(
  'live_calls_stale_connected',
  '*/5 * * * *',
  $$ DELETE FROM live_calls
     WHERE state = 'connected'
       AND connected_at < now() - interval '4 hours' $$
);
