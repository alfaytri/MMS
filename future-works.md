# MMS — Future Works & Remaining Tasks

> Last updated: 2026-05-30

---

## Contracts Module (Not Started — UI)

Database schema exists (`contracts`, `contract_visits`, `contract_payments`). All 4 pages and 11 components need to be built.

- View Contract Quotations page (`/contracts/quotations`) — list with status chips, filters, pipeline value badge
- Create Contract Quotation page (`/contracts/create-quotation`) — building tree, service schedule, payment schedule, terms & conditions
- View Live Contracts page (`/contracts`) — expandable cards with visit/payment progress bars
- Contract Detail page (`/contracts/detail/[id]`) — visit generator, frequency selector, team assignment
- ContractCard component — collapsed/expanded with progress bars
- ContractBuildingTree component — recursive tree for complex → building → floor → area
- ServiceScheduleSection component — mini calendar + drag-and-drop time-slot grid
- PaymentScheduleSection component — fixed/milestone/completion payment modes
- ContractTermsSection component — auto-collected T&C from services + divisions
- AddContractServiceDialog component — 2-step service picker with brand/condition pricing
- CancelContractDialog component — cancellation with reason

---

## Contact Center (Partially Done)

Built: WhatsApp dual-provider (WATI + WHAPI), chat sidebar, CRM section, address section, order history, chat input, escalation API.

- Agent Resources panel — searchable Q&A + file library (agent_resources + agent_qa tables, no UI)
- Task Queue panel — real-time task cards for cancel/reschedule/follow-up/unavailable (contact_center_tasks, escalation API exists but no queue UI)
- Products & Warranty section — customer products panel with warranty countdown
- 3CX Dialer integration — softphone UI for live calls (phone_lines_3cx table exists, no UI)
- Auto-message controls — per-customer toggle for block/unblock + reminder stop
- WhatsApp 24h window enforcement — template-only mode when window closed (WATI channel)

---

## Reports Module (Partially Done)

Built: Overtime report only.

- Financial reports — revenue, COGS, margins by division/team/period
- Team performance — completion rates, response times, QC scores
- Customer analytics — frequency, lifetime value, satisfaction
- Inventory reports — turnover, reorder suggestions, consumption patterns
- Contract reports — renewal pipeline, visit completion rates, payment aging

---

## Admin Security Hardening (Partially Done)

Built: User CRUD API routes, middleware for password change enforcement.

- Authorization checks — admin-only gates on user management routes (create/edit/reset-password)
- JWT metadata staleness — force session refresh after updates
- Role update atomicity — wrap delete+insert in a Postgres RPC transaction
- Rate limiting — protect sensitive endpoints from abuse
- Self-deactivation prevention — block admin from deactivating own account
- Middleware path hardening — explicit allowlist for bypass routes

---

## Open Bugs / Issues

- **LC Bills bucket is public** — storage bucket `lc-bills` set to `public: true`, should use signed URLs for viewing sensitive supplier invoices
- **LC Revert snapshot overwrite** — `revert_landed_cost` RPC uses snapshot overwrite instead of delta subtraction; reverting first LC when multiple applied will corrupt costs
- **Admin route authorization** — user management routes (`/api/users/create`, `/api/users/[id]`, `/api/users/reset-password`) lack admin-only guards; any authenticated user can access

---

## Minor Polish Items

- Notification Trail UI — schema exists (`notification_trail` table), needs a list page
- QC Visits scheduling UI — schema exists (`qc_schedule`, `qc_inspection_results`), needs management page
- Map clustering — at high team counts markers overlap; needs Leaflet clustering plugin
- Map dark mode — marker popup HTML uses inline hex colors, won't respect theme switching
- Calendar date picker — only ±1 day arrows, no calendar popup for jumping to a specific date
- Calendar filter persistence — refreshing resets all filters (no URL state sync)
