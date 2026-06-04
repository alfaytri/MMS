-- Performance indexes for frequently queried patterns
-- Targets: notification sort, order filters, employee soft-delete, FK gaps

-- Notifications: cover the (profile_id + unread + sort by created_at) pattern
CREATE INDEX IF NOT EXISTS idx_notifications_profile_unread_created
  ON notifications (profile_id, created_at DESC)
  WHERE read_at IS NULL;

-- Orders: composite for the most common filter (status + scheduled_date)
CREATE INDEX IF NOT EXISTS idx_orders_status_scheduled
  ON orders (status, scheduled_date DESC);

-- Orders: past-due-no-invoice filter
CREATE INDEX IF NOT EXISTS idx_orders_uninvoiced
  ON orders (scheduled_date)
  WHERE has_invoice = false AND status NOT IN ('cancelled');

-- Employees: active-only lookup (soft-delete filter used everywhere)
CREATE INDEX IF NOT EXISTS idx_employees_active
  ON employees (team_id, profile_id)
  WHERE deleted_at IS NULL;

-- Service change requests: sort by requested_at (approval queue ordering)
CREATE INDEX IF NOT EXISTS idx_scr_status_requested
  ON service_change_requests (status, requested_at DESC);

-- Missing FK index: service_change_requests.reviewed_by
CREATE INDEX IF NOT EXISTS idx_scr_reviewed_by
  ON service_change_requests (reviewed_by);

-- Missing FK index: order_services.service_id
CREATE INDEX IF NOT EXISTS idx_order_services_service
  ON order_services (service_id);

-- Contracts: agent_name filter (used in contract list)
CREATE INDEX IF NOT EXISTS idx_contracts_agent
  ON contracts (agent_name)
  WHERE agent_name IS NOT NULL;

-- Contracts: composite status + end_date for sorted list views
CREATE INDEX IF NOT EXISTS idx_contracts_status_end
  ON contracts (status, end_date DESC);
