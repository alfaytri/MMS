# Accounting Reports — Questions for the Accountant

We're building six reports: **Product Cost (PO-wise)**, **Revenue / COGS / Gross Profit**,
**Accounts Receivable**, **Accounts Payable**, **Cash & Cash Equivalents**, and **Profit & Loss** —
each filterable by division (and warehouse where stock applies), with Excel + PDF export.

Four earlier open questions were answered directly from the system's data. The items below
need an **accounting decision** before we finalise the **Cash** and **Profit & Loss** reports.
None of them block the other four reports.

---

## 1. Profit & Loss — Accrual vs Cash basis
The P&L will have an **Accrual / Cash** toggle. Please confirm the exact meaning of each:

- **Accrual basis** — our assumption: Revenue = sales **invoiced** in the period; COGS = cost of
  goods **sold/shipped** in the period; regardless of whether cash moved. ✅ correct?
- **Cash basis** — Revenue = cash **received** in the period. **COGS on a cash basis is the tricky
  part — how do you want it recognised?** For example:
  - cost of the items whose customer payment was received in the period, or
  - cost of the **supplier bills actually paid** in the period, or
  - something else?
- **Cash-basis revenue by stream** — on accrual we split revenue into **Product / Spare Parts /
  Consumables** from the invoice lines. A cash receipt often isn't tied to specific product lines.
  On a cash basis, how should a receipt be split across the three streams — proportional to the
  invoice's line mix, all to one bucket, or not split at all?

## 2. Cash & Cash Equivalents — opening balance  *(division auto-resolved — see note)*
- **Division:** resolved from the data — every payment links to a sale order / purchase order /
  invoice / bill, each of which already carries a division, so the cash report scopes by division
  automatically. Nothing to decide here.
- **What counts as "cash":** handled by a new **on/off flag per payment method** ("counts as cash")
  — e.g. tick *Cash* and *POS*, leave *Bank Transfer* off. Also nothing for the accountant to
  decide beyond which methods to tick, which is done in the app.
- **Opening balance (please confirm):** when a date range is applied, should the report show an
  **opening balance** (net of all cash received/paid *before* the start date) and carry a **running
  balance** down the rows? We recommend **yes**.

## 3. Revenue / COGS streams — where do "Tools" go?  ✅ DECIDED
**Tools get their own row** in both Revenue and COGS. The P&L streams are therefore:
**Products / Spare Parts / Consumables / Tools** — nothing folded or hidden. *(Decided 2026-08-11.)*

## 4. "Scrap & Defective" line (P&L) — confirm the source
The P&L has a **Scrap & Defective** line before Gross Profit. We plan to fill it from inventory
**written off as damaged** (quantity × cost) during the period. Is that the right source, or did
you mean something else (e.g. only physically scrapped items, or a specific expense account)?

## 5. "Exchange Gain / Loss" line (P&L) — scope
We can compute **realised FX gain/loss** from payments (when a foreign-currency invoice or bill
settles at a rate different from when it was raised). Should the P&L's Exchange Gain/Loss line
include **only payment-settlement FX**, or **also** revaluation on the orders themselves?

---

*Questions 4 and 5 are low-stakes — we have sensible defaults and can proceed on them if you'd
rather not decide now. Questions 1–3 genuinely shape the numbers, so those are the ones we most
need before building Cash (2.3) and Profit & Loss (2.4).*
