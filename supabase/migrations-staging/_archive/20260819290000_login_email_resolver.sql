-- Login email resolver — decouple sign-in from the email domain (Option ii).
--
-- Was: both user creation and login hardcoded the synthetic domain '@mms.local'
-- (login appended it to a bare username). Moving new users onto a real,
-- DB-driven company domain (username@<company>.com) would have locked out every
-- existing @mms.local user, because login appends ONE fixed domain that must
-- match the stored auth email.
--
-- Fix: login stops constructing the email and instead resolves the username to
-- the user's ACTUAL stored email via this function, then signs in with it. That
-- is domain-agnostic and backward-compatible — old @mms.local users and new
-- @<company>.com users both authenticate, and the domain can change freely.
--
-- The function is anon-callable (login is pre-auth) and SECURITY DEFINER so it
-- can read user_data (which anon cannot). It returns ONLY the email string and
-- nothing else. It accepts either a bare username (the local part before '@')
-- or a full email, preferring an exact email match. Trade-off: like any
-- username→email resolver it reveals whether a username exists (account
-- enumeration) — acceptable for an internal ERP login; revisit with rate
-- limiting if this ever faces the public internet.

CREATE OR REPLACE FUNCTION public.resolve_login_email(p_username text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT ud.email
  FROM   public.user_data ud
  WHERE  ud.is_active = true
    AND  ud.email IS NOT NULL
    AND  (
           lower(ud.email) = lower(btrim(p_username))                        -- typed a full email
        OR lower(split_part(ud.email, '@', 1)) = lower(btrim(p_username))     -- typed just the username
    )
  ORDER BY (lower(ud.email) = lower(btrim(p_username))) DESC                  -- prefer an exact-email hit
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.resolve_login_email(text) IS
'Anon-callable login helper: resolves a bare username (email local-part) or a '
'full email to the user''s actual stored user_data.email, so sign-in never has '
'to guess the domain. Returns only the email; NULL when no active user matches.';

REVOKE ALL ON FUNCTION public.resolve_login_email(text) FROM public;
GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
