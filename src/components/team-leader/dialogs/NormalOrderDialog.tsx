// src/components/team-leader/dialogs/NormalOrderDialog.tsx
'use client'

import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { X, Users, Info, AlertTriangle, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { ServiceStatusList } from '../shared/ServiceStatusList'
import { PhotoCapture } from '../shared/PhotoCapture'
import { DamageReportDialog } from '../shared/DamageReportDialog'
import { TeamNotesSection } from '../shared/TeamNotesSection'
import { ServiceCatalogPicker } from '../shared/ServiceCatalogPicker'
import type {
  TlVisit, TlService, OrderCompletionData,
  DamageReportEntry, AddedBillableService,
} from '@/types/team-leader'

interface Props {
  visit: TlVisit
  profileId: string
  onComplete: (visitId: string, data: OrderCompletionData) => void
  onClose: () => void
}

export function NormalOrderDialog({ visit, profileId, onComplete, onClose }: Props) {
  const [statuses, setStatuses] = useState<Record<string, 'done' | 'skipped' | 'issue'>>({})
  const [photos, setPhotos] = useState<Blob[]>([])
  const [damageOpen, setDamageOpen] = useState(false)
  const [damages, setDamages] = useState<DamageReportEntry[]>([])
  const [teamNotes, setTeamNotes] = useState('')
  const [teamPhotos, setTeamPhotos] = useState<Blob[]>([])
  const [followUpOpen, setFollowUpOpen] = useState(false)
  const [followUpNote, setFollowUpNote] = useState('')
  const [addedServices, setAddedServices] = useState<AddedBillableService[]>([])

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
              <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 space-y-3">
                <p className="text-sm font-semibold">Follow-up Required?</p>
                {!followUpOpen ? (
                  <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => setFollowUpOpen(true)}>
                    <Plus className="h-3 w-3" /> Add Follow-up
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Describe what follow-up is needed..."
                      value={followUpNote}
                      onChange={(e) => setFollowUpNote(e.target.value)}
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setFollowUpOpen(false); setFollowUpNote('') }}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={() => toast.success('Follow-up queued')} disabled={!followUpNote.trim()}>
                        Confirm Follow-up
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
