-- Allow authenticated users to insert and update country codes
-- (matches the policy pattern already used for currencies and payment_methods).
-- The admin UI relies on these to add new countries and toggle is_active.

CREATE POLICY "Authenticated users can insert country codes"
  ON public.country_codes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update country codes"
  ON public.country_codes FOR UPDATE TO authenticated USING (true);
