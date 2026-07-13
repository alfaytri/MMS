-- Make carrier optional — auto-detected by 17track from tracking number
ALTER TABLE public.shipments ALTER COLUMN carrier DROP NOT NULL;
ALTER TABLE public.shipments ALTER COLUMN carrier SET DEFAULT NULL;
