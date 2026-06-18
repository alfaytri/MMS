-- Add 'brand_manager' to the approval_role enum so users can be assigned
-- to the Brand Manager step in the stock adjustment approval chain (for
-- damage/write_off adjustments).
--
-- This is in its own migration because Postgres prohibits using a newly
-- added enum value in the same transaction it was created in. The gate
-- function in the next migration references this value.

ALTER TYPE approval_role ADD VALUE IF NOT EXISTS 'brand_manager';
