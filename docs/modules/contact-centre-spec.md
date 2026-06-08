# Contact Centre Module — Full Spec

**Date:** 2026-06-08  
**Status:** Built and live on `develop`  
**Module path:** `src/components/contact-center/`, `src/hooks/contact-center/`, `src/app/api/wati/`, `src/app/api/whapi/`

---

## 1. Purpose

The Contact Centre is a collapsible right-side sidebar in MMS that serves as the primary agent workspace for inbound customer communication. Agents receive WhatsApp messages and calls here, identify the caller, and create or manage orders from that context. It is the launch point for the entire customer-service loop.

---

## 2. Architecture Overview

### 2.1 Entry Point & Permission Gate

`ContactCenterSidebarGate` (`src/components/contact-center/ContactCenterSidebarGate.tsx`) is mounted once in the root dashboard layout. It:

1. Checks whether the current user has the `contact_centre.view` permission (via `custom_roles → permissions[]` join on `profiles`).
2. If the user lacks permission, renders nothing and sets the global sidebar state to `'none'` so the dashboard doesn't leave padding for it.
3. If permitted, renders `<ContactCenterSidebar />` and signals `'collapsed'` as the initial state.

### 2.2 Global Context

`ContactCenterContext` (`src/contexts/ContactCenterContext.tsx`) is a React context provided at the dashboard root. It exposes:

| Value | Type | Purpose |
|---|---|---|
| `ccSidebar` | `'none' \| 'collapsed' \| 'expanded'` | Tells the dashboard layout how much left-padding to apply |
| `setCcSidebar` | fn | Called by the sidebar to notify the layout of expand/collapse |
| `selectedCustomer` | `SelectedCustomer \| null` | Broadcasts the currently-opened customer to other pages (e.g. Order form) |
| `openCustomerById` | fn | Opens a customer by ID — used by cross-module links |
| `openCustomerByPhone` | fn | Triggers the sidebar to open a chat by phone number |
| `pendingPhone` | `{ phone, nonce } \| null` | Nonce-wrapped so re-triggering the same phone still fires the effect |
| `clearSelectedCustomer` | fn | Clears the selected customer |

### 2.3 Sidebar Views (State Machine)

The sidebar has three visual states managed by `useContactCenterState`:

| `sidebarView` | Desktop rendering | Mobile rendering |
|---|---|---|
| `'collapsed'` | 40 px fixed left strip with expand + chat icon | Floating action button (FAB) bottom-left |
| `'list'` | 320 px fixed left panel — conversation list | Bottom drawer (85 vh) with list |
| `'detail'` | 320 px fixed left panel — active conversation detail | Bottom drawer (85 vh) with detail |

### 2.4 Main State Hook

`useContactCenterState` (`src/hooks/contact-center/useContactCenterState.ts`) is the single orchestrating hook that wires together:

- `useLiveConversations` — Supabase realtime subscription for the conversation list
- `useLiveThread` — realtime subscription + manual polling for the active chat thread
- `useWhatsAppWindow` — computes whether the 24-hour messaging window is open and time remaining
- `useCustomerData` — CRM data for the active customer
- `useChatMessages` — send/react/retry logic
- `useAddressState` — address CRUD for the active customer
- `useProviderSetting` — persisted `'wati' | 'whapi'` toggle

It also:
- Runs a **silent 5-minute background sync** (`/api/wati/sync-contacts?mode=full`) on mount and interval to keep conversation names current without user interaction.
- Listens globally for `chat_messages INSERT (from_type=customer)` via Supabase realtime and plays an **audio notification sound** for every inbound message regardless of which conversation is open.

---

## 3. Messaging Providers

The module supports **two WhatsApp API providers** that can be toggled in the list header:

| Provider | Toggle label | Backend routes | Notes |
|---|---|---|---|
| WATI | `wati` | `/api/wati/*` | Default. Uses Wati's proprietary REST API. 24-hour session window enforced. |
| WHAPI | `whapi` | `/api/whapi/*` | Alternative. Session window is always open (no 24-hour restriction). |

The active provider is persisted via `useProviderSetting` (likely localStorage or a user preference row). All send/fetch/sync calls branch on the current provider.

---

## 4. Conversation List (`ChatListView`)

**File:** `src/components/contact-center/ChatListView.tsx`

### 4.1 Layout
- Search bar (text + phone search) with sync button
- Filter tabs: **All** / **Unanswered** (unread_count > 0)
- Conversation rows grouped by date: **Today**, **Yesterday**, then `DDD DD MMM` buckets, newest-first

### 4.2 Conversation Row
Each row shows:
- Avatar circle (first letter of name)
- Name (resolved customer name > WATI contact name > phone)
- Assigned agent with bot/human icon
- Last message preview + timestamp
- Status badges: `Solved` (emerald), `Pending` (amber)
- Unread count badge; checkmark if opened with 0 unread

### 4.3 Phone Lookup
When a search string looks like a phone number (≥6 digits, no alpha chars) and produces no local hits, a **debounced 600 ms fetch** to `/api/wati/lookup-contact?phone=<term>` searches WATI directly and renders the result under a "From WATI" label.

### 4.4 Sync
Manual sync button calls `syncFromProvider()`:
- **WATI:** streams `/api/wati/sync-contacts` (SSE) with progress stages: `fetching → resolving → upserting → done`
- **WHAPI:** streams `/api/whapi/sync-chats` with same stages

A `SyncBanner` displays live progress with a progress bar during `upserting` stage.

---

## 5. Active Conversation Detail View

**File:** `src/components/contact-center/ContactCenterSidebar.tsx` (detail branch)

### 5.1 Header
- Back button (→ list)
- Customer display name (resolved from contact name, CRM name, or phone)
- Phone number (monospace)
- **Conversation status pill** (only when a conversation row exists):
  - `Open` (blue dot)
  - `Pending` (amber dot)
  - `Solved` (emerald dot)
  - Clicking opens a dropdown to change status; change is saved to `chat_conversations` and synced to WATI via `supabase.functions.invoke('api-wati', { action: 'set_status' })`

### 5.2 CRM + Addresses Panel (upper, capped at 45% of height)
Scrollable upper section containing:
- **Customer section** → `CrmSection`
- **Addresses section** → `AddressSection`

### 5.3 Chat Thread (lower, takes remaining height)
- `ChatSection` (message bubbles)
- `ChatInputBar` (only shown when `activeConversationId` + `activePhone` are set)

---

## 6. CRM Section (`CrmSection`)

**File:** `src/components/contact-center/CrmSection.tsx`

### 6.1 Unknown Caller Flow
When a phone has no linked customer in MMS, the section enters an **Unknown Caller** mode with three steps:

1. `'prompt'` — two buttons: **Attach to existing** / **Create new**
2. `'attach'` — phone search input → calls `searchByPhone()` → resolves customer via `service_customer_phones`
3. `'create'` — name + phone form → calls `create_service_customer` Supabase RPC → resolves and broadcasts the new customer

On resolution, `onCustomerResolved()` fires, which:
- Updates `chat_conversations.customer_id`
- Broadcasts the customer via `openCustomerById()` in `ContactCenterContext` so e.g. the Order form syncs

### 6.2 View Mode
Displays:
- Name + customer type badge (`IND` / `BIZ`)
- **Blocked banner** (red) with Unblock button if `is_blocked`
- **Pending payment badge** (amber) if `pending_payment_amount > 0`
- All phone numbers with primary badge
- All addresses with type badge (`Blue Plate` / `GPS`), coordinates, Google Maps link, Waze link
- Addresses linked to the active WATI phone are highlighted with a primary/10 tint

### 6.3 Edit Mode
- Edit name and customer type
- Add/remove phone numbers (using `PhoneInputWithCode`)
- Block customer with reason (required) + notes (optional)
- Save / Cancel

---

## 7. Address Section (`AddressSection`)

**File:** `src/components/contact-center/AddressSection.tsx`

### 7.1 Address Card
Each address card is **draggable** (`dataTransfer.setData('application/mms-address', JSON.stringify(address))`). Dragging it onto the Order form's address drop zone pre-fills the address. Cards show:
- Grip handle (drag affordance)
- Label or auto-generated `B{n} S{n} Z{n}` label
- `primary` badge if applicable
- Blue plate breakdown in monospace
- Coordinates if geocoded
- `⚠ No GPS coords` warning if not geocoded
- Waze link if available
- Pencil edit button on hover

### 7.2 Add / Edit Address Form (two-step)

**Step 1:** Choose address type — `Blue Plate` or `GPS Coords`

**Step 2 (Blue Plate):**
- Unit (optional), Building*, Street*, Zone* inputs
- **Check address** button → calls `validateBluePlate()` → hits a geocoding API
- Validation success shows lat/lng + Waze link preview
- Validation failure shows error message
- Label (optional, e.g. "Home", "Office")

**Step 2 (GPS Coords):**
- Latitude + Longitude inputs
- **Verify coordinates** button → validates range (lat ±90, lng ±180), generates Waze link
- Label (optional)

Both types require saving to confirm; edit replaces in-place.

---

## 8. Chat Thread (`ChatSection`)

**File:** `src/components/contact-center/ChatSection.tsx`

### 8.1 Message Bubbles
- Customer messages: left-aligned, `bg-muted`
- Agent messages: right-aligned, `bg-primary text-primary-foreground` with agent name above
- System/event messages (`message_kind='event'`): centered italic divider line
- Attachments rendered via `AttachmentRenderer`
- Fallback: `📎 Attachment` for messages with no parseable content

### 8.2 Delivery Status Ticks (agent messages only)
| Status | Icon |
|---|---|
| `sending` | Spinning loader |
| `sent` | Single check (muted) |
| `delivered` | Double check (muted) |
| `read` | Double check (blue) |
| `failed` | Retry button (red) |

### 8.3 Emoji Reactions
- Hover over any message → portal-rendered quick-emoji bar (`👍 ❤️ 😂 😮 😢 🙏`) appears above the bubble
- Reactions grouped by emoji with count; customer reactions use solid border, MMS-only reactions use dashed border + `MMS` label
- Reactions are persisted in `chat_messages.reactions[]` and synced in both directions via webhooks

### 8.4 Scroll Behaviour
- Auto-scrolls to bottom when new messages arrive (if user is near bottom)
- If user is scrolled up and a new message arrives, a sticky badge shows "N new messages" with scroll-to-bottom button

### 8.5 Load Older Messages
When `canLoadMore` is true, a **Load older messages** button fetches the previous page from WATI and prepends them.

---

## 9. Chat Input Bar (`ChatInputBar`)

**File:** `src/components/contact-center/ChatInputBar.tsx`

### 9.1 Window Banner (WATI only)
Displays the 24-hour messaging window status:
- **Closed** — red banner, input disabled, "use a template" message
- **< 1 hour left** — amber banner with minutes remaining
- **Open** — green banner with hours + minutes remaining

### 9.2 Templates Panel (WATI only)
Collapsible section above the input. When expanded:
- Tabs: **No params** / **Has params** (drag-and-drop between tabs to override classification, persisted in localStorage)
- Refresh button reloads from WATI
- Clicking a template opens `ChatTemplateConfirmDialog` for variable entry
- Draggable rows — grip handle on left

### 9.3 Emoji Picker
Clicking the smiley icon opens a full emoji picker (grouped: Smileys, Gestures, Hearts, Objects, Nature) above the input. Emojis are inserted at cursor position.

### 9.4 Textarea
- Enter → send, Shift+Enter → newline
- Disabled when window is closed (WATI) or while sending
- Min height 44 px, max height 100 px, auto-resize

### 9.5 Action Buttons
| Button | Action |
|---|---|
| 😊 Emoji | Toggle emoji picker |
| 📎 Attachment | Open `ChatAttachmentDialog` |
| 📖 Instructions | Open `ChatInstructionsDialog` (canned service instructions) |
| 🎤 Mic | Start voice recording |
| Send | Send text message |

### 9.6 Voice Recording
- `startRecording()` → requests `getUserMedia({ audio: true })`
- Records as `audio/ogg;codecs=opus` (preferred), `audio/webm;codecs=opus`, or `audio/webm` depending on browser support
- WebM blobs are transcoded to OGG via `webmOpusToOgg()` before upload (WhatsApp requires OGG)
- Recording UI: red pulsing dot + MM:SS timer, Cancel (X) + Stop (square) buttons
- Minimum blob size 1 KB to avoid empty sends
- Sent via `sendFile()` → `/api/wati/send-file`

---

## 10. Dialogs

### 10.1 `ChatAttachmentDialog`
Allows agent to pick a file and optional caption, then sends via `sendFile()`.

### 10.2 `ChatInstructionsDialog`
Pre-canned service instruction text snippets the agent can select and send to the customer.

### 10.3 `ChatTemplateConfirmDialog`
- Shows template name and body preview
- Renders input fields for each variable parameter
- Header media upload (document/image/video) if template has a media header
- Confirm → calls `sendTemplate()` → `/api/wati/send-message` with `templateName` + `parameters`

---

## 11. Attachment Renderer (`AttachmentRenderer`)

**File:** `src/components/contact-center/AttachmentRenderer.tsx`

Renders inline based on MIME type:
- `image/*` → `<img>` with click-to-expand
- `video/*` → `<video controls>`
- `audio/*` → `<audio controls>` (voice notes with waveform)
- `application/pdf` + other documents → download link with filename

WHAPI media URLs are proxied through `/api/whapi/media?url=<encoded>` to avoid CORS issues.

---

## 12. Products List (`ProductsList`)

**File:** `src/components/contact-center/ProductsList.tsx`

Shows all installed products for the customer:
- Product name, brand, model
- Warranty status: `active` (green shield), `expiring < 30 days` (amber shield-alert), `expired` (grey shield-off)
- Warranty expiry date

---

## 13. Order History Section (`OrderHistorySection`)

**File:** `src/components/contact-center/OrderHistorySection.tsx`

Fetches the last 20 orders for `customerId` from the `orders` table (ordered by `scheduled_date DESC`). Each row shows:
- Order ID (monospace)
- Type (formatted)
- Scheduled date
- Total amount (QAR)
- Status badge with colour coding: `completed` emerald, `cancelled` rose, `scheduled/confirmed` blue, `in-progress` amber

---

## 14. API Routes

### 14.1 WATI Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/wati/webhook` | GET | WATI verification ping |
| `/api/wati/webhook` | POST | Inbound messages, delivery status updates, reactions, conversation status changes |
| `/api/wati/send-message` | POST | Send text or template message via WATI |
| `/api/wati/send-file` | POST | Upload + send file/voice note via WATI |
| `/api/wati/fetch-messages` | GET | Fetch message history page from WATI for a phone number |
| `/api/wati/lookup-contact` | GET | Look up a single contact by phone in WATI |
| `/api/wati/sync-contacts` | GET | Stream-sync all WATI contacts into `chat_conversations` (SSE) |
| `/api/wati/media` | GET | Proxy WATI media files (requires Bearer token) |
| `/api/wati/send-quotation` | POST | Send a quotation PDF to a customer via WATI template |

### 14.2 WHAPI Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/whapi/webhook` | POST | Inbound messages from WHAPI |
| `/api/whapi/webhook/channel` | POST | Channel-level webhook from WHAPI |
| `/api/whapi/send-message` | POST | Send text message via WHAPI |
| `/api/whapi/send-reaction` | POST | Send emoji reaction via WHAPI |
| `/api/whapi/fetch-messages` | GET | Fetch message history from WHAPI |
| `/api/whapi/sync-chats` | GET | Stream-sync all WHAPI chats into `chat_conversations` (SSE) |
| `/api/whapi/media` | GET | Proxy WHAPI media files |

### 14.3 Escalation Route

| Route | Method | Purpose |
|---|---|---|
| `/api/contact-center/escalate` | POST | Field team escalation — uploads building photos + call screenshots, creates `contact_center_tasks` row, sets order/site_visit status to `customer-unavailable` |

---

## 15. Webhook Processing (WATI)

**File:** `src/app/api/wati/webhook/route.ts`

The webhook handles the following event types:

| Event | Action |
|---|---|
| `status_changed`, `sentMessageDELIVERED_v2`, `sentMessageREAD_v2`, `templateMessageFailed` | Updates `delivery_status` on the matching `chat_messages` row by `external_id` |
| `reaction` (type) | Adds/removes emoji in `chat_messages.reactions[]` using `replyContextId` as the target wamid |
| `conversation_resolved`, `conversation_reopened`, `conversation_assigned` | Updates `chat_conversations.wati_status` and `assigned_agent` |
| Any message with `waId` | Upserts `chat_conversations`, inserts into `chat_messages` with deduplication |

**Deduplication strategy (outbound agent messages):**
1. Look for a `sending`/`sent` row with null/`wati_`-prefixed `external_id` and matching text within the last 60 seconds
2. If found: update `external_id` + `delivery_status` — avoids duplicates when webhook races ahead of the send API response
3. Fall through to: exact `external_id` match (both bare wamid and `wati_<id>` prefix)
4. Fall through to: text+conversation+time match within 2 minutes

**Media proxying:** WATI inbound media URLs are converted to `/api/wati/media?path=<rel>` proxied paths at webhook ingestion time so the browser can render them without WATI credentials.

---

## 16. Data Model

### 16.1 TypeScript Types (`src/types/contact-center.ts`)

```ts
type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
type ConversationType = 'customer' | 'team'
type CrmMode = 'view' | 'edit' | 'unknown'
type UnknownCallerStep = 'prompt' | 'attach' | 'create'
type SidebarView = 'collapsed' | 'list' | 'detail'

interface ChatConversation {
  id, customer_id, conversation_type, wati_phone, wati_contact_name,
  last_message, last_message_at, unread_count, assigned_agent,
  is_opened, wati_status, created_at
  // joined: customer_name
}

interface ChatMessage {
  id, conversation_id, from_type, source, message_kind,
  text, agent_name, attachments, reactions, delivery_status,
  external_id, reply_to_external_id, sent_by_profile_id, created_at
}

interface WatiTemplate {
  id, elementName, bodyOriginal, components, variableCount,
  paramNames, unsupported, headerMedia, headerParamName
}

interface WindowStatus { isOpen, expiresAt, minutesRemaining }

interface SelectedCustomer { customerId, customerName, primaryPhone, conversationId }

interface CustomerBlock { id, customer_id, reason, notes, image_url, blocked_by, created_at }
```

### 16.2 Database Tables (key)

| Table | Purpose |
|---|---|
| `chat_conversations` | One row per phone number per provider; tracks last message, unread count, assigned agent, WATI status |
| `chat_messages` | Individual messages within a conversation; stores attachments as JSONB, reactions as JSONB array |
| `contact_center_tasks` | Field escalation tasks created when team marks a customer unavailable |
| `service_customer_phones` | Phone-to-customer mapping used for customer resolution |
| `service_customer_addresses` | Customer addresses (blue plate + GPS coords + Waze link) |

---

## 17. Real-time & Live Updates

| Mechanism | What it covers |
|---|---|
| Supabase Realtime `chat_conversations INSERT/UPDATE` | Keeps the conversation list live (new chats, name changes, unread count) |
| Supabase Realtime `chat_messages INSERT/UPDATE` for active conversation | Live thread updates — new messages + delivery status ticks |
| Global `chat_messages INSERT (from_type=customer)` | Plays notification sound for any inbound message, regardless of active conversation |
| Polling fallback (`triggerPoll`) | Manually triggers a thread re-fetch after sending (catches the window where realtime might lag) |

---

## 18. Cross-Module Integration

### 18.1 Contact Centre → Order Form
- `openCustomerByPhone(phone)` from `ContactCenterContext` triggers the sidebar to open a conversation. The Order form calls this when an agent opens a customer chat from the order detail.
- `openCustomerById(id, name, phone)` broadcasts the resolved customer — the Order form's `useEffect` on `selectedCustomer` picks this up and pre-fills the customer field.
- Address drag-and-drop: dragging an address card from `AddressSection` and dropping it on the Order form's address drop zone pre-fills the address fields (`dataTransfer` type `application/mms-address`).

### 18.2 Orders → Contact Centre
- When viewing an order, clicking on the customer phone badge calls `openCustomerByPhone()` to open the sidebar to that chat.

### 18.3 Quotations → WATI
- `/api/wati/send-quotation` sends a generated quotation PDF to the customer via a WATI template message.

### 18.4 Field Team → Contact Centre
- `/api/contact-center/escalate` is called by the mobile/field team app when a customer is unreachable. It creates a `contact_center_tasks` row visible in the Contact Centre, uploads evidence photos to Supabase Storage (`team-escalations` bucket), and marks the order/site_visit as `customer-unavailable`.

---

## 19. Permission Model

Access to the Contact Centre is gated by the `contact_centre.view` permission string in `custom_roles.permissions[]`. Users without this permission:
- Do not see the sidebar at all (gate renders null)
- The dashboard layout applies no left-padding offset

---

## 20. What Is NOT Yet Built

| Feature | Notes |
|---|---|
| 3CX phone system integration | Designed but deferred. Would add inbound call notifications and a softphone dialer embed (iframe or JS SDK). |
| TASKS tab | Task cards for Reschedule / Complaint / Callback / Follow-Up / Cancellation task types. The DB table `contact_center_tasks` exists (used by escalation), but the UI task list/cards in the TASKS tab are not yet rendered. |
| TEAMS tab | Internal team-to-team messages. `conversation_type='team'` is in the type system but not surfaced in the filter tabs. |
| Priority queue ordering | The designed priority sort (🔴 tasks today → 🟡 oldest unanswered → 🔵 active → ⚫ resolved) is not yet implemented. Current order is by `last_message_at` descending. |
| Products panel in the detail view | `ProductsList` component exists and is complete, but it is not currently wired into the CRM section header group in `ContactCenterSidebar`. |

---

## 21. Known Architectural Notes

- `useContactCenterState` is deliberately not memoised for `syncFromProvider` because `refetchConversations` changes when the provider toggle flips; memoising it with `[]` would freeze the WATI version.
- `pendingPhone` is wrapped in a nonce object so re-triggering the same phone (e.g. agent clicks the same customer twice) still fires the `useEffect` in `ContactCenterSidebar`.
- Voice notes recorded in WebM are transcoded to OGG via a client-side WASM helper before upload, because WhatsApp requires OGG Opus format.
- WATI's numeric message type codes (`'0'–'7'`) are normalised to string names in both the webhook handler and the send flow.
- Template classification overrides (drag-to-reassign between "No params" and "Has params" tabs) are persisted in `localStorage` under the key `cc-template-overrides`.
