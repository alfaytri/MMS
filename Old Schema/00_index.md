# Database Schema — Master Index

> **Source**: Live public schema snapshot generated from the database on 2026-03-26  
> **Total public tables documented**: 120

---

## File Index

| File | Module | Tables | Count |
|------|--------|--------|------:|
| [01_core_configuration.md](./01_core_configuration.md) | 1 Core Configuration | `companies`, `divisions`, `app_settings`, `document_terms`, `reason_lists`, `pricing_factors`, `notification_config`, `notification_templates` | 8 |
| [02_users_rbac.md](./02_users_rbac.md) | 2 Users & RBAC | `profiles`, `custom_roles`, `user_custom_roles`, `user_divisions`, `phone_lines_3cx`, `phone_line_permissions_3cx` | 6 |
| [03_customers.md](./03_customers.md) | 3 Customers | `customers`, `customer_phones`, `customer_addresses`, `mep_projects`, `customer_tokens`, `customer_subscriptions`, `credit_categories` | 7 |
| [04_services.md](./04_services.md) | 4 Services | `services`, `service_components`, `service_component_options`, `service_brands`, `brand_service_reliability`, `service_duration_matrix`, `instructions`, `service_instructions`, `service_inventory`, `service_products`, `service_reminder_config`, `service_reminder_optouts`, `reminder_categories`, `reminders`, `brands`, `brand_groups`, `brand_group_members` | 17 |
| [05_teams_employees.md](./05_teams_employees.md) | 5 Teams & Employees | `teams`, `employees`, `employee_services`, `vehicles`, `schedules`, `team_schedule_assignments`, `team_live_locations`, `visit_timeline_events`, `traccar_devices` | 9 |
| [06_promotions.md](./06_promotions.md) | 6 Promotions & Subscriptions | `promotion_campaigns`, `promotion_rules`, `vouchers`, `business_customer_discounts`, `subscription_packages`, `subscription_package_services`, `subscription_usage_log` | 7 |
| [07_inventory_items.md](./07_inventory_items.md) | 7 Inventory Items | `inventory_categories`, `inventory_items`, `inventory_brand_variants`, `inventory_attribute_definitions`, `inventory_item_attributes`, `inventory_warranty_items`, `tool_asset_categories`, `tool_asset_items`, `tool_asset_item_brands`, `tool_asset_units` | 10 |
| [08_orders_contracts_scheduling.md](./08_orders_contracts_scheduling.md) | 8 Orders, Contracts & Scheduling | `orders`, `order_details`, `backwork_line_items`, `follow_up_line_items`, `order_report`, `contracts`, `quotations`, `quotation_line_items`, `quotation_signatures`, `signing_otp_codes`, `visits` | 11 |
| [09_invoices_payments.md](./09_invoices_payments.md) | 9 Invoices & Payments | `invoices`, `invoice_line_items`, `payments`, `payment_sessions`, `credit_notes` | 5 |
| [10_sales.md](./10_sales.md) | 10 Sales | `sale_orders`, `sale_order_lines`, `sale_deliveries`, `returns`, `approval_requests` | 5 |
| [11_purchase.md](./11_purchase.md) | 11 Purchase & Procurement | `purchase_orders`, `po_line_items`, `po_approvals`, `suppliers`, `receivals`, `receival_items`, `shipments`, `landed_costs` | 8 |
| [12_fifo_inventory_movement.md](./12_fifo_inventory_movement.md) | 12 FIFO, Inventory Movement & COGS | `fifo_cost_layers`, `inventory_stock_movements`, `cogs_entries` | 3 |
| [13_warehouse_management.md](./13_warehouse_management.md) | 13 Warehouse Management | `warehouses`, `warehouse_transfers`, `warehouse_manager_log`, `stock_adjustments`, `inventory_checks`, `inventory_check_items` | 6 |
| [14_chats.md](./14_chats.md) | 14 Chats & Contact Center | `chat_conversations`, `chat_messages`, `active_agent_calls`, `cx_call_journal`, `contact_center_tasks`, `agent_resources`, `agent_qa` | 7 |
| [15_quality_control.md](./15_quality_control.md) | 15 Quality Control | `qc_checklists`, `qc_schedule`, `qc_inspection_results`, `qc_team_scores` | 4 |
| [16_audits.md](./16_audits.md) | 16 Audits & Integrations | `activity_log`, `notification_trail`, `sync_state`, `webhook_logs`, `qb_accounts`, `qb_division_mappings`, `qb_items` | 7 |
| [17_legacy_data.md](./17_legacy_data.md) | 17 Legacy Data | — | 0 |

---

## Coverage Check

- Documented tables: **120 / 120**
- Missing tables from docs: **0**
- Extra documented tables not found in DB: **0**

> **Note**: `quotations`, `quotation_line_items` still exist (Phase 3 pending — will be merged into `contracts`). `order_services`, `order_team_assignments`, `contract_visits`, `order_spare_parts`, `order_service_photos` have been dropped and replaced by `order_details`, `visits`, `order_report`, and `invoice_line_items` (spare parts).

---

## Public Enums

- `address_type`: `blue-plate`, `google-coords`
- `approval_role`: `purchase_manager`, `accountant`, `owner`
- `approval_source_type`: `sale_order`, `order`
- `approval_status`: `pending`, `approved`, `rejected`
- `approval_type`: `margin`, `credit`
- `campaign_status`: `active`, `scheduled`, `expired`, `disabled`
- `confirmation_status`: `not_sent`, `sent`, `confirmed`, `no_response`, `manually_confirmed`, `cancel_requested`, `reschedule_requested`
- `contract_status`: `active`, `expiring_soon`, `overdue_payment`, `cancelled`, `completed`
- `contract_type`: `preventive`, `area`, `general`
- `credit_note_status`: `draft`, `approved`, `issued`, `void`
- `deal_type`: `single_order`, `contract`
- `employee_status`: `active`, `vacation`, `archived`, `unassigned`, `on-task`
- `instruction_content_type`: `text`, `pdf`, `image`, `video`
- `instruction_type`: `pre-service`, `post-service`
- `inventory_type`: `products`, `spare-parts`, `consumables`, `tools`
- `invoice_source`: `order`, `contract`, `quotation`
- `invoice_status`: `draft`, `sent`, `partially_paid`, `paid`, `overdue`, `cancelled`, `void`
- `message_source`: `whatsapp`, `whatsapp_api`, `phone`, `sms`, `email`
- `notification_category`: `orders`, `payments`, `contracts`, `service_reminders`, `incidents`, `welcome_messages`
- `notification_channel`: `whatsapp`, `sms`
- `notification_status`: `success`, `failed`
- `notification_trigger`: `system`, `scheduled`, `manual`
- `order_status`: `scheduled`, `confirmed`, `in-progress`, `completed`, `pending-approval`, `cancelled`, `waitlist`, `pending-confirmation`, `tentative`
- `payment_method`: `online`, `pay_later`, `fawran`, `online_transfer`, `cheque`, `bank_transfer`, `cash`, `pos`, `cdc`, `pdc`
- `payment_status`: `completed`, `pending`, `failed`, `refunded`, `processing`
- `po_status`: `draft`, `pending_approval`, `approved`, `partially_received`, `received`, `cancelled`
- `priority_response`: `none`, `24_48hr`, `under_24hr`
- `promotion_rule_type`: `percentage`, `fixed`, `buy_one_get_one`, `buy_x_get_y`, `buy_x_discount_get_y`
- `qc_priority`: `high`, `medium`, `low`
- `qc_schedule_status`: `pending`, `in-progress`, `completed`, `missed`
- `quotation_status`: `draft`, `sent`, `pending_approval`, `approved`, `customer_approved`, `rejected`, `expired`, `converted`, `cancelled`
- `receival_status`: `pending_approval`, `approved`, `rejected`
- `reminder_channel`: `Email`, `SMS`, `WhatsApp`
- `return_source_type`: `sale_order`, `order`
- `return_status`: `pending`, `received`, `restocked`, `closed`
- `sale_delivery_status`: `pending`, `dispatched`, `delivered`
- `sale_order_status`: `quotation`, `pending_approval`, `confirmed`, `partially_delivered`, `delivered`, `invoiced`, `closed`, `cancelled`
- `service_category`: `Repair`, `Installation`, `Maintenance`, `Cleaning`, `Quick Service`
- `service_status`: `active`, `inactive`
- `service_type`: `standard`, `configurable`
- `shipment_mode`: `air`, `sea`, `land`, `manual`
- `shipment_status`: `booked`, `in_transit`, `customs`, `delivered`, `delayed`
- `subscription_status`: `active`, `expired`, `cancelled`, `pending_payment`
- `tl_order_type`: `order`, `site-visit-single`, `site-visit-contract`, `contract`, `backwork`, `follow-up`, `qc`
- `token_purpose`: `address_confirm`, `order_response`, `payment_portal`, `live_tracking`, `service_reminder`, `quotation_signing`, `service_instruction`, `subscription_manage`
- `tool_condition`: `New`, `Good`, `Fair`, `Maintenance`
- `tool_status`: `available`, `assigned`, `maintenance`, `retired`
- `transfer_status`: `pending`, `in_transit`, `pending_approval`, `approved`, `rejected`
- `user_type`: `internal`, `customer`
- `vehicle_type`: `car`, `van`, `truck`, `pickup`, `motorcycle`
- `visit_status`: `scheduled`, `confirmed`, `in_progress`, `completed`, `cancelled`, `no_show`
- `visit_type`: `normal_order`, `emergency_order`, `follow_up`, `backwork`, `site_visit_single`, `site_visit_contract`, `contract_visit`, `quality_control`
- `voucher_type`: `single_use`, `multi_use`, `limited`

---

## Public Functions

- `apply_payment(p_invoice_id uuid, p_amount numeric)` → `TABLE(new_paid numeric, new_status text)`
- `auto_create_team_vehicle_warehouse()` → `trigger` (on `teams` AFTER INSERT)
- `deduct_fifo_layers(p_brand_variant_id uuid, p_warehouse_id uuid, p_qty integer)` → `TABLE(total_cost numeric, qty_deducted integer, weighted_unit_cost numeric)`
- `ensure_one_primary_phone()` → `trigger`
- `generate_customer_number()` → `trigger`
- `get_customer_pending_balance(p_customer_id uuid)` → `numeric`
- `get_customer_primary_phone(_customer_id uuid)` → `text`
- `get_profile_id(_user_id uuid)` → `uuid`
- `get_user_type(_user_id uuid)` → `user_type`
- `has_permission(_user_id uuid, _permission text)` → `boolean`
- `has_role(_user_id uuid, _role text)` → `boolean`
- `is_admin(_user_id uuid)` → `boolean`
- `is_internal(_user_id uuid)` → `boolean`
- `mark_overdue_invoices()` → `integer`
- `process_cx_call_journal()` → `trigger`
- `recalc_average_cost(p_brand_variant_id uuid)` → `numeric`
- `redeem_voucher(_voucher_id uuid)` → `void`
- `set_updated_at()` → `trigger`
- `update_linked_services_count()` → `trigger`
- `update_reserved_qty(p_brand_variant_id uuid, p_qty_change integer)` → `TABLE(new_reserved_qty integer, stock_level numeric)`
- `validate_order_status_transition()` → `trigger`
- `validate_promotion_discount_target()` → `trigger`
- `validate_service_division_fks()` → `trigger`
- `validate_service_inventory_link_type()` → `trigger`
- `validate_traccar_device_type()` → `trigger`
