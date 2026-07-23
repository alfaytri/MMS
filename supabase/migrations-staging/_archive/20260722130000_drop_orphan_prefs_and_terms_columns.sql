-- Drop orphan pieces confirmed dead by the schema audit
-- (grep across src/ shows zero code references; only appear in generated types)
--
-- 1. `user_ui_preferences` — Contact Centre 3CX preference table.
--    Only column of interest is `hide_3cx_mobile_note`, a Contact Centre
--    onboarding-dismiss flag. Contact Centre is not in the staging build
--    and this table has zero real consumers in the app.
--
-- 2. `document_terms.content_ar` — `ContractTermsSection` reads only
--    `content_en`; the Arabic content column has never been read.
--
-- 3. `document_terms.created_by` — populated by nothing, read by nothing.

BEGIN;

DROP TABLE IF EXISTS public.user_ui_preferences CASCADE;

ALTER TABLE public.document_terms
  DROP COLUMN IF EXISTS content_ar,
  DROP COLUMN IF EXISTS created_by;

COMMIT;
