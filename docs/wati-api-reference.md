# Wati API Reference
> Source: https://docs.wati.io/reference/introduction  
> Captured: 2026-05-12

---

## Authentication

```
Authorization: Bearer <api_token>
Content-Type: application/json
```

Base URLs:
- `https://live-mt-server.wati.io/`
- `https://api.wati.io/`

---

## Messaging

### Send Session Text Message
```
POST /api/v1/sendSessionMessage/{whatsappNumber}
```
| Field | Type | Notes |
|---|---|---|
| `messageText` | string (query param) | Message content |

Response: `{ ok, result, message: { whatsappMessageId, text, type, status, ticketId, conversationId, created } }`

---

### Send Template Message (v2 — single recipient)
```
POST /api/v2/sendTemplateMessage?whatsappNumber={phone}
```
Body:
```json
{
  "template_name": "my_template",
  "broadcast_name": "my_template",
  "parameters": [
    { "name": "param_name", "value": "param_value" }
  ]
}
```
> **Note:** `parameters` must use `{name, value}` objects — named params like `{{pdflink}}`, `{{booking_number}}` map directly to their `name` field.

Response: `{ result, templateName, receivers: [{ localMessageId, waId, isValidWhatsAppNumber, errors }] }`

---

### Send Template Messages (v2 bulk)
```
POST /api/v2/sendTemplateMessages
```
Body: `SendTemplatesRequestModel` — array of receivers each with `phone`, `name`, `params`.

---

### Send Template Messages (v3 extended)
```
POST /api/ext/v3/messageTemplates/send
```
Body:
```json
{
  "channel": "channel_id",
  "template_name": "my_template",
  "broadcast_name": "optional",
  "recipients": [
    {
      "phone_number": "97450000000",
      "local_message_id": "optional_tracking_id",
      "custom_params": [{ "name": "param", "value": "val" }]
    }
  ]
}
```
Response: `{ success, broadcast_id, recipients: [{ phone_number, status, errors }] }`

---

### Send Interactive Buttons Message
```
POST /api/v1/sendInteractiveButtonsMessage?whatsappNumber={phone}
```
Body:
```json
{
  "body": "text (max 1024)",
  "footer": "footer text (max 60)",
  "header": {
    "type": "Text | Video | Image | Document",
    "text": "for Text type",
    "media": {}
  },
  "buttons": [{ "text": "Button label (max 20)" }]
}
```
Max 3 buttons.

---

### Send File via Session (URL-based)
```
POST /api/v1/sendSessionFileViaUrl/{whatsappNumber}
```
Body:
```json
{ "url": "https://...", "caption": "optional" }
```
Response: `{ ok, result, message: { whatsappMessageId, type, media: { id, mimeType, caption }, status, statusString, ticketId } }`

---

### Send File (v3 conversation-based, URL)
```
POST /api/ext/v3/conversations/messages/fileviaurl?conversation_id=&url=&caption=
```
Body: `{ "message": "text content" }`

Response: `{ id, conversation_id, message_status }`

---

### Send File (direct upload)
```
POST /conversations/{conversation_id}/messages/file
```
Body: multipart form — `file` (required), `caption` (optional).

---

## Message Retrieval

### Get Messages — v1 (current)
```
GET /api/v1/getMessages/{phone}?pageSize={n}&pageNumber={n}
```
Returns `{ messages: { items: [...] } }`.  
Each item shape varies by `type`; key fields: `id`, `text`, `type`, `created`, `timestamp`, `owner`, `eventType`, `statusString`, `finalText`, `data`, `media`.

### Get Messages — v3 (cleaner, structured)
```
GET /api/ext/v3/conversations/{target}/messages?page_number=1&page_size=100
```
`target` can be: `ConversationId | PhoneNumber | Channel:PhoneNumber`

Response:
```json
{
  "message_list": [
    {
      "id": "string",
      "text": "string",
      "type": "text|image|video|document|reaction|...",
      "timestamp": "ISO string",
      "owner": true,
      "status": "string",
      "conversation_id": "string",
      "ticket_id": "string",
      "event_type": "string"
    }
  ],
  "page_number": 1,
  "page_size": 100
}
```

---

## Templates

### Get Message Templates
```
GET /api/v1/getmessagetemplates?limit={n}&page={n}
```
Response:
```json
{
  "result": "success",
  "messageTemplates": [
    {
      "id": "string",
      "elementName": "string",
      "category": "string",
      "status": "APPROVED",
      "language": { "key": "en", "value": "en", "text": "English" },
      "body": "string",
      "header": {},
      "footer": "string",
      "buttons": [{ "type": "string", "text": "string" }],
      "buttonsType": "string",
      "components": [
        { "type": "BODY", "text": "Hello {{name}}, your order {{order_id}} is ready." }
      ]
    }
  ],
  "link": { "prevPage": null, "nextPage": null, "pageNumber": 1, "pageSize": 20, "total": 45 }
}
```

---

## Contacts

### List Contacts (paginated)
```
GET /api/ext/v3/contacts?page_number=1&page_size=100
```
Response contact fields: `id`, `wa_id`, `name`, `phone`, `photo`, `created`, `last_updated`, `contact_status`, `source`, `channel_id`, `opted_in`, `allow_broadcast`, `teams`, `segments`, `custom_params`, `display_name`, `is_broadcast_limit_reached`.

### Get Contact
```
GET /api/ext/v3/contacts/{target}
```
`target`: ContactId | PhoneNumber | Channel:PhoneNumber

### Add Contact
```
POST /api/ext/v3/contacts
```
Body: `{ whatsapp_number, name, custom_params: [{name, value}] }`

### Update Contact
```
PUT /api/v3/contacts/{contactId}
```
Body: `{ opted_in, allow_broadcast, allow_sms, teams, segments, custom_params, display_name }`

---

## Conversation Status

### Update Conversation Status
```
PUT /api/v3/conversations/{conversationId}/target-status
```
Body: `{ "status": "open" | "resolved" | "pending" }`

---

## Webhooks

### Register Webhook
```
POST /api/v2/webhookEndpoints
```
Body: `{ url, eventTypes: ["message", "sentMessageDELIVERED_v2", ...] }`

Response: `{ ok, result: [{ id, tenantId, channelId, channelPhoneNumber, url, status, eventTypes }] }`
`status`: 0=Disabled, 1=Enabled, 2=Defective

---

### Webhook Event Types
| Event | Fires when |
|---|---|
| `message` | Customer sends a message |
| `newContactMessageReceived` | New contact sends first message |
| `sentMessageDELIVERED_v2` | Our message was delivered to customer device |
| `sentMessageREAD_v2` | Customer read our message |
| `templateMessageFailed` | Template delivery failed |

---

### Incoming Message Payload (`eventType: "message"`)
```json
{
  "id": "string",
  "created": "ISO timestamp",
  "whatsappMessageId": "string",
  "conversationId": "string",
  "ticketId": "string",
  "text": "string",
  "type": "text|image|video|document|location|voice|audio|button|interactive|reaction|sticker|contacts|order|catalog",
  "timestamp": "unix timestamp string",
  "owner": false,
  "eventType": "message",
  "statusString": "SENT",
  "avatarUrl": null,
  "assignedId": "string",
  "operatorName": "string",
  "operatorEmail": "string",
  "waId": "string",
  "senderName": "string",
  "sourceType": 0,
  "channelPhoneNumber": "string"
}
```

### Delivery Confirmed Payload (`eventType: "sentMessageDELIVERED_v2"`)
```json
{
  "eventType": "sentMessageDELIVERED_v2",
  "statusString": "Delivered",
  "localMessageId": "string",
  "id": "string",
  "whatsappMessageId": "string",
  "conversationId": "string",
  "ticketId": "string",
  "text": "string",
  "type": "text",
  "timestamp": "unix timestamp string",
  "assigneeId": "string",
  "operatorEmail": "string",
  "channelPhoneNumber": "string"
}
```

### Message Read Payload (`eventType: "sentMessageREAD_v2"`)
```json
{
  "eventType": "sentMessageREAD_v2",
  "statusString": "Read",
  "localMessageId": "string",
  "id": "string",
  "whatsappMessageId": "string",
  "conversationId": "string",
  "ticketId": "string",
  "text": "string",
  "type": "text",
  "timestamp": "unix timestamp string",
  "assigneeId": "string",
  "operatorEmail": "string",
  "channelPhoneNumber": "string"
}
```

### Template Failed Payload (`eventType: "templateMessageFailed"`)
```json
{
  "eventType": "templateMessageFailed",
  "statusString": "Failed",
  "localMessageId": "string",
  "failedCode": "string",
  "failedDetail": "string",
  "id": "string",
  "whatsappMessageId": "string",
  "conversationId": "string",
  "ticketId": "string",
  "text": null,
  "type": "template",
  "timestamp": "unix timestamp string",
  "assigneeId": null,
  "operatorEmail": "string"
}
```

---

## Pagination Pattern

All list endpoints follow the same pattern:

| Query param | Type | Notes |
|---|---|---|
| `page_number` | integer | 1-based |
| `page_size` | integer | Max 100 |

Response always includes `page_number`, `page_size`, and (on templates) `total`.

---

## 24-Hour Session Window

- WhatsApp Business API conversations operate in 24-hour windows
- Session is **active** when there has been a message exchange (customer reply)
- Session is **inactive** if only outbound messages were sent with no reply
- After 24 hours without activity the session expires — only template messages can be sent
- There is no dedicated "get window status" endpoint; window state is derived from the last inbound message timestamp in `getMessages`

---

## Implementation Notes (MMS-specific)

| Topic | Current approach | Improvement available |
|---|---|---|
| Template params | Now using `{name, value}` named format ✅ | — |
| Delivery status | Stored at send time only | Handle `sentMessageDELIVERED_v2` + `sentMessageREAD_v2` webhooks to update in real-time |
| File sending | `/api/v1/sendSessionFileViaUrl` via send-message route | Expose in ChatInputBar for agents |
| Message fetch | v1 `getMessages` with custom parser | v3 endpoint is cleaner but migration not urgent |
| Window status | Derived from last inbound message timestamp | No API alternative — current approach is correct |
