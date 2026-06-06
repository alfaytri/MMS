'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Smile, Paperclip, BookOpen, X, Loader2, GripVertical, RefreshCw, Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import type { WindowStatus, WatiTemplate } from '@/types/contact-center'
import { webmOpusToOgg } from '@/lib/webm-opus-to-ogg'
import type { useChatMessages } from '@/hooks/contact-center/useChatMessages'
import { ChatTemplateConfirmDialog } from './ChatTemplateConfirmDialog'
import { ChatAttachmentDialog } from './ChatAttachmentDialog'
import { ChatInstructionsDialog } from './ChatInstructionsDialog'

type ChatMessagesReturn = ReturnType<typeof useChatMessages>

// ── Emoji groups ──────────────────────────────────────────────────────────────
const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: 'Smileys', emojis: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓'] },
  { label: 'Gestures', emojis: ['👍','👎','👏','🙌','👐','🤲','🤝','🙏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🤏','💪','🦾'] },
  { label: 'Hearts', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝'] },
  { label: 'Objects', emojis: ['📱','💻','🖥️','📷','📸','📹','🎥','📞','☎️','📺','📻','💡','🔦','💵','💳','💎','🔧','🔨','🛠️','🔩','🔪','⚔️'] },
  { label: 'Nature', emojis: ['🌸','🌺','🌻','🌹','🌷','🌱','🌲','🌳','🌴','🌵','🍀','🍁','🍂','🍃','🍄','🌙','⭐','🌟','💫','✨','⚡','🌈','☁️','🌊'] },
]

interface Props {
  conversationId: string
  phone: string
  customerName: string
  windowStatus: WindowStatus
  chatMessages: ChatMessagesReturn
  onAfterSend?: () => void
  provider?: 'wati' | 'whapi'
}

// ── Main ChatInputBar ─────────────────────────────────────────────────────────
export function ChatInputBar({ conversationId, phone, customerName, windowStatus, chatMessages, onAfterSend, provider }: Props) {
  const {
    inputText, setInputText, sending,
    templates, templatesLoading,
    sendSessionMessage, sendTemplate, sendFile, loadTemplates,
  } = chatMessages

  const [showEmoji, setShowEmoji]           = useState(false)
  const [showAttach, setShowAttach]         = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [confirmTemplate, setConfirmTemplate]   = useState<WatiTemplate | null>(null)
  const [templatesExpanded, setTemplatesExpanded] = useState(false)
  const [templateFilter, setTemplateFilter] = useState<'no-params' | 'has-params'>('no-params')
  const [paramOverrides, setParamOverrides] = useState<Record<string, 'no-params' | 'has-params'>>(() => {
    try { return JSON.parse(localStorage.getItem('cc-template-overrides') ?? '{}') } catch { return {} }
  })
  const [draggedTemplate, setDraggedTemplate] = useState<string | null>(null)
  const [dragOver, setDragOver]               = useState<'no-params' | 'has-params' | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Voice recording ────────────────────────────────────────────────────────
  const [recording, setRecording]             = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const recorderRef    = useRef<MediaRecorder | null>(null)
  const chunksRef      = useRef<Blob[]>([])
  const streamRef      = useRef<MediaStream | null>(null)
  const durationTimer  = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    if (durationTimer.current) clearInterval(durationTimer.current)
  }, [])

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []

      const mimeType =
        MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')    ? 'audio/ogg;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const recorder = new MediaRecorder(stream, { mimeType })
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        const rawBlob = new Blob(chunksRef.current, { type: recorder.mimeType })

        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        if (durationTimer.current) { clearInterval(durationTimer.current); durationTimer.current = null }
        setRecording(false)
        setRecordingDuration(0)

        if (rawBlob.size < 1000) return

        let finalBlob: Blob
        if (recorder.mimeType.includes('ogg')) {
          finalBlob = rawBlob
        } else {
          try {
            finalBlob = await webmOpusToOgg(rawBlob)
          } catch {
            finalBlob = rawBlob
          }
        }
        const file = new File([finalBlob], `voice-note-${Date.now()}.ogg`, { type: 'audio/ogg' })

        try {
          await sendFile({ conversationId, phone, file })
          onAfterSend?.()
          toast.success('Voice note sent')
        } catch (e: any) {
          toast.error(e?.message ?? 'Failed to send voice note')
        }
      }

      recorder.start()
      setRecording(true)
      setRecordingDuration(0)
      durationTimer.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000)
    } catch {
      toast.error('Microphone access denied — check browser permissions')
    }
  }

  function stopRecording() {
    recorderRef.current?.stop()
  }

  function cancelRecording() {
    const rec = recorderRef.current
    if (rec) {
      rec.ondataavailable = null
      rec.onstop = null
      if (rec.state !== 'inactive') rec.stop()
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (durationTimer.current) { clearInterval(durationTimer.current); durationTimer.current = null }
    setRecording(false)
    setRecordingDuration(0)
  }

  const { isOpen: watiIsOpen, minutesRemaining } = windowStatus
  const isOpen = provider === 'whapi' ? true : watiIsOpen

  function getEffectiveGroup(t: WatiTemplate): 'no-params' | 'has-params' {
    return paramOverrides[t.elementName] ?? (t.variableCount === 0 ? 'no-params' : 'has-params')
  }

  function setOverride(elementName: string, group: 'no-params' | 'has-params') {
    setParamOverrides((prev) => {
      const next = { ...prev, [elementName]: group }
      localStorage.setItem('cc-template-overrides', JSON.stringify(next))
      return next
    })
  }

  const handleLoadTemplates = useCallback(() => {
    if (templates.length === 0) loadTemplates()
    setTemplatesExpanded((v) => !v)
  }, [templates.length, loadTemplates])

  async function handleSend() {
    if (!inputText.trim() || sending) return
    try {
      await sendSessionMessage({ conversationId, phone, text: inputText })
      onAfterSend?.()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to send message')
    }
  }

  async function handleSendFile(file: File, caption: string) {
    try {
      await sendFile({ conversationId, phone, file, caption: caption || undefined })
      setShowAttach(false)
      onAfterSend?.()
      toast.success('File sent')
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to send file')
    }
  }

  async function handleSendInstruction(text: string) {
    try {
      await sendSessionMessage({ conversationId, phone, text })
      onAfterSend?.()
    } catch {
      toast.error('Failed to send instruction')
    }
  }

  async function handleSendTemplate(vars: string[], headerUrl: string) {
    if (!confirmTemplate) return
    try {
      const bodyParams = confirmTemplate.paramNames.length > 0
        ? confirmTemplate.paramNames.map((name, i) => ({ name, value: vars[i] ?? '' }))
        : vars.map((v, i) => ({ name: `${i + 1}`, value: v }))
      await sendTemplate({ conversationId, phone, template: confirmTemplate, variables: vars, headerUrl: headerUrl || undefined })
      setConfirmTemplate(null)
      toast.success('Template sent')
      onAfterSend?.()
    } catch {
      toast.error('Failed to send template')
    }
  }

  function insertEmoji(emoji: string) {
    const el = textareaRef.current
    if (!el) { setInputText((t) => t + emoji); return }
    const start = el.selectionStart ?? inputText.length
    const end   = el.selectionEnd   ?? inputText.length
    setInputText(inputText.slice(0, start) + emoji + inputText.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + emoji.length, start + emoji.length)
    })
    setShowEmoji(false)
  }

  const windowBannerClass = !isOpen
    ? 'bg-destructive/10 border-destructive/30 text-destructive'
    : minutesRemaining < 360
    ? 'bg-amber-50 border-amber-200 text-amber-700'
    : 'bg-emerald-50 border-emerald-200 text-emerald-700'

  return (
    <div className="border-t border-border flex flex-col flex-shrink-0">

      {/* ── Templates quick-bar — WATI only ──────────────────────────────── */}
      {provider !== 'whapi' && <div className="border-b border-border">
        <button
          onClick={handleLoadTemplates}
          className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40 transition-colors"
        >
          <span className="font-medium">Templates</span>
          {templatesLoading
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <span className="text-[10px]">{templatesExpanded ? '▲' : '▼'}</span>}
        </button>

        {templatesExpanded && (
          <div className="pb-1.5">
            {/* Filter tabs + refresh button */}
            <div className="flex items-center gap-1 px-2 py-1">
              {(['no-params', 'has-params'] as const).map((f) => {
                const count = templates.filter((t) => getEffectiveGroup(t) === f).length
                const isTarget = dragOver === f && draggedTemplate !== null
                return (
                  <button
                    key={f}
                    onClick={() => setTemplateFilter(f)}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(f) }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (draggedTemplate) setOverride(draggedTemplate, f)
                      setDraggedTemplate(null)
                      setDragOver(null)
                      setTemplateFilter(f)
                    }}
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium border transition-all flex items-center gap-1 ${
                      isTarget
                        ? 'border-dashed border-primary bg-primary/10 text-primary scale-105'
                        : templateFilter === f
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {f === 'no-params' ? 'No params' : 'Has params'}
                    {templates.length > 0 && (
                      <span className={`rounded-full px-1 text-[9px] leading-none py-px ${
                        templateFilter === f && !isTarget ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted-foreground/20'
                      }`}>{count}</span>
                    )}
                  </button>
                )
              })}
              {/* Refresh button */}
              <button
                onClick={() => loadTemplates(true)}
                disabled={templatesLoading}
                title="Reload templates from WATI"
                className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`h-3 w-3 ${templatesLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Template list */}
            <div className="overflow-y-auto max-h-36 px-2 space-y-px">
              {templates.length === 0 && !templatesLoading && (
                <p className="text-xs text-muted-foreground py-1 px-1">No templates loaded</p>
              )}
              {templates
                .filter((t) => getEffectiveGroup(t) === templateFilter)
                .map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={() => setDraggedTemplate(t.elementName)}
                    onDragEnd={() => { setDraggedTemplate(null); setDragOver(null) }}
                    className={`flex items-center gap-1.5 rounded px-1.5 py-1 border transition-colors ${
                      draggedTemplate === t.elementName
                        ? 'opacity-40 border-border bg-muted'
                        : 'border-transparent hover:border-border hover:bg-muted/40'
                    }`}
                  >
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 cursor-grab active:cursor-grabbing" />
                    <button
                      onClick={() => { setConfirmTemplate(t); setTemplatesExpanded(false) }}
                      title={t.variableCount > 0 ? `Params: ${t.paramNames.join(', ')}` : 'No parameters — sends instantly'}
                      className="flex-1 text-left text-[11px] truncate hover:text-primary transition-colors"
                    >
                      {t.elementName}
                    </button>
                    {t.variableCount > 0 && (
                      <span className="shrink-0 rounded-full bg-amber-100 text-amber-700 border border-amber-300 px-1.5 text-[9px] leading-none py-px font-medium">
                        {t.variableCount} param{t.variableCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                ))}
              {templates.length > 0 && templates.filter((t) => getEffectiveGroup(t) === templateFilter).length === 0 && (
                <p className="text-xs text-muted-foreground py-1 px-1">
                  No {templateFilter === 'no-params' ? 'parameter-free' : 'parameterised'} templates — drag one here from the other tab
                </p>
              )}
            </div>
          </div>
        )}
      </div>}

      {/* ── Window banner — WATI only ────────────────────────────────────── */}
      {provider !== 'whapi' && (
        <div className={`flex items-center gap-1.5 px-3 py-1 text-xs border-b ${windowBannerClass}`}>
          {!isOpen
            ? 'Window closed — use a template'
            : minutesRemaining < 60
            ? `Window closes in ${minutesRemaining}m`
            : `Window open · ${Math.floor(minutesRemaining / 60)}h ${minutesRemaining % 60}m left`}
        </div>
      )}

      {/* ── Emoji panel ──────────────────────────────────────────────────── */}
      {showEmoji && (
        <div className="border-b border-border bg-popover">
          <ScrollArea className="h-[160px]">
            <div className="p-2 space-y-2">
              {EMOJI_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="text-[10px] text-muted-foreground font-medium mb-1">{group.label}</p>
                  <div className="flex flex-wrap gap-0.5">
                    {group.emojis.map((e, i) => (
                      <button key={i} className="text-base leading-none p-1 hover:bg-muted rounded" onClick={() => insertEmoji(e)}>{e}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* ── Input area ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1 p-2">
        <Textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          disabled={!isOpen || sending}
          placeholder={isOpen ? 'Type a message… (Enter to send)' : 'Window closed — use a template above'}
          className="min-h-[44px] max-h-[100px] resize-none text-xs w-full"
        />

        {/* Action buttons row */}
        {recording ? (
          <div className="flex items-center gap-2 h-8">
            <Button size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0" onClick={cancelRecording} title="Cancel">
              <X className="h-4 w-4 text-muted-foreground" />
            </Button>
            <div className="flex items-center gap-1.5 flex-1 text-xs text-destructive font-medium">
              <span className="h-2 w-2 rounded-full bg-destructive animate-pulse flex-shrink-0" />
              {Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, '0')}
              <span className="text-muted-foreground font-normal ml-1">Recording…</span>
            </div>
            <Button
              size="icon"
              className="h-8 w-8 bg-destructive hover:bg-destructive/90 flex-shrink-0"
              onClick={stopRecording}
              title="Stop and send"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!isOpen} onClick={() => setShowEmoji((s) => !s)}>
              <Smile className={`h-4 w-4 ${showEmoji ? 'text-primary' : 'text-muted-foreground'}`} />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!isOpen} onClick={() => setShowAttach(true)} title="Send attachment">
              <Paperclip className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!isOpen} onClick={() => setShowInstructions(true)} title="Send service instruction">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!isOpen} onClick={startRecording} title="Record voice note">
              <Mic className="h-4 w-4 text-muted-foreground" />
            </Button>

            <div className="flex-1" />

            <Button className="h-8 px-3 gap-1.5 text-xs" disabled={!isOpen || !inputText.trim() || sending} onClick={handleSend}>
              {sending
                ? <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <><Send className="h-3.5 w-3.5" /> Send</>}
            </Button>
          </div>
        )}
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}
      <ChatAttachmentDialog
        open={showAttach}
        sending={sending}
        onSend={handleSendFile}
        onClose={() => setShowAttach(false)}
      />

      <ChatInstructionsDialog
        open={showInstructions}
        sending={sending}
        onSend={handleSendInstruction}
        onClose={() => setShowInstructions(false)}
      />

      {confirmTemplate && (
        <ChatTemplateConfirmDialog
          template={confirmTemplate}
          sending={sending}
          onSend={handleSendTemplate}
          onClose={() => setConfirmTemplate(null)}
        />
      )}
    </div>
  )
}
