-- On-by-default rollout of the new PO / SO detail-tab view permissions.
--
-- Before this feature every tab was visible to anyone who could open the PO/SO.
-- To avoid changing what current users see, pre-grant the new per-tab view keys
-- to every role that can already open the respective dialog (holds
-- purchase.orders.view / sales.orders.view). Operators then untick a tab on a
-- role to hide it. System-admin roles bypass permission checks, so they need no
-- grant. Idempotent (distinct union) and self-adapting to each DB's roles.

update public.custom_roles
set permissions = array(
  select distinct e from unnest(
    permissions || array[
      'purchase.orders.tab.receivals.view',
      'purchase.orders.tab.payments.view',
      'purchase.orders.tab.bills.view',
      'purchase.orders.tab.returns.view',
      'purchase.orders.tab.activity.view',
      'purchase.orders.tab.exchange.view'
    ]::text[]
  ) e
)
where deleted_at is null
  and 'purchase.orders.view' = any(permissions);

update public.custom_roles
set permissions = array(
  select distinct e from unnest(
    permissions || array[
      'sales.orders.tab.deliveries.view',
      'sales.orders.tab.payments.view',
      'sales.orders.tab.returns.view',
      'sales.orders.tab.activity.view',
      'sales.orders.tab.invoice.view',
      'sales.orders.tab.exchange.view'
    ]::text[]
  ) e
)
where deleted_at is null
  and 'sales.orders.view' = any(permissions);
