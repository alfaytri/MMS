# QC Quality-Analyst Workflow + WATI Template Messaging — Design

**Date:** 2026-09-12
**Branch:** full-build/admin-misc
**Status:** Part A FINALIZED (2026-09-14) — point rules + trigger logic received; ready to build. Part B still draft.

---

## Goal

Two related upgrades to the order lifecycle:

1. **QC quality-analyst workflow** — orders (new services, backworks, new-service items)
   accrue **quality points**. When points trigger it, the system **creates a QC inspection**,
   **assigns a Quality Analyst**, the analyst inspects, then the **Operations Manager reviews
   and books** it. Runs at **two stages**: pre-booking and post-completion.
2. **WATI template messaging** — reminders (in **months**), order confirmation, and invoicing
   send a **WhatsApp template message only (no PDF)**, choosing a template.

These are independent enough to build/ship separately (Part A then Part B, or in parallel),
but share the WATI send layer.

---

## Current state (what exists today)

- **Reminders:** `services.reminder_days` is saved + badged in the service tree but **nothing
  consumes it** — no scheduler, no message. Inert.
- **QC:** `services.qc_checklist` / `services.qc_items` (points) are **flags only** — not read by
  the QC flow. The real QC is a **QC Visit** (calendar visit type `qc`), **manually scheduled**;
  a team scores **each service 0–10** (max hardcoded to 10) + notes/photos/signature →
  `visit_completions.qc_scores`. No point trigger, no analyst assignment, no manager review.
- **Approvals precedent:** order booking is already gate-able — high-risk customers route order
  creation into a **Service Order Approval** queue (`sale_order_approvals`). The pre-booking QC
  gate should extend this same pattern rather than invent a parallel one.
- **WATI infra (already built for Contact Centre):** `/api/wati/send-template`,
  `/api/wati/templates` (list), `/api/wati/send-session`, `/api/wati/send-message`,
  `/api/wati/send-file`, `/api/wati/send-quotation`, webhook. Template messaging is available.
- **Roles/permissions:** `PermissionTree` slug system — new roles/permissions plug in here.

---

## Finalized QC decisions (2026-09-14, from user)

### Team quality score — NEW ("how good is this team, out of 10")
- Per team: starts at **10**, **−1 per backwork**, **floors at 0**.
- **Recovers +1** for each later order the team completes with **no backwork** (climbs back toward 10).
- **Resets to 10** when a team **member or leader changes**.
- It's the team's standing rating AND feeds QC scoring (the "team score watch" factor below).

### QC point rules — **summed** per order → the order's QC score
| Scenario | Points |
|----------|--------|
| New member in team | 1 |
| New leader | 2 |
| New service (team hasn't done it before) | 4 |
| Backwork | 5 |
| Customer complaint | 5 |
| New team (new to the service **or** newly created) | 7 |
| Team score watch (team is post-backwork — applies to the backwork order **and its next order**) | 3 |

Rules are **editable in-app** (admin screen); the uploaded set is the initial seed.

### Trigger + capacity
- **Threshold** (configurable, editable in-app): QC score **≥ threshold** → the order is a QC candidate.
- **Capacity:** a configurable **max QCs per day** (editable in-app — reflects how many QC teams you
  have, ~1–3 each; can vary per weekday if needed). Candidates are booked **highest-score first**;
  **overflow rolls to the next available day**.

### Timing — before / along-with / after the team's visit (per scenario)
- Each scenario has a configurable timing (before / along / after).
- The **highest-point scenario sets the QC timing**. **Backwork is top priority** — if present it wins
  (QC rides with the backwork). E.g. plain new-service → QC *along with* the team; any backwork → QC on
  the backwork's timing.

### Same-site dedup — configurable setting
- A setting decides whether two orders for the **same customer + site on the same day** share **one QC**
  or get **one QC each**. The operator's selection governs.

### Roles
- **`qc.analyst`** (QC team — inspects/scores) and **`qc.manager`** (Ops Manager — reviews, then books
  pre-booking / signs off post-completion).

### Reuse (not rebuilt)
- QC uses the existing **`qc` visit type** + `visit_completions` scoring + the team-scheduling calendar.
  The new build is the **auto point-scoring + auto-booking engine**, the team score, the queues, and the
  admin — not a new calendar/visit system.

### Minor assumptions (proceeding unless corrected)
- Team score floors at 0. "New leader/new member" = changed since the team's last order. "Customer
  complaint" = a flag raised on the order/customer. Default threshold seeded at a sensible value,
  editable in-app.

---

## Part A — QC Quality-Analyst Workflow

### Roles (new)
- **Quality Analyst (QA)** — receives assigned inspections, records findings/scores.
- **Operations Manager (Ops)** — reviews the QA's inspection, then **books** (pre-booking) or
  **signs off/closes** (post-completion).
Both added as `PermissionTree` slugs (e.g. `qc.analyst`, `qc.manager`).

### Point scoring
- On the triggering event (order created / work completed), compute `points` by summing all
  matching rules from the point-rules config for that stage.
- If `points >= threshold` → QC is **required** for that stage.
- **Dedup:** if a QC inspection already exists for the same **site (customer + location) on the
  same day**, attach this order to it instead of creating a second one ("no QC that day → create;
  else reuse").

### Stage 1 — Pre-booking inspection (gate)
1. New order / backwork / new-service is created → points computed.
2. If triggered → order enters **`pending_qc`** instead of being booked; a **QC inspection** row
   is created (stage `pre_booking`) and a **QA is assigned**.
3. QA inspects (site survey / validation) → submits findings + pass/fail + notes/photos.
4. Routed to **Ops Manager** → reviews → **Books** the order (schedules it) or **rejects**
   (back to QA / cancelled). Non-triggered orders book as they do today (no gate).

### Stage 2 — Post-completion QC
1. Team completes the job → points computed for `post_completion`.
2. If triggered (and dedup allows) → **QC inspection** row (stage `post_completion`) + QA assigned.
3. QA inspects finished quality → scores (reusing the existing per-service 0–10 scoring, but
   driven by the service's **QC Items** where defined instead of a flat max-10).
4. Routed to **Ops Manager** → **signs off** (closes) or **flags for rework** (→ backwork).

### Assignment logic (recommended; confirm)
- A **pool of QAs** (users with `qc.analyst`), assigned by **round-robin within the order's
  division**, balanced by open-inspection count, with **manual reassignment** by Ops.

### Data model
- `qc_point_rules` — the uploadable config (match_kind, match_value, points, stage, active).
- `qc_inspections` — `id, order_id, site_key, inspection_date, stage, points, status, analyst_id,
  reviewed_by, findings, scores(jsonb), created_at, decided_at`.
  Statuses: `pending_analyst → analyst_done → pending_manager → approved(booked)|rejected`.
- Reuse `visit_completions` / QC-visit scoring for the actual on-site scoring where possible.

### UI surfaces
- **QA queue** — "My Inspections" list (assigned, pending).
- **Ops review queue** — inspections `pending_manager`, with a Book / Reject action.
- **Order detail** — shows QC status + inspection history.
- **Point-rules admin** — screen to view/edit the uploaded rules + threshold.

---

## Part B — WATI Template Messaging

All three send a **template message only (no PDF)** via `/api/wati/send-template`, choosing a
template from `/api/wati/templates`.

### Reminders (per-service template, groupable, in months)
- **Reminder templates (groups)** — a reusable record: `name + WATI template + interval_months
  + variable map`. You manage a small set centrally (e.g. "Annual AC Reminder", "6-Month Filter
  Reminder").
- **Each service points to one reminder template** (`services.reminder_template_id`, nullable =
  no reminder). Different services can use different templates; assigning the **same** template to
  many services **is** the grouping. Bulk-assign from the service tree.
- Interval is in **months**.
- **Scheduler = Vercel Cron (confirmed available & already in use).** `vercel.json` already runs
  daily crons (`/api/cron/notifications`, etc.); add a `/api/cron/reminders` route the same way.
  It runs daily, finds services whose reminder is due (last-service date + the template's
  `interval_months`), sends that service's template to the customer, and logs it (dedup).

### Order confirmation
- On order booking/confirmation → send the selected **confirmation template** to the customer
  (message only), instead of the current PDF send.

### Invoice
- On invoicing → send the selected **invoice template** (message only, no PDF attachment).

### Template selection
- A small **settings screen** mapping each event (reminder / confirmation / invoice) → a chosen
  WATI template + its variable bindings (customer name, order no, date, amount…).

### Data model
- `reminder_templates` — `id, name, wati_template_name, interval_months, variable_map, active`.
  Services reference one via `services.reminder_template_id`.
- `wati_message_config` — event (confirmation / invoice) → template name + variable map.
- `wati_message_log` — what was sent, to whom, when, for which order/reminder (dedup + audit).

---

## Assumptions to confirm
1. **QC timing** = both stages (confirmed).
2. **"Book it"** = Ops Manager schedules the order after pre-booking inspection passes.
3. Pre-booking QC **blocks** booking until approved (hard gate) — vs. advisory only.
4. QA assignment = round-robin by division + manual override.
5. Post-completion scoring should use the service's **QC Items** (per-item points) instead of the
   flat 0–10 — i.e. finally wire `services.qc_items` in.
6. Reminders: switch to **months**; scheduler = **Vercel Cron** (confirmed — already running daily
   crons in `vercel.json`). Each service picks a **reminder template**; sharing a template groups
   services.
7. Confirmation/Invoice messages **replace** the PDF send (not in addition) — confirm.

## A2 build — resolved decisions (2026-09-14, from user)
- **Hard gate (confirmed).** A QC-triggered order is HELD (not booked) until the QA inspects and the Ops Manager books it. Held via `orders.status='pending-approval'` (reused; no new enum value) disambiguated by a new `orders.qc_inspection_id`; final booking (`status='scheduled'`) happens only when no gate remains (shared `_maybe_book_order` helper called by both the QC Ops-book and the risk `approve_order_request`).
- **Inject in `create_order_with_dates`** after `order_team_assignments`, alongside the existing customer-risk gate (`20260930001200`). Extend the return contract with a `qc_pending` flag.
- **Member/leader change = snapshot.** New table `order_team_snapshots(order_id, team_id, leader_id, member_ids[])` written for EVERY order at creation; `new_leader`/`new_member` = diff vs the team's previous order snapshot (so they score from the first order after ship onward).
- **Customer complaint = order customer notes.** New table `order_customer_notes(order_id, note, created_by, created_at)` + an "Add note" affordance on the order card (OrderDetailDialog). `customer_complaint` fires when the order OR its parent order has ≥1 customer note.
- **Fully derivable now:** backwork (`orders.type='backwork'`), new_service (team↔service history via `order_team_assignments`+`order_services`), new_team (team has no prior orders), team_score_watch (team has a current/immediately-prior backwork).
- **`qc_inspections` built clean** (per this design); the orphan legacy QC tables (`qc_schedule`, `qc_inspection_results`, `qc_team_scores`, `qc_checklists`) are left untouched — flag for later cleanup.
- **QA assignment:** round-robin over `recipients_for_permission('qc.analyst')` within the order's division, balanced by open-inspection count, manual Ops override.
- **Booking the QC visit** reuses the `qc` visit type: an `order` with `type='qc'` on an `is_qc` team → shows in `calendar_visits`; QA completes via `complete_visit` → `visit_completions.qc_scores`.

## Phasing (build order)
- **A1** point-rules config + admin screen (needs the upload).
- **A2** pre-booking gate + QA/Ops queues + assignment.
- **A3** post-completion QC + wire `qc_items` into scoring.
- **B1** WATI send-template plumbing + template config screen.
- **B2** order confirmation + invoice messages.
- **B3** month-based reminder scheduler.

## Out of scope (for now)
- Rebuilding the calendar/visit system; QC reuses existing visit/scoring where possible.
- Email/SMS channels (WhatsApp/WATI only).
