// src/lib/notifications/sendWatiTemplate.ts
//
// THE single WhatsApp-template send path. Every automated WATI send goes
// through here, so there is exactly one implementation of the mandatory
// pattern in docs/reference/wati-template-sending-rule.md:
//   - the WATI template name is READ from notification_config[slug] →
//     notification_templates.wati_template_name (load-bearing; assigned in the
//     Services → Notifications admin picker, never hardcoded),
//   - the message is sent via the api-wati Edge Function (direct Node→WATI is
//     silently filtered),
//   - a chat_messages row is written for Contact Centre visibility.
//
// Callers provide the slug + the NAMED parameter VALUES; the media header
// (pdflink) is added here when the template is a document + a pdfUrl is given.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPA_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export type WatiParam = { name: string; value: string }

export interface SendWatiTemplateArgs {
  /** notification_config.slug — the message type (e.g. 'order_invoice'). Also
   *  used for the chat log / broadcast name even when templateOverride is set. */
  slug: string
  /** Bypass the notification_config lookup and use this WATI template directly
   *  (for reminders, whose template is chosen per reminder_template, not per
   *  a global notification_config slug). */
  templateOverride?: { watiTemplateName: string; mediaType?: string } | null
  /** Customer phone in any format; normalised to digits with a 974 prefix. */
  phone: string
  /** NAMED body parameter values matching the template's placeholders. */
  params: WatiParam[]
  /** Optional document-header URL (added as `pdflink` for document templates). */
  pdfUrl?: string | null
  /** Human-readable message stored on the chat_messages row (may be Arabic). */
  renderedText: string
  /** Attachment display name for the chat row (defaults to 'document.pdf'). */
  attachmentName?: string
  /** User JWT — preferred (immediate mode, matches the Contact Centre call). */
  userToken?: string | null
  /** Cron secret — used only when there's no user session. */
  cronSecret?: string | null
}

export type SendWatiTemplateResult =
  | { ok: true; watiMsgId: string | null }
  | { skipped: 'config-missing' | 'inactive' | 'unassigned' | 'no-phone' }
  | { ok: false; error: string }

const safe = (v: string | null | undefined) => (v && String(v).trim()) || '-'

function normalisePhone(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('974') ? digits : `974${digits}`
}

/** Resolve the assigned WATI template + media type for a config slug. */
async function resolveTemplate(admin: SupabaseClient, slug: string): Promise<
  { active: boolean; watiTemplateName: string | null; mediaType: string } | null
> {
  const { data } = await admin
    .from('notification_config')
    .select('is_active, notification_templates!notification_config_template_slug_fkey ( wati_template_name, media_type, is_active )')
    .eq('slug', slug)
    .maybeSingle()
  if (!data) return null
  const tpl = (data as unknown as {
    is_active: boolean
    notification_templates: { wati_template_name: string | null; media_type: string | null; is_active: boolean } | null
  }).notification_templates
  return {
    active: (data as { is_active: boolean }).is_active && (tpl?.is_active ?? false),
    watiTemplateName: (tpl?.wati_template_name ?? '').trim() || null,
    mediaType: tpl?.media_type ?? 'none',
  }
}

export async function sendWatiTemplate(args: SendWatiTemplateArgs): Promise<SendWatiTemplateResult> {
  const admin = createClient(SUPA_URL, SUPA_KEY)

  const cfg = args.templateOverride
    ? { active: true, watiTemplateName: (args.templateOverride.watiTemplateName ?? '').trim() || null, mediaType: args.templateOverride.mediaType ?? 'none' }
    : await resolveTemplate(admin, args.slug)
  if (!cfg)          return { skipped: 'config-missing' }
  if (!cfg.active)   return { skipped: 'inactive' }
  if (!cfg.watiTemplateName) return { skipped: 'unassigned' }

  const watiPhone = normalisePhone(args.phone)
  if (!watiPhone)    return { skipped: 'no-phone' }

  const templateName = cfg.watiTemplateName

  // Build named params — prepend the document header when applicable.
  const bodyParams = args.params.map((p) => ({ name: p.name, value: safe(p.value) }))
  const parameters = args.pdfUrl && cfg.mediaType === 'document'
    ? [{ name: 'pdflink', value: args.pdfUrl }, ...bodyParams]
    : bodyParams

  const broadcastName = `${templateName}_${args.slug.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`

  // ── Insert the chat row BEFORE the WATI call (dedup timing — the webhook
  //    fires ~50ms later and matches this row by text) ──────────────────────
  const chatPhone = `+${watiPhone}`
  const placeholderExternalId = `${args.slug}_${Date.now()}`
  const attachments = args.pdfUrl
    ? [{ url: args.pdfUrl, type: 'application/pdf', name: args.attachmentName ?? 'document.pdf' }]
    : null

  let conversationId: string | null = null
  try {
    const { data: existing } = await admin
      .from('chat_conversations').select('id').eq('wati_phone', chatPhone).maybeSingle()
    conversationId = (existing as { id: string } | null)?.id ?? null
    if (!conversationId) {
      const { data: created } = await admin
        .from('chat_conversations')
        .insert({ wati_phone: chatPhone, last_message: args.renderedText, last_message_at: new Date().toISOString(), unread_count: 0 })
        .select('id').single()
      conversationId = (created as { id: string } | null)?.id ?? null
    } else {
      await admin.from('chat_conversations')
        .update({ last_message: args.renderedText, last_message_at: new Date().toISOString() })
        .eq('id', conversationId)
    }
  } catch (e) {
    console.warn('[sendWatiTemplate] chat_conversations upsert failed', args.slug, e)
  }

  let insertedMessageId: string | null = null
  if (conversationId) {
    const { data: inserted } = await admin
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        from_type:       'agent',
        source:          'whatsapp_api',
        text:            args.renderedText,
        agent_name:      'System',
        attachments,
        external_id:     placeholderExternalId,
        delivery_status: 'sending',
      })
      .select('id').maybeSingle()
    insertedMessageId = (inserted as { id: string } | null)?.id ?? null
  }

  // ── Send via the api-wati Edge Function ──────────────────────────────────
  const invokeBody = { action: 'send_template', phone: watiPhone, template_name: templateName, broadcast_name: broadcastName, parameters }
  let watiData: Record<string, unknown> | null = null
  let fnError: string | null = null

  try {
    if (args.userToken) {
      const userClient = createClient(SUPA_URL, SUPA_ANON, { global: { headers: { Authorization: `Bearer ${args.userToken}` } } })
      const { data: fnData, error: fnErr } = await userClient.functions.invoke('api-wati', { body: invokeBody })
      if (fnErr) fnError = fnErr.message ?? String(fnErr)
      watiData = (fnData ?? null) as Record<string, unknown> | null
    } else {
      const res = await fetch(`${SUPA_URL}/functions/v1/api-wati`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPA_ANON, Authorization: `Bearer ${SUPA_ANON}`, 'x-cron-secret': args.cronSecret ?? '' },
        body:    JSON.stringify(invokeBody),
      })
      const rawText = await res.text()
      try { watiData = JSON.parse(rawText) } catch { watiData = { raw: rawText } }
      if (!res.ok) fnError = `HTTP ${res.status}: ${rawText.slice(0, 200)}`
    }
  } catch (e) {
    fnError = e instanceof Error ? e.message : String(e)
  }

  const _msg  = watiData?.message as Record<string, unknown> | undefined
  const _info = watiData?.info    as Record<string, unknown> | undefined
  const watiMsgId: string | null =
    (_msg?.whatsappMessageId  as string | undefined) ??
    (_info?.whatsAppMessageId as string | undefined) ??
    (watiData?.id             as string | undefined) ??
    (watiData?.messageId      as string | undefined) ?? null
  const watiOk = !fnError && !watiData?.error && watiData?.result !== false

  if (!watiOk) {
    console.warn('[sendWatiTemplate] send failed', args.slug, 'result:', watiData?.result,
      'fn_error:', fnError ?? watiData?.error, 'detail:', watiData?.detail, 'body:', JSON.stringify(watiData).slice(0, 500))
  }

  // ── Backfill the chat row (only overwrite external_id while it's our placeholder) ──
  if (insertedMessageId) {
    await admin.from('chat_messages')
      .update({ delivery_status: watiOk ? 'sent' : 'failed', ...(watiMsgId ? { external_id: `wati_${watiMsgId}` } : {}) })
      .eq('id', insertedMessageId)
      .eq('external_id', placeholderExternalId)
  }

  return watiOk ? { ok: true, watiMsgId } : { ok: false, error: fnError ?? String(watiData?.error ?? 'wati send failed') }
}
