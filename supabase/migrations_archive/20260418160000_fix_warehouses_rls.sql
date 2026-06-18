-- Add missing RLS policies for the warehouses table.
-- The table already has RLS enabled but had zero policies (every write denied).

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

-- All authenticated internal users can read warehouses
CREATE POLICY "Internal users can view warehouses"
  ON warehouses FOR SELECT TO authenticated
  USING (true);

-- All authenticated internal users can create warehouses
CREATE POLICY "Internal users can insert warehouses"
  ON warehouses FOR INSERT TO authenticated
  WITH CHECK (true);

-- All authenticated internal users can update warehouses
CREATE POLICY "Internal users can update warehouses"
  ON warehouses FOR UPDATE TO authenticated
  USING (true);

-- All authenticated internal users can delete warehouses
CREATE POLICY "Internal users can delete warehouses"
  ON warehouses FOR DELETE TO authenticated
  USING (true);
