-- Add 'service_order' to the approval_type enum so the reused Sales approval
-- engine (sale_order_approvals) can carry order-risk approvals. Must be its own
-- migration — a new enum value cannot be USED in the same transaction it is added.
-- (source_type already has 'order'; status/source_type need no change.)
ALTER TYPE public.approval_type ADD VALUE IF NOT EXISTS 'service_order';
