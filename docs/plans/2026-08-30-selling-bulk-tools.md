# Selling Bulk Tools + Bulk/Serialized Visual Distinction — Spec & Plan

**Goal:** Sell **bulk** tools through the sale order like a spare-part, keep **serialized** tools custody-only, default new tool categories to **bulk**, and give the tool catalog a clean visual language that separates *bulk (sellable)* from *serialized (custody)* at a glance — without cluttering the view for people who don't care.

**Status:** Spec/plan (design brainstorm 2026-08-30). Not started. Its own feature — build after the current batch (Phase 3a smoke + push).

## Model decisions (operator-confirmed 2026-08-30)

- **Selling is gated on `tool_tracking_mode = 'bulk'`, NOT on division.** Bulk tools are sellable in ANY division; serialized tools are never sold (custody only).
- **A dual-purpose physical tool = two catalog entries**, added by the operator: a **bulk** item (in the sellable/Trading tree) + a **serialized** item (in the custody/Maintenance tree). The app does not auto-link or auto-duplicate them — they are two independent catalog rows under their respective mode's category.
- **Default `tool_tracking_mode` = `bulk`** (was `serialized`). Serialized becomes the deliberate opt-in for equipment you assign + track.
- **Warranty** on a sold tool is automatic if its item/category resolves a warranty policy — reuses `create_warranty_records_for_delivery` (type-agnostic; keys off the variant's effective policy). No warranty code change expected.

**Non-goals:** per-division tracking fork (a single item bulk-in-one-division + serialized-in-another); serial-tracking on a sale; auto-converting existing serialized categories; migrating existing data. Serialized custody + team assignment is UNCHANGED.

## Why this is small functionally

Bulk tools already have `inventory_item_brand_variants` + FIFO stock and already flow through PO + quantity (Bulk Tools plan). The sale path (`sale_order_lines` → delivery → `complete_delivery_inventory` → `deduct_fifo_layers` + COGS) is variant/FIFO-based and type-agnostic. The ONLY reason tools can't be sold today is a deliberate **UI exclusion** in `SoLineItemsEditor` (`ALL_TYPES = ['products','consumables','spare-parts']`, with a note: *"do not add 'tools' without a new operator decision"*). This IS that decision.

## The visual language (the real design work)

Two tool natures, one small consistent identity, reused everywhere — never a redesign.

- **Serialized · Custody** — violet. Chip `⌗ Serialized · Custody`, faint violet left-rail in the tree, a violet dot on item rows. Represents *identity*: each unit is tracked by serial, assigned to a team.
- **Bulk · Sellable** — teal. Chip `▤ Bulk · Sellable`, faint teal left-rail, a teal dot. Represents *quantity*: fungible stock you buy, sell, consume.

**The tell = the affordances.** The differentiator people actually read is the ACTION offered on the row, not a label:
- A **bulk** tool row's primary action is **Sell / add-to-order** (price-tag glyph); its stat reads "N in stock".
- A **serialized** tool row's primary action is **Assign to team** (custody); its stat reads "N assigned · N free".

So the buttons themselves say what kind of tool it is; the violet/teal chip just confirms. Surfaces:
- **Tools & Assets catalog tree** (`ToolCategoryRow`) — elevate the existing Bulk/Serialized badge into the shared chip + the left-rail tint, so scanning the tree the two worlds separate without extra reading.
- **Item rows** — a small colored dot + mode-appropriate stat + action; hover shows the full chip.
- **Sale-order item picker** — **only bulk tools appear** (serialized are invisible there), so a seller never meets the distinction.
- **Anywhere a tool is listed** (custody, transfers) — the same dot/chip, so the language is consistent app-wide.

Design constraints: keep the app's orange primary; violet/teal are *mode* accents only (semantic, not brand). One chip component, one token pair — reused, so it reads as a system, not scattered one-offs. Subtle by default (a dot), explicit on demand (chip on hover / in headers).

## Tasks

### Task 1 — Default tool categories to bulk
- Migration: `ALTER TABLE inventory_categories ALTER COLUMN tool_tracking_mode SET DEFAULT 'bulk'` (verify the column + current default first; keep the `trg_guard_tool_tracking_mode_switch` populated-guard intact). Apply staging + new-prod (mirror both folders).
- `CategoryEditDialog.tsx`: default the tracking-mode control to `'bulk'` for a NEW tool category (was `?? 'serialized'`). Existing categories unchanged.
- Verify: creating a new tool category yields bulk; the switch-guard still blocks changing mode on a populated category.

### Task 2 — Sell bulk tools via the sale order
- `SoLineItemsEditor.tsx`: add `'tools'` to `ALL_TYPES` (and remove the exclusion note); the tools group shows only **bulk** tool items **with sellable stock**.
- Item picker source (`useCascadeAccessibleItems`) already filters `tools → tool_tracking_mode='bulk'` when `requireStock`; confirm the SO picker uses that path so serialized tools never appear.
- **Verify no server guard rejects tools** on the SO/delivery/COGS path (`create_and_confirm_delivery`, `complete_delivery_inventory`, SO create RPCs) — grep for a `type='tools'` reject; the exclusion is believed UI-only. If a guard exists, relax it for bulk tools only.
- Smoke: add a bulk tool to an SO → deliver → confirm FIFO deducted + COGS booked (source_type='sale') + stock dropped, exactly like a spare-part.

### Task 3 — Warranty on sold tools (verify, likely no code)
- Confirm `create_warranty_records_for_delivery` books a warranty for a delivered bulk-tool line whose item resolves an effective policy (it's type-agnostic). Rolled-back staging probe. If it excludes tools anywhere, relax it.

### Task 4 — The bulk/serialized visual language
- A shared `ToolModeChip` (+ tokens: `--mode-serialized` violet, `--mode-bulk` teal) — chip, dot, and left-rail variants.
- Apply in `ToolCategoryRow` (chip + rail), tool item rows (dot + mode stat + mode action), and any tool list (custody/transfers). Reuse — one component everywhere.
- The SO picker's tools group already implies "bulk/sellable"; no chip needed there (only bulk shows).
- Respect responsive + light/dark + the app's orange primary (violet/teal are semantic mode accents only).

### Task 5 — Docs + smoke
- flows-registry entry ("Sell Bulk Tool via Sale Order"); PROGRESS + Security Audit row; EOD.
- Operator smoke: sell a bulk tool end-to-end (order → deliver → invoice → warranty if policy → return via the now-correct Phase 3a flow); confirm serialized tools are never offered for sale and the catalog reads clearly.

## Risks / notes
- **Don't offer serialized tools for sale** — the bulk+stock filter must be enforced in the picker (Task 2) or a serialized custody unit could be sold, orphaning `tool_asset_units`. This is the main correctness risk.
- Default-change is forward-only; existing categories keep their mode.
- "Two entries for one physical tool" is an operator convention, not enforced by the app — acceptable per the decision.
- Returns of sold bulk tools use the normal sales-return flow (bulk, no serial), now with the Phase 3a COGS reversal correct.
- Verification model: `tsc` + rolled-back RPC probes (Tasks 2–3) + operator smoke; no vitest (project rule).
