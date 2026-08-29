-- Consumption warranties: extend the warranty source enum. Must be its own
-- migration so the value is committed before any RPC uses it.
ALTER TYPE public.warranty_source_type ADD VALUE IF NOT EXISTS 'consumption';
