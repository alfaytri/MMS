-- Creates brands, brand_groups, and brand_group_members tables.
-- These existed in the original DB but were missing from migration files.

-- ─── brands ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brands (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  name_ar     TEXT,
  sort_order  INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES profiles(id)
);

CREATE TRIGGER set_brands_updated_at
  BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can read brands"
  ON brands FOR SELECT TO authenticated USING (true);

CREATE POLICY "Internal users can insert brands"
  ON brands FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Internal users can update brands"
  ON brands FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Internal users can delete brands"
  ON brands FOR DELETE TO authenticated USING (true);

-- ─── brand_groups ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brand_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  name_ar     TEXT,
  scope       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES profiles(id),
  deleted_at  TIMESTAMPTZ
);

CREATE TRIGGER set_brand_groups_updated_at
  BEFORE UPDATE ON brand_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE brand_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can view brand groups"
  ON brand_groups FOR SELECT TO authenticated USING (true);

CREATE POLICY "Internal users can insert brand groups"
  ON brand_groups FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Internal users can update brand groups"
  ON brand_groups FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Internal users can delete brand groups"
  ON brand_groups FOR DELETE TO authenticated USING (true);

-- ─── brand_group_members ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brand_group_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES brand_groups(id) ON DELETE CASCADE,
  brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES profiles(id),
  UNIQUE (group_id, brand_id)
);

ALTER TABLE brand_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can view brand group members"
  ON brand_group_members FOR SELECT TO authenticated USING (true);

CREATE POLICY "Internal users can insert brand group members"
  ON brand_group_members FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Internal users can delete brand group members"
  ON brand_group_members FOR DELETE TO authenticated USING (true);
