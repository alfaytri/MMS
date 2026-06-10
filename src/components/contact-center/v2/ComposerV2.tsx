'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Paperclip, BookOpen, Mic, Square, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { ProviderSuggestBanner } from './ProviderSuggestBanner'
import type { WindowStatus, WatiTemplate } from '@/types/contact-center'
import { webmOpusToOgg } from '@/lib/webm-opus-to-ogg'

interface Props {
  provider:          'wati' | 'whapi'
  onProviderChange:  (p: 'wati' | 'whapi') => void
  suggestedProvider: 'wati' | 'whapi' | null
  onAcceptSuggest:   () => void
  onDismissSuggest:  () => void

  windowStatus?:     WindowStatus
  sending:           boolean
  onSend:            (text: string) => void
  onAttachment:      () => void
  onInstructions:    () => void
  onSelectTemplate:  (t: WatiTemplate) => void
  onVoiceNote:       (file: File) => Promise<void>

  templates:         WatiTemplate[]
  templatesLoading:  boolean
  onLoadTemplates:   () => void

  onFocus:           () => void
  onBlur:            () => void
  onTextChange:      (text: string) => void
  text:              string
}

export function ComposerV2({
  provider, onProviderChange, suggestedProvider, onAcceptSuggest, onDismissSuggest,
  windowStatus, sending, onSend,
  onAttachment, onInstructions, onSelectTemplate, onVoiceNote,
  templates, templatesLoading, onLoadTemplates,
  onFocus, onBlur, onTextChange, text,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Voice recording
  const [recording, setRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const recorderRef   = useRef<MediaRecorder | null>(null)
  const chunksRef     = useRef<Blob[]>([])
  const streamRef     = useRef<MediaStream | null>(null)
  const durationTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Templates expansion — which group is open ('none' | 'normal' | 'param')
  const [templateGroup, setTemplateGroup] = useState<'none' | 'normal' | 'param'>('none')

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    if (durationTimer.current) clearInterval(durationTimer.current)
  }, [])

  const watiClosed = provider === 'wati' && windowStatus && !windowStatus.isOpen
  const disabled = !!watiClosed || sending

  function handleSend() {
    if (!text.trim() || disabled) return
    onSend(text)
  }

  // ── Voice recording ────────────────────────────────────────────────────────
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
          try { finalBlob = await webmOpusToOgg(rawBlob) } catch { finalBlob = rawBlob }
        }
        const file = new File([finalBlob], `voice-note-${Date.now()}.ogg`, { type: 'audio/ogg' })

        try {
          await onVoiceNote(file)
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

  function stopRecording() { recorderRef.current?.stop() }

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

  const toggleGroup = useCallback((g: 'normal' | 'param') => {
    if (templates.length === 0) onLoadTemplates()
    setTemplateGroup((prev) => (prev === g ? 'none' : g))
  }, [templates.length, onLoadTemplates])

  return (
    <div className="border-t border-border flex flex-col flex-shrink-0">
      {/* Provider toggle */}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-border">
        <div className="flex items-center rounded-full border border-border bg-muted/50 p-0.5 gap-0.5">
          {(['wati', 'whapi'] as const).map((p) => (
            <button
              key={p}
              onClick={() => onProviderChange(p)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase transition-colors min-h-[20px] ${
                provider === p ? 'bg-primary text-primary-foreground shadow-sm'
                               : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <ProviderSuggestBanner
        suggested={suggestedProvider}
        onSwitch={onAcceptSuggest}
        onDismiss={onDismissSuggest}
      />

      {/* Templates — two buttons: Normal Message / Param Messages — WATI only */}
      {provider !== 'whapi' && (() => {
        const active    = templates.filter((t) => !t.unsupported)
        const noParams  = active.filter((t) => t.variableCount === 0)
        const hasParams = active.filter((t) => t.variableCount > 0)
        const currentList = templateGroup === 'normal' ? noParams
                          : templateGroup === 'param'  ? hasParams
                          : []
        return (
          <div className="border-b border-border">
            <div className="grid grid-cols-2 gap-px bg-border">
              <button
                onClick={() => toggleGroup('normal')}
                className={`flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  templateGroup === 'normal'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-background text-muted-foreground hover:bg-muted/40'
                }`}
              >
                <span>Normal Message</span>
                {templatesLoading && templateGroup === 'normal'
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : templates.length > 0 && <span className="text-[10px] opacity-70">· {noParams.length}</span>}
              </button>
              <button
                onClick={() => toggleGroup('param')}
                className={`flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  templateGroup === 'param'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-background text-muted-foreground hover:bg-muted/40'
                }`}
              >
                <span>Param Messages</span>
                {templatesLoading && templateGroup === 'param'
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : templates.length > 0 && <span className="text-[10px] opacity-70">· {hasParams.length}</span>}
              </button>
            </div>

            {templateGroup !== 'none' && (
              <div className="max-h-48 overflow-y-auto">
                {currentList.length === 0 && !templatesLoading && (
                  <p className="text-[11px] text-muted-foreground text-center py-2">
                    {templateGroup === 'normal' ? 'No parameter-free templates' : 'No parameterised templates'}
                  </p>
                )}
                {currentList.map((t) => (
                  <button
                    key={t.elementName}
                    onClick={() => onSelectTemplate(t)}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors border-b border-border flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{t.elementName}</span>
                    {t.variableCount > 0 && (
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {t.variableCount} {t.variableCount === 1 ? 'param' : 'params'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* Window status — WATI only */}
      {provider === 'wati' && windowStatus && (
        <div className={`flex items-center gap-1.5 px-3 py-1 text-xs border-b ${
          !windowStatus.isOpen
            ? 'bg-destructive/10 border-destructive/30 text-destructive'
            : windowStatus.minutesRemaining < 60
              ? 'bg-amber-50 border-amber-200 text-amber-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
        }`}>
          {!windowStatus.isOpen
            ? 'Window closed — use a template'
            : windowStatus.minutesRemaining < 60
              ? `Window closes in ${windowStatus.minutesRemaining}m`
              : `Window open · ${Math.floor(windowStatus.minutesRemaining / 60)}h ${windowStatus.minutesRemaining % 60}m left`}
        </div>
      )}

      {/* Recording indicator */}
      {recording && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 border-b border-destructive/30">
          <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
          <span className="text-xs text-destructive font-medium flex-1">
            Recording… {Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, '0')}
          </span>
          <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-destructive" onClick={cancelRecording}>
            Cancel
          </Button>
          <Button size="sm" variant="default" className="h-6 text-xs px-2" onClick={stopRecording}>
            <Square className="h-3 w-3 mr-1" /> Stop
          </Button>
        </div>
      )}

      {/* Textarea + action row */}
      {!recording && (
        <div className="flex flex-col gap-1 p-2">
          <Textarea
            ref={ref}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            disabled={disabled}
            placeholder={disabled ? 'Window closed — use a template above' : 'Type a message… (Enter to send)'}
            className="min-h-[60px] max-h-[35vh] resize-none text-xs w-full"
          />

          <div className="flex items-center gap-0.5">
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={disabled} onClick={onAttachment} title="Attach file">
              <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={disabled} onClick={onInstructions} title="Agent instructions">
              <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={disabled} onClick={startRecording} title="Voice note">
              <Mic className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
            <div className="flex-1" />
            <Button className="h-7 px-3 gap-1 text-xs" disabled={disabled || !text.trim()} onClick={handleSend}>
              <Send className="h-3 w-3" /> Send
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
