# Staging Migrations (Inventory Build)

This folder contains only the migrations required for the inventory/purchase/sales staging build.

## Excluded modules
- Services/Orders (field service)
- Contracts
- Subscriptions
- Chat / Contact Centre
- Teams / Employees / Vehicles
- Promotions / Vouchers
- QC (Quality Control)
- QuickBooks sync
- Standalone RFQs
- Reminders, Traccar, Tool Assets, Media Downloads

## How to apply
```bash
npx supabase link --project-ref <staging-ref>
npx supabase db reset --linked --yes
npx supabase link --project-ref <dev-ref>   # relink back to dev
```

## Last rebuilt
2026-07-19 — added architecture audit migrations (receival sequence, atomic PO approval RPC, FK indexes)
