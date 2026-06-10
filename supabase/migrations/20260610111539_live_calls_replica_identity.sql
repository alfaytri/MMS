-- Realtime DELETE events need the full row (including threecx_call_id)
-- to dismiss popups/banners in the client.
ALTER TABLE public.live_calls REPLICA IDENTITY FULL;
