# Contact Centre Module — Design Notes

**Status:** Designed, not yet built. Build after Orders module is stable.
**Branch (when ready):** `feature/contact-centre` — branch from develop after Orders merged.

---

## What It Is

A collapsible sidebar in MMS that combines:
1. **Wati** (WhatsApp Business API) — read/send messages, voice notes, media, reactions
2. **3CX dialer** — make/receive calls (embedded softphone)
3. **Customer CRM panel** — addresses, installed products, order history
4. **Task management** — structured follow-up tasks linked to orders

The sidebar is the primary launch point for order creation. Agents receive WhatsApp/phone requests here and create orders from the customer's profile.

---

## Chat List Tabs

| Tab | Content |
|---|---|
| ALL | Every customer conversation (WhatsApp + inbound calls) |
| UNANSWERED | Messages not yet replied to by any agent |
| TASKS | Structured tasks assigned to agents (Reschedule, Complaint, etc.) |
| TEAMS | Messages from team phone numbers (internal comms) |

---

## Chat Ordering — Priority Queue (not chronological)

Original idea was "sort by latest message." Agreed better model:

| Priority | What | Visual |
|---|---|---|
| 🔴 1st | Open Tasks due today / order scheduled today | Red badge, top of list |
| 🟡 2nd | Unanswered messages — sorted **oldest first** | Yellow dot (oldest = most neglected) |
| 🔵 3rd | Active conversations (replied, no open task) | Sorted by last message |
| ⚫ 4th | Resolved/dismissed | Collapsed or hidden |

Key: oldest unanswered first prevents a flood of new messages from burying old requests.

---

## Task Types (TASKS tab)

Each task card shows: type badge, customer name, linked order ID, description text, date, **Resolve** / **Dismiss** buttons.

| Task Type | Trigger |
|---|---|
| Reschedule | Customer wants to move visit time |
| Complaint | Unhappy with service quality |
| Callback | Customer wants a call back |
| Follow Up | Confirm details before team dispatch |
| Cancellation | Customer wants to cancel upcoming order |

---

## Customer Profile Panel (inside active conversation)

When agent opens a conversation, the right side shows the customer's CRM data:

- Customer name + phone number
- **ADDRESSES** section:
  - List of saved addresses with a **"Drag→"** button per address
  - **"+ Add Address"** button — opens address creation (Blue Plate or GPS coords)
  - Dragging an address onto the Create Order page fills the ORDER ADDRESS drop zone
- **PRODUCTS** section:
  - Installed products with warranty status (active / expiring / expired)
- **ORDERS** section:
  - **"+ New"** button → triggers phone lookup modal → opens Create Order
  - Lists past orders: order ID, date, status badge

---

## Address Drag Flow (Orders integration)

1. Agent has Contact Centre sidebar open alongside Create Order page
2. In customer's address list, clicks **"Drag→"** on an address
3. Drags it to the ORDER ADDRESS drop zone in the Order form
4. Address fills automatically — no typing

The Order form's address field is always a droppable zone (built into the Orders module spec).

---

## Wati Integration

- Source: WhatsApp Business API via Wati platform
- Read: message bubbles, timestamps, source badges (`WA` = WhatsApp, `API` = automated)
- Media: images rendered inline, voice notes show waveform player + play button
- Reactions: shown on messages
- Send: text input at bottom, agent can reply from MMS without switching to Wati dashboard

---

## 3CX Integration

- 3CX is the company phone system (softphone / dialer)
- Inbound calls appear in ALL tab: "Inbound call · MM:SS"
- TEAMS tab: calls and messages from team phone numbers
- Implementation: likely embedded iframe or 3CX JS SDK (TBD — confirm with client)

---

## Recommended Build Order

1. **MMS-native panel first** (no Wati/3CX): customer search by phone, address list, order history, draggable addresses
2. **Wire address drag** to Orders module (drop zone already exists)
3. **Wati read-only** thread embed (show conversation history)
4. **Wati reply/send** capability
5. **3CX dialer** embed
6. **Task creation** (agent creates tasks from order detail)
