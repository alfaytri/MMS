-- Fix: deleting a custom_role cascades to user_custom_roles instead of blocking.
ALTER TABLE public.user_custom_roles
  DROP CONSTRAINT user_custom_roles_role_id_fkey,
  ADD CONSTRAINT user_custom_roles_role_id_fkey
    FOREIGN KEY (role_id)
    REFERENCES public.custom_roles(id)
    ON DELETE CASCADE;
