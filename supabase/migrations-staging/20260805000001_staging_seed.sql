-- ============================================================
-- MMS Staging Seed (regenerated from live staging DB)
-- Generated: 2026-08-05 via pg_dump --data-only against mwvblpgbgxipvrevkeff
-- ============================================================
-- Contents:
--   - country_codes, currencies (reference)
--   - custom_roles (system + admin roles)
--   - payment_methods, reason_list_categories, reason_lists (reference)
--   - companies (demo), company_divisions (demo)
--   - storage.buckets (bucket definitions matching baseline storage policies)
--
-- User accounts (public.user_data, auth.users, user_custom_roles) are NOT
-- seeded — the very first auth user is auto-bootstrapped as Admin by the
-- public.bootstrap_first_user() trigger defined in the baseline.
--
-- Business data (brands, inventory_categories, warehouses, sale/PO/receival/
-- bill records, etc.) is NOT seeded — that's created per-deployment by the
-- operator during onboarding.
-- ============================================================

BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: currencies; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) VALUES ('8303b4de-26a4-40ef-b5da-bd1e2ef06f62', 'QAR', 'Qatari Riyal', 'ر.ق', true, 1, '2026-07-13 10:38:47.916595+00', '2026-07-13 10:38:47.916595+00');
INSERT INTO public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) VALUES ('e199acab-d9a6-47ba-a6e0-94d2ad835146', 'SAR', 'Saudi Riyal', 'ر.س', true, 2, '2026-07-13 10:38:47.916595+00', '2026-07-13 10:38:47.916595+00');
INSERT INTO public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) VALUES ('bf000ab9-e2a5-472a-aca9-5d8b5e61c78e', 'AED', 'UAE Dirham', 'د.إ', true, 3, '2026-07-13 10:38:47.916595+00', '2026-07-13 10:38:47.916595+00');
INSERT INTO public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) VALUES ('f80da638-7883-41ac-92cf-1d83ee98f548', 'BHD', 'Bahraini Dinar', '.د.ب', true, 4, '2026-07-13 10:38:47.916595+00', '2026-07-13 10:38:47.916595+00');
INSERT INTO public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) VALUES ('9148b8eb-df49-4e43-a4f7-26ab9a581555', 'OMR', 'Omani Rial', 'ر.ع', true, 5, '2026-07-13 10:38:47.916595+00', '2026-07-13 10:38:47.916595+00');
INSERT INTO public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) VALUES ('8aa23cf9-0744-4835-9962-2ea70ba2b0e3', 'KWD', 'Kuwaiti Dinar', 'د.ك', true, 6, '2026-07-13 10:38:47.916595+00', '2026-07-13 10:38:47.916595+00');
INSERT INTO public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) VALUES ('f62eed1f-86e6-4879-a0eb-44e434708455', 'USD', 'US Dollar', '$', true, 10, '2026-07-13 10:38:47.916595+00', '2026-07-13 10:38:47.916595+00');
INSERT INTO public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) VALUES ('b6ec472c-bb4b-42e2-a9ed-56e9b4edca66', 'EUR', 'Euro', '€', true, 11, '2026-07-13 10:38:47.916595+00', '2026-07-13 10:38:47.916595+00');
INSERT INTO public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) VALUES ('485da7fa-24ee-4f60-9f8e-29fd64f2a05e', 'GBP', 'British Pound', '£', true, 12, '2026-07-13 10:38:47.916595+00', '2026-07-13 10:38:47.916595+00');
INSERT INTO public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) VALUES ('0bf95e0d-f969-4727-a846-bd79de270a74', 'INR', 'Indian Rupee', '₹', true, 13, '2026-07-13 10:38:47.916595+00', '2026-07-13 10:38:47.916595+00');
INSERT INTO public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) VALUES ('aa04cb4d-d06b-45f6-83ae-ac18642f8456', 'PKR', 'Pakistani Rupee', 'Rs', true, 14, '2026-07-13 10:38:47.916595+00', '2026-07-13 10:38:47.916595+00');
INSERT INTO public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) VALUES ('573e9601-d0bb-4bb4-85d8-f43b1623ff8b', 'CNY', 'Chinese Yuan', '¥', true, 15, '2026-07-13 10:38:47.916595+00', '2026-07-13 10:38:47.916595+00');
INSERT INTO public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) VALUES ('81bd993c-0632-43bd-a024-c067b416a6b2', 'JPY', 'Japanese Yen', '¥', true, 16, '2026-07-13 10:38:47.916595+00', '2026-07-13 10:38:47.916595+00');
INSERT INTO public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) VALUES ('3051f2aa-6fcb-4cf9-93d4-110fb23d408d', 'KRW', 'South Korean Won', '₩', true, 17, '2026-07-13 10:38:47.916595+00', '2026-07-13 10:38:47.916595+00');
INSERT INTO public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) VALUES ('b1b298aa-b243-4e39-b87a-f44b1349cf8b', 'TRY', 'Turkish Lira', '₺', true, 18, '2026-07-13 10:38:47.916595+00', '2026-07-13 10:38:47.916595+00');
INSERT INTO public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) VALUES ('c5fb2f6e-defc-4ea1-8037-b417db01cf14', 'EGP', 'Egyptian Pound', 'E£', true, 19, '2026-07-13 10:38:47.916595+00', '2026-07-13 10:38:47.916595+00');
INSERT INTO public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) VALUES ('c01b012b-c707-4e00-a727-bbb31134dd2a', 'BDT', 'Bangladeshi Taka', '৳', true, 20, '2026-07-13 10:38:47.916595+00', '2026-07-13 10:38:47.916595+00');
INSERT INTO public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) VALUES ('9d6a398e-7526-48b5-9aaa-fcf230fc512e', 'LKR', 'Sri Lankan Rupee', 'Rs', true, 21, '2026-07-13 10:38:47.916595+00', '2026-07-13 10:38:47.916595+00');
INSERT INTO public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) VALUES ('dbd87abb-4bde-4b74-a54b-1f1fc7e92188', 'PHP', 'Philippine Peso', '₱', true, 22, '2026-07-13 10:38:47.916595+00', '2026-07-13 10:38:47.916595+00');
INSERT INTO public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) VALUES ('75685165-cf65-4ae7-89c7-b02d62fc67bb', 'MYR', 'Malaysian Ringgit', 'RM', true, 23, '2026-07-13 10:38:47.916595+00', '2026-07-13 10:38:47.916595+00');
INSERT INTO public.currencies (id, code, name, symbol, is_active, sort_order, created_at, updated_at) VALUES ('36be2a06-3f03-4380-b5a2-b4db2f282612', 'SGD', 'Singapore Dollar', 'S$', true, 24, '2026-07-13 10:38:47.916595+00', '2026-07-13 10:38:47.916595+00');


--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.companies (id, name_en, name_ar, cr_number, vat_id, default_currency, default_tax_rate, logo_url, address_en, address_ar, is_active, created_at, updated_at, created_by, stamp_url, footer_motto, currency_id) VALUES ('58999c7e-e4f0-4572-85f9-f8194b1afeb4', 'Alfaytri', NULL, NULL, NULL, 'QAR', 0, 'https://mwvblpgbgxipvrevkeff.supabase.co/storage/v1/object/public/division-assets/company-41862919-2e28-4659-bb9e-e1353352d991-AlFaytri_logoTRANSPARENT.png', NULL, NULL, true, '2026-07-22 19:55:49.426641+00', '2026-08-04 21:14:40.904891+00', NULL, NULL, NULL, '8303b4de-26a4-40ef-b5da-bd1e2ef06f62');


--
-- Data for Name: company_divisions; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.company_divisions (id, slug, name, short_name, color, css_classes, company_name_en, company_name_ar, address_en, address_ar, logo_url, stamp_url, is_active, sort_order, created_at, updated_at, created_by, footer_motto, default_currency, default_tax_rate, company_id, name_ar, address, currency_id) VALUES ('41f9e62c-defb-474d-9e55-05f64cc2776b', 'Alfaytri-Maintenance', 'Maintenance', 'AFM', '#f97316', NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, 0, '2026-07-22 19:56:12.017966+00', '2026-07-26 08:07:37.067085+00', NULL, NULL, 'QAR', 0, '58999c7e-e4f0-4572-85f9-f8194b1afeb4', NULL, NULL, '8303b4de-26a4-40ef-b5da-bd1e2ef06f62');
INSERT INTO public.company_divisions (id, slug, name, short_name, color, css_classes, company_name_en, company_name_ar, address_en, address_ar, logo_url, stamp_url, is_active, sort_order, created_at, updated_at, created_by, footer_motto, default_currency, default_tax_rate, company_id, name_ar, address, currency_id) VALUES ('0d30eb9d-c723-4116-b36b-942c08c7276e', 'Alfaytri-Kitchen', 'Kitchen', 'AFK', '#f59e0b', NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, 0, '2026-07-30 08:54:51.147003+00', '2026-07-30 08:54:51.147003+00', NULL, NULL, 'QAR', 0, '58999c7e-e4f0-4572-85f9-f8194b1afeb4', NULL, NULL, '8303b4de-26a4-40ef-b5da-bd1e2ef06f62');


--
-- Data for Name: country_codes; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (2, '+974', 'QA', '🇶🇦', 'Qatar', true, 1);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (3, '+966', 'SA', '🇸🇦', 'Saudi Arabia', true, 2);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (4, '+971', 'AE', '🇦🇪', 'United Arab Emirates', true, 3);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (5, '+973', 'BH', '🇧🇭', 'Bahrain', true, 4);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (6, '+968', 'OM', '🇴🇲', 'Oman', true, 5);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (7, '+965', 'KW', '🇰🇼', 'Kuwait', true, 6);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (8, '+91', 'IN', '🇮🇳', 'India', true, 10);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (9, '+92', 'PK', '🇵🇰', 'Pakistan', true, 11);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (10, '+94', 'LK', '🇱🇰', 'Sri Lanka', true, 12);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (11, '+977', 'NP', '🇳🇵', 'Nepal', true, 13);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (12, '+880', 'BD', '🇧🇩', 'Bangladesh', true, 14);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (13, '+63', 'PH', '🇵🇭', 'Philippines', true, 15);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (14, '+20', 'EG', '🇪🇬', 'Egypt', true, 20);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (15, '+962', 'JO', '🇯🇴', 'Jordan', true, 21);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (16, '+961', 'LB', '🇱🇧', 'Lebanon', true, 22);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (17, '+964', 'IQ', '🇮🇶', 'Iraq', true, 23);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (18, '+90', 'TR', '🇹🇷', 'Turkey', true, 24);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (19, '+98', 'IR', '🇮🇷', 'Iran', true, 25);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (20, '+44', 'GB', '🇬🇧', 'United Kingdom', true, 30);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (21, '+1', 'US', '🇺🇸', 'United States', true, 31);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (22, '+86', 'CN', '🇨🇳', 'China', true, 32);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (23, '+81', 'JP', '🇯🇵', 'Japan', true, 33);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (24, '+82', 'KR', '🇰🇷', 'South Korea', true, 34);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (25, '+60', 'MY', '🇲🇾', 'Malaysia', true, 35);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (26, '+65', 'SG', '🇸🇬', 'Singapore', true, 36);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (27, '+62', 'ID', '🇮🇩', 'Indonesia', true, 37);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (28, '+49', 'DE', '🇩🇪', 'Germany', true, 38);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (29, '+33', 'FR', '🇫🇷', 'France', true, 39);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (30, '+39', 'IT', '🇮🇹', 'Italy', true, 40);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (31, '+27', 'ZA', '🇿🇦', 'South Africa', true, 41);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (32, '+254', 'KE', '🇰🇪', 'Kenya', true, 42);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (33, '+234', 'NG', '🇳🇬', 'Nigeria', true, 43);
INSERT INTO public.country_codes (id, code, iso, flag, name, is_active, sort_order) VALUES (34, '+55', 'BR', '🇧🇷', 'Brazil', true, 44);


--
-- Data for Name: custom_roles; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.custom_roles (id, name, color, permissions, is_system_admin, created_at, updated_at, created_by, deleted_at, is_approval_slot, is_inventory_receiver) VALUES ('6f1cc096-c162-4882-a782-7643eb94f8f3', 'Warehouse Manager', 'bg-teal-500/15 text-teal-700 border-teal-500/30', '{}', false, '2026-07-13 10:38:44.537697+00', '2026-07-23 18:04:32.587936+00', NULL, NULL, true, false);
INSERT INTO public.custom_roles (id, name, color, permissions, is_system_admin, created_at, updated_at, created_by, deleted_at, is_approval_slot, is_inventory_receiver) VALUES ('3e136807-607d-4280-a2db-3ec40e9016c2', 'Owner', 'bg-rose-500/15 text-rose-600 border-rose-500/30', '{master_data.access,master_data.inventory.view,master_data.inventory.manage,warehouse.access,purchase.warehouses.view,purchase.warehouses.manage,warehouse.warehouses.view,warehouse.settings.manage,warehouse.responsible_person,warehouse.stock.view,warehouse.transfers.view,warehouse.transfer.create,warehouse.transfer.dispatch,warehouse.transfer.receive,warehouse.transfer.approve,warehouse.adjustments.view,warehouse.adjustment.request,warehouse.checks.view,warehouse.check.count,warehouse.check.create,warehouse.stock_value.view,warehouse.movements.view,warehouse.receivals.view,master_data.users.view,master_data.users.manage,master_data.roles.view,master_data.roles.manage,master_data.audit.view,master_data.admin.view,master_data.admin.manage,master_data.companies.view,master_data.companies.manage,master_data.divisions.view,master_data.divisions.manage,master_data.warehouses.view,master_data.warehouses.manage,master_data.services.view,master_data.services.manage,master_data.services.approve,master_data.service_customers.view,master_data.service_customers.manage,master_data.subscriptions.view,master_data.subscriptions.manage,purchase_sales.access,master_data.suppliers.view,master_data.suppliers.manage,master_data.customers.view,master_data.customers.manage,master_data.customers.change_credit_group,master_data.customers.change_type,purchase.orders.view,purchase.orders.manage,purchase.approvals.view,purchase.approvals.chain.manage,purchase.approvals.bypass,purchase.receivals.view,purchase.receivals.manage,purchase.bills.view,purchase.bills.manage,purchase.returns.view,purchase.returns.manage,purchase.debit_notes.view,sales.orders.view,sales.orders.manage,sales.approvals.view,sales.approvals.manage,sales.invoices.view,sales.invoices.manage,sales.returns.view,sales.returns.manage,sales.deliveries.view,sales.deliveries.manage,sales.credit_notes.view,sales.credit_notes.manage,purchase.shipments.view,purchase.shipments.manage,purchase.landed_costs.view,purchase.landed_costs.manage,purchase.dead_stock.view,reports.access,reports.view,reports.manage,reports.dashboard_finance,system.admin,system.import,system.export}', true, '2026-07-13 10:38:44.537697+00', '2026-07-26 11:26:13.358581+00', NULL, NULL, true, true);
INSERT INTO public.custom_roles (id, name, color, permissions, is_system_admin, created_at, updated_at, created_by, deleted_at, is_approval_slot, is_inventory_receiver) VALUES ('c896d7ab-1e93-4c4d-9f3d-2f7d299a2958', 'Brand Manager', 'bg-purple-500/15 text-purple-700 border-purple-500/30', '{master_data.access,master_data.inventory.create,master_data.inventory.manage,master_data.inventory.view,purchase.warehouses.create,purchase.warehouses.manage,purchase.warehouses.view,warehouse.access,warehouse.adjustment.request,warehouse.adjustments.view,warehouse.check.count,warehouse.check.create,warehouse.checks.view,warehouse.settings.create,warehouse.settings.manage,warehouse.stock.view,warehouse.warehouses.view}', false, '2026-07-13 10:38:44.537697+00', '2026-08-04 08:58:39.770678+00', NULL, NULL, true, false);
INSERT INTO public.custom_roles (id, name, color, permissions, is_system_admin, created_at, updated_at, created_by, deleted_at, is_approval_slot, is_inventory_receiver) VALUES ('88eb02d4-ba32-4cc5-9ac8-6d0bbbedc504', 'field_rp', 'bg-blue-500/15 text-blue-700 border-blue-500/30', '{master_data.access,purchase_sales.access,purchase.warehouses.create,purchase.warehouses.manage,purchase.warehouses.view,sales.deliveries.create,sales.deliveries.manage,sales.deliveries.view,sales.invoices.create,sales.invoices.manage,sales.invoices.view,sales.orders.create,sales.orders.manage,sales.orders.view,sales.returns.create,sales.returns.manage,sales.returns.view,warehouse.access,warehouse.adjustments.view,warehouse.check.count,warehouse.checks.view,warehouse.receivals.view,warehouse.settings.create,warehouse.settings.manage,warehouse.stock.view,warehouse.transfer.create,warehouse.transfer.dispatch,warehouse.transfer.receive,warehouse.transfers.view,warehouse.warehouses.view}', false, '2026-07-13 10:38:44.537697+00', '2026-08-04 08:58:39.770678+00', NULL, NULL, true, false);
INSERT INTO public.custom_roles (id, name, color, permissions, is_system_admin, created_at, updated_at, created_by, deleted_at, is_approval_slot, is_inventory_receiver) VALUES ('d0adccb6-36e9-4ae2-b460-4a758919c88d', 'Purchase Manager', 'bg-blue-500/15 text-blue-700 border-blue-500/30', '{master_data.access,master_data.inventory.create,master_data.inventory.manage,master_data.inventory.view,master_data.suppliers.create,master_data.suppliers.manage,master_data.suppliers.view,purchase_sales.access,purchase.approvals.bypass,purchase.approvals.chain.create,purchase.approvals.chain.manage,purchase.approvals.view,purchase.bills.create,purchase.bills.manage,purchase.bills.view,purchase.orders.create,purchase.orders.manage,purchase.orders.view,purchase.receivals.create,purchase.receivals.manage,purchase.receivals.view,purchase.returns.create,purchase.returns.manage,purchase.returns.view,purchase.rfq.create,purchase.rfq.manage,purchase.rfq.view,purchase.warehouses.view,warehouse.access,warehouse.check.count,warehouse.checks.view,warehouse.settings.create,warehouse.settings.manage,warehouse.stock_value.view,warehouse.stock.view,warehouse.warehouses.view}', false, '2026-07-13 10:38:44.537697+00', '2026-08-04 08:58:39.770678+00', NULL, NULL, true, false);
INSERT INTO public.custom_roles (id, name, color, permissions, is_system_admin, created_at, updated_at, created_by, deleted_at, is_approval_slot, is_inventory_receiver) VALUES ('4e849df2-d196-41bd-9eed-50c82478a9f4', 'inventory_manager', 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30', '{master_data.access,master_data.inventory.create,master_data.inventory.manage,master_data.inventory.view,purchase.warehouses.view,warehouse.access,warehouse.adjustment.approve,warehouse.adjustment.request,warehouse.adjustments.view,warehouse.check.approve,warehouse.check.count,warehouse.check.create,warehouse.checks.view,warehouse.receivals.view,warehouse.settings.create,warehouse.settings.manage,warehouse.stock.view,warehouse.transfer.approve,warehouse.transfer.create,warehouse.transfers.view}', false, '2026-07-13 10:38:44.537697+00', '2026-08-04 08:58:39.770678+00', NULL, NULL, true, false);
INSERT INTO public.custom_roles (id, name, color, permissions, is_system_admin, created_at, updated_at, created_by, deleted_at, is_approval_slot, is_inventory_receiver) VALUES ('ad9c5473-f8b8-4cbd-80ec-37e8745cd632', 'Accountant', 'bg-amber-500/15 text-amber-700 border-amber-500/30', '{master_data.access,master_data.customers.change_credit_group,master_data.customers.change_type,master_data.customers.create,master_data.customers.manage,master_data.customers.view,master_data.inventory.create,master_data.inventory.manage,master_data.inventory.view,master_data.suppliers.create,master_data.suppliers.manage,master_data.suppliers.view,purchase_sales.access,purchase.approvals.bypass,purchase.approvals.chain.create,purchase.approvals.chain.manage,purchase.approvals.view,purchase.bills.create,purchase.bills.manage,purchase.bills.view,purchase.dead_stock.view,purchase.debit_notes.view,purchase.landed_costs.create,purchase.landed_costs.manage,purchase.landed_costs.view,purchase.orders.create,purchase.orders.manage,purchase.orders.view,purchase.payments.create,purchase.payments.manage,purchase.payments.view,purchase.receivals.create,purchase.receivals.manage,purchase.receivals.view,purchase.returns.create,purchase.returns.manage,purchase.returns.view,purchase.rfq.create,purchase.rfq.manage,purchase.rfq.view,purchase.shipments.create,purchase.shipments.manage,purchase.shipments.view,purchase.warehouses.create,purchase.warehouses.manage,purchase.warehouses.view,reports.access,reports.create,reports.dashboard_finance,reports.manage,reports.view,sales.approvals.create,sales.approvals.manage,sales.approvals.view,sales.credit_notes.create,sales.credit_notes.manage,sales.credit_notes.view,sales.deliveries.create,sales.deliveries.manage,sales.deliveries.view,sales.invoices.create,sales.invoices.manage,sales.invoices.view,sales.orders.create,sales.orders.manage,sales.orders.view,sales.returns.create,sales.returns.manage,sales.returns.view,warehouse.access,warehouse.adjustment.request,warehouse.adjustments.view,warehouse.check.count,warehouse.check.create,warehouse.checks.view,warehouse.movements.view,warehouse.receivals.view,warehouse.responsible_person,warehouse.settings.create,warehouse.settings.manage,warehouse.stock_value.view,warehouse.stock.view,warehouse.transfer.approve,warehouse.transfer.create,warehouse.transfer.dispatch,warehouse.transfer.receive,warehouse.transfers.view,warehouse.warehouses.view}', false, '2026-07-13 10:38:44.537697+00', '2026-08-04 08:58:39.770678+00', NULL, NULL, true, false);
INSERT INTO public.custom_roles (id, name, color, permissions, is_system_admin, created_at, updated_at, created_by, deleted_at, is_approval_slot, is_inventory_receiver) VALUES ('0fa3824e-2ae2-4aeb-93bb-b6f77d928882', 'Test role', 'bg-primary/15 text-primary border-primary/30', '{master_data.suppliers.create,master_data.suppliers.manage,master_data.suppliers.view,purchase_sales.access}', false, '2026-08-04 08:45:56.074667+00', '2026-08-04 08:58:39.770678+00', NULL, NULL, false, false);


--
-- Data for Name: payment_methods; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.payment_methods (id, name, slug, is_active, sort_order, created_at, requires_payment_link) VALUES ('784992ca-d110-463d-935b-8fb24ee11b18', 'Cash', 'cash', true, 1, '2026-07-13 10:38:44.537697+00', false);
INSERT INTO public.payment_methods (id, name, slug, is_active, sort_order, created_at, requires_payment_link) VALUES ('74ddde7e-a521-42cb-9ad9-00975f1ea21b', 'POS', 'pos', true, 2, '2026-07-13 10:38:44.537697+00', false);
INSERT INTO public.payment_methods (id, name, slug, is_active, sort_order, created_at, requires_payment_link) VALUES ('e93cf796-f863-405e-a15e-b4daf7931ac1', 'online payment', 'online_payment', true, 3, '2026-07-20 08:09:48.196757+00', false);
INSERT INTO public.payment_methods (id, name, slug, is_active, sort_order, created_at, requires_payment_link) VALUES ('81f20676-d9ee-4fa0-b3f6-31db7d062572', 'Bank Transfer', 'bank_transfer', true, 3, '2026-07-26 08:45:43.375884+00', false);
INSERT INTO public.payment_methods (id, name, slug, is_active, sort_order, created_at, requires_payment_link) VALUES ('d3d7a01f-f89a-44f3-ba5e-6f2dd7de3cf5', 'Cheque', 'cheque', true, 4, '2026-07-26 08:45:43.375884+00', false);
INSERT INTO public.payment_methods (id, name, slug, is_active, sort_order, created_at, requires_payment_link) VALUES ('3add2a80-e824-4851-a1cf-603d11451af0', 'Online Transfer', 'online_transfer', true, 5, '2026-07-26 08:45:43.375884+00', false);
INSERT INTO public.payment_methods (id, name, slug, is_active, sort_order, created_at, requires_payment_link) VALUES ('c883a028-4259-435e-a1a6-103fd752f53e', 'Store Credit', 'store_credit', true, 6, '2026-07-26 08:45:43.375884+00', false);


--
-- Data for Name: reason_list_categories; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.reason_list_categories (id, slug, label, sort_order, active, deleted_at, created_at) VALUES ('e958e132-c53f-4cc3-ac8a-640380d75dfe', 'cancellation', 'Cancellation', 10, true, NULL, '2026-07-13 10:38:32.576096+00');
INSERT INTO public.reason_list_categories (id, slug, label, sort_order, active, deleted_at, created_at) VALUES ('cf1c4360-c6e3-4861-b3ec-996066a1ed49', 'return', 'Return', 20, true, NULL, '2026-07-13 10:38:32.576096+00');
INSERT INTO public.reason_list_categories (id, slug, label, sort_order, active, deleted_at, created_at) VALUES ('ba0e7a22-ec0b-40d5-a0c5-a49842a155f0', 'adjustment', 'Adjustment', 30, true, NULL, '2026-07-13 10:38:32.576096+00');
INSERT INTO public.reason_list_categories (id, slug, label, sort_order, active, deleted_at, created_at) VALUES ('fd7d8ef2-a116-4f49-9daa-395539ccfabd', 'credit_note', 'Credit Note', 40, true, NULL, '2026-07-13 10:38:32.576096+00');
INSERT INTO public.reason_list_categories (id, slug, label, sort_order, active, deleted_at, created_at) VALUES ('5cfc859c-321f-4eb6-817f-5132e5eb639a', 'refund', 'Refund', 50, true, NULL, '2026-07-13 10:38:32.576096+00');
INSERT INTO public.reason_list_categories (id, slug, label, sort_order, active, deleted_at, created_at) VALUES ('88773f6b-ab32-4bd3-a1d7-098d39716a47', 'discount', 'Discount', 60, true, NULL, '2026-07-13 10:38:32.576096+00');
INSERT INTO public.reason_list_categories (id, slug, label, sort_order, active, deleted_at, created_at) VALUES ('759c804a-af16-478f-a87a-b2f002e917b3', 'complaint', 'Complaint', 70, true, NULL, '2026-07-13 10:38:32.576096+00');
INSERT INTO public.reason_list_categories (id, slug, label, sort_order, active, deleted_at, created_at) VALUES ('2a49e10b-03c7-4fae-8643-c909abf5e1ad', 'reschedule', 'Reschedule', 80, true, NULL, '2026-07-13 10:38:32.576096+00');
INSERT INTO public.reason_list_categories (id, slug, label, sort_order, active, deleted_at, created_at) VALUES ('6de656a8-603c-41a5-8d1c-08f50115a6c0', 'void', 'Void', 90, true, NULL, '2026-07-13 10:38:32.576096+00');
INSERT INTO public.reason_list_categories (id, slug, label, sort_order, active, deleted_at, created_at) VALUES ('978f31aa-1720-4f1e-8855-f27ce604739a', 'sale_return', 'Sale Return', 25, true, NULL, '2026-07-13 10:38:39.586848+00');
INSERT INTO public.reason_list_categories (id, slug, label, sort_order, active, deleted_at, created_at) VALUES ('d44a5efc-8249-4fc9-81f9-08edb049d583', 'po_return', 'PO Return', 26, true, NULL, '2026-07-13 10:38:39.586848+00');


--
-- Data for Name: reason_lists; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.reason_lists (id, category, label, active, sort_order, created_at, updated_at, created_by, deleted_at, division_ids) VALUES ('46edd1eb-cf06-4720-9be5-705767fedb8f', 'sale_return', 'Defective Product', true, 10, '2026-07-13 10:38:39.586848+00', '2026-07-13 10:38:39.586848+00', NULL, NULL, NULL);
INSERT INTO public.reason_lists (id, category, label, active, sort_order, created_at, updated_at, created_by, deleted_at, division_ids) VALUES ('bf40ed66-bd12-45d9-850f-2e3281ac93cf', 'sale_return', 'Wrong Item Shipped', true, 20, '2026-07-13 10:38:39.586848+00', '2026-07-13 10:38:39.586848+00', NULL, NULL, NULL);
INSERT INTO public.reason_lists (id, category, label, active, sort_order, created_at, updated_at, created_by, deleted_at, division_ids) VALUES ('41fcfbd7-08d6-48e9-93f2-c726622a40c4', 'sale_return', 'Damaged in Transit', true, 30, '2026-07-13 10:38:39.586848+00', '2026-07-13 10:38:39.586848+00', NULL, NULL, NULL);
INSERT INTO public.reason_lists (id, category, label, active, sort_order, created_at, updated_at, created_by, deleted_at, division_ids) VALUES ('415cd21e-bf23-4d98-bb1e-4f1c83f33ff4', 'sale_return', 'Customer Changed Mind', true, 40, '2026-07-13 10:38:39.586848+00', '2026-07-13 10:38:39.586848+00', NULL, NULL, NULL);
INSERT INTO public.reason_lists (id, category, label, active, sort_order, created_at, updated_at, created_by, deleted_at, division_ids) VALUES ('723caa93-78ec-4c78-8841-574af6946240', 'sale_return', 'Not as Described', true, 50, '2026-07-13 10:38:39.586848+00', '2026-07-13 10:38:39.586848+00', NULL, NULL, NULL);
INSERT INTO public.reason_lists (id, category, label, active, sort_order, created_at, updated_at, created_by, deleted_at, division_ids) VALUES ('f45f97b2-5059-4a3d-918f-a65f422c4582', 'sale_return', 'Warranty Claim', true, 60, '2026-07-13 10:38:39.586848+00', '2026-07-13 10:38:39.586848+00', NULL, NULL, NULL);
INSERT INTO public.reason_lists (id, category, label, active, sort_order, created_at, updated_at, created_by, deleted_at, division_ids) VALUES ('ee769248-3937-44ce-8c15-d5998a5e2732', 'sale_return', 'Duplicate Order', true, 70, '2026-07-13 10:38:39.586848+00', '2026-07-13 10:38:39.586848+00', NULL, NULL, NULL);
INSERT INTO public.reason_lists (id, category, label, active, sort_order, created_at, updated_at, created_by, deleted_at, division_ids) VALUES ('86ace4d3-8d3a-42ab-8aed-ef8868131184', 'po_return', 'Defective from Manufacturer', true, 10, '2026-07-13 10:38:39.586848+00', '2026-07-13 10:38:39.586848+00', NULL, NULL, NULL);
INSERT INTO public.reason_lists (id, category, label, active, sort_order, created_at, updated_at, created_by, deleted_at, division_ids) VALUES ('499fed4e-a39f-4700-9233-f915c40a1429', 'po_return', 'Wrong Item Received', true, 20, '2026-07-13 10:38:39.586848+00', '2026-07-13 10:38:39.586848+00', NULL, NULL, NULL);
INSERT INTO public.reason_lists (id, category, label, active, sort_order, created_at, updated_at, created_by, deleted_at, division_ids) VALUES ('a68109cc-8253-4dc1-8e5e-f2e9cdd292aa', 'po_return', 'Damaged in Transit', true, 30, '2026-07-13 10:38:39.586848+00', '2026-07-13 10:38:39.586848+00', NULL, NULL, NULL);
INSERT INTO public.reason_lists (id, category, label, active, sort_order, created_at, updated_at, created_by, deleted_at, division_ids) VALUES ('c05c19e9-b3f7-4e6e-ba01-6e6bbb66033f', 'po_return', 'Quality Issue', true, 40, '2026-07-13 10:38:39.586848+00', '2026-07-13 10:38:39.586848+00', NULL, NULL, NULL);
INSERT INTO public.reason_lists (id, category, label, active, sort_order, created_at, updated_at, created_by, deleted_at, division_ids) VALUES ('ec08f08e-0054-4bca-80ee-33df6235f9ba', 'po_return', 'Specification Mismatch', true, 50, '2026-07-13 10:38:39.586848+00', '2026-07-13 10:38:39.586848+00', NULL, NULL, NULL);
INSERT INTO public.reason_lists (id, category, label, active, sort_order, created_at, updated_at, created_by, deleted_at, division_ids) VALUES ('a86fbdc4-3de5-4c9f-80f9-6bb2efbabdbd', 'po_return', 'Expired Product', true, 60, '2026-07-13 10:38:39.586848+00', '2026-07-13 10:38:39.586848+00', NULL, NULL, NULL);
INSERT INTO public.reason_lists (id, category, label, active, sort_order, created_at, updated_at, created_by, deleted_at, division_ids) VALUES ('54c89177-1f59-449d-a8b7-bb4ac301af22', 'po_return', 'Overshipment', true, 70, '2026-07-13 10:38:39.586848+00', '2026-07-13 10:38:39.586848+00', NULL, NULL, NULL);


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: -
--

INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('receival-receipt-pdfs', 'receival-receipt-pdfs', NULL, '2026-07-06 08:35:42.323215+00', '2026-07-06 08:35:42.323215+00', true, false, 10485760, '{application/pdf}', NULL, 'STANDARD') ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('delivery-note-pdfs', 'delivery-note-pdfs', NULL, '2026-07-06 08:35:42.583236+00', '2026-07-06 08:35:42.583236+00', true, false, 10485760, '{application/pdf}', NULL, 'STANDARD') ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('return-pdfs', 'return-pdfs', NULL, '2026-07-06 08:35:42.848616+00', '2026-07-06 08:35:42.848616+00', true, false, 10485760, '{application/pdf}', NULL, 'STANDARD') ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('booking-confirmations', 'booking-confirmations', NULL, '2026-07-06 08:35:24.190446+00', '2026-07-06 08:35:24.190446+00', true, false, 10485760, '{application/pdf}', NULL, 'STANDARD') ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('quotation-pdfs', 'quotation-pdfs', NULL, '2026-07-06 08:35:30.217362+00', '2026-07-06 08:35:30.217362+00', true, false, 10485760, '{application/pdf}', NULL, 'STANDARD') ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('invoice-pdfs', 'invoice-pdfs', NULL, '2026-07-06 08:35:30.217362+00', '2026-07-06 08:35:30.217362+00', true, false, 10485760, '{application/pdf}', NULL, 'STANDARD') ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('credit-note-pdfs', 'credit-note-pdfs', NULL, '2026-07-06 08:35:30.217362+00', '2026-07-06 08:35:30.217362+00', true, false, 10485760, '{application/pdf}', NULL, 'STANDARD') ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('po-pdfs', 'po-pdfs', NULL, '2026-07-06 08:35:40.197743+00', '2026-07-06 08:35:40.197743+00', true, false, 10485760, '{application/pdf}', NULL, 'STANDARD') ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('receival-check-pdfs', 'receival-check-pdfs', NULL, '2026-07-06 08:35:41.006142+00', '2026-07-06 08:35:41.006142+00', true, false, 10485760, '{application/pdf}', NULL, 'STANDARD') ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('bill-pdfs', 'bill-pdfs', NULL, '2026-07-06 08:35:41.274983+00', '2026-07-06 08:35:41.274983+00', true, false, 10485760, '{application/pdf}', NULL, 'STANDARD') ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('avatars', 'avatars', NULL, '2026-07-13 10:38:50.281318+00', '2026-07-13 10:38:50.281318+00', true, false, 5242880, '{image/jpeg,image/png,image/webp,image/gif}', NULL, 'STANDARD') ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('division-assets', 'division-assets', NULL, '2026-08-04 16:18:09.272467+00', '2026-08-04 16:18:09.272467+00', true, false, 5242880, '{image/jpeg,image/png,image/webp,image/svg+xml}', NULL, 'STANDARD') ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('lc-bills', 'lc-bills', NULL, '2026-08-04 16:18:09.272467+00', '2026-08-04 16:18:09.272467+00', false, false, 10485760, '{image/jpeg,image/png,image/webp,application/pdf}', NULL, 'STANDARD') ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('inventory-item-photos', 'inventory-item-photos', NULL, '2026-08-03 13:02:31.998054+00', '2026-08-03 13:02:31.998054+00', true, false, 10485760, '{image/jpeg,image/png,image/webp}', NULL, 'STANDARD') ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('adjustment-photos', 'adjustment-photos', NULL, '2026-07-26 11:28:19.846654+00', '2026-07-26 11:28:19.846654+00', false, false, 10485760, '{image/jpeg,image/png,image/webp}', NULL, 'STANDARD') ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('consumption-attachments', 'consumption-attachments', NULL, '2026-08-03 11:32:56.516347+00', '2026-08-03 11:32:56.516347+00', false, false, 10485760, '{image/jpeg,image/png,image/webp,application/pdf}', NULL, 'STANDARD') ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id, type) VALUES ('customer-credit-docs', 'customer-credit-docs', NULL, '2026-07-06 08:35:27.353198+00', '2026-07-06 08:35:27.353198+00', false, false, 10485760, '{image/jpeg,image/png,image/webp,application/pdf}', NULL, 'STANDARD') ON CONFLICT (id) DO NOTHING;


--
-- Name: country_codes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.country_codes_id_seq', 34, true);


--
-- PostgreSQL database dump complete
--



COMMIT;

NOTIFY pgrst, 'reload schema';
