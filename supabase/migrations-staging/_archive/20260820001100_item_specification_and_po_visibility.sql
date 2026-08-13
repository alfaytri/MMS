-- Item specification — an Inventory + Purchasing detail, never surfaced in Sales.
--
--   inventory_items.specification            free-text spec details for an item.
--   inventory_items.po_specification_default per-item default for whether the spec
--                                            shows on a PURCHASE ORDER line. Default
--                                            false = hidden; the operator can turn it
--                                            on per line during PO creation.
--   purchase_orders.show_specifications      per-PO master switch (default true). Turn
--                                            off to suppress ALL specs on that PO
--                                            regardless of per-line flags.
--   po_line_items.show_specification         per-line flag (default false), seeded from
--                                            the item's po_specification_default at PO
--                                            creation. The spec prints on the PO PDF only
--                                            when the PO master switch AND this flag are on.
--
-- Sales orders / quotations / invoices / delivery notes never read specification.

alter table public.inventory_items
  add column if not exists specification              text,
  add column if not exists po_specification_default   boolean not null default false;

alter table public.purchase_orders
  add column if not exists show_specifications        boolean not null default true;

alter table public.po_line_items
  add column if not exists show_specification          boolean not null default false;
