# Subscription Payment Flow — Future Implementation Notes

**Status:** NOT YET BUILT — this note documents the intended architecture for a future ticket.  
**Depends on:** Subscription Packages master data (this branch), Dibsy payment integration, WATI WhatsApp integration.

---

## The Flow

1. **Admin assigns a package to a customer** (or customer self-selects via portal).
2. System calls **Dibsy API** to create a payment link for `customer_subscriptions.price_paid` (snapshotted from `subscription_packages.initial_fee` at that moment).
3. System sends the Dibsy payment link to the customer via **WATI** (WhatsApp Business API) — a pre-approved template message.
4. Customer pays through the Dibsy link.
5. Dibsy fires a **webhook** to our backend:
   - On `payment.success` → set `customer_subscriptions.status = 'active'`, set `start_date = today`, `end_date = today + duration_months`.
   - On `payment.failed` / expired → leave status as `pending_payment` (new status to add).
6. Subscription is now active. Customer receives a WhatsApp confirmation via WATI.

---

## Auto-Renewal Flow

1. **Cron job** (`cron-renew-subscriptions`) runs nightly.
2. For each subscription where `end_date = today + N days` (configurable, e.g. 7 days) and `auto_renew = true`:
   - If customer has a **saved payment method** (Dibsy stored card / tokenised mandate):
     - Charge automatically via Dibsy recurring API.
     - On success → create new `customer_subscriptions` row for next period.
     - On failure → send WATI "payment failed, update your card" message; do NOT cancel yet.
   - If **no saved payment method**:
     - Send WATI renewal reminder with a new Dibsy payment link.
     - If not paid by `end_date` → set `status = 'expired'`.
3. For subscriptions with `auto_renew = false`:
   - Send WATI expiry reminder N days before `end_date` with an opt-in renewal link.
   - On `end_date` → set `status = 'expired'` automatically.

---

## Schema Additions Needed (future migration)

```sql
-- Add pending_payment status to customer_subscriptions
ALTER TABLE customer_subscriptions 
  DROP CONSTRAINT customer_subscriptions_status_check;
ALTER TABLE customer_subscriptions 
  ADD CONSTRAINT customer_subscriptions_status_check 
  CHECK (status IN ('pending_payment', 'active', 'expired', 'cancelled'));

-- Payment tracking
ALTER TABLE customer_subscriptions ADD COLUMN dibsy_payment_id text;
ALTER TABLE customer_subscriptions ADD COLUMN dibsy_mandate_token text; -- for recurring
ALTER TABLE customer_subscriptions ADD COLUMN paid_at timestamptz;
```

---

## Integration Points

| System | Purpose | Notes |
|---|---|---|
| **Dibsy** | Payment link generation, webhook callbacks, recurring charges | Need Dibsy API key in env; store `dibsy_payment_id` on subscription row |
| **WATI** | Send WhatsApp messages (payment link, confirmation, renewal reminder) | Uses approved message templates; need WATI API token in env |
| **Supabase Edge Function** | Handle Dibsy webhook → activate subscription | Deploy as `supabase/functions/dibsy-webhook/index.ts`; validate webhook signature |
| **Cron** | Nightly renewal checks | Extend or add to existing cron infrastructure |

---

## Open Questions (resolve before building)

1. Does Dibsy support **recurring/mandate** payments, or is every renewal a new one-time link?
2. What is the **grace period** after `end_date` before cancellation (0 days? 3 days?)?
3. Should a failed auto-renewal retry once or multiple times before sending the manual link?
4. Who can manually trigger a renewal reminder from the admin panel?
5. Should the customer portal (WhatsApp link) allow the customer to **upgrade** their tier mid-year (pro-rated)?

---

## Files to Create When Building

```
supabase/functions/dibsy-webhook/index.ts     ← webhook receiver + subscription activation
supabase/functions/send-renewal-reminders/    ← nightly cron logic
src/hooks/useCustomerSubscriptions.ts         ← customer-facing hooks
src/components/subscriptions/SubscriptionPortal.tsx
```

---

*This note is a continuation of the Subscription Packages module. Do not start building until Dibsy and WATI integrations are confirmed and the master-data package catalog is live.*
