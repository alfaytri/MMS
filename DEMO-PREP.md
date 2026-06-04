# MMS Demo Preparation — 4 June 2026

## Quick Stats

| Metric | Count |
|---|---|
| Dashboard pages | 60 |
| Database migrations | 268 |
| Modules | 14 |
| Permissions | 86 across 12 groups |
| Implementation plans completed | 25+ |

---

## Demo Order (Suggested Flow)

### 1. Login & Dashboard
- **URL:** `/` (redirects to login if unauthenticated)
- **What to show:** Login with Supabase Auth, dashboard loads, TopNav with all module dropdowns
- **Highlight:** Role-based nav — non-admin users only see modules they have permission for

---

### 2. Master Data (foundation for everything)
- **Companies** `/master-data/admin/companies` — Multi-company support (Alfaytri, RSH)
- **Divisions** — Each company has divisions (Maintenance, Cleaning, Pest Control)
- **Warehouses** `/purchase/warehouses` — 7-tab hub: stock levels, movements, transfers, adjustments, receivals, deliveries, inventory check
- **Inventory Items** `/master-data/inventory` — Category tree (self-referential parent_id), brand variants, FIFO cost layers
- **Suppliers** `/master-data/suppliers` — Full CRUD, linked to POs
- **Customers** `/master-data/customers` — Legacy customers
- **Service Customers** `/master-data/service-customers` — New model with multi-phone, multi-address, GPS coordinates, Blue Plate integration, blacklist with reason
- **Services** `/master-data/services` — 3-tab tree (Normal / Contract / Mobile), pricing, brands, conditions, service approval workflow with change requests
- **Subscription Packages** `/master-data/subscriptions`
- **Users & Roles** `/master-data/users` — User management, custom roles with 86 granular permissions, Admin role (system-locked)
- **Audit Trail** `/master-data/audit-trail` — Activity log across all modules
- **Admin** `/master-data/admin` — Brand groups, reason lists, approval settings, payment methods, currencies, credit groups

---

### 3. Purchase Module
- **Purchase Orders** `/purchase/orders` — List with stat cards, RFQ/Draft/Confirmed tabs, progress bar table
- **Create PO** `/purchase/create-po` — Sticky header, grouped items, supplier picker, division scope
- **Approvals** `/purchase/approvals` — Configurable approval chains (division-based, cumulative tiers), force-approve for admins
- **Shipments** `/purchase/shipments` — 17track integration, auto-sync tracking events
- **Landed Costs** `/purchase/landed-costs` — FIFO allocation, bill attachment, margin calculation
- **Receivals** `/purchase/receivals` — Receive against PO, edit requests with approval
- **Purchase Payments** `/purchase/payments` — AP payment recording
- **Bills** `/purchase/bills` — Bill management with PDF upload
- **RFQ** `/purchase/rfq` — Request for quotation flow
- **Dead Stock Report** `/purchase/dead-stock` — Slow-moving inventory analysis
- **PO Returns** — Dispatch/cancel/supplier-confirm flow with inventory reversal

---

### 4. Sales Module
- **Sale Orders** `/sales/orders` — Create SO with credit check, division scope
- **Deliveries** `/sales/deliveries` — Delivery management with inventory release
- **Invoices** `/sales/invoices` — Invoice generation from SO
- **Sale Returns** `/sales/returns` — Return with restock option
- **Credit/Debit Notes** `/sales/credit-notes` — Void and credit note workflow

---

### 5. Orders Module (Service Orders)
- **Order List** `/orders` — Chip filters, status badges, order cards
- **Create Order** `/orders/create` — Phone lookup (find/create customer), service selector tree, date picker with team calendar (drag-and-drop), arrival time windows
- **Order Detail** — 4-tab sheet (services, invoice, follow-up, logs), confirm/cancel/rollback actions

---

### 6. Quotations (Service Quotations)
- **Quotation List** `/quotations` — Filter by status
- **Create Quotation** `/quotations/create` — Phone lookup, service tree, discount (flat QAR / %), PDF preview, send via WhatsApp (Wati/WHAPI)

---

### 7. Contracts Module
- **Contract Quotation List** `/contracts/quotations` — Draft/Review/Customer/Approved workflow
- **Create Contract Quotation** `/contracts/create-quotation` — Building tree structure (buildings > floors > areas), services per area, brand/condition pricing, payment schedule (fixed/milestone/completion), frequency options (monthly/quarterly/semi-annual/annual)
- **Contract Detail** `/contracts/detail/[id]` — Workflow progress bar, pricing summary, visit summary, team scheduling (drag-and-drop), terms & conditions PDF upload
- **Live Contracts** `/contracts` — Active contract management

---

### 8. Invoices & Payments (Finance)
- **View Invoices** `/invoices` — Card-based UI, infinite scroll, QB sync flags, void/credit-note
- **View Payments** `/invoices/payments` — Payment records with status
- **Pending Payments** `/invoices/pending-payments` — Server-aggregated customer balances

---

### 9. Teams & Employees
- **Teams** `/master-data/teams` — Company > Division hierarchy, drag-and-drop, team CRUD
- **Team Leader** `/team-leader` — Mobile-first field execution: GPS tracking, 7 order dialog types, photo capture, signature pad, invoice flow, customer escalation

---

### 10. Calendar
- **Operations Calendar** `/calendar` — Team-based weekly/daily views, visit blocks, swap teams, edit visits

---

### 11. Map (Fleet Tracking)
- **Live Map** `/map` — Leaflet with real-time team GPS markers, order location pins, geofences, vehicle history trails, 30s polling

---

### 12. Contact Centre
- **WhatsApp Sidebar** — Always-on sidebar, Wati + WHAPI dual provider toggle
- **Chat** — Real-time messages, templates with named params, emoji reactions, delivery status ticks, media attachments (image/video/audio/document)
- **CRM Panel** — Customer info, addresses, installed products with warranty status, order history
- **Sync** — Full contact sync, webhook for inbound/outbound/status events

---

### 13. Reports
- **Overtime Report** `/reports/overtime`

---

### 14. System
- **CSV Import** `/master-data/import` — 5 entity types bulk import
- **Permissions** — 86 permissions across 12 modules, all configurable via UI
- **Payment Portal** `/pay/[invoiceId]` — Customer-facing, mobile-first, RTL, batch payments via Dibsy

---

## Database Highlights

| Area | Tables / RPCs |
|---|---|
| Core | profiles, companies, divisions, user_divisions, custom_roles, user_custom_roles |
| Inventory | inventory_categories (self-ref tree), inventory_items, brand_variants, fifo_layers, stock_movements |
| Purchase | purchase_orders, po_line_items, po_versions, shipments, shipment_events, landed_costs, lc_allocations, receivals, receival_items, bills |
| Sales | sale_orders, so_line_items, deliveries, delivery_items, invoices, payments, credit_debit_notes |
| Services | services (3 contract types), service_brands, service_photos, service_inventory_links, service_change_requests |
| Orders | orders, order_services, order_visit_dates, order_team_assignments, order_log |
| Contracts | contracts, contract_services, contract_milestones, contract_visits |
| Teams | teams, employees, employee_services, team_activity_log, tool_assignments |
| Contact Centre | chat_conversations, chat_messages (with reactions, delivery_status), service_customers, service_customer_phones, service_customer_addresses, installed_products |
| Finance | tl_invoices, tl_payment_batches, tl_payment_batch_items, payment_methods |
| Config | app_settings, approval_chains, approval_tiers, notification_configs, reason_lists |

---

## Security Architecture

- **Auth:** Supabase Auth with JWT custom claims (user_type, division_ids)
- **RLS:** Every table has Row Level Security enabled
- **Division Isolation:** owner/accountant = super-viewer (all divisions); employees see only their assigned divisions
- **Permissions:** 86 named permissions, all assignable via UI. No hardcoded admin-only gates.
- **Webhooks:** Wati, 17track, Dibsy — each validates its own payload
- **API Routes:** `requireAdmin()` for user management, `requirePermission()` for module-specific gates, `requireAuth()` for general auth

---

## Integrations

| Service | Purpose | Status |
|---|---|---|
| Supabase | Database, Auth, Storage, Realtime | Live |
| Wati | WhatsApp Business API (primary) | Live |
| WHAPI | WhatsApp API (secondary/fallback) | Live |
| Dibsy | Payment gateway (Qatar) | Live |
| 17track | Shipment tracking | Live |
| Traccar | GPS fleet tracking | Live |
| Blue Plate | Qatar addressing system | Live |
| Google Maps / Waze | Navigation links | Live |
