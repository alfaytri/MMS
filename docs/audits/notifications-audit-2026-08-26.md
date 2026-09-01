# Notifications Audit — what we have + where it's needed (2026-08-26)

Scope: the **in-app bell** (`notifications` table). Channels like WhatsApp/email are not wired in this back-office build. Notifications here are **staff-facing** (never customer-facing).

## The engine that already exists
- **Routing map** — `src/lib/notification-routes.ts` (`NOTIFICATION_ROUTES` = type → screen/icon/actionable; `NOTIFICATION_RECIPIENTS` = type → permission/notify-key).
- **Recipient resolver** — `recipients_for_permission` (DB) → who gets it, by role, warehouse-scoped, with overrides.
- **Per-role control** — the role editor's `notify.*` keys.
- **Emit** — `src/lib/notify.ts` (client) + several SECURITY DEFINER functions (server).

## 1. What we have today (~28 types across 11 areas)

Every one follows the **"someone must act on a pending request" pattern**, plus two stock alerts.

| Area | Types | Who's notified | Emitted at |
|---|---|---|---|
| PO approval | `po_approval_requested` / `po_approved` / `po_rejected` | approvers (request) + creator (outcome) | Submit PO; `po_approval_action` |
| PO edit request | `po_edit_request_pending` / `_approved` / `_declined` | approvers + requester | `usePoEditRequests` |
| SO approval | `so_approved` / `so_rejected` | **creator only (outcome)** | `useSalesApprovals` |
| Service change | `service_change_pending` | approvers | `notify_approvers_on_service_change` |
| Warehouse transfers | `transfer_pending` / `_dispatched` / `_received` / `_received_shrinkage` / `_rejected` / `_cancelled` | dest/source RPs + approvers | `WhTransferDialog` / `WhTransfersTab` |
| Stock adjustments | `stock_adj_pending` / `_approved` / `_rejected` | approvers + requester | adjustment flow |
| Inventory checks | `inv_check_pending` / `_approved` / `_rejected` | approvers + initiator | check flow |
| Credit group | `credit_group_pending` / `_approved` / `_rejected` | approvers + requester | credit-group flow |
| Receival edits | `receival_edit_request` / `_response` | receival managers + requester | `useReceivals` |
| Low stock | `low_stock_alert` | warehouse (below reorder point) | `check_low_stock_and_notify` |
| Warehouse item requests | `item_request` | warehouse managers + requester | `rpc_request_warehouse_item` / `rpc_resolve_item_request` |

**Takeaway:** notifications today are ~entirely **approval/workflow** events + low-stock + item-request. There are **no financial, no status/lifecycle, and no reminder notifications.**

## 2. Where notifications are needed (gaps in active modules)

### 🔴 High value
| Event | Notify | Why it matters | Flow |
|---|---|---|---|
| **SO submitted for approval** | the approvers | PO notifies approvers, SO doesn't — approvals can stall unseen | Approve/Reject Sale Order |
| **Goods received against a PO** | the purchaser / PO creator | they don't learn their order arrived | Create & Approve Receival |
| **Invoice overdue** | finance / sales owner | no one is alerted when an invoice passes due | Customer Invoices / AR |
| **Shipment delayed / customs / delivered** | the purchaser | 17track events land in DB but nobody is pinged | Update Shipment Status |
| **Sales return created / needs inspection** | warehouse + sales | a return arriving is silent until someone looks | Create Sales Return |
| **Warranty claim filed** | warranty manager | claims sit unseen | Warranty Claim (sale) |

### 🟡 Medium value
| Event | Notify | Flow |
|---|---|---|
| Customer payment received / Supplier payment made | finance | Record Customer/Supplier Payment |
| Invoice generated / fully paid | sales owner | Generate Invoice from SO |
| Payment installment due (reminder) | finance | Create Payment Plan / Settle Installment |
| Sale delivery completed | sales owner | Complete Delivery |
| Credit note / debit note issued | finance | Issue Credit / Debit Note |
| PO fully received / PO cancelled | purchaser | PO lifecycle |
| Supplier bill created / due | finance | Create Supplier Bill |

### 🟢 Lower value
- Tool inspection / repair due; monthly check session due (Tools & Assets)
- Custody assignment pending accept (already has an in-app **banner**, just no bell entry)
- Purchase-return / debit-note resolution outcomes

## 3. Do we need a "notification engine"?

The **routing engine already exists** and scales to all the gaps above by adding a type + a recipient rule + an emit call — the same way the current 28 types work. So:

- **If you just want the missing alerts** → add them the existing way (code). Fast, no new infra. Best for the 🔴 list.
- **Build the control-center "engine"** only when you want one or more of:
  1. **Operator control without a developer** — toggle each notification on/off, change who gets it, edit the text, from an admin page (routing moves from code → DB).
  2. **More channels** — WhatsApp/email/SMS (e.g. *overdue invoice → WhatsApp to finance*). Needs the pruned Wati/email integrations re-enabled.
  3. **Per-user preferences** — let staff mute types.

**Recommendation:** knock out the 🔴 gaps with the existing pattern first (they're the real operational blind spots). Revisit the engine once the list of types is bigger and you want to tune them yourself or push them to WhatsApp/email.
