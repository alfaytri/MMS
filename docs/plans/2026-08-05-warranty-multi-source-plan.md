# Warranty Tracking — The Plan

Hi,

Here's how I want us to handle warranty tracking across the company. Read the plan first, then two questions at the end that need your call before I finalize.

---

## The Plan

**The goal is one place — one screen — where every warranty we've ever issued is monitored, no matter which part of the business issued it.**

### How warranty gets attached to an item

Every item category in the system carries its own warranty policy (e.g. "Standard 12 months — parts only", "AC 24 months — parts and labor", "No warranty"). Any item in that category inherits the policy automatically. Specific items that need a different rule can override the category default.

### Where warranties come from

Warranty in this business doesn't come from sales alone. It comes from any job we do that we stand behind. So the tracking system is designed to accept warranties from **four sources**:

1. **Sales orders** — a customer buys something, we cover it.
2. **Service orders** — we perform a service or maintenance job, our work is warranted.
3. **Contracts (MEP / construction)** — we finish a fit-out, the materials and workmanship are warranted.
4. **Installations** — we install a product on site.

Each warranty row on the system will carry a tag saying which source it came from, so we can filter and report on each independently. On day one only sales will feed into it — the other three come later, once the ERP core is fully shipped, each with its own plan.

### How each warranty is numbered

Every warranty gets a unique number that includes the source and the division that issued it, so at a glance we know where it came from and which company (Alfaytri Maintenance, Alfaytri Kitchen, RSH etc.) owns it.

The format is:

`WAR-<source>-<division>-<counter>`

For example:

- `WAR-SALE-AFM-001` — first warranty issued from a sale under Alfaytri Maintenance
- `WAR-SALE-AFK-001` — first warranty issued from a sale under Alfaytri Kitchen
- `WAR-SERV-AFM-023` — the 23rd warranty from a service order under Alfaytri Maintenance (once service is wired in)

The counter is per source per division, so each stream numbers independently and cleanly.

### The Warranty Register

A dedicated page in the system — a live list of every warranty we hold — visible only to the roles you approve on the navigation permission list (sales, accounts, service leads, etc — not warehouse operators or delivery staff).

The register shows for each row: warranty number, customer, item covered, policy applied, start date, end date, source (sale / service / contract / install), and the division that issued it. It's searchable by customer name or phone, filterable by source, division, and date range.

Because we're only tracking sales at first, the sales version of the register comes as its own tab on the sales side too — so the sales team has a quick way to check "what did we sell to this customer that's still under warranty?" without leaving their workspace. Expired warranties live on a separate tab so the active view stays short and useful.

### Certificate at handover

Every warranty comes with a printable bilingual certificate (English + Arabic) that the operator can hand to the customer at the point of handover. Reprints regenerate the same certificate from the record — the terms are locked in when the warranty is created, so a customer disputing later sees exactly what we committed to on the day.

### What comes later (not in this version)

- **Service orders** — we still need to decide what part of a service job is warranted (labor only, or labor + parts). I'll come back with a proposal once the ERP is shipped.
- **Contracts (MEP / construction)** — contracts will carry their own policy attached at the contract level, not per line. Deferred to a separate plan once contracts module is in.
- **Installations** — will live under service orders. Separate plan when we get there.

---

## Two questions for you

I need your vision on these before I finalize — they change what we build.

### 1. Warranty Claims — what should happen when a customer raises one?

When a customer comes to us saying "my compressor failed, it's still under warranty" — how do you want the process tracked in the system?

Two options I'm weighing:

- **Full claim workflow** — a claim record is opened against the original warranty. Tech team inspects, marks it Covered / Void / Rejected. If covered, the system routes it to the right action: a repair job, a replacement delivery, or a credit note. Every step tracked, every decision recorded, full history against the warranty.
- **Simple status flag** — the warranty row just gets a status marker ("Under Claim" / "Claimed") and the actual work is booked as a normal repair or replacement in the existing workflows, without a formal claim record.

The full workflow is more work to build but gives us proper visibility, accountability, and a record we can defend to a customer or auditor. The simple flag is lighter but relies on people remembering to note things manually.

**What's your vision — full workflow, simple flag, or something in between?**

### 2. Expiry Reminders — should the system alert anyone when a warranty is close to expiring?

For example, at 30 days before expiry, should the system:

- **Notify the customer** — send a WhatsApp / SMS to remind them their warranty is ending soon, offer an extension check.
- **Notify our team** — flag the row in the register so a salesperson can call the customer proactively.
- **Both** — customer sees the reminder, team sees the flag.
- **Neither** — no reminders, we deal with claims when they come in.

The register can show "expiring in 30 days" as a filter regardless, but the question is whether we push a notification out.

**What's your call?**

---

Let me know your thinking on the two questions above and I'll finalize the plan. Everything above the questions is what I'll build regardless — the questions only change the layers we add on top.

Thanks,
Mohamed
