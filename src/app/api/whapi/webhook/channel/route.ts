// Re-export the webhook handler at /api/whapi/webhook/channel
// WHAPI sends events to this path by convention.
export { GET, POST } from '../route'
