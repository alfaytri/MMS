# Team vs Service Consumption — Design Spec

**Date:** 2026-08-18
**Status:** Draft — awaiting operator review
**Author:** Claude (brainstormed with Mohamed Ismail)

---

## 1. Goal

Split the Consumption experience into **two tabs** that run the *same* posting
process, so field teams have a clear, separate place to consume the multi-use
consumables they are **holding** (refrigerant, plastic rolls, etc.) apart from
the normal "used-on-a-job" consumption:

- **Service item consumption** — the everyday flow: consume items (from a
  warehouse) that are used up serving a job.
- **Team item consumption** — consume the **team-flagged** consumables a team is
  holding in its **custody**, drawn down over time until empty.

Both tabs post through the existing `rpc_post_consumption` (deduct stock → book
COGS). **No change to how consumption actually posts, to FIFO, or to COGS.**

### Explicitly out of scope (decided during brainstorming)

- ❌ **Aging / "days held" tracking.** The operator confirmed dates do not
  matter — if a container empties in a day they simply get another. No
  duration/aging metric is built.
- ❌ **Measured drawdown of a single container** (e.g. "2.3 kg out of a 13.6 kg
  cylinder"). Consumption stays whole-unit quantities, exactly as today.

---

## 2. Background — how it works today (verified against the code)

- **Consumption** = `rpc_post_consumption` deducts FIFO stock from a source
  `(warehouse, sub_container)` and books COGS to a **consumer**. `consumer_type`
  is `'custody' | 'internal'` (a "customer" path exists in columns but is dead).
  Writes: `consumption_entries` (header) + `consumption_lines` + per-layer
  `cogs_entries` + `inventory_stock_movements`. Qty is a whole-unit integer.
- **Custody** = stock that has left a real warehouse and now lives with a team
  at a **virtual warehouse** of `warehouse_kind = 'custody'`, as FIFO layers on
  that team's custody **sub-container**. It is still company **asset** — COGS is
  booked only when the team later consumes it. Items reach a team via the
  existing 3-step **custody assign** flow (request → dispatch → accept).
- **Consuming from custody already works**: a team can consume the stock it
  holds (source = its custody sub, consumer = the same sub). Today this is
  reached from the warehouse/custody page or the generic New Consumption dialog —
  it is **not** surfaced as its own tab on the Consumption page.
- **"Consumable"** is an inventory **category type** (`inventory_type` enum:
  `products | spare-parts | consumables | tools`). There is **no** per-item
  "team item" flag today (verified: no `is_team_item` anywhere in the repo).

**Conclusion:** the engine for "a team consumes what it holds" already exists.
This feature is a **UX reshape + one routing flag**, not new posting logic.

---

## 3. Core concept — the "Team item" flag

A new boolean marks an item as a **team item** (a team-held, multi-use
consumable). It is settable at **two levels**, per the operator's decision:

| Level | Column (new) | Meaning |
|---|---|---|
| Category | `inventory_categories.is_team_item` (`boolean not null default false`) | Marks **every** item under the category as a team item by default. |
| Item | `inventory_items.is_team_item` (`boolean null`) | Per-item **override**: `true` = force team item, `false` = force normal, `null` = **inherit** the category. |

**Effective rule** (the single source of truth used everywhere):

```
effective_is_team_item(item) =
  COALESCE(item.is_team_item, item.category.is_team_item, false)
```

- Flip a category on → all its items become team items.
- Flip a single item on → it is a team item regardless of its category.
- Flip a single item off (`false`) → it opts **out** of a team category.

> The exact column placement (`inventory_items` vs the variants table) and the
> join path variant → item → category will be re-verified against the **live
> DB** before writing the migration, per the project's SQL-migration-check rule.
> `inventory_items.category_id → inventory_categories` is already confirmed.

---

## 4. Design

### 4.1 Inventory UI — the toggles

- **Category editor** (`CategoryEditDialog.tsx`): add a switch **"Team item
  category — items here are held by field teams and consumed from their
  custody."** Visible for any category (most useful on `consumables`).
- **Item editor**: add a control **"Team item"** with three states —
  **Inherit (from category X)** / **Yes** / **No** — writing `null` / `true` /
  `false` respectively. When the category flag is on, the "Inherit" label shows
  the resulting *Yes* so the operator sees the effective value.

No UUIDs shown; category name is displayed in the inherit label.

### 4.2 Consumption page — two tabs

The `/consumption` page gains a two-tab switch. Both tabs share the same table
columns, the same permission gates (`consumption.view`, `consumption.cost.view`),
and the same `NewConsumptionDialog` engine.

**Tab 1 — Service item consumption (default):**
- Behaves exactly like today's page, with **one change**: the item picker in the
  New Consumption dialog **excludes** effective team-items.
- History list shows entries that consumed **non-team** items.

**Tab 2 — Team item consumption:**
- **Holdings-first view.** Shows the team-items a team is currently **holding**
  in custody (effective team-item **∩** custody stock for that team), grouped by
  team (custody sub-container), with remaining qty per item.
- If the user oversees one team, it is auto-selected; if several, a team picker
  (reuses the custody-scope rules already in the dialog).
- **Consume action** opens the New Consumption dialog in team mode: source =
  that team's custody sub, consumer = the same sub, picker limited to that team's
  held team-items, qty → post. (This is the existing source-locked custody
  consume, scoped to team-items.)
- History list shows entries that consumed **team** items.

Empty states: Service — "No consumption yet"; Team — "This team isn't holding
any team-items. Assign some via Custody first."

### 4.3 Classifying history into the two tabs

Every consumption entry is **homogeneous** by construction — a Service entry
contains only non-team items, a Team entry only team-items (the pickers never
mix them). To make the two lists a cheap, correct, indexed filter rather than a
per-row join, store the classification on the header:

- Add `consumption_entries.is_team_item` (`boolean not null default false`).
- `rpc_post_consumption` **derives** it server-side from the consumed variants'
  effective team-item value (it already loads each variant for FIFO), and
  **asserts homogeneity** — all lines must share the same team/non-team value,
  else it raises (defense-in-depth against a hand-crafted mixed post).
- `cogs_entries` optionally mirrors the flag for reporting symmetry (nice-to-have,
  not required for the tabs).

Filtering: Service list = `is_team_item = false`; Team list = `is_team_item = true`.

> This is one added param-free code path inside `rpc_post_consumption` (it reads
> the flag itself; no new RPC argument). The function will be rewritten from its
> **live body** (DROP+CREATE, re-applying grants) per the project's RPC rules.

### 4.4 Server-side routing guards (defense-in-depth)

UI already routes correctly; the RPC additionally enforces so the rule can't be
bypassed:

- A **team-item** may only be consumed from a **custody** source
  (`warehouse_kind = 'custody'`). (Team-items in a real warehouse are not
  consumable until assigned to a team — the accepted edge case below.)
- A **Service** post may not include a team-item (mirror of the picker filter).

These guards are additive and do not touch the existing division/permission
guards.

### 4.5 What does NOT change

- `rpc_post_consumption` posting mechanics, FIFO draining, per-layer COGS,
  stock movements — unchanged.
- The **custody assign** flow (how a team is "given" an item) — unchanged and
  reused as-is.
- Stock valuation: a team-item is normal FIFO stock; the flag is a **routing**
  attribute only, with **no** accounting effect.

---

## 5. Accepted edge cases & invariants

1. **Team-item sitting in a warehouse, not yet assigned to a team** → appears in
   **neither** tab. Confirmed acceptable: team-items become consumable only once
   in a team's custody. (A later write-off path via *Internal* consumption could
   be added if ever needed — out of scope now.)
2. **Per-item opt-out of a team category** → supported via the tri-state item
   flag (`false` overrides an `on` category).
3. **Homogeneous entries** → enforced in the RPC; the UI never lets a single
   consumption mix team and non-team items.
4. **Changing an item's flag later** → affects only *future* consumptions and
   which tab the pickers show it in. Past entries keep the `is_team_item` value
   stamped at post time (no retro-reclassification), which is the correct,
   stable behaviour for history.

---

## 6. Data-model change summary

| Object | Change | Notes |
|---|---|---|
| `inventory_categories` | `+ is_team_item boolean not null default false` | category-level default |
| `inventory_items` | `+ is_team_item boolean null` | per-item override (`null`=inherit) |
| `consumption_entries` | `+ is_team_item boolean not null default false` | history routing; derived at post |
| `cogs_entries` | *(optional)* `+ is_team_item boolean` | reporting symmetry only |
| `rpc_post_consumption` | DROP+CREATE from live body | derive + assert flag; add routing guards; re-apply grants |
| indexes | partial index on `consumption_entries(is_team_item)` if the list filter needs it | measure first |

RLS: the three tables already have policies; new columns inherit them (no new
policy needed). Migrations go to **staging** first, then **new-prod** via the
guarded `db query --file` flow, and are mirrored into `supabase/migrations-staging/`.

---

## 7. Frontend change summary

| File | Change |
|---|---|
| `CategoryEditDialog.tsx` | category "Team item" switch |
| Item editor (inventory) | tri-state item "Team item" control |
| `useInventory.ts` | read/write the two flags; expose effective value |
| `app/(dashboard)/consumption/page.tsx` | two-tab layout; split lists |
| `NewConsumptionDialog.tsx` | `mode: 'service' | 'team'`; picker include/exclude team-items; team-mode holdings source |
| `useConsumption.ts` | list filter by `is_team_item`; carry flag on rows |
| `useWarehouseOperations.ts` / picker | expose effective team-item flag on stock rows for filtering |
| `useMyConsumptionSources` | already returns `warehouse_kind` — used to find custody sources for team mode |
| `docs/flows-registry.md` | update the consumption flow entries |

---

## 8. Rollout / process notes

- Follows the standard project ritual: PROGRESS.md start/complete commits, EOD
  entry, module security checklist, flow-registry update **in the same commit as
  the code**, co-authored commits.
- **One deploy = one push** — commit locally, batch, and ask before pushing to
  `deploy/warehouse-shipping` (each push is a Vercel prod build).
- Migrations: staging immediately; new-prod via the guarded flow when the
  operator is ready to deploy.

---

## 9. Open questions

None blocking. Candidate follow-ups (not in this build): write-off path for
warehouse-held team-items; team-item aging report (explicitly declined now);
per-team low-stock alerts on held consumables.
