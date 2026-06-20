-- Add *.access permission keys to existing roles so the new nav-level gates
-- (master_data.access, purchase_sales.access, orders.access, invoices.access,
--  contracts.access, teams.access, reports.access) don't regress any role
-- that already had inner-page permissions.
--
-- Each top-level nav dropdown now requires its module's access key. The
-- inner items still have their own per-page permissions. Without this
-- backfill, every role that previously held only inner-page perms
-- (Field RP, Accountant, Purchase Manager, etc.) would lose dropdown
-- visibility.

BEGIN;

-- ── Master Data dropdown ──────────────────────────────────────────────
-- Includes: Warehouses (warehouse.access), Users & Roles, Audit Trail,
-- Admin, Service Customers, Services, Teams & Employees (teams.view),
-- Subscription Packages.
UPDATE custom_roles
SET    permissions = permissions || ARRAY['master_data.access']
WHERE  deleted_at IS NULL
  AND  NOT ('master_data.access' = ANY(permissions))
  AND  EXISTS (
    SELECT 1 FROM unnest(permissions) p
    WHERE p LIKE 'master_data.%'
       OR p = 'warehouse.access'
       OR p = 'teams.view'
  );

-- ── Purchase & Sales dropdown ─────────────────────────────────────────
-- Includes: Suppliers, Customers (master_data.*), Purchase Orders,
-- Approvals, Shipments, Receivals, Landed Costs, Bills, RFQ, Dead Stock
-- (purchase.*), Sale Orders, Invoices, Returns, Deliveries, Credit Notes
-- (sales.*).
UPDATE custom_roles
SET    permissions = permissions || ARRAY['purchase_sales.access']
WHERE  deleted_at IS NULL
  AND  NOT ('purchase_sales.access' = ANY(permissions))
  AND  EXISTS (
    SELECT 1 FROM unnest(permissions) p
    WHERE p LIKE 'purchase.%'
       OR p LIKE 'sales.%'
       OR p IN (
         'master_data.suppliers.view', 'master_data.suppliers.manage',
         'master_data.customers.view', 'master_data.customers.manage'
       )
  );

-- ── Orders dropdown ───────────────────────────────────────────────────
-- Includes: Orders, Quotations.
UPDATE custom_roles
SET    permissions = permissions || ARRAY['orders.access']
WHERE  deleted_at IS NULL
  AND  NOT ('orders.access' = ANY(permissions))
  AND  EXISTS (
    SELECT 1 FROM unnest(permissions) p
    WHERE p LIKE 'orders.%'
       OR p LIKE 'follow_ups.%'
       OR p LIKE 'quotations.%'
  );

-- ── Invoices dropdown ─────────────────────────────────────────────────
-- Includes: Invoices, Payments.
UPDATE custom_roles
SET    permissions = permissions || ARRAY['invoices.access']
WHERE  deleted_at IS NULL
  AND  NOT ('invoices.access' = ANY(permissions))
  AND  EXISTS (
    SELECT 1 FROM unnest(permissions) p
    WHERE p LIKE 'invoices.%' OR p LIKE 'payments.%'
  );

-- ── Contracts dropdown ────────────────────────────────────────────────
UPDATE custom_roles
SET    permissions = permissions || ARRAY['contracts.access']
WHERE  deleted_at IS NULL
  AND  NOT ('contracts.access' = ANY(permissions))
  AND  EXISTS (
    SELECT 1 FROM unnest(permissions) p WHERE p LIKE 'contracts.%'
  );

-- ── Teams dropdown ────────────────────────────────────────────────────
-- Includes: Map, Calendar, Team Leader.
UPDATE custom_roles
SET    permissions = permissions || ARRAY['teams.access']
WHERE  deleted_at IS NULL
  AND  NOT ('teams.access' = ANY(permissions))
  AND  EXISTS (
    SELECT 1 FROM unnest(permissions) p
    WHERE p LIKE 'teams.%' OR p LIKE 'employees.%' OR p LIKE 'calendar.%'
  );

-- ── Reports dropdown ──────────────────────────────────────────────────
UPDATE custom_roles
SET    permissions = permissions || ARRAY['reports.access']
WHERE  deleted_at IS NULL
  AND  NOT ('reports.access' = ANY(permissions))
  AND  EXISTS (
    SELECT 1 FROM unnest(permissions) p WHERE p LIKE 'reports.%'
  );

COMMIT;
