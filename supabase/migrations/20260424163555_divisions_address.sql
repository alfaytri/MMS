-- TEXT (not VARCHAR) to support long multi-line addresses
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS address TEXT;
