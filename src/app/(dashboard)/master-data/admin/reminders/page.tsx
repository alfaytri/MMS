'use client'

import { useState } from 'react'
import { Bell, Plus, Pencil, Trash2, Loader2, ShieldAlert } from 'lucide-react'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  useReminderTemplates, useSaveReminderTemplate, useDeleteReminderTemplate,
  useReminderConfig, useSaveReminderConfig,
  useServicesForReminder, useSetServicesReminder,
} from '@/hooks/useReminderTemplates'
import { useWatiTemplates } from '@/hooks/useWatiTemplates'

type Draft = { id?: string; name: string; wati_template_name: string | null; interval_months: number; active: boolean }
const BLANK: Draft = { name: '', wati_template_name: null, interval_months: 12, active: true }

export default function RemindersAdminPage() {
  const { data: templates = [], isLoading } = useReminderTemplates()
  const { data: watiTemplates = [] } = useWatiTemplates()
  const save = useSaveReminderTemplate()
  const del = useDeleteReminderTemplate()
  const { data: config } = useReminderConfig()
  const saveConfig = useSaveReminderConfig()
  const { data: services = [] } = useServicesForReminder()
  const setServices = useSetServicesReminder()

  const [draft, setDraft] = useState<Draft | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  function openDraft(t?: Draft & { id?: string }) {
    setDraft(t ?? { ...BLANK })
    setPicked(new Set(t?.id ? services.filter((s) => s.reminder_template_id === t.id).map((s) => s.id) : []))
  }
  function toggleService(id: string) {
    setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  const [testNumber, setTestNumber] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(true)
  const cfg = config ?? { enabled: true, test_number: null }
  const tn = testNumber ?? cfg.test_number ?? ''
  const en = testNumber === null ? cfg.enabled : enabled

  async function handleSaveTemplate() {
    if (!draft) return
    if (!draft.name.trim()) { toast.error('Name is required'); return }
    try {
      const templateId = await save.mutateAsync({ ...draft, name: draft.name.trim(), param_names: ['customer_name', 'service_name'] })
      if (templateId) {
        const currentlyThis = services.filter((s) => s.reminder_template_id === templateId).map((s) => s.id)
        const toAssign = [...picked].filter((id) => !currentlyThis.includes(id))
        const toClear = currentlyThis.filter((id) => !picked.has(id))
        if (toAssign.length) await setServices.mutateAsync({ serviceIds: toAssign, templateId })
        if (toClear.length) await setServices.mutateAsync({ serviceIds: toClear, templateId: null })
      }
      toast.success('Reminder template saved')
      setDraft(null)
    } catch (e) { toast.error((e as Error).message || 'Failed to save') }
  }

  async function handleSaveConfig() {
    try {
      await saveConfig.mutateAsync({ enabled: en, test_number: tn.trim() || null })
      toast.success('Reminder settings saved')
      setTestNumber(null)
    } catch (e) { toast.error((e as Error).message || 'Failed to save') }
  }

  return (
    <PageWrapper>
      <div>
        <h1 className="text-2xl 2xl:text-3xl font-bold">Service Reminders</h1>
        <p className="text-sm text-muted-foreground mt-1">
          WhatsApp reminders that go out when a customer&apos;s last service + the template&apos;s interval
          (in months) has passed. Assign a template to a service in Master Data → Services.
        </p>
      </div>

      {/* Config — the DEV test-number lock */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-semibold">Sending</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="space-y-1">
            <span className="text-xs font-medium">Test number (lock)</span>
            <Input
              value={tn}
              onChange={(e) => setTestNumber(e.target.value)}
              placeholder="e.g. 97472195504"
            />
            <span className="block text-xs text-muted-foreground">
              While set, EVERY reminder is sent here instead of the real customer — nothing reaches a real
              customer. Clear it only in a real environment to go live.
            </span>
          </label>
          <div className="flex items-center gap-2 pb-1">
            <Switch checked={en} onCheckedChange={(v) => { setEnabled(v); if (testNumber === null) setTestNumber(cfg.test_number ?? '') }} />
            <span className="text-sm">Reminders enabled</span>
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSaveConfig} disabled={saveConfig.isPending}>
            {saveConfig.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Save settings
          </Button>
        </div>
      </Card>

      {/* Templates */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Reminder templates</h3>
        <Button size="sm" className="gap-1.5" onClick={() => openDraft()}>
          <Plus className="h-4 w-4" /> Add template
        </Button>
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : templates.length === 0 ? (
        <div className="py-12 text-center">
          <Bell className="mx-auto h-9 w-9 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No reminder templates yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {templates.map((t) => (
            <Card key={t.id} className="p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold truncate">{t.name}</p>
                  {!t.active && <Badge variant="outline" className="text-xs">inactive</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Every <span className="font-medium">{t.interval_months}</span> month{t.interval_months === 1 ? '' : 's'}
                  {' · '}
                  {t.wati_template_name ? <span className="font-mono">{t.wati_template_name}</span> : <span className="text-amber-600">no WhatsApp template</span>}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openDraft({ id: t.id, name: t.name, wati_template_name: t.wati_template_name, interval_months: t.interval_months, active: t.active })}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                  onClick={async () => { if (confirm(`Delete "${t.name}"?`)) { try { await del.mutateAsync(t.id); toast.success('Deleted') } catch (e) { toast.error((e as Error).message) } } }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(v) => { if (!v) setDraft(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{draft?.id ? 'Edit' : 'New'} reminder template</DialogTitle></DialogHeader>
          {draft && (
            <div className="space-y-3 py-1">
              <label className="space-y-1 block">
                <span className="text-xs font-medium">Name</span>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Annual AC Reminder" />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">Interval (months)</span>
                <Input type="number" min={1} value={draft.interval_months}
                  onChange={(e) => setDraft({ ...draft, interval_months: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">WhatsApp template</span>
                <Select value={draft.wati_template_name ?? ''} onValueChange={(v) => setDraft({ ...draft, wati_template_name: v || null })}>
                  <SelectTrigger><SelectValue placeholder="Choose a WATI template" /></SelectTrigger>
                  <SelectContent>
                    {watiTemplates.map((w) => (
                      <SelectItem key={w.elementName} value={w.elementName}>{w.elementName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <div className="flex items-center gap-2">
                <Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} />
                <span className="text-sm">Active</span>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium">Services using this template</span>
                <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1">
                  {services.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No active services</p>
                  ) : services.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={picked.has(s.id)} onCheckedChange={() => toggleService(s.id)} />
                      <span className="truncate">{s.name_en}</span>
                      {s.reminder_template_id && draft.id && s.reminder_template_id !== draft.id && !picked.has(s.id) && (
                        <span className="text-xs text-amber-600">(other template)</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={handleSaveTemplate} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  )
}
