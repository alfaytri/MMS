-- Add the 'transfer_shrinkage' stock movement type.
--
-- The standard receive_transfer RPC (and now the custody accept RPC) records the
-- lost-in-transit shortfall as a movement_type='transfer_shrinkage' row, but that
-- label was never added to the stock_movement_type enum — so any short-received
-- transfer would have raised "invalid input value for enum". Latent until now
-- because no transfer had been received short. Idempotent + standalone (the value
-- is not used within this migration's transaction).
alter type public.stock_movement_type add value if not exists 'transfer_shrinkage';
