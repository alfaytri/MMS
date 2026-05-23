// src/components/team-leader/CustomerUnavailableDialog.tsx
'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { PhotoCapture } from './shared/PhotoCapture'
import { toast } from 'sonner'

interface Props {
  open: boolean
  visitId: string
  teamId: string
  onClose: () => void
}

export function CustomerUnavailableDialog({ open, visitId, teamId, onClose }: Props) {
  const [step,              setStep]            = useState<1 | 2>(1)
  const [buildingPhotos,    setBuildingPhotos]  = useState<Blob[]>([])
  const [callPhotos,        setCallPhotos]      = useState<Blob[]>([])
  const [notes,             setNotes]           = useState('')
  const [submitting,        setSubmitting]      = useState(false)

  async function handleSubmit() {
    if (buildingPhotos.length === 0 || callPhotos.length === 0) {
      toast.error('Both photos are required')
      return
    }
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('visit_id', visitId)
      formData.append('team_id', teamId)
      formData.append('notes', notes)
      buildingPhotos.forEach((b, i) => formData.append(`building_${i}`, b, `building_${i}.jpg`))
      callPhotos.forEach((b, i) => formData.append(`call_${i}`, b, `call_${i}.jpg`))

      const res = await fetch('/api/contact-center/escalate', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Escalation failed')

      toast.success('Escalated to call centre')
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-lg h-full sm:h-auto sm:max-h-[85vh] rounded-none sm:rounded-xl flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
          <DialogTitle>Customer Not Answering</DialogTitle>
          <p className="text-xs text-muted-foreground">Step {step} of 2</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {step === 1 && (
            <>
              <p className="text-sm text-muted-foreground">
                Take a photo of the building or location to confirm your arrival.
              </p>
              <PhotoCapture
                visitId={`${visitId}-building`}
                label="Building / Location Photo"
                photos={buildingPhotos}
                onChange={setBuildingPhotos}
                maxPhotos={3}
              />
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-sm text-muted-foreground">
                Upload a screenshot of your call log to confirm the attempt.
              </p>
              <PhotoCapture
                visitId={`${visitId}-call`}
                label="Call Log Screenshot"
                photos={callPhotos}
                onChange={setCallPhotos}
                maxPhotos={2}
              />
              <div className="space-y-1.5">
                <Label>Notes (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional context…"
                  rows={3}
                />
              </div>
            </>
          )}
        </div>

        <div className="px-4 pb-4 pt-2 border-t shrink-0 flex gap-2">
          {step === 1 && (
            <Button
              className="flex-1 min-h-11"
              onClick={() => setStep(2)}
              disabled={buildingPhotos.length === 0}
            >
              Next →
            </Button>
          )}
          {step === 2 && (
            <>
              <Button variant="outline" className="min-h-11" onClick={() => setStep(1)}>← Back</Button>
              <Button
                className="flex-1 min-h-11"
                onClick={handleSubmit}
                disabled={callPhotos.length === 0 || submitting}
              >
                {submitting ? 'Escalating…' : 'Submit Escalation'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
