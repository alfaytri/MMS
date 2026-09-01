# Boss Review — Corrections Backlog

Source: `Approval chain databases.docx` (boss feedback, 2026-06-26)
Branch: `corrections`

The boss's notes have been split into **Questions** (needing answers/clarification before action) and **Suggestions** (concrete changes / fixes / new features to implement).

---

## ❓ Questions

1. **Approval chains** — how do they work? They appear to be only for purchase requests; confirm.
2. **Contract approvals** — do the existing approval chains handle contract approvals as well?
3. **Brand & brand group** — re-explain the concept and how they are used in the app.
4. **`calendar_schedule_id`** — what is it referring to? Which table/entity does it link to and what does it represent?
5. **Payment methods** — where are they populated from? (Hardcoded list, table, etc.)
6. **Payment method storage** — is it better to keep it as free text, or as a FK to the `payment_methods` table?
7. **Category** — where is the category field coming from? Hardcoded, or sourced from a table?
8. **`profile_id`** — is this a FK to the users table?
9. **Tracking integration** — are you connecting the tracking number to any tracking API to get the estimated date of arrival?

---

## ✅ Suggestions

### Database — Naming & Structure
1. Rename approval-chain tables so the scope is explicit (e.g. `purchase_approval_chain`).
2. Rename `approval_request` to `sales_approval_request` (it looks sales-only).
3. **Alternative to renaming**: merge all approval flows into one table with a `type` column (`purchase`, `sales`, `credit`, `contract`, …).
4. Rename the divisions table to **`Company_Divisions`**.

### Data / Display
5. Use realistic Arabic samples for the division name field (e.g. `الصيانه`).
6. **Global number formatting** — display every number with thousands separators: `#,###,###.##` (e.g. `3,000,000`).

### Warehouse / Users
7. Fix the warehouse-assignment dropdown so users with the **RP role** appear (currently they don't show even though they exist).

### Credit Groups (NEW feature)
8. Add an approval flow for credit groups.
9. Approval chain order: **Purchase Manager → Accounting Manager → Owner**.
10. Require uploaded documents before submitting a credit-group request: **CR, Establishment ID, signed credit form**.

### Document Templates
11. Prepare draft document templates for **all possible cases** (PO, SO, RFQ, invoice, bill, credit form, …) and submit them to the boss for approval.
12. Every document must include:
    - **Header**: legal company name
    - **Footer**: company address + contact number

### Orders — Company / Division Lock
13. Company and division must **not change** after a purchase or sale is created — they should remain as set at creation.
14. The purchase order itself must be linked to company and division.
15. On external-facing documents, **do not show the division** — use a short code embedded in the serial number for internal reference; only show the company name to suppliers/customers.

### Workflow Gating
16. RFQ vs Draft state needs review — "this is an RFQ but I saved as draft" is confusing.
17. **Block bill creation** until the PO is confirmed and fully approved.
18. **Block sales invoice creation** until the sale order is confirmed and fully approved.

### Record Payment
19. Show the **total balance** on the Record Payment screen.
20. Validate that the entered amount cannot exceed the outstanding balance.
21. Fix: **Total Paid does not refresh** after a payment is recorded.

### Receiving (Stock Receipt)
22. Provide a correction path for mistakes before confirming (e.g. accidentally adding free item qty 4 when meant 3).
23. Remove the "you can revert" wording. Replace with a strong warning:
    > **THIS CAN NOT BE CHANGED IN THE FUTURE. REVIEW BEFORE CONFIRMING.**
24. Add scenario help text covering the cases discussed (items sold fully / partially remaining / fully remaining). Make one a worked scenario and link it as reference.

### UI / Design Fixes
25. Redesign the **search box** — it looks cut off.
26. Fix the error that appears when trying to **save a quotation**.
27. Fix **text overflow** issue.

### Quotations — Margins & Approvals
28. When an item has a **negative margin**, add a "Send for approval" action (currently the app only shows an indication with no action).
29. **Owner / Sales Manager / Accounting Manager must see unit cost** on quotation/sale-order lines so they can evaluate the margin and decide whether to approve. Hide unit cost from other roles.

---

## 📋 Still to be Reviewed by Boss (out of scope for this pass)

- Purchase Returns
- Sale Order module (all of it)
- Warehouse Transfers
- Stock Changes / Adjustments
- All other Warehouse modules

---

## Quick-action checklist

- [ ] Rename approval tables to make scope explicit (or merge into one + `type` column)
- [ ] Rename divisions table to `Company_Divisions`
- [ ] Add realistic Arabic samples for division name
- [ ] Apply global number formatting `#,###,###.##`
- [ ] Fix warehouse-assignment dropdown to include RP-role users
- [ ] Build Credit Group approval flow (Purchase Mgr → Accounting Mgr → Owner)
- [ ] Enforce CR + Establishment ID + signed credit form before credit-group request
- [ ] Draft document templates for all flows with header (legal name) + footer (address, contact)
- [ ] Lock company/division on PO and Sale Order after creation
- [ ] Hide division on external-facing documents; use short code in serial
- [ ] Block bill creation until PO fully approved
- [ ] Block sales invoice creation until sale order fully approved
- [ ] Record Payment: show total balance, validate amount ≤ balance, refresh Total Paid
- [ ] Receiving: replace "can revert" with strong warning, add scenario help, allow correction path before confirm
- [ ] Fix search box design / text overflow / quotation save error
- [ ] Add "Send for approval" when margin is negative on quotations
- [ ] Show unit cost on quotations to owner / sales mgr / accounting mgr only
- [ ] Get answers to the 9 open questions above before implementing the related items
