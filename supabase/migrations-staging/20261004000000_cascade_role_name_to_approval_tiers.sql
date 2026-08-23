-- Cascade custom_roles name changes / removals into po_approval_chain_tiers.required_roles.
--
-- Problem: po_approval_chain_tiers.required_roles is a denormalized text[] of role
-- NAMES with no FK to custom_roles. Deleting or renaming a role left its name frozen
-- in every tier that listed it — the name kept showing in the PO Approval Bands UI,
-- could not be removed via the tier editor (no chip renders for a role that no longer
-- exists), and produced an unfulfillable approval step (buildApprovalSteps) that blocks
-- PO submission with "No user assigned to required role".
--
-- Fix: an AFTER trigger on custom_roles that keeps the tier arrays in sync — remove the
-- name on delete (hard or soft), replace it on rename — plus a one-time cleanup of any
-- pre-existing orphans.
--
-- SECURITY DEFINER: data-integrity maintenance trigger with no user input (reads only
-- OLD/NEW), hardened with search_path=''. Definer rights keep the cascade working even
-- if RLS on po_approval_chain_tiers is later tightened.

CREATE OR REPLACE FUNCTION public.sync_role_name_to_approval_tiers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    UPDATE public.po_approval_chain_tiers
       SET required_roles = array_remove(required_roles, OLD.name)
     WHERE OLD.name = ANY(required_roles);
    RETURN OLD;
  END IF;

  -- UPDATE: propagate a rename
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.po_approval_chain_tiers
       SET required_roles = array_replace(required_roles, OLD.name, NEW.name)
     WHERE OLD.name = ANY(required_roles);
  END IF;

  -- UPDATE: treat a soft delete (deleted_at newly set) as a removal
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE public.po_approval_chain_tiers
       SET required_roles = array_remove(required_roles, NEW.name)
     WHERE NEW.name = ANY(required_roles);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_role_name_to_approval_tiers() IS
  'Keeps po_approval_chain_tiers.required_roles (denormalized role-name array) in sync when a custom_roles row is renamed or removed (hard or soft delete).';

DROP TRIGGER IF EXISTS trg_sync_role_name_to_approval_tiers ON public.custom_roles;
CREATE TRIGGER trg_sync_role_name_to_approval_tiers
AFTER UPDATE OF name, deleted_at OR DELETE ON public.custom_roles
FOR EACH ROW
EXECUTE FUNCTION public.sync_role_name_to_approval_tiers();

-- One-time cleanup: strip any names already orphaned (not matching an active role),
-- preserving order. No-op where there are no orphans.
UPDATE public.po_approval_chain_tiers t
   SET required_roles = COALESCE((
         SELECT array_agg(rn ORDER BY ord)
         FROM unnest(t.required_roles) WITH ORDINALITY AS u(rn, ord)
         WHERE rn IN (SELECT name FROM public.custom_roles WHERE deleted_at IS NULL)
       ), '{}'::text[])
 WHERE EXISTS (
   SELECT 1 FROM unnest(t.required_roles) rn
   WHERE rn NOT IN (SELECT name FROM public.custom_roles WHERE deleted_at IS NULL)
 );
