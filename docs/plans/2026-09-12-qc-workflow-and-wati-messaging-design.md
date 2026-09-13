# QC Quality-Analyst Workflow + WATI Template Messaging — Design

**Date:** 2026-09-12
**Branch:** full-build/admin-misc
**Status:** DRAFT — awaiting review + point-rules upload from user

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

## Open input (user will supply)

**Point rules table.** The user will upload the definitive list of *what earns points and how
many*. The design treats this as **configurable data**, not hardcoded. Expected shape per rule:

| field | meaning | example |
|-------|---------|---------|
| `match_kind` | what the rule matches on | `service`, `order_type`, `item_kind`, `service_category` |
| `match_value` | the value to match | a service id, `backwork`, `new_service`, `product` |
| `points` | points added when matched | `5` |
| `stage` | which stage it applies to | `pre_booking`, `post_completion`, `both` |

Plus two knobs: **trigger threshold** (points ≥ N → QC required) and the **dedup rule**
("one QC per site per day"). Values TBD from the upload.

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
