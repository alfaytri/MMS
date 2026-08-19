# 05 · Transfer

Top nav: **Transfer** — a dedicated top-level entry gated by
`warehouse.transfer.simple`. A user whose role holds ONLY
`warehouse.transfer.simple` sees just this one entry (built for low-literacy
warehouse staff).

| Page → node | View | Manage / actions | Show costs | Notes |
|---|---|---|---|---|
| **Picture Transfer** — `/warehouse/picture-transfer` | `warehouse.transfer.simple` | `warehouse.transfer.create` (send) · `warehouse.transfer.receive` (receive) | — **none needed** | No tabs — state-driven **send / receive** modes behind "which store / which area" pickers. **No money is displayed anywhere** in the flow (an `avg_cost` is written into the transfer payload for stock valuation but never shown). |

**Setup reminder (from the catalog):** grant `warehouse.transfer.simple`
**together with** `warehouse.transfer.create` + `warehouse.transfer.receive`, and
assign the user as a **Warehouse RP** of their warehouse — otherwise send/receive
won't authorize.

---

## Section notes

- No cost gate applies (nothing financial is shown). This is the one operational
  surface that needs **no** `*.cost.view` key.
- The classic transfer surface lives under **Master Data ▸ Warehouses ▸
  Transfers** (`warehouse.transfers.view` + the `warehouse.transfer.*` action
  keys) — see [01-master-data.md](01-master-data.md). Picture Transfer is a
  parallel simplified front-end over the **same** transfer engine, gated
  separately by `warehouse.transfer.simple`.
