-- Add a direct per-user toggle for Contact Centre access that is independent
-- of the role-permission system. Mirrors the pattern used for `is_division_manager`.
--
-- Backwards compatibility: anyone whose role currently grants the
-- `contact_centre.view` permission is backfilled to `true` so day-1 behaviour
-- is identical to before this column existed. The gate checks BOTH this flag
-- AND the role permission going forward.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_contact_centre_access boolean NOT NULL DEFAULT false;

-- Backfill from existing role assignments. Idempotent: re-running has no effect
-- because every matching row already has the value we'd set.
UPDATE public.profiles p
SET    has_contact_centre_access = true
WHERE  p.has_contact_centre_access = false
  AND  EXISTS (
    SELECT 1
    FROM   public.user_custom_roles ucr
    JOIN   public.custom_roles cr ON cr.id = ucr.role_id
    WHERE  ucr.profile_id = p.id
      AND  'contact_centre.view' = ANY (cr.permissions)
  );

COMMENT ON COLUMN public.profiles.has_contact_centre_access IS
  'Direct toggle granting Contact Centre access (chats + 3CX calls). Additive to the contact_centre.view role permission — either source is sufficient.';
