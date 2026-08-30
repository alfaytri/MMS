# Phase 3a — Sales-Return COGS Reversal — Operator Smoke Checklist

**What changed:** Every processed sales return now reverses the original sale's **revenue + cost** (full-line reversal). Before, only "restock as good" did — damaged / write-off / repair / free-replacement returns left the cost sitting in COGS, so the P&L overstated profit. Write-offs now also land the cost on the **Scrap** line, and a free replacement books its cost with **no revenue**.

**Where to smoke:** Against the **staging** database (`mwvblpgbgxipvrevkeff`) — your local dev server pointed at staging, or the staging site. **Do NOT smoke on prod** — prod does not have this fix yet (held on purpose until this passes).

**The one tool you watch the whole time:** the **P&L report** (Reports → Profit & Loss). Filter it to the **test division** and a **date range that includes today**. You'll read three lines after every step: **Revenue**, **COGS**, **Scrap**.

Legend: **P** = the unit's selling price · **C** = the unit's cost (FIFO).

---

## Step 0 — Set up one clean test order

1. Pick (or make) a simple **product** with a known cost and a non-zero selling price, in a division whose P&L you can read alone.
2. Create a **sale order** for **5 units** of it → **confirm** → **deliver** (all 5) → **invoice**.
3. Open the **P&L**, filter to that division + today, and **write down the three numbers**:
   - Revenue = _______  (should include 5 × P)
   - COGS = _______  (should include 5 × C)
   - Scrap = _______

That's your baseline. Every step below returns **1 unit** from this delivery with a different disposition, and you re-check the three numbers.

---

## The 5 returns — do them one at a time and check the P&L after each

| # | Return this unit as… | Revenue should move | COGS should move | Scrap should move | Plain meaning |
|---|---|---|---|---|---|
| 1 | **Restock — good** (regression check) | **− P** | **− C** | 0 | Unit back on the shelf, sale fully unwound |
| 2 | **Restock — damaged** | **− P** | **− C** | 0 | Sale unwound; unit sits in **damaged stock** (not scrapped) |
| 3 | **Write-off** | **− P** | **− C** | **+ C** | Sale unwound; unit destroyed → its cost appears on **Scrap** |
| 4 | **Send for repair** | **− P** | **− C** | 0 | Sale unwound **once**; cost re-books only if the repaired unit is later resold |
| 5 | **Partial / free replacement** | **− P** | **− C (original)** then **+ C (replacement)** | **+ C** *if the original is written off* | Original sale unwound; the free replacement's cost is booked with **no revenue** |

**How to read each check:** after the return, the three P&L numbers should have moved by exactly the row's amounts **versus the previous step**. E.g. after step 3 (write-off), COGS drops by C **and** Scrap rises by C — the cost moved out of COGS and onto Scrap.

### Per-step pass criteria
- **Step 1 (good):** Revenue −P, COGS −C, Scrap unchanged. Unit is back in **good** stock. (This is the regression check — it worked before; confirm it still does.)
- **Step 2 (damaged):** same P&L movement as step 1, but the unit lands in **damaged stock**, not good stock. Scrap stays flat (it's not scrapped yet).
- **Step 3 (write-off):** Revenue −P, COGS −C, **Scrap +C**. This is the headline fix — before, none of this moved.
- **Step 4 (repair):** Revenue −P, COGS −C, Scrap flat. Then, as a bonus check: take that unit **back from repair and re-sell it** → its cost should book **once** on the new sale (no double-count, no missing cost).
- **Step 5 (replacement):** original line reverses (−P, −C); the free replacement unit adds its cost to COGS with **zero revenue**; if you disposed of the original by write-off, Scrap +C too.

---

## ⚠️ The one judgment call — read this before trusting step 5

The model reverses the **original sale's revenue on every return, including a replacement/swap.** That's correct when the customer is **refunded**. But if your "replacement" means the customer **keeps their money and just swaps the item** (no refund), then fully removing the original revenue **understates** your sales.

**Decide at smoke:** do your replacements involve a refund (revenue should reverse — current behavior is right) or a straight swap (revenue should stay)? If it's a swap, tell me — that's a one-line change to the replacement path, not a redesign.

---

## If all 5 pass
Tell me "3a smoke passed" and I'll:
1. Apply migrations `20260831000700`–`20260831001100` to **new-prod**.
2. Push `deploy/warehouse-shipping` (one Vercel prod build) — after you OK the push.

## If something's off
Tell me the step # and the three P&L numbers you saw vs. expected — I have per-path staging probes to compare against.
