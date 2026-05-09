# Future Modules — Notes & Build Order

Captured during Orders module brainstorming session (2026-05-09).

---

## Agreed Build Order

| # | Module | Branch | Status |
|---|---|---|---|
| 1 | Calendar | `feature/Calander` | ✅ Done |
| 2 | Orders | `feature/orders-module` | 🔄 In Progress |
| 3 | Contact Centre | `feature/contact-centre` | 📋 Designed |
| 4 | Contracts | `feature/contracts-module` | 📋 Spec in `Ideas/Contracts Module.txt` |
| 5 | Teams enhancements | alongside above | 📋 Partial |

---

## Calendar Module

**Status:** Built — `feature/Calander`
**Files:** `src/components/calendar/`, `src/hooks/useCalendarVisits.ts`
**What it does:** Operations timeline. Week view, team rows × time columns, order blocks, swap team dialog.

**Phase 2 backlog:**
- Multi-day visit grouping via `parent_assignment_id` (column added in Orders DB amendments)
- "Fill from Waitlist" button on empty slot when order is cancelled/moved
- Proximity dispatching — score teams by travel time from previous visit to new order address (needs map/routing API)
- Map view (`/map`) — spatial "space view" sibling to calendar's "time view"

---

## Teams Module

**Status:** Built (Phase 1) — teams, employees, schedules, vehicle assignments, activity logging

**Phase 2 backlog:**
- Teams have phone numbers → messages from these numbers appear in Contact Centre TEAMS tab
- **Team Leader App (mobile):** technicians use this to mark orders complete and log installed products
  - This is the **only write path** for the `installed_products` table
  - Flow: tech marks order `completed` → prompt "Add Installed Products" → fills `installed_products` with `order_id`, `address_id`, `warranty_months` derived from `order_services`
- Team skills drive skill-highlighting in Create Order calendar (green glow = skill match)

---

## Contracts Module

**Status:** Not built. Full spec: `Ideas/Contracts Module.txt`

**Two workflows:**
1. **Contract Quotations** — draft → manager review → sent to customer → awaiting signature → approved → active
2. **Live Contracts** — active contracts with visit scheduling, payment tracking, progress bars

**Key concepts:**
- Building tree: Complex → Building → Floor → Area → Services (each area has services with frequency)
- Service schedule section: mini calendar + drag-and-drop time slot assignment grid (most complex section)
- Payment modes: Fixed / Milestone / Completion
- Contract visits create `orders` with `type = 'contract-visit'`, `source_contract_id` linking back
- Terms & Conditions auto-collected from service tree + divisions
- Signed document upload (PDF/image) when customer approves

**Branch when ready:** `feature/contracts-module` — branch from develop after Orders merged.

---

## Contact Centre Module

**See full notes:** `docs/modules/contact-centre.md`

**Short summary:** Wati (WhatsApp) + 3CX (dialer) sidebar with customer CRM, task management, priority queue chat ordering, address drag-and-drop to Order form.

---

## Qatar-Specific Technical Notes

### Blue Plate Address System
- Qatar official addressing: Unit / Building / Street / Zone (e.g., U-5, B58, St662, Z70)
- Each address has GPS coordinates (lat/lng)
- API: Qatar Municipality / Metrash — **endpoint must be confirmed with client before building**
- Implementation: Supabase Edge Function `blue-plate-lookup` as proxy (CORS + API key protection)
- Fallback: Google Coordinates (lat/lng pin drop) for properties without a Blue Plate

### Customer Identity Model
- **Phone number = true unique identifier** (names are not unique in Qatar — many people share the same name)
- One customer can have multiple phone numbers (personal + work)
- Phones are linked to the same customer via `customer_id` FK on `customer_phones`
- During customer creation: ask "does this customer use another number?" to link phones under same record
- Analytics value: phone → address preference (which number is used for which area/location)
- `customer_addresses.address_line` is NOT persisted — computed on frontend via `formatAddressLine()`
- `orders.address` IS a persisted snapshot (intentionally immutable once order is placed)

### Orders vs Sales Orders
- **Orders** (`/orders`) = field service orders (AC cleaning, pest control, maintenance) — this module
- **Sale Orders** (`/sales/orders`) = trading/goods invoicing — built Phase 1, separate module
- Both use the `customers` table but for different purposes
- Service customers include both B2B (hotels, corporations) and residential individuals

---

## Full Phase 2 Backlog

| Item | Module | Priority |
|---|---|---|
| Proximity dispatching (team scoring by travel time) | Calendar / Orders | Medium |
| Waitlist "Fill Slot" button on empty slots | Calendar / Orders | Medium |
| Multi-day order swap logic (respect `parent_assignment_id`) | Calendar | Low |
| Post-visit product spawning (Team Leader App) | Teams / Orders | High |
| Quotations flow (draft → approve → convert to order) | Orders | High |
| Follow-up creation page (`/orders/create-follow-up`) | Orders | High |
| Backwork creation page (`/orders/create-backwork`) | Orders | High |
| Mobile Booking auto-assign engine | Orders | Medium |
| WhatsApp 48hr auto-confirmation before visit | Orders / Wati | Medium |
| Contact Centre native panel (customer search + addresses) | Contact Centre | High |
| Wati thread embed (read-only) | Contact Centre | High |
| Wati reply/send | Contact Centre | Medium |
| 3CX dialer embed | Contact Centre | Medium |
| Task creation from order detail | Contact Centre | Medium |
| Map view (`/map`) spatial calendar sibling | Calendar | Low |
| Contracts quotation flow | Contracts | High |
| Contracts live management | Contracts | High |
