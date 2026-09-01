-- views — generated from live (staging) catalog 2026-09-02. UNVERIFIED: test-apply before use.
CREATE OR REPLACE VIEW public.credit_group_customer_counts AS
 SELECT credit_group_id,
    count(*)::integer AS customer_count
   FROM customers
  WHERE credit_group_id IS NOT NULL
  GROUP BY credit_group_id;

CREATE OR REPLACE VIEW public.customer_credit_balances AS
 WITH issued AS (
         SELECT cn.customer_id,
            COALESCE(inv_so.currency, ret_so.currency, 'QAR'::text) AS currency,
            cn.id AS credit_note_id,
            sum(cr.qty * COALESCE(sol.unit_price, 0::numeric)) AS credit_amount
           FROM return_line_customer_resolutions cr
             JOIN return_lines rl ON rl.id = cr.return_line_id
             JOIN so_po_returns r_1 ON r_1.id = rl.return_id AND r_1.source_type = 'sale_order'::return_source_type
             JOIN credit_notes cn ON cn.source_return_id = r_1.id
             LEFT JOIN sale_orders ret_so ON ret_so.id = r_1.source_id
             LEFT JOIN sale_order_lines sol ON sol.sale_order_id = r_1.source_id AND sol.brand_variant_id = rl.brand_variant_id
             LEFT JOIN so_invoices inv ON inv.id = cn.invoice_id
             LEFT JOIN sale_orders inv_so ON inv_so.id = inv.sale_order_id
          WHERE cr.resolution_type = 'store_credit'::text AND cn.status <> 'void'::credit_note_status AND cn.customer_id IS NOT NULL
          GROUP BY cn.customer_id, cn.id, inv_so.currency, ret_so.currency
        ), redemptions AS (
         SELECT payments.credit_note_id,
            COALESCE(sum(payments.amount), 0::numeric) AS applied
           FROM payments
          WHERE payments.credit_note_id IS NOT NULL AND payments.direction = 'incoming'::payment_direction AND payments.deleted_at IS NULL
          GROUP BY payments.credit_note_id
        )
 SELECT i.customer_id,
    i.currency,
    count(*) AS open_count,
    sum(i.credit_amount - COALESCE(r.applied, 0::numeric)) AS open_amount
   FROM issued i
     LEFT JOIN redemptions r ON r.credit_note_id = i.credit_note_id
  WHERE (i.credit_amount - COALESCE(r.applied, 0::numeric)) > 0::numeric
  GROUP BY i.customer_id, i.currency;

CREATE OR REPLACE VIEW public.customer_credit_summary AS
 SELECT c.id AS customer_id,
    c.name AS customer_name,
    c.name_ar AS customer_name_ar,
        CASE
            WHEN c.credit_group_id IS NULL THEN 'cash'::text
            ELSE 'credit'::text
        END AS customer_type,
    c.block_reason IS NOT NULL AS is_blocked,
    c.credit_group_id,
    cg.name AS credit_group_name,
        CASE
            WHEN c.credit_group_id IS NULL THEN 0::numeric
            ELSE COALESCE(cg.credit_limit, 0::numeric)
        END AS credit_limit,
    customer_credit_used(c.id, NULL::uuid) AS credit_used,
    GREATEST(
        CASE
            WHEN c.credit_group_id IS NULL THEN 0::numeric
            ELSE COALESCE(cg.credit_limit, 0::numeric)
        END - customer_credit_used(c.id, NULL::uuid), 0::numeric) AS credit_available,
        CASE
            WHEN COALESCE(
            CASE
                WHEN c.credit_group_id IS NULL THEN 0::numeric
                ELSE COALESCE(cg.credit_limit, 0::numeric)
            END, 0::numeric) = 0::numeric THEN NULL::numeric
            ELSE LEAST(round(customer_credit_used(c.id, NULL::uuid) / NULLIF(
            CASE
                WHEN c.credit_group_id IS NULL THEN 0::numeric
                ELSE COALESCE(cg.credit_limit, 0::numeric)
            END, 0::numeric) * 100::numeric, 1), 100::numeric)
        END AS credit_utilization_pct
   FROM customers c
     LEFT JOIN credit_groups cg ON cg.id = c.credit_group_id;

CREATE OR REPLACE VIEW public.customer_invoices AS
 SELECT id,
    invoice_id,
    customer_id,
    source,
    source_id,
    source_label,
    issued_date,
    due_date,
    status,
    subtotal,
    total_amount,
    paid_amount,
    agent_name,
    notes,
    qb_synced,
    created_at,
    sale_order_id,
    needs_refresh,
    payment_status,
    invoice_type,
    discount_amount,
    discount_label,
    division_id
   FROM so_invoices;

CREATE OR REPLACE VIEW public.customer_open_credit_notes AS
 WITH issued AS (
         SELECT cn.id AS credit_note_pk,
            cn.credit_note_id AS credit_note_number,
            cn.status,
            cn.created_at,
            COALESCE(inv_so.customer_id, ret_so.customer_id) AS customer_id,
            COALESCE(inv_so.currency, ret_so.currency, 'QAR'::text) AS currency,
            COALESCE(inv_so.so_number, ret_so.so_number) AS so_number,
            inv.invoice_id AS invoice_number,
            r_1.return_number,
            sum(cr.qty * COALESCE(sol.unit_price, 0::numeric)) AS credit_amount
           FROM return_line_customer_resolutions cr
             JOIN return_lines rl ON rl.id = cr.return_line_id
             JOIN so_po_returns r_1 ON r_1.id = rl.return_id AND r_1.source_type = 'sale_order'::return_source_type
             JOIN credit_notes cn ON cn.source_return_id = r_1.id
             LEFT JOIN sale_orders ret_so ON ret_so.id = r_1.source_id
             LEFT JOIN sale_order_lines sol ON sol.sale_order_id = r_1.source_id AND sol.brand_variant_id = rl.brand_variant_id
             LEFT JOIN so_invoices inv ON inv.id = cn.invoice_id
             LEFT JOIN sale_orders inv_so ON inv_so.id = inv.sale_order_id
          WHERE cr.resolution_type = 'store_credit'::text AND cn.status <> 'void'::credit_note_status AND cn.customer_id IS NOT NULL
          GROUP BY cn.id, cn.credit_note_id, cn.status, cn.created_at, inv_so.customer_id, ret_so.customer_id, inv_so.currency, ret_so.currency, inv_so.so_number, ret_so.so_number, inv.invoice_id, r_1.return_number
        ), redemptions AS (
         SELECT payments.credit_note_id,
            COALESCE(sum(payments.amount), 0::numeric) AS applied
           FROM payments
          WHERE payments.credit_note_id IS NOT NULL AND payments.direction = 'incoming'::payment_direction AND payments.deleted_at IS NULL
          GROUP BY payments.credit_note_id
        )
 SELECT i.credit_note_pk AS id,
    i.credit_note_number AS note_number,
    i.customer_id,
    i.currency,
    i.status,
    i.created_at,
    i.so_number,
    i.invoice_number,
    i.return_number,
    i.credit_amount - COALESCE(r.applied, 0::numeric) AS amount_remaining
   FROM issued i
     LEFT JOIN redemptions r ON r.credit_note_id = i.credit_note_pk
  WHERE (i.credit_amount - COALESCE(r.applied, 0::numeric)) > 0::numeric;

CREATE OR REPLACE VIEW public.return_line_progress AS
 WITH cust AS (
         SELECT return_line_customer_resolutions.return_line_id,
            sum(return_line_customer_resolutions.qty) AS sum_qty
           FROM return_line_customer_resolutions
          GROUP BY return_line_customer_resolutions.return_line_id
        ), inv AS (
         SELECT return_line_inventory_dispositions.return_line_id,
            sum(return_line_inventory_dispositions.qty) AS sum_qty
           FROM return_line_inventory_dispositions
          GROUP BY return_line_inventory_dispositions.return_line_id
        ), cust_mix AS (
         SELECT x.return_line_id,
            jsonb_object_agg(x.resolution_type, x.sum_qty) AS by_type
           FROM ( SELECT return_line_customer_resolutions.return_line_id,
                    return_line_customer_resolutions.resolution_type,
                    sum(return_line_customer_resolutions.qty) AS sum_qty
                   FROM return_line_customer_resolutions
                  GROUP BY return_line_customer_resolutions.return_line_id, return_line_customer_resolutions.resolution_type) x
          GROUP BY x.return_line_id
        ), inv_mix AS (
         SELECT x.return_line_id,
            jsonb_object_agg(x.disposition_type, x.sum_qty) AS by_type
           FROM ( SELECT return_line_inventory_dispositions.return_line_id,
                    return_line_inventory_dispositions.disposition_type,
                    sum(return_line_inventory_dispositions.qty) AS sum_qty
                   FROM return_line_inventory_dispositions
                  GROUP BY return_line_inventory_dispositions.return_line_id, return_line_inventory_dispositions.disposition_type) x
          GROUP BY x.return_line_id
        )
 SELECT rl.id AS return_line_id,
    rl.return_id,
    rl.brand_variant_id,
    rl.item_name,
    rl.sku,
    rl.qty AS returned_qty,
    rl.condition,
    COALESCE(cust.sum_qty, 0::numeric) AS customer_resolved_qty,
    GREATEST(0::numeric, rl.qty::numeric - COALESCE(cust.sum_qty, 0::numeric)) AS customer_remaining_qty,
        CASE
            WHEN rl.condition = 'damaged'::text THEN COALESCE(inv.sum_qty, 0::numeric)
            ELSE NULL::numeric
        END AS inventory_resolved_qty,
        CASE
            WHEN rl.condition = 'damaged'::text THEN GREATEST(0::numeric, rl.qty::numeric - COALESCE(inv.sum_qty, 0::numeric))
            ELSE 0::numeric
        END AS inventory_remaining_qty,
    cust_mix.by_type AS customer_resolutions_by_type,
    inv_mix.by_type AS inventory_dispositions_by_type
   FROM return_lines rl
     LEFT JOIN cust ON cust.return_line_id = rl.id
     LEFT JOIN inv ON inv.return_line_id = rl.id
     LEFT JOIN cust_mix ON cust_mix.return_line_id = rl.id
     LEFT JOIN inv_mix ON inv_mix.return_line_id = rl.id;

CREATE OR REPLACE VIEW public.return_progress AS
 WITH per_return AS (
         SELECT r.id AS return_id,
            r.return_number,
            r.status,
            sum(rl.qty)::numeric AS total_returned,
            sum(COALESCE(p.customer_resolved_qty, 0::numeric)) AS customer_resolved,
            sum(COALESCE(p.customer_remaining_qty, 0::numeric)) AS customer_remaining,
            sum(
                CASE
                    WHEN rl.condition = 'damaged'::text THEN rl.qty
                    ELSE 0
                END)::numeric AS total_damaged,
            sum(
                CASE
                    WHEN rl.condition = 'damaged'::text THEN COALESCE(p.inventory_resolved_qty, 0::numeric)
                    ELSE 0::numeric
                END) AS inventory_resolved,
            sum(
                CASE
                    WHEN rl.condition = 'damaged'::text THEN COALESCE(p.inventory_remaining_qty, 0::numeric)
                    ELSE 0::numeric
                END) AS inventory_remaining
           FROM so_po_returns r
             JOIN return_lines rl ON rl.return_id = r.id
             JOIN return_line_progress p ON p.return_line_id = rl.id
          GROUP BY r.id
        ), cust_mix AS (
         SELECT rl2.return_id,
            jsonb_object_agg(x.resolution_type, x.sum_qty) AS by_type
           FROM ( SELECT rl2_1.return_id,
                    cr.resolution_type,
                    sum(cr.qty) AS sum_qty
                   FROM return_lines rl2_1
                     JOIN return_line_customer_resolutions cr ON cr.return_line_id = rl2_1.id
                  GROUP BY rl2_1.return_id, cr.resolution_type) x
             JOIN return_lines rl2 ON rl2.return_id = x.return_id
          GROUP BY rl2.return_id
        ), inv_mix AS (
         SELECT rl2.return_id,
            jsonb_object_agg(x.disposition_type, x.sum_qty) AS by_type
           FROM ( SELECT rl2_1.return_id,
                    idp.disposition_type,
                    sum(idp.qty) AS sum_qty
                   FROM return_lines rl2_1
                     JOIN return_line_inventory_dispositions idp ON idp.return_line_id = rl2_1.id
                  GROUP BY rl2_1.return_id, idp.disposition_type) x
             JOIN return_lines rl2 ON rl2.return_id = x.return_id
          GROUP BY rl2.return_id
        )
 SELECT pr.return_id,
    pr.return_number,
    pr.status,
    pr.total_returned,
    pr.customer_resolved,
    pr.customer_remaining,
    pr.total_damaged,
    pr.inventory_resolved,
    pr.inventory_remaining,
    cust_mix.by_type AS customer_resolutions_by_type,
    inv_mix.by_type AS inventory_dispositions_by_type,
        CASE
            WHEN pr.customer_remaining > 0::numeric THEN 'in_progress'::text
            ELSE 'fully_resolved'::text
        END AS customer_status,
        CASE
            WHEN pr.total_damaged = 0::numeric THEN 'not_applicable'::text
            WHEN pr.inventory_remaining > 0::numeric THEN 'in_progress'::text
            ELSE 'fully_resolved'::text
        END AS inventory_status,
        CASE
            WHEN pr.customer_remaining > 0::numeric OR pr.inventory_remaining > 0::numeric THEN 'in_progress'::text
            ELSE 'fully_resolved'::text
        END AS overall_coverage_status,
    pr.total_damaged > 0::numeric AND pr.inventory_remaining = 0::numeric AND pr.customer_remaining > 0::numeric AS compensation_missing
   FROM per_return pr
     LEFT JOIN cust_mix ON cust_mix.return_id = pr.return_id
     LEFT JOIN inv_mix ON inv_mix.return_id = pr.return_id;
CREATE OR REPLACE VIEW public.sale_order_lines_summary AS
 WITH shipped AS (
         SELECT sd.sale_order_id,
            sdl.brand_variant_id,
            sdl.sku,
            sdl.item_name,
            sum(sdl.qty_delivered) AS qty
           FROM sale_deliveries sd
             JOIN sale_delivery_lines sdl ON sdl.sale_delivery_id = sd.id
          WHERE sd.type = 'standard'::sale_delivery_type AND sd.status = 'delivered'::sale_delivery_status
          GROUP BY sd.sale_order_id, sdl.brand_variant_id, sdl.sku, sdl.item_name
        ), replaced AS (
         SELECT sd.sale_order_id,
            sdl.brand_variant_id,
            sdl.sku,
            sdl.item_name,
            sum(sdl.qty_delivered) AS qty
           FROM sale_deliveries sd
             JOIN sale_delivery_lines sdl ON sdl.sale_delivery_id = sd.id
          WHERE sd.type = 'replacement'::sale_delivery_type AND sd.status = 'delivered'::sale_delivery_status
          GROUP BY sd.sale_order_id, sdl.brand_variant_id, sdl.sku, sdl.item_name
        ), returned_good AS (
         SELECT r.source_id AS sale_order_id,
            rl.brand_variant_id,
            rl.sku,
            rl.item_name,
            sum(rl.qty) AS qty
           FROM so_po_returns r
             JOIN return_lines rl ON rl.return_id = r.id
          WHERE r.source_type = 'sale_order'::return_source_type AND (r.status = ANY (ARRAY['restocked'::return_status, 'resolved_credit'::return_status, 'resolved_replacement'::return_status, 'resolved_partial'::return_status])) AND rl.condition = 'good'::text AND r.deleted_at IS NULL
          GROUP BY r.source_id, rl.brand_variant_id, rl.sku, rl.item_name
        )
 SELECT sol.id AS sale_order_line_id,
    sol.sale_order_id,
    sol.brand_variant_id,
    sol.sku,
    sol.item_name,
    sol.qty,
    COALESCE(s.qty, 0::bigint)::numeric AS shipped_qty,
    COALESCE(rg.qty, 0::bigint)::numeric AS returned_good_qty,
    COALESCE(rp.qty, 0::bigint)::numeric AS replacement_qty,
    GREATEST(0::bigint, COALESCE(s.qty, 0::bigint) - COALESCE(rg.qty, 0::bigint) + COALESCE(rp.qty, 0::bigint))::numeric AS net_delivered_qty
   FROM sale_order_lines sol
     LEFT JOIN shipped s ON s.sale_order_id = sol.sale_order_id AND NOT s.brand_variant_id IS DISTINCT FROM sol.brand_variant_id AND (sol.brand_variant_id IS NOT NULL OR NOT s.sku IS DISTINCT FROM sol.sku)
     LEFT JOIN returned_good rg ON rg.sale_order_id = sol.sale_order_id AND NOT rg.brand_variant_id IS DISTINCT FROM sol.brand_variant_id AND (sol.brand_variant_id IS NOT NULL OR NOT rg.sku IS DISTINCT FROM sol.sku)
     LEFT JOIN replaced rp ON rp.sale_order_id = sol.sale_order_id AND NOT rp.brand_variant_id IS DISTINCT FROM sol.brand_variant_id AND (sol.brand_variant_id IS NOT NULL OR NOT rp.sku IS DISTINCT FROM sol.sku);

CREATE OR REPLACE VIEW public.sale_order_paid_summary AS
 SELECT so.id AS sale_order_id,
    COALESCE(sum(COALESCE(pmt.amount_qar, pmt.amount)), 0::numeric) AS paid_qar
   FROM sale_orders so
     LEFT JOIN so_invoices si ON si.sale_order_id = so.id
     LEFT JOIN payments pmt ON pmt.deleted_at IS NULL AND (pmt.source_type = 'sale_order'::payment_source_type AND pmt.source_id = so.id OR si.id IS NOT NULL AND pmt.source_type = 'invoice'::payment_source_type AND pmt.source_id = si.id OR si.id IS NOT NULL AND pmt.invoice_id = si.id)
  WHERE so.deleted_at IS NULL
  GROUP BY so.id;

CREATE OR REPLACE VIEW public.supplier_credit_balances AS
 SELECT po.supplier_id,
    COALESCE(po.currency, 'QAR'::text) AS currency,
    count(*) AS open_count,
    sum(dn.total_amount) AS open_amount
   FROM debit_notes dn
     JOIN purchase_orders po ON po.id = dn.purchase_order_id
  WHERE dn.resolution_type = 'supplier_credit'::text AND dn.status <> 'void'::credit_note_status AND po.supplier_id IS NOT NULL
  GROUP BY po.supplier_id, (COALESCE(po.currency, 'QAR'::text));

CREATE OR REPLACE VIEW public.warehouse_stock_view AS
 SELECT wss.warehouse_id,
    wss.sub_container_id,
    wss.brand_variant_id,
    wss.item_name,
    wss.brand,
    wss.sku,
    wss.unit,
    wss.qty,
    wss.avg_cost,
    wss.total_value,
    wss.category_name,
    wss.subcategory_name,
    wss.item_type,
    wss.allocated_qty,
    wss.available_qty,
    wsc.name AS sub_container_name,
    ii.image_url,
    bv.country_id,
    cc.name AS country_name
   FROM warehouse_stock_summary wss
     LEFT JOIN warehouse_sub_containers wsc ON wsc.id = wss.sub_container_id
     LEFT JOIN inventory_item_brand_variants bv ON bv.id = wss.brand_variant_id
     LEFT JOIN inventory_items ii ON ii.id = bv.item_id
     LEFT JOIN country_codes cc ON cc.id = bv.country_id;

CREATE OR REPLACE VIEW public.warehouse_sub_container_totals AS
 SELECT sc.warehouse_id,
    sc.id AS sub_container_id,
    sc.name AS sub_container_name,
    sc.is_active AS sub_container_is_active,
    count(DISTINCT fcl.brand_variant_id) FILTER (WHERE fcl.remaining_qty > 0) AS item_count,
    COALESCE(sum(fcl.remaining_qty) FILTER (WHERE fcl.remaining_qty > 0), 0::bigint)::numeric AS total_qty,
    COALESCE(sum(fcl.remaining_qty::numeric * fcl.total_unit_cost) FILTER (WHERE fcl.remaining_qty > 0), 0::numeric) AS total_value,
    sc.division_id,
    d.name AS division_name
   FROM warehouse_sub_containers sc
     LEFT JOIN fifo_cost_layers fcl ON fcl.sub_container_id = sc.id
     LEFT JOIN company_divisions d ON d.id = sc.division_id
  WHERE sc.is_active = true
  GROUP BY sc.warehouse_id, sc.id, sc.name, sc.is_active, sc.division_id, d.name;

CREATE OR REPLACE VIEW public.warranty_records_remaining AS
 SELECT id,
    warranty_number,
    sale_delivery_line_id,
    sale_order_id,
    customer_id,
    division_id,
    brand_variant_id,
    item_name,
    sku,
    qty,
    policy_id,
    policy_name_snapshot,
    coverage_type_snapshot,
    duration_months_snapshot,
    terms_en_snapshot,
    terms_ar_snapshot,
    void_conditions_snapshot,
    starts_from_snapshot,
    start_date,
    end_date,
    created_at,
    source_type,
    origin_country_id,
    origin_name_snapshot,
    GREATEST(qty - COALESCE(( SELECT sum(c.claim_qty) AS sum
           FROM warranty_claims c
          WHERE c.warranty_record_id = wr.id AND (c.status <> ALL (ARRAY['void'::warranty_claim_status, 'rejected'::warranty_claim_status]))), 0::bigint), 0::bigint)::integer AS remaining_qty
   FROM warranty_records wr;
