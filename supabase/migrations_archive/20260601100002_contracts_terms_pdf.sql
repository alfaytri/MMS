-- Add terms_pdf_url column for uploaded T&C PDF documents
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS terms_pdf_url TEXT;
