-- Add stamp_url and footer_motto to companies table
-- so PDF branding can be configured at the company level
-- (divisions inherit these unless they set their own)

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS stamp_url    text,
  ADD COLUMN IF NOT EXISTS footer_motto text;
