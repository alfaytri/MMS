'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { WatiTemplate } from '@/types/contact-center'

interface ChatTemplateConfirmDialogProps {
  template: WatiTemplate
  sending: boolean
  onSend: (vars: string[], headerUrl: string) => void
  onClose: () => void
}

export function ChatTemplateConfirmDialog({
  template, sending, onSend, onClose,
}: ChatTemplateConfirmDialogProps) {
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
