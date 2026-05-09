-- Normalized visit-date table to replace the flat visit_dates JSONB column on orders.
-- NOTE: The old visit_dates column is NOT dropped here. It is dropped in a separate
-- migration (20260509200010_drop_orders_visit_dates_column.sql) after the new code
-- is confirmed running in production. This prevents "ghost order" breakage on rollback.

CREATE TABLE order_visit_dates (
  id          uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  visit_date  date      NOT NULL,
  from_time   time,
  to_time     time,
  sort_order  smallint  NOT NULL DEFAULT 0,
  UNIQUE (order_id, visit_date)
);

ALTER TABLE order_visit_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_manage_order_visit_dates"
  ON order_visit_dates
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX order_visit_dates_order_id_idx  ON order_visit_dates (order_id);
CREATE INDEX order_visit_dates_visit_date_idx ON order_visit_dates (visit_date);

-- Backfill from orders.visit_dates JSONB (stores ISO date strings e.g. "2026-05-09")
INSERT INTO order_visit_dates (order_id, visit_date, sort_order)
SELECT
  o.id,
  (elem.value #>> '{}')::date,
  (elem.ordinality - 1)::smallint
FROM orders o,
     LATERAL jsonb_array_elements(
       COALESCE(o.visit_dates, '[]'::jsonb)
     ) WITH ORDINALITY AS elem(value, ordinality)
WHERE o.visit_dates IS NOT NULL
  AND jsonb_array_length(o.visit_dates) > 0
ON CONFLICT (order_id, visit_date) DO NOTHING;
