// src/components/team-leader/dialogs/NormalOrderDialog.tsx
'use client'

import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { X, Users, Info, AlertTriangle, Plus, Check } from 'lucide-react'
import { toast } from 'sonner'
import { ServiceStatusList } from '../shared/ServiceStatusList'
import { PhotoCapture } from '../shared/PhotoCapture'
import { DamageReportDialog } from '../shared/DamageReportDialog'
import { TeamNotesSection } from '../shared/TeamNotesSection'
import { ServiceCatalogPicker } from '../shared/ServiceCatalogPicker'
import { useCreateFollowUpRequest } from '@/hooks/useCreateFollowUpRequest'
import type {
  TlVisit, TlService, OrderCompletionData,
  DamageReportEntry, AddedBillableService,
} from '@/types/team-leader'

const SLOT_OPTIONS: string[] = (() => {
  const out: string[] = []
  for (let h = 7; h <= 21; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`)
    if (h !== 21) out.push(`${String(h).padStart(2, '0')}:30`)
  }
  return out
})()

function formatSlotLabel(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':')
  const h = parseInt(hStr, 10)
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${mStr} ${period}`
}

interface Props {
  visit: TlVisit
  profileId: string
  onComplete: (visitId: string, data: OrderCompletionData) => void
  onClose: () => void
}

export function NormalOrderDialog({ visit, profileId: _profileId, onComplete, onClose }: Props) {
  const [statuses, setStatuses] = useState<Record<string, 'done' | 'skipped' | 'issue'>>({})
  const [photos, setPhotos] = useState<Blob[]>([])
  const [damageOpen, setDamageOpen] = useState(false)
  const [damages, setDamages] = useState<DamageReportEntry[]>([])
  const [teamNotes, setTeamNotes] = useState('')
  const [teamPhotos, setTeamPhotos] = useState<Blob[]>([])
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [followUpSubmitted, setFollowUpSubmitted] = useState<string | null>(null) // request_number once created
  const [followUpServices, setFollowUpServices] = useState<Set<string>>(new Set())
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpFrom, setFollowUpFrom] = useState('')
  const [followUpTo, setFollowUpTo]     = useState('')
  const [followUpNote, setFollowUpNote] = useState('')
  const [followUpConflict, setFollowUpConflict] = useState<string | null>(null)
  const followUpMut = useCreateFollowUpRequest()
  const [addedServices, setAddedServices] = useState<AddedBillableService[]>([])

  function toggleFollowUpService(id: string) {
    setFollowUpServices((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submitFollowUp() {
    setFollowUpConflict(null)
    if (followUpServices.size === 0) { toast.error('Pick at least one service'); return }
    if (!followUpDate) { toast.error('Pick a date'); return }
    if (!followUpFrom || !followUpTo) { toast.error('Pick From and To time'); return }
    if (followUpTo <= followUpFrom) { toast.error('To time must be after From time'); return }

    try {
      const res = await followUpMut.mutateAsync({
        parent_order_id: visit.source_id,
        services_to_followup: visit.services
          .filter((s) => followUpServices.has(s.id))
          .map((s) => ({ order_service_id: s.id, name: s.name })),
        requested_date: followUpDate,
        requested_time_from: followUpFrom,
        requested_time_to:   followUpTo,
        time_note: null,
        notes: followUpNote.trim() || null,
      })
      if (res.ok) {
        setFollowUpSubmitted(res.request_number)
        setFollowUpOpen(false)
        toast.success(`Follow-up requested: ${res.request_number}`)
        return
      }
      setFollowUpConflict('Team time occupied — please pick another time.')
    } catch (err) {
      toast.error((err as Error).message || 'Failed to submit follow-up')
    }
  }

  const allServices: TlService[] = [
    ...visit.services,
    ...addedServices.map((s) => ({ id: s.id, name: s.name, unit_price: s.unitPrice, qty: s.qty })),
  ]

  const otherTeams = (visit.team_ids ?? []).filter((t) => t !== visit.team_id)
  const isLastTeam = otherTeams.length === 0

  const headerTitle = visit.order_id
    ? `${visit.order_id} — Normal Order`
    : 'Normal Order'

  function handleSubmit() {
    const data: OrderCompletionData = {
      orderId: visit.source_id,
      visitId: visit.id,
      visitType: visit.type,
      serviceStatuses: statuses,
      inventoryUsage: {},
      photos,
      damageReport: { noted: damages.length > 0, description: damages.map((d) => d.description).join('\n') },
      addedServices: addedServices.length > 0 ? addedServices : undefined,
    }
    onComplete(visit.id, data)
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
        <DialogContent className="w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-xl flex flex-col p-0 gap-0">
          <div className="px-5 py-3 bg-primary text-primary-foreground shrink-0">
            <p className="text-base font-bold">{headerTitle}</p>
            <p className="text-[11px] opacity-90">
              {visit.scheduled_time ?? ''} · {visit.customer_name}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* Requested Services */}
              <div className="rounded-lg border p-4 space-y-3">
                <p className="text-sm font-semibold">Requested Services</p>

                <ServiceStatusList
                  services={allServices}
                  statuses={statuses}
                  onChange={(id, s) => setStatuses((p) => ({ ...p, [id]: s }))}
                />

                {addedServices.length > 0 && (
                  <div className="space-y-1 pt-2 border-t">
                    <p className="text-xs font-medium text-muted-foreground">Added Services</p>
                    {addedServices.map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-xs py-1">
                        <span>{s.name} × {s.qty}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">QAR {s.unitPrice * s.qty}</span>
                          <button type="button" onClick={() => setAddedServices((p) => p.filter((x) => x.id !== s.id))}>
                            <X className="h-3 w-3 text-destructive" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-2 border-t space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Add Service</p>
                  <ServiceCatalogPicker onAdd={(s) => setAddedServices((p) => [...p, s])} />
                </div>
              </div>

              {/* Team Notes */}
              <TeamNotesSection
                visitId={visit.id}
                notes={teamNotes}
                onNotesChange={setTeamNotes}
                photos={teamPhotos}
                onPhotosChange={setTeamPhotos}
              />

              {/* Pre-existing Damage */}
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Pre-existing Damage</p>
                  <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => setDamageOpen(true)}>
                    <AlertTriangle className="h-3 w-3" /> Report Damage
                  </Button>
                </div>
                {damages.map((d) => (
                  <div key={d.id} className="flex items-start justify-between text-xs rounded border p-2 bg-background">
                    <div>
                      <p>{d.description}</p>
                      {d.customerNotified && <Badge variant="outline" className="text-[10px] mt-1">Notified</Badge>}
                    </div>
                    <button type="button" onClick={() => setDamages((p) => p.filter((x) => x.id !== d.id))}>
                      <X className="h-3 w-3 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Agent Notes (read-only) */}
              {visit.followup_context?.agent_note && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Agent Notes</p>
                  <p className="text-sm">{visit.followup_context.agent_note}</p>
                </div>
              )}

              {/* Follow-up Required? */}
              <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 space-y-3">
                <p className="text-sm font-semibold">Follow-up Required?</p>

                {followUpSubmitted ? (
                  <div className="flex items-center gap-2 rounded-md border border-green-300 bg-green-50 p-2 text-xs text-green-900">
                    <Check className="h-4 w-4" />
                    Follow-up requested: <span className="font-mono font-semibold">{followUpSubmitted}</span>
                  </div>
                ) : !followUpOpen ? (
                  <Button variant="outline" size="sm" className="h-9 gap-1 text-xs" onClick={() => setFollowUpOpen(true)}>
                    <Plus className="h-3 w-3" /> Add Follow-up
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Services needing follow-up</Label>
                      {visit.services.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 rounded border bg-white p-2 min-h-11 cursor-pointer">
                          <Checkbox
                            checked={followUpServices.has(s.id)}
                            onCheckedChange={() => toggleFollowUpService(s.id)}
                          />
                          <span className="text-sm">{s.name}</span>
                        </label>
                      ))}
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="fu-date" className="text-xs font-semibold">Date</Label>
                      <Input
                        id="fu-date"
                        type="date"
                        value={followUpDate}
                        onChange={(e) => { setFollowUpDate(e.target.value); setFollowUpConflict(null) }}
                        className="h-11 bg-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">From</Label>
                        <Select
                          value={followUpFrom}
                          onValueChange={(v) => {
                            if (!v) return
                            setFollowUpFrom(v)
                            if (followUpTo && followUpTo <= v) setFollowUpTo('')
                            setFollowUpConflict(null)
                          }}
                        >
                          <SelectTrigger className="h-11 bg-white"><SelectValue placeholder="Start" /></SelectTrigger>
                          <SelectContent className="max-h-64">
                            {SLOT_OPTIONS.map((s) => (
                              <SelectItem key={s} value={s}>{formatSlotLabel(s)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">To</Label>
                        <Select
                          value={followUpTo}
                          onValueChange={(v) => { if (!v) return; setFollowUpTo(v); setFollowUpConflict(null) }}
                          disabled={!followUpFrom}
                        >
                          <SelectTrigger className="h-11 bg-white">
                            <SelectValue placeholder={followUpFrom ? 'End' : 'Pick From'} />
                          </SelectTrigger>
                          <SelectContent className="max-h-64">
                            {SLOT_OPTIONS.filter((s) => s > followUpFrom).map((s) => (
                              <SelectItem key={s} value={s}>{formatSlotLabel(s)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {followUpConflict && (
                      <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900">
                        {followUpConflict}
                      </div>
                    )}

                    <Textarea
                      placeholder="Notes for the office (optional)"
                      value={followUpNote}
                      onChange={(e) => setFollowUpNote(e.target.value)}
                      rows={2}
                      className="bg-white"
                    />

                    <div className="flex gap-2">
                      <Button
                        variant="outline" size="sm"
                        onClick={() => { setFollowUpOpen(false); setFollowUpConflict(null) }}
                      >
                        Cancel
                      </Button>
                      <Button size="sm" onClick={submitFollowUp} disabled={followUpMut.isPending}>
                        {followUpMut.isPending ? 'Submitting…' : 'Submit Follow-up'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Multi-Team info */}
              {otherTeams.length > 0 && (
                <div className="rounded-lg border bg-muted/50 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Users className="h-3.5 w-3.5" /> Other Teams on This Job
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {otherTeams.map((t) => (
                      <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Photos */}
              <PhotoCapture visitId={visit.id} photos={photos} onChange={setPhotos} />
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t shrink-0 space-y-2">
            {!isLastTeam && (
              <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Another team will complete invoicing for this order.</span>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 min-h-11" onClick={onClose}>Cancel</Button>
              <Button
                className={cn(
                  'flex-1 min-h-11',
                  isLastTeam ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
                )}
                onClick={handleSubmit}
              >
                {isLastTeam ? 'Complete & Invoice' : 'Mark Complete — Other Team Will Invoice'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DamageReportDialog
        open={damageOpen}
        visitId={visit.id}
        onSubmit={(d) => setDamages((p) => [...p, d])}
        onClose={() => setDamageOpen(false)}
      />

    </>
  )
}
