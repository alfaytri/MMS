'use client'

// RealtimeSync previously used Supabase Realtime subscriptions on
// purchase_orders, po_approvals, receivals, and notifications — 4 unfiltered
// postgres_changes channels active for every browser tab. This consumed 95% of
// the project's Realtime message quota.
//
// Replaced with refetchInterval on the relevant React Query hooks:
//   • usePurchaseOrders  → 30s refetchInterval
//   • useReceivals       → 30s refetchInterval
//   • useUnreadNotificationCount → already had 60s refetchInterval
//
// This component is now a no-op stub kept so the layout import doesn't break.

export function RealtimeSync() {
  return null
}
