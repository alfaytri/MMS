// src/components/orders/OrderEditDialog.tsx
'use client'
import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { useOrderActions } from '@/hooks/useOrderActions'
import type { OrderDetail } from '@/types/orders'

const COUNTRY_CODES = [
  { code: '+974', label: 'QA +974' },
  { code: '+971', label: 'AE +971' },
  { code: '+966', label: 'SA +966' },
  { code: '+965', label: 'KW +965' },
  { code: '+973', label: 'BH +973' },
  { code: '+968', label: 'OM +968' },
  { code: '+20',  label: 'EG +20'  },
  { code: '+91',  label: 'IN +91'  },
  { code: '+92',  label: 'PK +92'  },
  { code: '+880', label: 'BD +880' },
  { code: '+63',  label: 'PH +63'  },
  { code: '+94',  label: 'LK +94'  },
]

const HOURS = Array.from({ length: 15 }, (_, i) => {
  const h = i + 7 // 07:00 → 21:00
  return `${String(h).padStart(2, '0')}:00`
})

interface AssignmentEdit {
  id: string
  teamName: string
  scheduledDate: string
  timeSlot: string
  duration: string
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  order: OrderDetail
}

export function OrderEditDialog({ open, onOpenChange, order }: Props) {
  const { updateOrder } = useOrderActions(order.id)

  const [scheduledDate, setScheduledDate] = useState(order.scheduled_date ?? '')
  const [notes, setNotes] = useState(order.notes ?? '')
  const [arrivalCountryCode, setArrivalCountryCode] = useState('+974')
  const [arrivalLocal, setArrivalLocal] = useState('')
  const [assignments, setAssignments] = useState<AssignmentEdit[]>([])

  // Initialise from order when it changes / dialog opens
  useEffect(() => {
    if (!open) return
    setScheduledDate(order.scheduled_date ?? '')
    setNotes(order.notes ?? '')

    // Parse arrival phone into country code + local
    const ap = order.arrival_phone ?? ''
    const matched = COUNTRY_CODES.find((c) => ap.startsWith(c.code))
    if (matched) {
      setArrivalCountryCode(matched.code)
      setArrivalLocal(ap.slice(matched.code.length))
    } else {
      setArrivalCountryCode('+974')
      setArrivalLocal(ap.replace(/^\+974/, ''))
    }

    setAssignments(
      order.order_team_assignments.map((a) => ({
        id: a.id,
        teamName: a.team_name,
        scheduledDate: a.scheduled_date,
        timeSlot: a.time_slot,
        duration: String(a.duration),
      }))
    )
  }, [open, order])

  function updateAssignment(id: string, patch: Partial<Omit<AssignmentEdit, 'id' | 'teamName'>>) {
    setAssignments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  async function handleSave() {
    const arrivalPhone = arrivalLocal.trim()
      ? `${arrivalCountryCode}${arrivalLocal.trim().replace(/^0/, '')}`
      : ''
    try {
      await updateOrder.mutateAsync({
        orderReadableId: order.order_id,
        scheduledDate,
        notes,
        arrivalPhone,
        assignments: assignments.map((a) => ({
          id: a.id,
          timeSlot: a.timeSlot,
          duration: a.duration,
          scheduledDate: a.scheduledDate,
        })),
      })
      toast.success('Order updated')
      onOpenChange(false)
    } catch {
      toast.error('Failed to update order')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-base">Edit Order — {order.order_id}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

          {/* Visit Date */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Visit Date
            </Label>
            <Input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="h-9"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Notes
            </Label>
            <Textarea
              placeholder="Add notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Arrival Phone */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Phone on Arrival
            </Label>
            <div className="flex h-10 rounded-md border border-input shadow-sm focus-within:ring-1 focus-within:ring-ring">
              <Select value={arrivalCountryCode} onValueChange={(v) => { if (v) setArrivalCountryCode(v) }}>
                <SelectTrigger className="w-28 shrink-0 rounded-r-none border-0 shadow-none focus:ring-0 h-full bg-slate-50 text-xs font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_CODES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="w-px bg-border self-stretch" />
              <Input
                placeholder="5XXX XXXX"
                value={arrivalLocal}
                onChange={(e) => setArrivalLocal(e.target.value)}
                className="rounded-l-none border-0 shadow-none focus-visible:ring-0 h-full flex-1"
              />
            </div>
          </div>

          {/* Team Assignments */}
          {assignments.length > 0 && (
            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Team Assignments
              </Label>
              {assignments.map((a) => (
                <div key={a.id} className="rounded-lg border p-3 space-y-2.5">
                  <p className="text-sm font-medium text-slate-800">{a.teamName}</p>

                  {/* Date per assignment */}
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Date</Label>
                    <Input
                      type="date"
                      value={a.scheduledDate}
                      onChange={(e) => updateAssignment(a.id, { scheduledDate: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {/* Start time */}
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">Start Time</Label>
                      <Select
                        value={a.timeSlot}
                        onValueChange={(v) => { if (v) updateAssignment(a.id, { timeSlot: v }) }}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {HOURS.map((h) => (
                            <SelectItem key={h} value={h}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Duration */}
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">Duration (hrs)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={12}
                        value={a.duration}
                        onChange={(e) => {
                          const v = parseInt(e.target.value)
                          if (!isNaN(v) && v >= 1) updateAssignment(a.id, { duration: String(v) })
                        }}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t p-3">
          <Button
            className="w-full gap-2 min-h-[44px]"
            onClick={handleSave}
            disabled={updateOrder.isPending}
          >
            <Save className="h-4 w-4" />
            {updateOrder.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
