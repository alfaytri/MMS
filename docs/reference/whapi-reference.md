# WHAPI Cloud — Connection Reference

> Source: https://whapi.readme.io/  
> Last fetched: 2026-05-17

---

## Base URL

```
https://gate.whapi.cloud
```

---

## Authentication

All requests require a **Bearer token** in the `Authorization` header.

```http
Authorization: Bearer <YOUR_WHAPI_TOKEN>
Content-Type: application/json
```

The token is your channel/instance API token from the WHAPI dashboard.

---

## Common Response Codes

| Code | Meaning |
|------|---------|
| 200 | OK — success |
| 400 | Bad request — invalid parameters |
| 401 | Unauthorized — missing or invalid token |
| 402 | Trial limit exceeded |
| 403 | Forbidden — cannot send to this recipient |
| 404 | Not found |
| 413 | Request body too large |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## Endpoints

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Check channel operational status |

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `wakeup` | boolean | `true` | Launch the channel if sleeping |
| `platform` | string | — | Browser/OS identifier: `"Browser,OS,Version"` |
| `channel_type` | string | `web` | `web` or `mobile` |

**Limits endpoint:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/limits` | Get current rate limits and operational constraints |

---

### Messages

| Method | Path | Description |
|--------|------|-------------|
| GET | `/messages/list` | List all messages |
| GET | `/messages/{MessageID}` | Get single message |
| POST | `/messages/text` | Send a text message |

#### GET `/messages/list`

| Param | Type | Range | Default | Description |
|-------|------|-------|---------|-------------|
| `count` | number | 1–500 | 100 | Number of messages to return |
| `offset` | number | ≥0 | — | Pagination offset |
| `time_from` | number | — | — | Unix timestamp start filter |
| `time_to` | number | — | — | Unix timestamp end filter |
| `normal_types` | boolean | — | `true` | `false` includes system messages |
| `author` | string | — | — | Filter by Contact ID |
| `from_me` | boolean | — | — | `true` = sent by me, `false` = received |
| `sort` | string | `asc`/`desc` | `desc` | Sort direction |

#### GET `/messages/{MessageID}`

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `MessageID` | string (path) | Yes | Unique message identifier |
| `resync` | boolean (query) | No | Force data re-sync (default `false`) |

#### POST `/messages/text` — Send Text Message

```http
POST https://gate.whapi.cloud/messages/text
Authorization: Bearer <token>
Content-Type: application/json
```

**Request body:**

```json
{
  "to": "974XXXXXXXX@s.whatsapp.net",
  "body": "Hello!",
  "quoted": "MESSAGE_ID_TO_REPLY_TO",
  "edit": "MESSAGE_ID_TO_EDIT",
  "typing_time": 2,
  "no_link_preview": false,
  "wide_link_preview": false,
  "mentions": ["974XXXXXXXX", "974YYYYYYYY"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | string | **Yes** | Phone/Chat ID of recipient. Format: `{phone}@s.whatsapp.net` for individual, `{groupId}@g.us` for group |
| `body` | string | **Yes** | Message text |
| `quoted` | string | No | Message ID to quote/reply to |
| `edit` | string | No | Message ID to edit |
| `typing_time` | number (0–60) | No | Simulate typing indicator for N seconds |
| `no_link_preview` | boolean | No | Disable link previews |
| `wide_link_preview` | boolean | No | Enable fullwidth link preview |
| `mentions` | string[] | No | Phone numbers to mention |

---

### Chats

| Method | Path | Description |
|--------|------|-------------|
| GET | `/chats` | List all chats |
| GET | `/chats/{ChatID}` | Get single chat metadata |

#### GET `/chats`

| Param | Type | Range | Default | Description |
|-------|------|-------|---------|-------------|
| `count` | number | 1–500 | 100 | Number of chats to return |
| `offset` | number | ≥0 | — | Pagination offset |

#### GET `/chats/{ChatID}`

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `ChatID` | string (path) | Yes | Chat identifier |

**Chat ID formats:**
- Individual: `{countryCode}{phone}@s.whatsapp.net` → e.g. `97412345678@s.whatsapp.net`
- Group: `{groupId}@g.us`
- Channel/Newsletter: `{channelId}@newsletter`

---

### Contacts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/contacts` | List all contacts |
| GET | `/contacts/{ContactID}` | Get single contact |

#### GET `/contacts`

| Param | Type | Range | Default | Description |
|-------|------|-------|---------|-------------|
| `count` | number | 1–500 | 100 | Number of contacts to return |
| `offset` | number | ≥0 | — | Pagination offset |

---

## TypeScript Helper — Base Client

Minimal typed client for use in Next.js API routes or server actions:

```typescript
// lib/whapi.ts

const WHAPI_BASE = 'https://gate.whapi.cloud';
const WHAPI_TOKEN = process.env.WHAPI_TOKEN!;

function whapiHeaders() {
  return {
    Authorization: `Bearer ${WHAPI_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

export async function whapiGet<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
  const url = new URL(`${WHAPI_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }
  const res = await fetch(url.toString(), { headers: whapiHeaders() });
  if (!res.ok) throw new Error(`WHAPI ${path} → ${res.status}`);
  return res.json();
}

export async function whapiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${WHAPI_BASE}${path}`, {
    method: 'POST',
    headers: whapiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`WHAPI ${path} → ${res.status}`);
  return res.json();
}

// Usage examples:
// const chats  = await whapiGet('/chats', { count: 50 });
// const msgs   = await whapiGet('/messages/list', { author: '974XXXXXXXX@s.whatsapp.net', count: 100 });
// const sent   = await whapiPost('/messages/text', { to: '974XXXXXXXX@s.whatsapp.net', body: 'Hello' });
// const health = await whapiGet('/health');
```

---

## Environment Variable

Add to `.env.local`:

```env
WHAPI_TOKEN=your_channel_token_here
```

---

## Notes

- **Phone format in `to`:** Always include country code, no `+`: e.g. `97412345678@s.whatsapp.net`
- **Pagination:** All list endpoints support `count` (max 500) + `offset`
- **Webhooks:** Configure via the WHAPI dashboard (channel settings → Webhooks). WHAPI will POST events to your registered URL. Add the route to `WEBHOOK_PREFIXES` in `middleware.ts` and validate the shared secret inside the handler.
- **Trial limits:** HTTP 402 means the free trial message quota is exhausted.
