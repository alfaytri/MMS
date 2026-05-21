'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ChatMessage, WatiTemplate } from '@/types/contact-center'

export type AttachmentCategory = 'image' | 'video' | 'document' | 'audio'

export interface SendFileParams {
  conversationId: string
  phone: string
  file: File
  caption?: string
  agentProfileId?: string | null
}

interface SendSessionMessageParams {
  conversationId: string
  phone: string
  text: string
  onOptimisticInsert?: (tempId: string) => void
  agentProfileId?: string | null
}

interface SendTemplateParams {
  conversationId: string
  phone: string
  template: WatiTemplate
  variables: string[]
  headerUrl?: string
  agentProfileId?: string | null
}

export function useChatMessages(
  patchMessage: (id: string, patch: Partial<ChatMessage>) => void,
  addMessage?: (msg: ChatMessage) => void,
  provider: 'wati' | 'whapi' = 'wati',
) {
  const supabase = createClient()
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [templates, setTemplates] = useState<WatiTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)

  const sendSessionMessage = useCallback(async ({
    conversationId,
    phone,
    text,
    onOptimisticInsert,
    agentProfileId,
  }: SendSessionMessageParams) => {
    if (!text.trim() || sending) return
    setSending(true)

    // Ensure we have a valid session — refresh if the token has expired
    let { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      const { data: refreshed } = await supabase.auth.refreshSession()
      user = refreshed?.user ?? null
    }
    if (!user) {
      setSending(false)
      throw new Error('Session expired — please reload the page and log in again.')
    }

    let profileId: string | null = agentProfileId ?? null
    if (profileId === null) {
      const { data: profile } = await (supabase as any)
        .from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
      profileId = profile?.id ?? null
    }

    const { data: inserted, error: insertErr } = await (supabase as any)
      .from('chat_messages')
      .insert({
        conversation_id:    conversationId,
        from_type:          'agent',
        source:             'whatsapp_api',
        text:               text.trim(),
        delivery_status:    'sending',
        external_id:        null,
        sent_by_profile_id: profileId,
      })
      .select()
      .single()

    if (insertErr || !inserted) {
      setSending(false)
      throw new Error(insertErr?.message ?? 'Failed to insert message')
    }

    const tempId: string = inserted.id
    onOptimisticInsert?.(tempId)
    addMessage?.({
      ...inserted,
      reactions: inserted.reactions ?? [],
      attachments: inserted.attachments ?? null,
      message_kind: inserted.message_kind ?? 'message',
    } as ChatMessage)
    setInputText('')

    try {
      if (provider === 'whapi') {
        const res = await fetch('/api/whapi/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, text: text.trim(), skipDbInsert: true }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'WHAPI send failed')
        const whapiId = data.messageId ?? null
        const patch = whapiId
          ? { external_id: whapiId, delivery_status: 'sent' as const }
          : { delivery_status: 'sent' as const }
        await (supabase as any).from('chat_messages').update(patch).eq('id', tempId)
        patchMessage(tempId, patch)
      } else {
        const { data: fnData, error: fnErr } = await supabase.functions.invoke('api-wati', {
          body: { action: 'send_session_message', phone, text: text.trim() },
        })
        if (fnErr) throw fnErr
        const watiId = (fnData as any)?.message?.whatsappMessageId
          ?? (fnData as any)?.info?.whatsAppMessageId
          ?? (fnData as any)?.id
          ?? (fnData as any)?.messageId
        if (watiId) {
          await (supabase as any)
            .from('chat_messages')
            .update({ external_id: `wati_${watiId}`, delivery_status: 'sent' })
            .eq('id', tempId)
          patchMessage(tempId, { external_id: `wati_${watiId}`, delivery_status: 'sent' })
        } else {
          patchMessage(tempId, { delivery_status: 'sent' })
        }
      }
    } catch (err) {
      await (supabase as any)
        .from('chat_messages')
        .update({ delivery_status: 'failed' })
        .eq('id', tempId)
      patchMessage(tempId, { delivery_status: 'failed' })
      throw err
    } finally {
      setSending(false)
    }
  }, [provider, sending, supabase, patchMessage, addMessage])

  const sendTemplate = useCallback(async ({
    conversationId,
    phone,
    template,
    variables,
    headerUrl,
    agentProfileId,
  }: SendTemplateParams) => {
    if (sending) return
    setSending(true)

    // Ensure we have a valid session — refresh if the token has expired
    let { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      const { data: refreshed } = await supabase.auth.refreshSession()
      user = refreshed?.user ?? null
    }
    if (!user) {
      setSending(false)
      throw new Error('Session expired — please reload the page and log in again.')
    }

    let profileId: string | null = agentProfileId ?? null
    if (profileId === null) {
      const { data: profile } = await (supabase as any)
        .from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
      profileId = profile?.id ?? null
    }

    const bodyText = template.paramNames.reduce(
      (t, name, i) => t.replace(`{{${name}}}`, variables[i] ?? ''),
      template.bodyOriginal || template.elementName
    )

    const { data: inserted, error: insertErr } = await (supabase as any)
      .from('chat_messages')
      .insert({
        conversation_id:    conversationId,
        from_type:          'agent',
        source:             'whatsapp_api',
        text:               bodyText,
        delivery_status:    'sending',
        external_id:        null,
        sent_by_profile_id: profileId,
      })
      .select()
      .single()

    if (insertErr || !inserted) {
      setSending(false)
      throw new Error(insertErr?.message ?? 'Failed to insert template message')
    }

    const tempId: string = inserted.id
    addMessage?.({
      ...inserted,
      reactions: inserted.reactions ?? [],
      attachments: inserted.attachments ?? null,
      message_kind: inserted.message_kind ?? 'message',
    } as ChatMessage)
    const bodyParams = template.paramNames.length > 0
      ? template.paramNames.map((name, i) => ({ name, value: variables[i] ?? '' }))
      : variables.map((v, i) => ({ name: `${i + 1}`, value: v }))
    const hdrName = template.headerParamName ?? 'url'
    const parameters = template.headerMedia && headerUrl
      ? [{ name: hdrName, value: headerUrl }, ...bodyParams]
      : bodyParams

    try {
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('api-wati', {
        body: {
          action:         'send_template',
          phone,
          template_name:  template.elementName,
          broadcast_name: template.elementName,
          parameters,
        },
      })
      if (fnErr) throw fnErr
      const watiId = (fnData as any)?.message?.whatsappMessageId
        ?? (fnData as any)?.info?.whatsAppMessageId
        ?? (fnData as any)?.id
        ?? (fnData as any)?.messageId
      const patch = watiId
        ? { external_id: `wati_${watiId}`, delivery_status: 'sent' as const }
        : { delivery_status: 'sent' as const }
      await (supabase as any).from('chat_messages').update(patch).eq('id', tempId)
      patchMessage(tempId, patch)
    } catch {
      await (supabase as any).from('chat_messages').update({ delivery_status: 'failed' }).eq('id', tempId)
      patchMessage(tempId, { delivery_status: 'failed' })
    } finally {
      setSending(false)
    }
  }, [sending, supabase, patchMessage, addMessage])

  const loadTemplates = useCallback(async (force = false) => {
    if (!force && templates.length > 0) return
    setTemplatesLoading(true)
    setTemplates([])
    try {
      const { data } = await supabase.functions.invoke('api-wati', { body: { action: 'get_templates' } })
      const raw: any[] = (data as any)?.messageTemplates ?? []
      const parsed: WatiTemplate[] = raw.map((t) => {
        const comps: any[] = t.components ?? []
        const bodyComp   = comps.find((c: any) => (c.type ?? '').toUpperCase() === 'BODY')
        const headerComp = comps.find((c: any) => (c.type ?? '').toUpperCase() === 'HEADER')
        // Prefer bodyOriginal (named variables like {{booking_number}}) over
        // body (positional {{1}}) — the API needs the named param names.
        const bodyText = t.bodyOriginal ?? t.body ?? bodyComp?.text ?? ''
        const matches = bodyText.match(/\{\{(\w+)\}\}/g) ?? []
        const paramNames = matches.map((m: string) => m.replace(/\{\{|\}\}/g, ''))
        // Detect header media from components[] OR from root-level header object
        const headerFmt = (headerComp?.format ?? '').toUpperCase()
          || (t.header?.headerTypeString ?? t.header?.typeString ?? '').toUpperCase()
        const headerMedia: WatiTemplate['headerMedia'] =
          headerFmt === 'DOCUMENT' ? 'document'
          : headerFmt === 'IMAGE'  ? 'image'
          : headerFmt === 'VIDEO'  ? 'video'
          : null
        const headerLink: string = t.header?.link ?? ''
        const headerParamMatch = headerLink.match(/\{\{(\w+)\}\}/)
        const headerParamName = headerParamMatch ? headerParamMatch[1] : null
        return {
          id:           t.id ?? t.elementName,
          elementName:  t.elementName,
          bodyOriginal: bodyText,
          components:   comps,
          variableCount: paramNames.length,
          paramNames,
          unsupported:  false,
          headerMedia,
          headerParamName,
        }
      })
      setTemplates(parsed)
    } finally {
      setTemplatesLoading(false)
    }
  }, [templates.length, supabase])

  const reactToMessage = useCallback(async (messageId: string, emoji: string, phone?: string) => {
    const { data: row } = await (supabase as any)
      .from('chat_messages').select('reactions, external_id').eq('id', messageId).maybeSingle()
    const existing: { emoji: string; from_type: string }[] = row?.reactions ?? []
    const hasIt = existing.some((r) => r.emoji === emoji && r.from_type === 'agent')
    const updated = hasIt
      ? existing.filter((r) => !(r.emoji === emoji && r.from_type === 'agent'))
      : [...existing, { emoji, from_type: 'agent' }]

    if (provider === 'whapi' && row?.external_id && phone) {
      // Fire-and-forget: send-reaction route handles DB update via external_id
      fetch('/api/whapi/send-reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, messageId: row.external_id, emoji }),
      }).catch(() => {/* non-fatal */})
    }

    const { error: updateErr } = await (supabase as any)
      .from('chat_messages').update({ reactions: updated }).eq('id', messageId)
    if (updateErr) {
      console.error('[reactToMessage] update failed', updateErr)
      return
    }
    patchMessage(messageId, { reactions: updated } as any)
  }, [provider, supabase, patchMessage])

  const retryMessage = useCallback(async (message: ChatMessage, phone: string) => {
    if (!message.text) return
    patchMessage(message.id, { delivery_status: 'sending' })
    await (supabase as any).from('chat_messages').update({ delivery_status: 'sending' }).eq('id', message.id)
    try {
      if (provider === 'whapi') {
        const res = await fetch('/api/whapi/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, text: message.text, skipDbInsert: true }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'WHAPI retry failed')
        const whapiId = data.messageId ?? null
        const patch = whapiId
          ? { external_id: whapiId, delivery_status: 'sent' as const }
          : { delivery_status: 'sent' as const }
        await (supabase as any).from('chat_messages').update(patch).eq('id', message.id)
        patchMessage(message.id, patch)
      } else {
        const { data: fnData } = await supabase.functions.invoke('api-wati', {
          body: { action: 'send_session_message', phone, text: message.text },
        })
        const watiId = (fnData as any)?.message?.whatsappMessageId
          ?? (fnData as any)?.info?.whatsAppMessageId
          ?? (fnData as any)?.id
          ?? (fnData as any)?.messageId
        const patch = watiId
          ? { external_id: `wati_${watiId}`, delivery_status: 'sent' as const }
          : { delivery_status: 'sent' as const }
        await (supabase as any).from('chat_messages').update(patch).eq('id', message.id)
        patchMessage(message.id, patch)
      }
    } catch {
      await (supabase as any).from('chat_messages').update({ delivery_status: 'failed' }).eq('id', message.id)
      patchMessage(message.id, { delivery_status: 'failed' })
    }
  }, [provider, supabase, patchMessage])

  const sendFile = useCallback(async ({ conversationId, phone, file, caption, agentProfileId }: SendFileParams) => {
    if (sending) return
    setSending(true)

    let { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      const { data: refreshed } = await supabase.auth.refreshSession()
      user = refreshed?.user ?? null
    }
    if (!user) { setSending(false); throw new Error('Session expired') }

    // 1. Upload to Supabase Storage
    const ext      = file.name.split('.').pop() ?? 'bin'
    const path     = `${conversationId}/${Date.now()}.${ext}`
    // Strip ;codecs=... suffix — Supabase Storage checks against allowed_mime_types
    // with exact match; "audio/ogg;codecs=opus" would fail against "audio/ogg".
    const contentType = file.type.split(';')[0]
    const { data: uploaded, error: upErr } = await supabase.storage
      .from('chat-attachments')
      .upload(path, file, { contentType, upsert: false })
    if (upErr || !uploaded) { setSending(false); throw new Error(upErr?.message ?? 'Upload failed') }

    const { data: { publicUrl } } = supabase.storage.from('chat-attachments').getPublicUrl(path)

    // 2. Insert a placeholder message row
    let fileProfileId: string | null = agentProfileId ?? null
    if (fileProfileId === null) {
      const { data: profile } = await (supabase as any)
        .from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
      fileProfileId = profile?.id ?? null
    }
    const { data: inserted } = await (supabase as any)
      .from('chat_messages')
      .insert({
        conversation_id:    conversationId,
        from_type:          'agent',
        source:             'whatsapp_api',
        text:               caption ?? null,
        attachments:        [{ url: publicUrl, type: file.type, name: file.name }],
        delivery_status:    'sending',
        external_id:        null,
        sent_by_profile_id: fileProfileId,
      })
      .select().single()

    if (inserted) {
      addMessage?.({ ...inserted, reactions: [], message_kind: 'message' } as ChatMessage)
    }

    // 3. Send via provider
    try {
      if (provider === 'whapi') {
        const isImage = file.type.startsWith('image/')
        const isVideo = file.type.startsWith('video/')
        const isAudio = file.type.startsWith('audio/')
        const reqBody: any = { phone, skipDbInsert: true }
        if (caption) reqBody.text = caption
        if (isImage)      reqBody.imageUrl    = publicUrl
        else if (isVideo) reqBody.videoUrl    = publicUrl
        else if (isAudio) reqBody.audioUrl    = publicUrl
        else { reqBody.documentUrl = publicUrl; reqBody.documentName = file.name }
        const res = await fetch('/api/whapi/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'WHAPI file send failed')
        if (inserted) {
          const whapiId = data.messageId ?? null
          const patch = whapiId
            ? { external_id: whapiId, delivery_status: 'sent' as const }
            : { delivery_status: 'sent' as const }
          await (supabase as any).from('chat_messages').update(patch).eq('id', inserted.id)
          patchMessage(inserted.id, patch)
        }
      } else {
        // Use Next.js API route (Node.js) instead of Deno edge function — the edge
        // function loads the entire file into memory which fails for large videos.
        const fileRes = await fetch('/api/wati/send-file', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            phone,
            url:       publicUrl,
            caption:   caption ?? '',
            filename:  file.name,
            mime_type: file.type,
          }),
        })
        const watiResp = await fileRes.json().catch(() => ({})) as any
        if (!fileRes.ok) throw new Error(watiResp?.detail ?? watiResp?.error ?? 'WATI rejected the file')
        if (watiResp?.result === false || watiResp?.error) {
          throw new Error(watiResp?.info ?? watiResp?.error ?? 'WATI rejected the file')
        }
        const watiId = watiResp?.message?.whatsappMessageId
          ?? watiResp?.info?.whatsAppMessageId ?? null
        if (inserted) {
          const patch = watiId
            ? { external_id: `wati_${watiId}`, delivery_status: 'sent' as const }
            : { delivery_status: 'sent' as const }
          await (supabase as any).from('chat_messages').update(patch).eq('id', inserted.id)
          patchMessage(inserted.id, patch)
        }
      }
    } catch (err) {
      if (inserted) {
        await (supabase as any).from('chat_messages').update({ delivery_status: 'failed' }).eq('id', inserted.id)
        patchMessage(inserted.id, { delivery_status: 'failed' })
      }
      throw err
    } finally {
      setSending(false)
    }
  }, [provider, sending, supabase, patchMessage, addMessage])

  return {
    inputText,
    setInputText,
    sending,
    templates,
    templatesLoading,
    sendSessionMessage,
    sendTemplate,
    sendFile,
    loadTemplates,
    retryMessage,
    reactToMessage,
  }
}
