'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ChatMessage, WatiTemplate } from '@/types/contact-center'

interface SendSessionMessageParams {
  conversationId: string
  phone: string
  text: string
  onOptimisticInsert?: (tempId: string) => void
}

interface SendTemplateParams {
  conversationId: string
  phone: string
  template: WatiTemplate
  variables: string[]
}

export function useChatMessages(patchMessage: (id: string, patch: Partial<ChatMessage>) => void) {
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
  }: SendSessionMessageParams) => {
    if (!text.trim() || sending) return
    setSending(true)

    const { data: { user } } = await supabase.auth.getUser()

    const { data: inserted, error: insertErr } = await (supabase as any)
      .from('chat_messages')
      .insert({
        conversation_id:    conversationId,
        from_type:          'agent',
        source:             'whatsapp_api',
        text:               text.trim(),
        delivery_status:    'sending',
        external_id:        null,
        sent_by_profile_id: user?.id ?? null,
      })
      .select()
      .single()

    if (insertErr || !inserted) {
      setSending(false)
      throw new Error(insertErr?.message ?? 'Failed to insert message')
    }

    const tempId: string = inserted.id
    onOptimisticInsert?.(tempId)
    setInputText('')

    try {
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('api-wati', {
        body: { action: 'send_session_message', phone, text: text.trim() },
      })
      if (fnErr) throw fnErr

      const watiId = (fnData as any)?.id ?? (fnData as any)?.messageId
      if (watiId) {
        await (supabase as any)
          .from('chat_messages')
          .update({ external_id: `wati_${watiId}`, delivery_status: 'sent' })
          .eq('id', tempId)
        patchMessage(tempId, { external_id: `wati_${watiId}`, delivery_status: 'sent' })
      } else {
        patchMessage(tempId, { delivery_status: 'sent' })
      }
    } catch {
      await (supabase as any)
        .from('chat_messages')
        .update({ delivery_status: 'failed' })
        .eq('id', tempId)
      patchMessage(tempId, { delivery_status: 'failed' })
    } finally {
      setSending(false)
    }
  }, [sending, supabase, patchMessage])

  const sendTemplate = useCallback(async ({
    conversationId,
    phone,
    template,
    variables,
  }: SendTemplateParams) => {
    if (sending) return
    setSending(true)

    const { data: { user } } = await supabase.auth.getUser()
    const bodyText = variables.reduce(
      (t, v, i) => t.replace(`{{${i + 1}}}`, v),
      template.bodyOriginal ?? template.elementName
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
        sent_by_profile_id: user?.id ?? null,
      })
      .select()
      .single()

    if (insertErr || !inserted) {
      setSending(false)
      throw new Error(insertErr?.message ?? 'Failed to insert template message')
    }

    const tempId: string = inserted.id
    const parameters = variables.map((v, i) => ({ name: `${i + 1}`, value: v }))

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
      const watiId = (fnData as any)?.id ?? (fnData as any)?.messageId
      const patch = watiId
        ? { external_id: `wati_${watiId}`, delivery_status: 'sent' as const }
        : { delivery_status: 'sent' as const }
      if (watiId) {
        await (supabase as any).from('chat_messages').update(patch).eq('id', tempId)
      }
      patchMessage(tempId, patch)
    } catch {
      await (supabase as any).from('chat_messages').update({ delivery_status: 'failed' }).eq('id', tempId)
      patchMessage(tempId, { delivery_status: 'failed' })
    } finally {
      setSending(false)
    }
  }, [sending, supabase, patchMessage])

  const loadTemplates = useCallback(async () => {
    if (templates.length > 0) return
    setTemplatesLoading(true)
    try {
      const { data } = await supabase.functions.invoke('api-wati', { body: { action: 'get_templates' } })
      const raw: any[] = (data as any)?.messageTemplates ?? []
      const parsed: WatiTemplate[] = raw.map((t) => {
        const bodyComp = (t.components ?? []).find((c: any) => c.type === 'BODY')
        const matches = bodyComp?.text?.match(/\{\{\d+\}\}/g) ?? []
        const variableCount = matches.length
        return {
          id:             t.id ?? t.elementName,
          elementName:    t.elementName,
          bodyOriginal:   bodyComp?.text ?? '',
          components:     t.components ?? [],
          variableCount,
          unsupported:    variableCount > 2,
        }
      }).filter((t) => !t.unsupported)
      setTemplates(parsed)
    } finally {
      setTemplatesLoading(false)
    }
  }, [templates.length, supabase])

  const retryMessage = useCallback(async (message: ChatMessage, phone: string) => {
    if (!message.text) return
    patchMessage(message.id, { delivery_status: 'sending' })
    await (supabase as any).from('chat_messages').update({ delivery_status: 'sending' }).eq('id', message.id)
    try {
      const { data: fnData } = await supabase.functions.invoke('api-wati', {
        body: { action: 'send_session_message', phone, text: message.text },
      })
      const watiId = (fnData as any)?.id
      const patch = watiId
        ? { external_id: `wati_${watiId}`, delivery_status: 'sent' as const }
        : { delivery_status: 'sent' as const }
      await (supabase as any).from('chat_messages').update(patch).eq('id', message.id)
      patchMessage(message.id, patch)
    } catch {
      await (supabase as any).from('chat_messages').update({ delivery_status: 'failed' }).eq('id', message.id)
      patchMessage(message.id, { delivery_status: 'failed' })
    }
  }, [supabase, patchMessage])

  return {
    inputText,
    setInputText,
    sending,
    templates,
    templatesLoading,
    sendSessionMessage,
    sendTemplate,
    loadTemplates,
    retryMessage,
  }
}
