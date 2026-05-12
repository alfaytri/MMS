'use client'

import { useState, useRef } from 'react'
import { Send, ChevronDown, Clock, Check, Smile } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import type { WindowStatus, WatiTemplate } from '@/types/contact-center'
import type { useChatMessages } from '@/hooks/contact-center/useChatMessages'

type ChatMessagesReturn = ReturnType<typeof useChatMessages>

// Common emoji groups for the picker
const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: 'Smileys', emojis: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓'] },
  { label: 'Gestures', emojis: ['👍','👎','👏','🙌','👐','🤲','🤝','🙏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🤏','💪','🦾','🦵','🦶','👂','🦻','👃','👀','👁️','🫦','🫀','🫁','🧠','🦷','🦴'] },
  { label: 'People', emojis: ['👶','🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵','🧏','💆','💇','🚶','🧍','🧎','🏃','💃','🕺','🧖','🛀','🧘'] },
  { label: 'Hearts', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☯️'] },
  { label: 'Objects', emojis: ['📱','💻','🖥️','🖨️','⌨️','🖱️','📷','📸','📹','🎥','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌚','📡','🔋','🔌','💡','🔦','🕯️','💵','💴','💶','💷','💰','💳','💎','⚖️','🧲','🔧','🔨','⚒️','🛠️','⛏️','🔩','🪛','🔫','🪃','🛡️','🪚','🔪','🗡️','⚔️','🪤','🪣','🧴','🧹','🧺','🧻','🪣','🧼','🫧','🪥','🧽','🪒','🛒'] },
  { label: 'Nature', emojis: ['🌸','🌺','🌻','🌹','🥀','🌷','🌱','🌲','🌳','🌴','🌵','🎄','🌾','🍀','🍁','🍂','🍃','🍄','🌰','🦔','🐾','🌙','🌛','🌜','🌝','🌞','⭐','🌟','💫','✨','⚡','🌈','☁️','⛅','🌤️','🌦️','🌧️','⛈️','🌩️','🌪️','🌫️','🌬️','🌀','🌊','🌈'] },
]

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
  const [showEmoji, setShowEmoji] = useState(false)
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

  function insertEmoji(emoji: string) {
    const el = textareaRef.current
    if (!el) { setInputText((t) => t + emoji); return }
    const start = el.selectionStart ?? inputText.length
    const end   = el.selectionEnd   ?? inputText.length
    const next  = inputText.slice(0, start) + emoji + inputText.slice(end)
    setInputText(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + emoji.length, start + emoji.length)
    })
    setShowEmoji(false)
  }

  function openTemplateConfirm(template: WatiTemplate) {
    setTemplateVars(Array.from({ length: template.variableCount }, () => ''))
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

  // Render a live preview of the template with current variable values
  function renderPreview(template: WatiTemplate): string {
    if (!template.bodyOriginal) return ''
    return template.paramNames.reduce(
      (text, name, i) => text.replace(`{{${name}}}`, templateVars[i] ? `*${templateVars[i]}*` : `{{${name}}}`),
      template.bodyOriginal
    )
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

      {/* Emoji picker panel */}
      {showEmoji && (
        <div className="border-b border-border bg-popover">
          <ScrollArea className="h-[180px]">
            <div className="p-2 space-y-2">
              {EMOJI_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">{group.label}</p>
                  <div className="flex flex-wrap gap-0.5">
                    {group.emojis.map((e) => (
                      <button
                        key={e}
                        className="text-base leading-none p-1 hover:bg-muted rounded transition-colors"
                        onClick={() => insertEmoji(e)}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

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
            {sending
              ? <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Send className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            disabled={!isOpen}
            onClick={() => { setShowEmoji((s) => !s); setShowTemplates(false) }}
          >
            <Smile className={`h-3.5 w-3.5 ${showEmoji ? 'text-primary' : ''}`} />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            onClick={() => { loadTemplates(); setShowTemplates(!showTemplates); setShowEmoji(false) }}
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Template list */}
      {showTemplates && (
        <div className="border-t border-border max-h-[200px] overflow-y-auto px-2 py-1.5 space-y-1">
          {templatesLoading && <p className="text-xs text-muted-foreground">Loading templates…</p>}
          {!templatesLoading && templates.length === 0 && <p className="text-xs text-muted-foreground">No templates available</p>}
          {templates.map((t) => (
            <button
              key={t.id}
              className="w-full text-left rounded px-2 py-1.5 hover:bg-muted transition-colors"
              onClick={() => openTemplateConfirm(t)}
            >
              <span className="text-xs font-medium">{t.elementName}</span>
              {t.variableCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] py-0 px-1">
                  {t.variableCount} var{t.variableCount > 1 ? 's' : ''}
                </Badge>
              )}
              {t.bodyOriginal && (
                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{t.bodyOriginal}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Template variable dialog */}
      <Dialog open={!!confirmTemplate} onOpenChange={(open) => { if (!open) setConfirmTemplate(null) }}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">{confirmTemplate?.elementName}</DialogTitle>
          </DialogHeader>

          {confirmTemplate && (
            <ScrollArea className="flex-1 overflow-y-auto">
              <div className="space-y-4 pr-1">
                {/* Live preview */}
                <div className="rounded-lg bg-muted/60 border border-border px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words dir-auto">
                  {renderPreview(confirmTemplate) || <span className="text-muted-foreground italic">No body text</span>}
                </div>

                {/* Variable inputs */}
                {confirmTemplate.variableCount > 0 && (
                  <div className="space-y-3">
                    {confirmTemplate.paramNames.map((name, i) => (
                      <div key={name} className="space-y-1">
                        <Label className="text-xs font-medium">
                          {`{{${name}}}`}
                        </Label>
                        <Input
                          value={templateVars[i] ?? ''}
                          onChange={(e) => setTemplateVars((prev) => prev.map((pv, pi) => pi === i ? e.target.value : pv))}
                          className="h-8 text-xs"
                          placeholder={`Enter ${name}`}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="gap-1.5 pt-2 border-t border-border">
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
