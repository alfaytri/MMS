# IT Company Meeting — Talking Points

> **Context:** Meeting with an IT vendor to introduce the MMS platform, present what's already done, and scope the three remaining modules I want them to take on.

---

## Opening (30 seconds)

> "Thanks for coming in. To set context: we've built an internal ERP — the Maintenance Management System — for Alfaytri Maintenance and RSH Cleaning & Pest Control. It's already in production. I'll walk you through what's live, then focus on three specific pieces I'd like your team to take on."

---

## Part 1 — What's built (2 minutes — keep it brisk)

Open the spec doc at the **status table** and say:

> "The platform is 26 modules, 63 pages, 120+ database tables — fully deployed on Vercel with Supabase as the backend. Rather than read the list, the headlines are:
>
> - **Operations** — Orders, Quotations, Contracts (quotations + live), Calendar scheduling, Team Leader mobile app, Live GPS fleet tracking on a map.
> - **Finance** — Invoices, Payments, Aging Receivables, Customer payment portal with Dibsy checkout.
> - **Procurement** — Full Purchase + Sales lifecycle with approval chains, FIFO inventory, landed costs, shipment tracking.
> - **Master Data** — 79 permission keys, role builder, services hub with 7 management tabs, full audit trail.
> - **Contact Centre** — WhatsApp (Wati + WHAPI) and 3CX voice are both live in the same sidebar.
>
> Tech stack: Next.js 15, TypeScript, Supabase, shadcn/ui — modern, enterprise-grade."

---

## Part 2 — What's left, and who does what (the important part)

> "Looking at the open items, **most of them my team will handle in-house**:
>
> - **Subscriptions** — packages page is already scaffolded, we'll finish it.
> - **Notification Trail** — straightforward delivery log, we'll build it.
> - **QuickBooks Integration** — sync badges are already live on invoices and payments; we'll wire the full account/payment/item mapping admin.
> - **Reports & Analytics** — overtime report is done; we'll expand the dashboards.
>
> **That leaves three pieces I want to discuss with you today** — these are bigger or outside our core competency:"

| # | Module | Why it's a fit for them |
|---|---|---|
| 1 | **Contact Centre — AI Sentiment (Fanar AI)** | Arabic dialect understanding, voice transcription, sentiment routing to Ops Manager dashboard. Needs ML/NLP expertise. |
| 2 | **Mobile App Services** | Customer-facing native mobile app — service catalog, booking, account. Needs iOS/Android dev. |
| 3 | **Customer Self-Booking Portal** | Self-schedule services from within the payment portal — extends an existing web flow. |

---

## Part 3 — Questions to ask them

1. **Scope & timeline** — "Which of the three can you deliver, and in what order?"
2. **Tech approach** — "Will the mobile app be native (Swift/Kotlin), React Native, or Flutter? We need it to talk to our existing Supabase backend."
3. **Fanar AI** — "Have you worked with Fanar AI before? If not, do you have an alternative for Arabic sentiment that you'd recommend?"
4. **Integration model** — "Our backend is Supabase with Row-Level Security on every table. You'd consume it via our API — are you comfortable with that pattern?"
5. **Pricing** — fixed-price per module vs. T&M.
6. **Handover & code ownership** — "Source code stays with us, in our GitHub. Agreed?"

---

## How to close

> "I'll send you the updated specification document after this meeting. It has the full module breakdown, the database schema, and the integration points you'd need. Once you've reviewed, I'd like a proposal covering scope, timeline, and pricing for those three modules — and a recommendation on which one to start first."

---

## Tone tips

- **Lead with what's done** — establishes you're not a startup looking for a builder, you're an operator looking for a specialist partner.
- **Be specific about scope boundaries** — signal you're not outsourcing whatever they want to pitch; you've already decided what's theirs.
- **Don't oversell the tech stack** — mention it once, move on. They'll ask if they care.
- **Keep the meeting under 45 minutes** — 5 min intro, 10 min walkthrough, 20 min Q&A, 10 min next steps.

---

## Key numbers to have on hand

- **26 modules** fully developed and operational
- **63 application pages** across all modules
- **120+ PostgreSQL tables** with Row-Level Security on every table
- **79 permission keys** in the role system
- Live integrations: **Wati, WHAPI, 3CX, Traccar GPS, 17track, Dibsy**

---

## Leave-behind

Send after the meeting: `Alfaytri_System_Specification_v2.1.docx` (the updated spec with current statuses).
