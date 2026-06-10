ALTER TABLE call_records
  ADD COLUMN initiated_by UUID REFERENCES profiles(id);

COMMENT ON COLUMN call_records.initiated_by IS
  'Agent who dialed (outbound) or claimed (inbound). NULL if abandoned or never picked up.';
