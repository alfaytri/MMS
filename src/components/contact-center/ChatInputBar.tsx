'use client'

import { useState, useRef } from 'react'
import { Send, ChevronDown, Clock, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { WindowStatus, WatiTemplate } from '@/types/contact-center'
import type { useChatMessages } from '@/hooks/contact-center/useChatMessages'

type ChatMessagesReturn = ReturnType<typeof useChatMessages>

interface Props {
  conversationId: string
  phone: string
  customerName: string
  windowStatus: WindowStatus
  chatMessages: ChatMessagesReturn
}

export function ChatInputBar({ conversationId, phone, customerName, windowStatus, chatMessages }: Props) {
  const { inputText, setInputText, sending, templates, templatesLoading, sendSessionMessage, sendTemplate, loadTemplates } = chatMessages
  const [showTemplates, setShowTemplates] = useState(false)
  const [confirmTemplate, setConfirmTemplate] = useState<WatiTemplate | null>(null)
  const [templateVars, setTemplateVars] = useState<string[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { isOpen, minutesRemaining } = windowStatus

  async function handleSend() {
    if (!inputText.trim() || sending) return
    try {
      await sendSessionMessage({ conversationId, phone, text: inputText })
    } catch {
      toast.error('Failed to send message')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function openTemplateConfirm(template: WatiTemplate) {
    const defaults = Array.from({ length: template.variableCount }, (_, i) =>
      i === 0 ? customerName : ''
    )
    setTemplateVars(defaults)
    setConfirmTemplate(template)
    setShowTemplates(false)
  }

  async function handleSendTemplate() {
    if (!confirmTemplate) return
    try {
      await sendTemplate({ conversationId, phone, template: confirmTemplate, variables: templateVars })
      setConfirmTemplate(null)
      toast.success('Template sent')
    } catch {
      toast.error('Failed to send template')
    }
  }

  const windowBannerClass = !isOpen
    ? 'bg-destructive/10 border-destructive/30 text-destructive'
    : minutesRemaining < 360
    ? 'bg-amber-50 border-amber-200 text-amber-700'
    : 'bg-emerald-50 border-emerald-200 text-emerald-700'

  return (
    <div className="border-t border-border flex flex-col">
      {/* Window banner */}
      <div className={`flex items-center gap-1.5 px-3 py-1 text-xs border-b ${windowBannerClass}`}>
        <Clock className="h-3 w-3 flex-shrink-0" />
        {!isOpen
          ? 'Window closed — use a template'
          : minutesRemaining < 60
          ? `Window closes in ${minutesRemaining}m`
          : `Window open · ${Math.floor(minutesRemaining / 60)}h ${minutesRemaining % 60}m left`
        }
      </div>

      {/* Input area */}
      <div className="flex items-end gap-1.5 p-2">
        <Textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!isOpen || sending}
          placeholder={isOpen ? 'Type a message… (Enter to send)' : 'Window closed — select a template below'}
          className="min-h-[52px] max-h-[120px] resize-none text-xs flex-1"
        />
        <div className="flex flex-col gap-1">
          <Button
            size="icon"
            className="h-8 w-8"
            disabled={!isOpen || !inputText.trim() || sending}
            onClick={handleSend}
          >
            {sending ? <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => { loadTemplates(); setShowTemplates(!showTemplates) }}
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Template list */}
      {showTemplates && (
        <div className="border-t border-border max-h-[160px] overflow-y-auto px-2 py-1.5 space-y-1">
          {templatesLoading && <p className="text-xs text-muted-foreground">Loading templates…</p>}
          {!templatesLoading && templates.length === 0 && <p className="text-xs text-muted-foreground">No templates available</p>}
          {templates.map((t) => (
            <button
              key={t.id}
              className="w-full text-left rounded px-2 py-1.5 text-xs hover:bg-muted transition-colors"
              onClick={() => openTemplateConfirm(t)}
            >
              <span className="font-medium">{t.elementName}</span>
              {t.variableCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs py-0 px-1">{t.variableCount} var{t.variableCount > 1 ? 's' : ''}</Badge>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Template variable confirm dialog */}
      <Dialog open={!!confirmTemplate} onOpenChange={(open) => { if (!open) setConfirmTemplate(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Confirm template variables</DialogTitle>
          </DialogHeader>
          {confirmTemplate && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1.5 rounded">
                {confirmTemplate.bodyOriginal}
              </p>
              {templateVars.map((v, i) => (
                <div key={i} className="space-y-1">
                  <Label className="text-xs">{`{{${i + 1}}}`} — suggested: <span className="text-muted-foreground">{i === 0 ? 'Customer name' : 'Order date'}</span></Label>
                  <Input
                    value={v}
                    onChange={(e) => setTemplateVars((prev) => prev.map((pv, pi) => pi === i ? e.target.value : pv))}
                    className="h-8 text-xs"
                  />
                </div>
              ))}
            </div>
          )}
          <DialogFooter className="gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setConfirmTemplate(null)}>Cancel</Button>
            <Button size="sm" onClick={handleSendTemplate} disabled={sending}>
              <Check className="h-3.5 w-3.5 mr-1" /> Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
