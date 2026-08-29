# 7. Common Tasks & Troubleshooting

A quick "how do I…" index, then what to do when something is blocked.

## 7.1 How do I…? — quick index

Menu paths follow the app's own menus. If a page or button below isn't visible to you, your role probably doesn't have that permission — **ask your administrator**.

**Inventory & stock**

- **Add a new item, category, or brand** — Master Data → Inventory
- **Check how much stock I have (by division)** — Master Data → Inventory (use the **All Divisions** filter at the top right)
- **Add or correct stock** (found / lost / damaged / write-off) — Master Data → Warehouses → Adjustments
- **Move stock between warehouses** — Master Data → Warehouses → Transfers
- **Do a stock count / inventory check** — Master Data → Warehouses → Inventory Check
- **See slow-moving / dead stock** — Purchase & Sales → Dead Stock Report

**Purchasing**

- **Add a supplier** — Purchase & Sales → Suppliers
- **Raise a purchase order** — Purchase & Sales → Purchase Orders → New PO
- **Approve a PO waiting on me** — Purchase & Sales → Approvals (or the Dashboard's *My Pending Approvals*)
- **Receive delivered goods** — Purchase & Sales → Receivals
- **Add freight / customs to received goods** — Purchase & Sales → Landed Costs
- **Record a supplier bill and pay it** — Purchase & Sales → Bills
- **Return goods to a supplier / raise a debit note** — Purchase & Sales → Returns / Debit Notes
- **Track an incoming shipment** — Purchase & Sales → Shipments
- **See what we owe suppliers** — Purchase & Sales → Aging Report (or Reports → Accounts Payable)

**Sales**

- **Add a customer** — Purchase & Sales → Customers
- **Create a sale order** (with its quotation lines) — Purchase & Sales → Sale Orders → New SO
- **Invoice a sale** — Purchase & Sales → SO Invoices
- **Deliver goods to a customer** — Purchase & Sales → Deliveries
- **Record a customer payment** — Purchase & Sales → SO Invoices (open the invoice → record payment)
- **Handle a customer return / credit note** — Purchase & Sales → Returns / Credit Notes
- **Print a customer's statement** — Purchase & Sales → Customer Statement
- **See what customers owe us** — Purchase & Sales → Aging Report (or Reports → Accounts Receivable)

**Operations**

- **Hand stock to a team / van / project** — Operations → Custody
- **Issue stock for internal use or a project** — Operations → Consumption
- **Send damaged stock for repair, or write it off** — Operations → Damaged Stock
- **Manage tools & assets** — Operations → Tools & Assets

**People & settings** *(administrator)*

- **Add a user, or change a role's permissions** — Master Data → Users & Roles
- **Edit the reason pick-lists** (adjustments, write-offs, cancellations) — Master Data → Admin → Reason Lists
- **Set up approval chains, credit groups, currencies, etc.** — Master Data → Admin
- **See who did what** — Master Data → Audit Trail

## 7.2 When something's blocked

- **A PO or SO is stuck on "Pending Approval."** Its value is above your approval tier, so it's waiting for an approver. Check **Approvals** to see who it's with and ask that person — approvers find it under the Dashboard's *My Pending Approvals*.
- **"Credit limit exceeded" when confirming a sale.** The customer is over their credit group's limit. Take a payment to bring the balance down, or request a credit-group change (which itself needs approval).
- **An item shows stock on hand but "0 available."** Those units are **reserved by a pending transfer** — spoken for, but not yet moved. Complete or cancel that transfer to free them.
- **A menu or button described here isn't there.** Your role doesn't have that permission — ask your administrator to grant it.
- **A full-screen "no division" message after login.** Your account isn't assigned to any division yet. Use the **Notify administrator** button on that screen and they'll assign you.
- **"Permission denied … pricing" when editing a cost or price.** Changing prices needs a specific permission — ask your administrator for it.
- **Your login doesn't work.** Passwords are managed by the administrator, not self-service — ask them to reset it.
- **You received fewer units than were dispatched on a transfer.** The difference is shrinkage/loss; record the shortfall with a reason when you receive the transfer.
- **A number looks stale right after you saved.** The on-screen figure hadn't refreshed — reload the page; if it's still wrong, tell your administrator.

## 7.3 Who to ask

- **Your administrator** — passwords, new accounts, permissions, roles, division access, and anything that "isn't showing up."
- **The approver in the chain** — a PO or SO stuck in approval (the Approvals page shows who it's waiting on).
- **Accounts / finance** — credit limits, customer and supplier balances, and payment questions.

> **Tip:** the Dashboard is the fastest starting point every morning — its cards jump you straight to open POs, open SOs, and your pending approvals.
