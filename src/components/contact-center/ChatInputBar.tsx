'use client'

import { useState, useRef, useCallback } from 'react'
import { Send, Smile, Paperclip, BookOpen, X, Loader2, Check, FileText, Image as ImageIcon, Video, Music, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { WindowStatus, WatiTemplate } from '@/types/contact-center'
import type { useChatMessages } from '@/hooks/contact-center/useChatMessages'

type ChatMessagesReturn = ReturnType<typeof useChatMessages>

// ── Emoji groups ──────────────────────────────────────────────────────────────
const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: 'Smileys', emojis: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓'] },
  { label: 'Gestures', emojis: ['👍','👎','👏','🙌','👐','🤲','🤝','🙏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🤏','💪','🦾'] },
  { label: 'Hearts', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝'] },
  { label: 'Objects', emojis: ['📱','💻','🖥️','📷','📸','📹','🎥','📞','☎️','📺','📻','💡','🔦','💵','💳','💎','🔧','🔨','🛠️','🔩','🔪','⚔️'] },
  { label: 'Nature', emojis: ['🌸','🌺','🌻','🌹','🌷','🌱','🌲','🌳','🌴','🌵','🍀','🍁','🍂','🍃','🍄','🌙','⭐','🌟','💫','✨','⚡','🌈','☁️','🌊'] },
]

// ── Attachment categories ─────────────────────────────────────────────────────
const ATTACH_TABS = [
  { key: 'image',    label: 'Images',    icon: <ImageIcon className="h-4 w-4" />,  accept: 'image/jpeg,image/png,image/webp,image/gif' },
  { key: 'video',    label: 'Videos',    icon: <Video className="h-4 w-4" />,      accept: 'video/mp4,video/3gpp,video/quicktime' },
  { key: 'document', label: 'Documents', icon: <FileText className="h-4 w-4" />,   accept: 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { key: 'audio',    label: 'Audios',    icon: <Music className="h-4 w-4" />,      accept: 'audio/ogg,audio/mpeg,audio/mp4,audio/aac' },
] as const

interface Props {
  conversationId: string
  phone: string
  customerName: string
  windowStatus: WindowStatus
  chatMessages: ChatMessagesReturn
  onAfterSend?: () => void
}

// ── Template confirm dialog ───────────────────────────────────────────────────
function TemplateConfirmDialog({
  template, sending, onSend, onClose,
}: {
  template: WatiTemplate
  sending: boolean
  onSend: (vars: string[], headerUrl: string) => void
  onClose: () => void
}) {
  const [vars, setVars]         = useState<string[]>(Array.from({ length: template.variableCount }, () => ''))
  const [headerUrl, setHeaderUrl] = useState('')

  function preview() {
    return template.paramNames.reduce(
      (t, name, i) => t.replace(`{{${name}}}`, vars[i] ? `*${vars[i]}*` : `{{${name}}}`),
      template.bodyOriginal || template.elementName,
    )
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">{template.elementName}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="space-y-4 pr-1">
            <div className="rounded-lg bg-muted/60 border border-border px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap">
              {preview() || <span className="text-muted-foreground italic">No body text</span>}
            </div>
            {template.headerMedia && (
              <div className="space-y-1">
                <Label className="text-xs font-medium">
                  {template.headerMedia === 'document' ? 'Document URL' : template.headerMedia === 'image' ? 'Image URL' : 'Video URL'}
                </Label>
                <Input value={headerUrl} onChange={(e) => setHeaderUrl(e.target.value)} className="h-8 text-xs" placeholder="https://…" />
              </div>
            )}
            {template.variableCount > 0 && (
              <div className="space-y-3">
                {template.paramNames.map((name, i) => (
                  <div key={name} className="space-y-1">
                    <Label className="text-xs font-medium">{`{{${name}}}`}</Label>
                    <Input value={vars[i] ?? ''} onChange={(e) => setVars((p) => p.map((v, pi) => pi === i ? e.target.value : v))} className="h-8 text-xs" placeholder={`Enter ${name}`} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
        <DialogFooter className="gap-1.5 pt-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onSend(vars, headerUrl)} disabled={sending}>
            <Check className="h-3.5 w-3.5 mr-1" /> Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Attachment dialog ─────────────────────────────────────────────────────────
function AttachmentDialog({
  open, sending, onSend, onClose,
}: {
  open: boolean
  sending: boolean
  onSend: (file: File, caption: string) => void
  onClose: () => void
}) {
  const [tab, setTab]       = useState<typeof ATTACH_TABS[number]['key']>('image')
  const [file, setFile]     = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef            = useRef<HTMLInputElement>(null)

  const activeTab = ATTACH_TABS.find((t) => t.key === tab)!

  function handleFile(f: File) { setFile(f); setCaption('') }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  function reset() { setFile(null); setCaption('') }

  function handleClose() { reset(); onClose() }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="w-[95vw] max-w-xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-base">Send Attachment</DialogTitle>
        </DialogHeader>

        {/* Category tabs */}
        <div className="flex border-b border-border bg-muted/30">
          {ATTACH_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); reset() }}
              className={`flex-1 flex flex-col items-center gap-1.5 py-3.5 text-xs font-medium transition-colors border-r last:border-r-0 border-border ${
                tab === t.key
                  ? 'bg-background text-primary border-b-2 border-b-primary'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {!file ? (
            /* Drop zone */
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-xl py-14 cursor-pointer transition-colors ${
                dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/20'
              }`}
            >
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold">Drag & Drop Files Here</p>
                <p className="text-xs text-muted-foreground">
                  Supported: {activeTab.label.toLowerCase()}
                </p>
              </div>
              <Button variant="outline" size="sm" className="px-6" type="button">Browse Files</Button>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                accept={activeTab.accept}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
            </div>
          ) : (
            /* File preview */
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4">
                <div className="h-12 w-12 flex items-center justify-center rounded-lg bg-muted flex-shrink-0">
                  {activeTab.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button onClick={reset} className="p-1.5 rounded-md hover:bg-muted">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* Image preview */}
              {tab === 'image' && (
                <img
                  src={URL.createObjectURL(file)}
                  alt="preview"
                  className="w-full max-h-52 object-contain rounded-xl border border-border bg-muted/20"
                />
              )}

              <div className="space-y-1.5">
                <Label className="text-sm">Caption (optional)</Label>
                <Input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="h-9"
                  placeholder="Add a caption…"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-5 pb-5 gap-2">
          <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          <Button
            disabled={!file || sending}
            onClick={() => { if (file) onSend(file, caption) }}
          >
            {sending
              ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Sending…</>
              : <><Send className="h-4 w-4 mr-1.5" />Send</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Service instructions dialog ───────────────────────────────────────────────
function InstructionsDialog({
  open, sending, onSend, onClose,
}: {
  open: boolean
  sending: boolean
  onSend: (text: string) => void
  onClose: () => void
}) {
  const supabase = createClient()
  const [search, setSearch] = useState('')

  const { data: instructions = [], isLoading } = useQuery({
    queryKey: ['instructions-for-chat'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('instructions')
        .select('id, name_en, type, content_type, content_preview, full_content, status')
        .eq('status', 'active')
        .order('name_en')
      if (error) console.error('[instructions-for-chat]', error)
      return (data ?? []) as {
        id: string; name_en: string; type: string; content_type: string
        content_preview: string | null; full_content: string | null; status: string
      }[]
    },
    enabled: open,
  })

  const filtered = instructions.filter((i) =>
    i.name_en.toLowerCase().includes(search.toLowerCase()),
  )

  const TYPE_COLOR: Record<string, string> = {
    'pre-service':  'bg-blue-100 text-blue-700',
    'post-service': 'bg-purple-100 text-purple-700',
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-[95vw] max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Service Instructions
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 pt-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search instructions…"
            className="h-9"
            autoFocus
          />
        </div>

        <ScrollArea className="h-80 px-3 py-3">
          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
              <BookOpen className="h-6 w-6 opacity-30" />
              <p className="text-sm">No instructions found</p>
              <p className="text-xs opacity-70">Add instructions in Services → Instructions</p>
            </div>
          )}
          <div className="space-y-1.5">
            {filtered.map((instr) => {
              const text = instr.full_content || instr.content_preview || instr.name_en
              const isText = instr.content_type === 'text'
              return (
                <button
                  key={instr.id}
                  disabled={sending || !isText}
                  onClick={() => { onSend(text); onClose() }}
                  className="w-full text-left rounded-lg px-4 py-3 hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-border"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{instr.name_en}</span>
                    <Badge className={`text-[10px] py-0 px-1.5 h-4 border-0 ${TYPE_COLOR[instr.type] ?? 'bg-muted text-muted-foreground'}`}>
                      {instr.type === 'pre-service' ? 'Pre-service' : 'Post-service'}
                    </Badge>
                    {!isText && (
                      <span className="text-[10px] text-muted-foreground italic">({instr.content_type})</span>
                    )}
                  </div>
                  {instr.content_preview && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{instr.content_preview}</p>
                  )}
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

// ── Main ChatInputBar ─────────────────────────────────────────────────────────
export function ChatInputBar({ conversationId, phone, customerName, windowStatus, chatMessages, onAfterSend }: Props) {
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { isOpen, minutesRemaining } = windowStatus

  // Load templates once when the bar mounts
  const handleLoadTemplates = useCallback(() => {
    if (templates.length === 0) loadTemplates()
    setTemplatesExpanded((v) => !v)
  }, [templates.length, loadTemplates])

  async function handleSend() {
    if (!inputText.trim() || sending) return
    try {
      await sendSessionMessage({ conversationId, phone, text: inputText })
      onAfterSend?.()
    } catch {
      toast.error('Failed to send message')
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
      const parameters = confirmTemplate.headerMedia && headerUrl
        ? [{ name: 'url', value: headerUrl }, ...bodyParams]
        : bodyParams
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

      {/* ── Templates quick-bar ──────────────────────────────────────────── */}
      <div className="border-b border-border">
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
          <div className="overflow-x-auto scrollbar-none px-2 pb-1.5 flex gap-1.5 flex-wrap max-h-24 overflow-y-auto">
            {templates.length === 0 && !templatesLoading && (
              <span className="text-xs text-muted-foreground px-1">No templates</span>
            )}
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => { setConfirmTemplate(t); setTemplatesExpanded(false) }}
                className="shrink-0 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-[11px] hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-colors"
              >
                {t.elementName}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Window banner ────────────────────────────────────────────────── */}
      <div className={`flex items-center gap-1.5 px-3 py-1 text-xs border-b ${windowBannerClass}`}>
        {!isOpen
          ? 'Window closed — use a template'
          : minutesRemaining < 60
          ? `Window closes in ${minutesRemaining}m`
          : `Window open · ${Math.floor(minutesRemaining / 60)}h ${minutesRemaining % 60}m left`}
      </div>

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
        {/* Textarea row */}
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
        <div className="flex items-center gap-1">
          {/* Secondary actions: emoji, attach, instructions */}
          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!isOpen} onClick={() => setShowEmoji((s) => !s)}>
            <Smile className={`h-4 w-4 ${showEmoji ? 'text-primary' : 'text-muted-foreground'}`} />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!isOpen} onClick={() => setShowAttach(true)} title="Send attachment">
            <Paperclip className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={!isOpen} onClick={() => setShowInstructions(true)} title="Send service instruction">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </Button>

          {/* Push send to right */}
          <div className="flex-1" />

          {/* Send */}
          <Button className="h-8 px-3 gap-1.5 text-xs" disabled={!isOpen || !inputText.trim() || sending} onClick={handleSend}>
            {sending
              ? <div className="h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><Send className="h-3.5 w-3.5" /> Send</>}
          </Button>
        </div>
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}
      <AttachmentDialog
        open={showAttach}
        sending={sending}
        onSend={handleSendFile}
        onClose={() => setShowAttach(false)}
      />

      <InstructionsDialog
        open={showInstructions}
        sending={sending}
        onSend={handleSendInstruction}
        onClose={() => setShowInstructions(false)}
      />

      {confirmTemplate && (
        <TemplateConfirmDialog
          template={confirmTemplate}
          sending={sending}
          onSend={handleSendTemplate}
          onClose={() => setConfirmTemplate(null)}
        />
      )}
    </div>
  )
}
