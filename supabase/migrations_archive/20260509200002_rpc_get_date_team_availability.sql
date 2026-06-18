-- Returns the count of teams available (not booked) for a given time window
-- per requested date. Used by VisitDateSchedule to disable the "Apply to all"
-- button for dates where zero teams are free.
--
-- Overlap logic: booking [slot_start, slot_start + duration) overlaps [p_from, p_to)
--   when: slot_start < p_to  AND  slot_start + duration > p_from

CREATE OR REPLACE FUNCTION get_date_team_availability(
  p_dates     date[],
  p_from_time time,
  p_to_time   time
)
RETURNS TABLE (
  visit_date            date,
  available_teams_count integer
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH total_teams AS (
    SELECT COUNT(*)::integer AS cnt
    FROM   teams
    WHERE  deleted_at IS NULL
  ),
  booked_teams AS (
    SELECT DISTINCT
      ota.scheduled_date AS visit_date,
      ota.team_id
    FROM   order_team_assignments ota
    WHERE  ota.scheduled_date = ANY(p_dates)
      AND  p_from_time IS NOT NULL
      AND  p_to_time   IS NOT NULL
      -- Cast TEXT duration column to integer minutes for arithmetic
      AND  ota.time_slot::time < p_to_time
      AND  (ota.time_slot::time + (COALESCE(ota.duration::integer, 0) || ' minutes')::interval)::time > p_from_time
  ),
  booked_counts AS (
    SELECT visit_date, COUNT(DISTINCT team_id)::integer AS booked
    FROM   booked_teams
    GROUP  BY visit_date
  )
  SELECT
    d::date                                                                  AS visit_date,
    GREATEST(0, (SELECT cnt FROM total_teams) - COALESCE(bc.booked, 0))     AS available_teams_count
  FROM   UNNEST(p_dates) AS d
  LEFT   JOIN booked_counts bc ON bc.visit_date = d::date
  ORDER  BY visit_date;
$$;
