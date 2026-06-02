-- Migration 2: Contract module — new tables, RLS, storage
-- Spec refs: §2.3-2.5, Amendment 2, Issue Fix 3, Issue Fix 4, §18

-- ——— 1. contract_services TABLE ———
CREATE TABLE IF NOT EXISTS contract_services (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id         UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  service_id          UUID REFERENCES services(id),
  building_node_id    TEXT,
  service_name        TEXT NOT NULL,
  service_path        TEXT[] DEFAULT '{}',
  brand_id            UUID REFERENCES brands(id),
  brand_name          TEXT,
  reliability_factor  NUMERIC NOT NULL DEFAULT 1.0,
  condition           TEXT,
  condition_factor    NUMERIC NOT NULL DEFAULT 1.0,
  frequency           TEXT NOT NULL DEFAULT 'monthly',
  quantity            INT NOT NULL DEFAULT 1,
  base_price          NUMERIC NOT NULL DEFAULT 0,
  unit_price          NUMERIC NOT NULL DEFAULT 0,
  total_price         NUMERIC NOT NULL DEFAULT 0,
  divisions           TEXT[] DEFAULT '{}',
  note                TEXT,
  is_general          BOOLEAN NOT NULL DEFAULT false,
  sort_order          INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_services_contract ON contract_services(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_services_node ON contract_services(building_node_id);

-- Amendment 2: Division-scoped RLS for contract_services
ALTER TABLE contract_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Division-scoped read contract_services"
  ON contract_services FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts c
      JOIN profiles p ON p.auth_user_id = auth.uid()
      JOIN user_divisions ud ON ud.profile_id = p.id
      JOIN divisions d ON d.id = ud.division_id
      WHERE c.id = contract_services.contract_id
        AND d.slug = ANY(c.divisions)
    )
  );

CREATE POLICY "Division-scoped write contract_services"
  ON contract_services FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts c
      JOIN profiles p ON p.auth_user_id = auth.uid()
      JOIN user_divisions ud ON ud.profile_id = p.id
      JOIN divisions d ON d.id = ud.division_id
      WHERE c.id = contract_services.contract_id
        AND d.slug = ANY(c.divisions)
    )
  );

-- ——— 2. contract_milestones TABLE ———
CREATE TABLE IF NOT EXISTS contract_milestones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  percentage  NUMERIC NOT NULL DEFAULT 0,
  amount      NUMERIC NOT NULL DEFAULT 0,
  due_date    DATE,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_milestones_contract ON contract_milestones(contract_id);

-- Amendment 2: Division-scoped RLS for contract_milestones
ALTER TABLE contract_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Division-scoped read contract_milestones"
  ON contract_milestones FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts c
      JOIN profiles p ON p.auth_user_id = auth.uid()
      JOIN user_divisions ud ON ud.profile_id = p.id
      JOIN divisions d ON d.id = ud.division_id
      WHERE c.id = contract_milestones.contract_id
        AND d.slug = ANY(c.divisions)
    )
  );

CREATE POLICY "Division-scoped write contract_milestones"
  ON contract_milestones FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts c
      JOIN profiles p ON p.auth_user_id = auth.uid()
      JOIN user_divisions ud ON ud.profile_id = p.id
      JOIN divisions d ON d.id = ud.division_id
      WHERE c.id = contract_milestones.contract_id
        AND d.slug = ANY(c.divisions)
    )
  );

-- ——— 3. service_brands TABLE ———
CREATE TABLE IF NOT EXISTS service_brands (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id          UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  brand_id            UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  reliability_factor  NUMERIC NOT NULL DEFAULT 1.0,
  is_reliable         BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(service_id, brand_id)
);

CREATE INDEX IF NOT EXISTS idx_service_brands_service ON service_brands(service_id);
CREATE INDEX IF NOT EXISTS idx_service_brands_brand ON service_brands(brand_id);

-- Amendment 2: Permissive read, admin-only write for service_brands
ALTER TABLE service_brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read service_brands"
  ON service_brands FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin write service_brands"
  ON service_brands FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN user_custom_roles ucr ON ucr.profile_id = p.id
      JOIN custom_roles cr ON cr.id = ucr.role_id
      WHERE p.auth_user_id = auth.uid()
        AND (cr.is_system = true OR 'master_data.edit' = ANY(cr.permissions))
    )
  );

-- ——— 4. ADD contract_service_id FK TO contract_visits (Issue Fix 3) ———
ALTER TABLE contract_visits
  ADD COLUMN IF NOT EXISTS contract_service_id UUID REFERENCES contract_services(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contract_visits_service ON contract_visits(contract_service_id);

-- ——— 5. STORAGE BUCKET: contract-documents (§18, Issue Fix 4) ———
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contract-documents',
  'contract-documents',
  false,
  10485760,
  ARRAY['application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/png', 'image/jpeg']
) ON CONFLICT (id) DO NOTHING;

-- Issue Fix 4: Permission-scoped storage policies
CREATE POLICY "Authorized upload to contract documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'contract-documents'
  AND EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_custom_roles ucr ON ucr.profile_id = p.id
    JOIN custom_roles cr ON cr.id = ucr.role_id
    WHERE p.auth_user_id = auth.uid()
      AND (cr.is_system = true OR 'contracts.activate' = ANY(cr.permissions))
  )
);

CREATE POLICY "Division-scoped view contract documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'contract-documents'
  AND EXISTS (
    SELECT 1 FROM contracts c
    JOIN profiles p ON p.auth_user_id = auth.uid()
    JOIN user_divisions ud ON ud.profile_id = p.id
    JOIN divisions d ON d.id = ud.division_id
    WHERE c.id::TEXT = (storage.foldername(name))[1]
      AND d.slug = ANY(c.divisions)
  )
);

CREATE POLICY "Admin delete contract documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'contract-documents'
  AND EXISTS (
    SELECT 1 FROM profiles p
    JOIN user_custom_roles ucr ON ucr.profile_id = p.id
    JOIN custom_roles cr ON cr.id = ucr.role_id
    WHERE p.auth_user_id = auth.uid()
      AND (cr.is_system = true OR 'contracts.activate' = ANY(cr.permissions))
  )
);
