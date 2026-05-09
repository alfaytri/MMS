# Orders Module — Design Spec (Part 1 of 3)

---

## 1. Overview

### What This Module Is
The Orders module is the core field-service scheduling system for MMS. It allows contact-centre agents to:
- Look up or create a customer by phone number
- Book a service visit (select services, date, address, assign a team)
- View and manage all work orders (list, detail, cancel, confirm)
- Track order history and installed products per customer

This is **distinct from Sales Orders** (trading/invoicing in `/sales`). Orders here are field-service visits: AC cleaning, pest control, maintenance, etc.

### What Is Out of Scope for This Spec
- Contact Centre sidebar (Wati/3CX integration) — separate module, built later
- Quotations flow — separate sub-module, planned after orders are stable
- Follow-up / Backwork creation pages — phase 2 of this module
- Mobile Booking auto-assign engine — phase 2
- WhatsApp confirmation automation — phase 2

### Branch
`feature/orders-module` — branched from `feature/Calander`.
Do NOT merge to `develop` until the Calendar branch is also merged.

---

## 2. Data Model

### 2.1 Existing Tables (already in DB, no changes needed)
| Table | Purpose |
|---|---|
| `customers` | Customer entity — name, type (Credit/Cash), credit group |
| `orders` | Work orders — status, scheduled date, total, agent, address |
| `order_services` | Line items per order — service, qty, price, config |
| `order_team_assignments` | Team scheduling — team, time slot, date, services |
| `order_log` | Audit trail — action, user, details, timestamp |

### 2.2 New Tables Required

#### `customer_phones`
Multiple phone numbers per customer. Phone is the true unique identifier — names are not unique in Qatar.

```sql
CREATE TABLE customer_phones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  phone        varchar(20) NOT NULL UNIQUE,
  label        varchar(50),          -- e.g. "Main", "Mobile", "Office"
  is_primary   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_phones_customer ON customer_phones(customer_id);
CREATE INDEX idx_customer_phones_phone    ON customer_phones(phone);
```

**Linking rule:** Two phone numbers belonging to the same person are linked by sharing the same `customer_id`. During quick-create, the agent is prompted: *"Does this customer use another number for service requests?"* — if yes, the system links both phones under the same customer record.

#### `customer_addresses`
Addresses are attached to a **phone number**, not just the customer. This captures preference data: "this number is used for requests from Zone 70" — useful for analytics and routing.

```sql
CREATE TABLE customer_addresses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  phone_id        uuid NOT NULL REFERENCES customer_phones(id) ON DELETE CASCADE,
  label           varchar(100),        -- e.g. "Main Villa", "Office Floor 3"
  address_type    varchar(20) NOT NULL CHECK (address_type IN ('blue_plate', 'coordinates')),

  -- Blue Plate fields (Qatar official addressing system)
  blue_plate_no   varchar(50),
  unit_no         varchar(50),
  building_no     varchar(50),
  street_no       varchar(50),
  zone_no         varchar(50),

  -- Fallback: Google coordinates
  lat             decimal(10, 7),
  lng             decimal(10, 7),

  -- Display
  address_line    text,               -- Formatted one-line display string
  is_primary      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_addresses_customer ON customer_addresses(customer_id);
CREATE INDEX idx_customer_addresses_phone    ON customer_addresses(phone_id);
```

#### `installed_products`
Tracks products/equipment installed at a customer address during a completed order. Drives the "Products" section of the Customer History Panel.

```sql
CREATE TABLE installed_products (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  phone_id            uuid NOT NULL REFERENCES customer_phones(id),
  address_id          uuid REFERENCES customer_addresses(id),
  order_id            uuid NOT NULL REFERENCES orders(id),
  product_name        varchar(255) NOT NULL,
  brand               varchar(100),
  model               varchar(100),
  serial_number       varchar(100),
  installed_at        date NOT NULL,          -- = order completion date
  warranty_months     integer NOT NULL DEFAULT 0,
  warranty_expires_at date,                   -- computed: installed_at + warranty_months
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_installed_products_customer ON installed_products(customer_id);
CREATE INDEX idx_installed_products_order    ON installed_products(order_id);
```

### 2.3 Orders Table — Existing Columns Reference
The `orders` table already has the required columns. Key fields used by this module:
```
order_id              -- e.g. ORD-2026-0901 (human-readable)
customer_id           -- FK to customers
type                  -- 'order' | 'site-visit' | 'quotation'
division              -- service division
status                -- order_status enum (see state machine below)
confirmation_status   -- 'not_sent' | 'msg_sent' | 'customer_confirmed' |
                      -- 'agent_confirmed' | 'no_response' | 'manually_confirmed'
scheduled_date        -- visit date
total_amount          -- QAR
agent_name            -- who booked it
notes                 -- free text
address               -- JSON or text — selected from customer_addresses
has_invoice           -- boolean
invoice_number        -- FK or string
```

No schema changes needed to `orders` itself for Phase 1.

### 2.4 Order Status State Machine
Defined in `orderStateMachine.ts` (already exists). Valid transitions:

```
tentative        → scheduled, cancelled
scheduled        → confirmed, cancelled, waitlist, pending-confirmation
pending-confirm  → confirmed, scheduled, cancelled
confirmed        → in-progress, cancelled, scheduled
in-progress      → completed, cancelled
completed        → (terminal)
cancelled        → (terminal)
waitlist         → scheduled, cancelled
pending-approval → confirmed, cancelled
```

Terminal states: `completed`, `cancelled` — no further transitions allowed.

---

## 3. Customer Lookup & Quick-Create Flow

### 3.1 Entry Point
A **"+ New Order"** button appears in:
- The Orders list page header
- The top navigation Orders submenu

Clicking it opens the **Phone Lookup Modal** — a small, focused dialog (not the full order form yet).

### 3.2 Phone Lookup Modal

```
┌─────────────────────────────────────┐
│  New Order                          │
│                                     │
│  Customer Phone Number              │
│  ┌───────────────────────────────┐  │
│  │ +974 ___________________      │  │
│  └───────────────────────────────┘  │
│                                     │
│  [Cancel]              [Look Up →]  │
└─────────────────────────────────────┘
```

- Input: phone number (required)
- On submit: searches `customer_phones.phone`

### 3.3 Found — Existing Customer
```
┌─────────────────────────────────────┐
│  ✓ Customer Found                   │
│                                     │
│  Al Wakra Grand Hotel               │
│  3 addresses · 12 past orders       │
│                                     │
│  [Change Number]    [Continue →]    │
└─────────────────────────────────────┘
```
- Shows customer name + address count + order count
- Continue → order form opens with customer pre-linked

### 3.4 Not Found — New Customer
```
┌─────────────────────────────────────┐
│  New Customer                       │
│                                     │
│  Name  ________________________     │
│                                     │
│  Does this customer use another     │
│  number for service requests?       │
│  ○ No   ○ Yes → [enter number]      │
│                                     │
│  [Cancel]           [Continue →]    │
└─────────────────────────────────────┘
```
- Name: required (free text — not unique, that's fine)
- Second number: optional. If entered:
  - Found in DB → links both numbers under that existing customer record
  - Not found → creates second `customer_phones` entry under same new customer
- Continue → creates `customers` record + `customer_phones` record(s), then opens order form

### 3.5 Quick-Create Rules
- Customer record created silently in background — agent is NOT taken to a "Customer Profile" page
- `is_primary = true` set on the first phone for new customers
- No validation beyond name being non-empty
- If agent enters wrong number, they can go back and change it


---

# Orders Module — Design Spec (Part 2 of 3)

---

## 4. Create Order Page (`/orders/create`)

### 4.1 Layout
Full-page view. Three panels:

```
┌─────────────────────┬──────────────────────────────┬───────────────────┐
│   ORDER FORM        │      TEAM CALENDAR            │  CUSTOMER HISTORY │
│   (340px fixed)     │      (flex, fills space)      │  (320px, toggle)  │
│                     │                               │                   │
│  Order / Site Visit │  ◄  Sat May 9  ►              │  [Orders][Products│
│  ─────────────────  │  Normal  Emergency  Waitlist  │                   │
│  REQUESTED SERVICES │                               │  ▼ Month filter   │
│  [Division filters] │  Team 1  │ 7AM│ 8AM│ 9AM│    │  ← Apr  May  Jun► │
│  [Service dropdowns]│  Team 2  │    │ORD │    │    │                   │
│  [Selected cards]   │  Team 3  │    │    │ORD │    │  ORDER CARDS (4)  │
│  ─────────────────  │                               │  ──────────────── │
│  VISIT DATE         │                               │  PRODUCT CARDS(4) │
│  [Date picker]      │                               │                   │
│  ─────────────────  │                               │  [◄ scroll ►]     │
│  ORDER ADDRESS      │                               │                   │
│  [Drop zone / click]│                               │  [◄ collapse]     │
│  ─────────────────  │                               │                   │
│  VOUCHER CODE       │                               │                   │
│  [Input] [Apply]    │                               │                   │
│  ─────────────────  │                               │                   │
│  NOTES              │                               │                   │
│  [Textarea]         │                               │                   │
│  ─────────────────  │                               │                   │
│  [Confirm Order ✓]  │                               │                   │
└─────────────────────┴──────────────────────────────┴───────────────────┘
```

On mobile/tablet (< lg): Customer History panel hidden behind a toggle button. Order form stacks above Team Calendar (calendar collapses to a compact date+team picker).

### 4.2 Order Form (Left Panel)

#### Order Type Tabs
- **Order** — standard service order, full service selection
- **Site Visit** — disables service selection; shows sub-type selector (Single / Contract)

#### Service Selector
N-level cascading dropdowns — reuses existing `ServiceSelector` component pattern:
1. Division filter badges at top (Alfaytri Maintenance / RSH Cleaning / Alfaytri Kitchen)
2. Level 1 dropdown (e.g. "Air Conditioning")
3. Level 2 dropdown (e.g. "Split")
4. Level 3 dropdown (e.g. "Level 1 Maintenance")
5. Leaf dropdown (e.g. "Capacitor Changing")
6. On leaf selected: shows price (QAR) + duration (min) + qty input + "Add Service" button
7. Configurable services: opens inline `ServiceConfigurator` (qty/select/boolean pickers)

Selected services appear as **draggable cards** below the selector:
- Service name · qty · price · duration
- Remove (×) button
- Drag handle — dragging a card over the Team Calendar highlights teams with matching skills (green glow = match, faded = no match)

#### Visit Date
- Single date picker (default: today)
- Multi-day toggle: enables date range picker; creates "Day X of Y" label in calendar

#### Order Address
Drop zone + click behaviour:

```
┌──────────────────────────────────────────┐
│  📍 Drop address here, or click to select │
└──────────────────────────────────────────┘
```

- **Click** → opens Address Picker popover (see Section 5)
- **Drop** → accepts address drag from Contact Centre panel (future — drop target always active)
- Once selected: shows address label + formatted address line

#### Voucher Code
- Text input + Apply button
- On valid: shows discount applied per service line
- On invalid: inline error toast

#### Notes
- Textarea, optional

#### Confirm Order Button
- Disabled until: at least one service added, visit date set, address selected, at least one team assignment on the calendar
- On click: validates state machine (status → `scheduled`), writes `orders` + `order_services` + `order_team_assignments` + `order_log`, shows success toast, redirects to order list

### 4.3 Team Calendar (Right Panel)

Reuses the calendar components already built in `feature/Calander`:
- `TimelineGrid` — team rows × hour columns
- `VisitBlock` — existing order blocks shown as read-only context
- Drag service card from left panel → drop onto team row + time cell → assigns team

**Mode toggle (top right):**
| Mode | Behaviour |
|---|---|
| Normal | Standard scheduling |
| Emergency | Emergency time slots |
| Waitlist | Bypasses team/time — creates order with status `waitlist` |

**Skill highlighting during drag:**
- While dragging a service card, compare service's root skill ID against each team's `skills[]`
- Match → team row glows green
- No match → team row dims

**Allocation dialog (qty > 1):**
When dropping a service card with qty > 1 onto a slot, opens `AllocateQuantityDialog`:
- Shows total qty
- Agent splits qty across multiple team assignments
- Each split creates a separate entry in `order_team_assignments`

**Date navigation:**
- ◄ ► arrows to change the calendar date
- "Today" button
- Must match the Visit Date selected in the order form (auto-synced)

---

## 5. Address System

### 5.1 Address Picker (Popover)
Opens when agent clicks the ORDER ADDRESS field.

```
┌─────────────────────────────────────────┐
│  Select Address                         │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ Main Villa  [Blue Plate]        │ ✓  │
│  │ B58, St662, Z70 · Qatar         │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │ Office HQ   [Coordinates]       │    │
│  │ 25.3764, 51.4480                │    │
│  └─────────────────────────────────┘    │
│                                         │
│  + Add New Address                      │
└─────────────────────────────────────────┘
```

- Lists all addresses linked to the customer's phone (`customer_addresses` where `phone_id = looked-up phone`)
- Each entry shows: label, type badge, formatted address
- Click to select → fills the drop zone
- "+ Add New Address" → opens Address Creation Sheet

### 5.2 Address Creation Sheet
Slide-up sheet (mobile) / side drawer (desktop). Agent picks the address type first:

#### Blue Plate (Qatar Official Address)
```
Enter Blue Plate Number: [__________]  [Fetch]
```
- API call to Qatar Blue Plate service
- On success: auto-fills Unit, Building, Street, Zone, coordinates
- Agent adds a label (e.g. "Main Villa") and confirms
- Saves to `customer_addresses` with `address_type = 'blue_plate'`

#### Google Coordinates (No Blue Plate)
- Embedded Google Maps picker (or coordinate input fallback)
- Agent pins the location
- Auto-generates a display address from reverse geocoding (best effort)
- Agent adds a label and confirms
- Saves to `customer_addresses` with `address_type = 'coordinates'`, stores lat/lng

### 5.3 Blue Plate API Integration
- API endpoint: Qatar Municipality / Metrash Blue Plate API (to be confirmed — endpoint TBD)
- Request: `GET /address?blue_plate={number}`
- Response maps to: `unit_no`, `building_no`, `street_no`, `zone_no`, `lat`, `lng`
- Fallback: if API unavailable, agent can manually enter the fields
- Error state: "Blue Plate not found — enter address manually" inline message

---

## 6. Customer History Panel (Right Collapsible)

Auto-opens when customer is identified after phone lookup. Can be collapsed via a `◄` toggle button on its left edge.

### 6.1 Month Filter (Top)
Compact month strip:
```
◄  March  April  [May]  June  July  ►
```
- Clicking a month filters both Orders and Products sections to that month
- Active month highlighted (primary orange)
- Months with any activity show a subtle dot indicator
- Default: current month

### 6.2 Orders Section

**Header:** "Orders" + count badge for the selected month

**Cards — 4 per view:**
```
┌────────────────────────────────────┐
│  ORD-2026-0312          📅 Mar 12  │
│  ● Completed                       │
│                                    │
│  [View Order]  [View Invoice]      │
│                    [Create Backwork]│
└────────────────────────────────────┘
```
- Order ID (bold)
- Completion / scheduled date
- Status badge: Completed (green) · Scheduled (blue) · Ongoing (orange) · Cancelled (red)
- Action buttons (always visible on the card, no expand needed):
  - **View Order** → opens Order Detail Dialog
  - **View Invoice** → opens invoice (if `has_invoice = true`; otherwise button is disabled + tooltip "No invoice yet")
  - **Create Backwork** → navigates to `/orders/create-backwork?from={orderId}` (only shown when status = completed)

**Pagination:** 4 cards visible. "Show next 4" / "Show previous 4" scroll buttons below the cards. No infinite scroll — deliberate paging for visual clarity.

**Empty state:** "No orders in [Month]" with a muted calendar icon.

### 6.3 Products Section

**Header:** "Installed Products" + count badge

**Cards — 4 per view:**
```
┌────────────────────────────────────┐
│  Samsung Split AC Unit             │
│  Installed: 12 Mar 2026            │
│  Warranty: 8 months remaining      │
└────────────────────────────────────┘
```
- Product name (bold)
- Installation date (= order completion date from `installed_products.installed_at`)
- Warranty status:
  - Active: "X months remaining" (green)
  - Expiring soon (< 1 month): "Expires in X days" (yellow)
  - Expired: "Warranty expired" (red)

**Month filter:** filters by `installed_at` month.

**Pagination:** same 4-card pattern as orders.

**Empty state:** "No products installed in [Month]"

### 6.4 Responsive Behaviour
- `lg+` (1024px+): Panel visible by default, 320px wide, collapsible
- `md` (768–1023px): Panel hidden by default, accessible via "History" tab button
- `< md` (mobile): Panel accessible as a full-screen bottom sheet triggered by a button


---

# Orders Module — Design Spec (Part 3 of 3)

---

## 7. Order List Page (`/orders`)

### 7.1 Layout
Standard page layout with `PageWrapper`. No split panels — full width list.

### 7.2 Header
```
Orders                              [+ New Order]
```

### 7.3 Counter Chips (Clickable Filters)
Each chip filters the list to that status group. Active chip shows filled style.

| Chip | Filters On |
|---|---|
| Scheduled | `status = 'scheduled'` |
| Pending Approval | `status = 'pending-approval'` |
| No Confirmation | `status = 'pending-confirmation' OR confirmation_status = 'no_response'` |
| No Address | `address IS NULL OR address = ''` |
| Past Due · No Invoice | `scheduled_date < today AND has_invoice = false AND status != 'cancelled'` |

### 7.4 Filter Panel (Collapsible)
Toggled by a "Filter" button with active filter count badge.

| Filter | Input |
|---|---|
| Booking Date From/To | Date pickers |
| Visit Date From/To | Date pickers |
| Customer Name | Text (partial match) |
| Customer Phone | Text (partial match) |
| Agent | Dropdown (auto-populated from data) |
| Team | Dropdown (auto-populated from data) |
| Order Number | Text (partial match) |
| Division | Dropdown |

Reset button clears all filters.

Sort toggle: Date ↑↓ / Amount ↑↓

### 7.5 Order Cards
Scrollable list. Each card shows:
- Order ID (e.g., ORD-2026-0312)
- Customer name + phone
- Status badge (colour-coded per status)
- Confirmation status badge
- Division badge
- Services summary (e.g., "2× AC Cleaning, 1× Pest Control")
- Scheduled date
- Total amount (QAR)
- Click anywhere → opens Order Detail Dialog

### 7.6 Status Badge Colours
| Status | Colour |
|---|---|
| tentative | Muted gray |
| scheduled | Primary blue |
| confirmed | Success green |
| in-progress | Warning orange |
| completed | Success bold green |
| cancelled | Destructive red |
| waitlist | Warning yellow |
| pending-approval | Warning yellow |
| pending-confirmation | Warning orange |

---

## 8. Order Detail Dialog

Opens as a sheet/dialog (full-screen on mobile, large centered dialog on desktop) when an order card is clicked.

### 8.1 Header
- Order ID (bold)
- Status badge
- Multi-day badge (only if `scheduled_end_date` exists: "Multi-Day: date → date")
- Customer Name · Phone (small text)

### 8.2 Confirmation Banner
Always visible below the header. Shows current WhatsApp confirmation state:

| State | Border Colour | Subtext |
|---|---|---|
| not_sent | Neutral | "48hr auto-confirmation via WhatsApp before visit" |
| msg_sent | Blue | "Message sent — awaiting customer reply" + timestamp |
| customer_confirmed | Green | "Customer confirmed" + timestamp |
| agent_confirmed / manually_confirmed | Green | "Manually confirmed by [agent]" |
| no_response | Red | "No response received" |

**Action buttons (conditional):**
| Button | Visible When | Action |
|---|---|---|
| Confirm Manually | status = scheduled | Sets status → confirmed, confirmation → manually_confirmed, writes audit log |
| Rollback | confirmation = manually_confirmed or customer_confirmed | Resets status → scheduled, confirmation → not_sent, writes audit log |
| Edit Order | status = scheduled | Navigates to `/orders/create?edit={orderId}` |
| Cancel Order | `canTransition(status, 'cancelled') = true` | Opens Cancel Dialog |

### 8.3 Tab 1: Booked Services
- Lists each `order_team_assignments` as a card:
  - Team name
  - Scheduled date + time slot + duration
  - Service badges (e.g., "2× AC Cleaning")
- Order Summary Grid (3 columns): services count · teams count · total amount

### 8.4 Tab 2: Invoiced & Report
- If `has_invoice = true`: shows invoice number + link to invoice
- If `has_invoice = false`: "No invoice generated yet"
- Placeholder for on-site photos and team report (Phase 2)

### 8.5 Tab 3: Follow-up & Backwork
- "+ Follow-up" button → `/orders/create-follow-up?from={orderId}`
- "+ Backwork" button → `/orders/create-backwork?from={orderId}` (red-tinted)
- Lists any linked child orders (follow-up / backwork) with: Order ID · type badge · date

### 8.6 Tab 4: Logs
Reverse-chronological audit trail from `order_log`:
- Dot + vertical line connector
- Action name (bold) + "by {userName}"
- Details text (if any)
- Timestamp: "MMM d, yyyy HH:mm"

---

## 9. Order Cancel Dialog

Alert dialog with destructive styling. Opens from Edit Order button in detail view.

**Content:**
- Order ID + Customer Name (info text)
- Cancellation Reason (required) — dropdown from `reason_lists` where `type = 'cancellation'` and `active = true`
- Notes — optional textarea

**Waitlist Warning:**
If any orders with `status = 'waitlist'` exist on the same date + division as the cancelled order, shows a yellow warning box listing them (Order ID, customer, services). Purpose: alerts agent that a slot may be freed for waitlisted customers.

**Buttons:**
- Keep Order (cancel dialog)
- Confirm Cancellation (disabled until reason selected) → sets status to `cancelled`, writes audit log with `{ old_status, new_status, reason, notes }`

---

## 10. Navigation Integration

Add Orders sub-items to the existing "Orders▾" nav dropdown. Current items (Purchase Orders, Sale Orders) remain. New items added:

```
Orders ▾
  ├── Work Orders          → /orders
  ├── Create Order         → /orders/create  (or triggers phone prompt modal)
  ├── ─────────────────
  ├── Purchase Orders      → /purchase/orders   (existing)
  └── Sale Orders          → /sales/orders      (existing)
```

Route structure in `src/app/(dashboard)/`:
```
orders/
  page.tsx              ← Order list
  create/
    page.tsx            ← Create order (phone prompt + order form)
  [orderId]/
    page.tsx            ← Order detail (or use dialog from list)
```

---

## 11. Hooks & Data Layer

### New hooks required:

| Hook | File | Purpose |
|---|---|---|
| `useCustomerLookup` | hooks/useCustomerLookup.ts | Phone search, quick-create, link phones |
| `useCustomerAddresses` | hooks/useCustomerAddresses.ts | Fetch/add/select addresses per phone |
| `useOrders` | hooks/useOrders.ts | Fetch order list with filters, pagination |
| `useOrderDetail` | hooks/useOrderDetail.ts | Single order with joins (services, assignments, logs) |
| `useCreateOrder` | hooks/useCreateOrder.ts | Create order mutation (orders + services + assignments + log) |
| `useOrderActions` | hooks/useOrderActions.ts | confirm, rollback, cancel actions with state machine validation |
| `useCustomerHistory` | hooks/useCustomerHistory.ts | Past orders + installed products per customer |
| `useBlueplate` | hooks/useBlueplate.ts | Qatar Blue Plate API fetch + parse |

### Pattern
All hooks follow the existing TanStack Query v5 pattern used in `usePurchaseOrders.ts`:
- `useQuery` for reads with `queryKey` arrays
- `useMutation` for writes with `onSuccess` cache invalidation
- Supabase client from `src/lib/supabase/client.ts`

---

## 12. Error Handling

| Scenario | Handling |
|---|---|
| Phone lookup — network error | Toast: "Lookup failed — try again" |
| Blue Plate API unavailable | Inline fallback: "API unavailable — enter manually" |
| Order confirm — state machine violation | Toast: "Cannot transition from X to Y" |
| Address not selected on confirm | Field highlighted red, scroll to field |
| No team assigned on confirm | Toast: "Assign at least one team before confirming" |
| Cancel without reason | Confirm button disabled |
| Duplicate phone on link | Toast: "This number is already linked to a different customer — merge not supported yet" |

---

## 13. Permissions

Follows the same RLS pattern as Purchase Orders:

| Role | Can Do |
|---|---|
| agent | Create, view own orders, confirm/cancel scheduled orders |
| manager | All agent actions + approve pending-approval orders + view all agents' orders |
| admin | Full access |

RLS on `orders` table: existing policy by `division` scope (same as POs) — no new RLS needed for Phase 1.

---

## 14. Implementation Build Order (Create-First)

The implementation plan will sequence tasks in this order:

**Phase A — Foundation (data + customer)**
1. DB migration: `customer_phones`, `customer_addresses`, `installed_products`
2. Hook: `useCustomerLookup` (phone search + quick-create + link)
3. Hook: `useCustomerAddresses` (fetch addresses, add Blue Plate, add coordinates)
4. Phone Lookup Modal component
5. Address Picker + Address Creation Sheet (Blue Plate + Coordinates)

**Phase B — Create Order**
6. Hook: `useCreateOrder`
7. Service Selector component (reuse existing pattern)
8. Team Calendar panel (reuse `CalendarPage` components)
9. Create Order page layout (left form + right calendar)
10. Customer History Panel (orders + products + month filter)
11. Confirm Order flow (validation + submission)

**Phase C — Order Management**
12. Hook: `useOrders` (list with filters)
13. Hook: `useOrderDetail` + `useOrderActions`
14. Order List page (`/orders`)
15. Order Detail Dialog (4 tabs)
16. Order Cancel Dialog
17. Navigation integration

**Phase D — Polish**
18. Responsive layout (mobile/tablet breakpoints)
19. Loading states, empty states, error states
20. Audit log display in detail dialog
