# Production Roles — What Each Role Does + Coverage Check

**Source:** live prod database (`custom_roles` on new-prod) cross-checked against your filled-in
`Prod-Roles-User-Assignment.xlsx` and the app's permission catalog + route gates.
**Date:** 2026-08-23 · **Build:** `deploy/warehouse-shipping` (back-office ERP)

> How to read: each role lists **who** is assigned (from your sheet), **what they do** in plain
> English, and the **key things they can / can't** do. A role marked *full access* bypasses every
> permission check. Everyone can only ever open pages their role allows.

---

## 1. Full-access tier (owners / admin / dev)

These three are **system admins** — they can open *everything*, regardless of the catalog.

| Role | Who | What they do |
|---|---|---|
| **Owner** | Owners | Top authority. Full access to every module. Can sit in approval chains. |
| **Admin Level** | Owners | Same full power as Owner (the owners' admin login). Can sit in approval chains. |
| **Developer** | Mr. Ismail | Full access for building & maintaining the system. Deliberately **kept out** of business approval chains. |

---

## 2. Finance & Accounting

**Accounting Manager** — *Mr. Nijam*
Runs the money side end-to-end. Creates and manages supplier **bills**, records **supplier &
customer payments**, manages **landed costs**, **credit notes**, and customer **credit groups &
types**; sees all **finance reports & dashboards** and can **export** data. Also manages the
**inventory catalog & pricing**. Can sit in approval chains.
*Can't:* company/division/user/role setup, bypass PO approvals.

**Accounting user** — *Mr. Adil, Mr. Ijas, Mr. Abdullah*
Day-to-day accounting clerks. Create **bills** & **landed costs**, **record payments**, create
**sales invoices**, view POs/SOs and their finance tabs, see the **finance dashboard & reports**.
*Can't:* manage/approve, manage suppliers, edit the catalog (view only).

---

## 3. Inventory & Warehouse

**Inventory Manager** — *Mr. Nijam*
Owns the stock. Manages the **inventory catalog & item attributes**, runs **stock counts/checks**,
**adjustments**, **transfers** (create / approve / dispatch / receive), **receivals**, **damaged
stock**, and **consumption** (from custody & internal); sees **stock value** + finance dashboard.
Can sit in approval chains.
*Can't:* purchasing beyond receivals, sales, company/user setup.

**Inventory User** — *Mr. Shoyal, Mr. Thangarasa, Mr. Salman*
Warehouse floor staff. Create **receivals**, do **stock checks/counts**, **request adjustments**,
**create / dispatch / receive transfers**, handle **damaged stock**, view catalog & stock.
*Can't:* approve transfers, edit the catalog, see stock value/cost, touch finance.

**Warehouse Manager** — *⚠ nobody assigned (not on your sheet)*
A fully-built role almost identical to Inventory Manager (receivals manage, transfers approve,
checks, damaged stock, **deliveries** create/manage, **projects** manage, stock value). It currently
has **0 users** and isn't on your sheet. **Decide:** assign it, or retire it (it overlaps Inventory
Manager heavily).

**Brand Manager** — *⚠ nobody assigned*
Minimal **read-only**: view inventory catalog + view warehouse adjustments/checks. Essentially a
catalog/brand viewer. No user assigned — decide what it's for or drop it.

**Special Inv User**  *( = your "Inventory User 2" )* — *Mr. Thangarasa – Industrial Area*
A stripped-down warehouse role: master-data access + **"simple picture transfer" only** (the
picture-based Send/Receive screen for floor staff).
*Can't:* anything else.

**Tools & Assets Manage**  *(new — created 2026-08-23)* — *unassigned (assign as needed)*
Runs **Operations → Tools & Assets**: assigns serialized tools to teams, moves them between teams in
the same division, runs condition checks (Good / Bad / Under-repair), and resolves repairs
(Repaired, or Scrap → posts the unit cost to the P&L). Sees tool/scrap **costs**.
*Note:* the page is **division-scoped** — whoever holds this role must also be assigned to the
relevant division(s), or they'll see no tools.

---

## 4. Purchasing

**Purchase Manager** — *Mr. Shenil*
Runs buying. Create/manage **purchase orders**, **bills**, **receivals**, **returns**,
**shipments**, **landed costs**; manages **suppliers**; sees purchase + finance reports (payables,
cash, product cost, P&L). Can sit in approval chains.
*Can't:* sales; record payments (view only); company/user setup.

**Purchase User** — *Mr. Rafid & Mr. Anas*
Buyers/clerks. Create & manage **POs**, create **bills**, **receivals**, **returns**,
**shipments**, **landed costs**; create suppliers; see product-cost / profitability / P&L reports.
*Can't:* fully manage suppliers, approvals, payments.

---

## 5. Sales

**Sales Manager** — *Mr. Adnan, Mr. Moez, Mr. Naeem, Mr. Shenil, Mr. Shaif*
Runs selling. Create/manage **sale orders**, **invoices**, **deliveries**, **returns**, **credit
notes**; **manage & approve** sale orders; manages **customers**; sees finance dashboard + reports;
views stock. Can sit in approval chains.
*Can't:* purchasing; record payments (view only); setup.
*⚠ Separation-of-duties note:* this role can both **create and approve** a sale order.

**Sales User** — *Mr. Anoop, Mr. Anas, Mr. Shoyal*
Sales staff. Create **sale orders**, **invoices**, **deliveries**, **returns**; create customers;
view credit notes & stock.
*Can't:* manage/approve, payments, purchasing.

---

## 6. Field teams & projects (Operations → Custody + Consumption)

These are intentionally **tiny** roles — they only touch **Operations → Custody / Consumption**
(the field-stock-holding workflow). They see **no** inventory catalog, purchasing, sales, or finance.

**Project Manager** — *Mr. Moez*
Manages stock **custody + consumption for one specific project location**. View/edit custody for
that scope, create consumption from custody, view consumption.

**Project User** — *Mr. Wasim*
A project member who **holds custody stock** (responsible person) and views custody (with cost).
*Can't:* edit custody or create consumption.

**Team manager**  *( = your "Team Supervisor / Foreman" )* — *Maintenance – Mr. Shahid & Mr. Gufran (needs 2 accounts)*
The foreman who issues stock to jobs: view/edit **custody** and create/view **consumption** for the
maintenance team's scope.

**Team User** — *Maintenance (30 teams), RSH (5), Kitchen (3), MEP (3)*
The everyday technician account: **holds custody stock** (responsible person) + views custody.
*Can't:* edit custody, consume, or see anything else.

**Van User** — *Mr. Shabir*
Same shape as Team User, for **van stock**: holds custody + views custody.

---

## 7. Coverage verdict

**The core back-office app is fully covered** — every module has a manager + user pairing:

| App area | Owned by | Status |
|---|---|---|
| Inventory / Warehouse | Inventory Manager + Inventory User (+ Warehouse Manager spare) | ✅ |
| Purchasing | Purchase Manager + Purchase User | ✅ |
| Sales | Sales Manager + Sales User | ✅ |
| Finance / Accounting | Accounting Manager + Accounting user | ✅ |
| Reports | Managers + Accounting | ✅ |
| Operations · Custody / Consumption | Project / Team / Van + Inventory Manager | ✅ |
| Operations · Tools & Assets | **Tools & Assets Manage** *(new, 2026-08-23)* | ✅ |
| Admin / setup (companies, divisions, users, roles) | Owner / Admin / Developer only | ✅ correct |

### Things only Owner/Admin can reach today (no operational role has them)

1. ~~**Tools & Assets**~~ — **RESOLVED 2026-08-23:** created a dedicated **Tools & Assets Manage**
   role (`operations.access` + `tools.assets.view` + `manage` + `cost.view`). Assign it to whoever
   runs the tool room.
2. **Warranties** (Sales → Warranties) — no non-admin role. If you use sales warranties, grant
   `sales.warranties.view` to **Sales Manager**.
3. **Field-service master data** (Service Customers, Services) and the field modules
   (Orders / Teams / Contact Centre) — the catalog shows them, but they are **not in this pruned
   prod build**, so no operational role has them. Fine for now; revisit when the full build ships.
4. **By design — leave as-is:** company/division/user/role setup, PO-approval bypass/chain,
   cost-visibility keys (consumption/damaged/warehouse cost), consumption cancel/cross-division,
   system import. Correctly admin-only.

---

## 8. Assignment observations

- **Not assigned yet:** **Brand Manager** and **Warehouse Manager** (0 users each) — decide
  keep-and-assign or retire.
- **Same person in two roles** (they get the **combined** access of both):
  - Mr. Nijam — Accounting Manager **+** Inventory Manager (controls finance **and** stock)
  - Mr. Moez — Sales Manager **+** Project Manager
  - Mr. Shenil — Purchase Manager **+** Sales Manager (controls buying **and** selling)
  - Mr. Anas — Purchase User **+** Sales User (both a buyer **and** a seller)
  - Mr. Shoyal — Inventory User **+** Sales User
  - Mr. Thangarasa — Inventory User **+** Special Inv User
  → Worth a second look for **separation of duties**, especially the purchase-and-sales combinations.
- **Naming mismatch** (your sheet vs the system):
  - "Inventory User 2" → system role is **Special Inv User**
  - "Team Supervisor ( Forman )" → system role is **Team manager**
  - (also a typo: "Invetory")
  Consider renaming these in-app to match your sheet so it's less confusing.
- **The role↔user links are mostly not created in prod yet.** Your Excel is the *plan*; only a
  handful of assignments exist in the database so far. Creating the staff accounts and assigning
  these roles (in **Users & Roles**) is the next step.

### Minor dev note (Mr. Ismail)
Catalog-vs-route drift: the payments pages check `purchase.payments.view` / `payments.view`, but the
catalog now offers `…payments.record`. Existing roles carry the old `…payments.view` (so they still
work), but you can't re-grant that exact key from the UI. Harmless now — tidy when convenient.

---

## 9. Recommended actions

1. Decide **Brand Manager** and **Warehouse Manager** — assign or retire.
2. ✅ Done — created the **Tools & Assets Manage** role. (Optional, unrelated: if you use sales **Warranties**, grant `sales.warranties.view` to Sales Manager.)
3. Review the **dual-role people** for separation of duties (especially purchase + sales).
4. Rename **Special Inv User → "Inventory User 2"** and **Team manager → "Team Supervisor"** in-app to match your sheet.
5. **Create the staff accounts and assign roles** per the sheet.
