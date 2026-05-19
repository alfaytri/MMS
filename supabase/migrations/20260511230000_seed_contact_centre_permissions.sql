-- Re-seed contact_centre.view for Owner and Call Centre roles.
-- Needed after db reset wiped custom_roles data.
UPDATE public.custom_roles
SET permissions = array_append(permissions, 'contact_centre.view')
WHERE name IN ('Owner', 'Call Centre')
  AND NOT ('contact_centre.view' = ANY(permissions));
