-- Tree lookups filter by tree_type + parent_id on every tab load.
-- Without this, each tab load does a full table scan as the catalog grows.
CREATE INDEX IF NOT EXISTS idx_services_tree_type_parent
  ON services (tree_type, parent_id);
