BEGIN;

-- ─── SHIPMENTS — tracking columns ───
ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_error     TEXT,
  ADD COLUMN IF NOT EXISTS carrier_code   TEXT,
  ADD COLUMN IF NOT EXISTS is_syncing     BOOLEAN NOT NULL DEFAULT false;

-- ─── RPC: append_shipment_events ───
CREATE OR REPLACE FUNCTION append_shipment_events(
  p_shipment_id  UUID,
  p_events       JSONB,
  p_status_map   JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status  TEXT;
  v_current_weight  NUMERIC;
  v_max_new_weight  NUMERIC   := 0;
  v_best_new_status TEXT      := NULL;
  v_existing_events JSONB;
  v_events_to_add   JSONB     := '[]'::JSONB;
  v_updated_events  JSONB;
  v_event           JSONB;
  v_existing_evt    JSONB;
  v_hash            TEXT;
  v_ts              TEXT;
  v_loc             TEXT;
  v_status          TEXT;
  v_new_weight      NUMERIC;
  v_match_found     BOOLEAN;
  v_supersede_idx   INT;
  i                 INT;
  j                 INT;
BEGIN
  SELECT status, events
  INTO v_current_status, v_existing_events
  FROM shipments
  WHERE id = p_shipment_id;

  IF NOT FOUND THEN RETURN; END IF;
  IF v_existing_events IS NULL THEN v_existing_events := '[]'::JSONB; END IF;

  v_current_weight := COALESCE((p_status_map->>v_current_status)::NUMERIC, 0);

  FOR i IN 0 .. jsonb_array_length(p_events) - 1 LOOP
    v_event         := p_events->i;
    v_hash          := v_event->>'hash';
    v_ts            := v_event->>'normalizedTimestamp';
    v_loc           := v_event->>'location';
    v_status        := v_event->>'status';
    v_match_found   := FALSE;
    v_supersede_idx := -1;

    FOR j IN 0 .. jsonb_array_length(v_existing_events) - 1 LOOP
      v_existing_evt := v_existing_events->j;
      IF (v_existing_evt->>'normalizedTimestamp')::TIMESTAMPTZ = v_ts::TIMESTAMPTZ
         AND v_existing_evt->>'location' = v_loc THEN
        IF v_existing_evt->>'hash' = v_hash THEN
          v_match_found := TRUE;
          EXIT;
        ELSE
          v_supersede_idx := j;
          EXIT;
        END IF;
      END IF;
    END LOOP;

    IF v_match_found THEN CONTINUE; END IF;

    IF v_supersede_idx >= 0 THEN
      v_updated_events := '[]'::JSONB;
      FOR j IN 0 .. jsonb_array_length(v_existing_events) - 1 LOOP
        IF j = v_supersede_idx THEN
          v_updated_events := v_updated_events || jsonb_build_array(v_event);
        ELSE
          v_updated_events := v_updated_events || jsonb_build_array(v_existing_events->j);
        END IF;
      END LOOP;
      v_existing_events := v_updated_events;
    ELSE
      v_events_to_add := v_events_to_add || jsonb_build_array(v_event);
    END IF;

    IF v_status IS NOT NULL AND p_status_map ? v_status THEN
      v_new_weight := (p_status_map->>v_status)::NUMERIC;
      IF v_new_weight > v_max_new_weight THEN
        v_max_new_weight  := v_new_weight;
        v_best_new_status := v_status;
      END IF;
    END IF;
  END LOOP;

  UPDATE shipments
  SET
    events         = v_existing_events || v_events_to_add,
    status         = CASE
                       WHEN v_best_new_status IS NOT NULL
                            AND v_max_new_weight > v_current_weight
                       THEN v_best_new_status::shipment_status
                       ELSE status
                     END,
    last_synced_at = NOW()
  WHERE id = p_shipment_id;
END;
$$;

REVOKE ALL ON FUNCTION append_shipment_events(UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION append_shipment_events(UUID, JSONB, JSONB) TO authenticated;

COMMIT;
