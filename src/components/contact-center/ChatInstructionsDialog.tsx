'use client'

import { useState } from 'react'
import { BookOpen, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

interface ChatInstructionsDialogProps {
  open: boolean
  sending: boolean
  onSend: (text: string) => void
  onClose: () => void
}

export function ChatInstructionsDialog({
  open, sending, onSend, onClose,
}: ChatInstructionsDialogProps) {
  const supabase = createClient()
  const [search, setSearch] = useState('')

  const { data: instructions = [], isLoading } = useQuery({
    queryKey: queryKeys.contactCenter.instructionsForChat,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
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
