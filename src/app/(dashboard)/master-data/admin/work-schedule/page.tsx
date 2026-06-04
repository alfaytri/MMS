'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Plus, Clock, Pencil, Trash2, Eye, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormField, FormItem, FormLabel, FormControl,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PageWrapper } from '@/components/shared/PageWrapper'
import {
  useSchedules,
  useCreateSchedule,
  useUpdateSchedule,
  useDeleteSchedule,
  type Schedule,
  type ScheduleInsert,
  type ScheduleUpdate,
} from '@/hooks/useTeams'
import {
  useDivisionsWithSchedule,
  useAssignDivisionSchedule,
} from '@/hooks/useDivisions'

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
type Day = (typeof DAYS)[number]

const DAY_LABELS: Record<Day, string> = {
  sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
  thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
}

interface DayConfig {
  enabled: boolean
  start: string
  end: string
  break_start: string
  break_minutes: number
}

interface ScheduleFormValues {
  name: string
  days: Record<Day, DayConfig>
}

function defaultDays(): ScheduleFormValues['days'] {
  return Object.fromEntries(
    DAYS.map(d => [
      d,
      {
        enabled: ['sun', 'mon', 'tue', 'wed', 'thu'].includes(d),
        start: '08:00',
        end: '17:00',
        break_start: '13:00',
        break_minutes: 60,
      },
    ])
  ) as ScheduleFormValues['days']
}

function countWorkDays(days: Record<string, { enabled: boolean }> | null): number {
  if (!days) return 0
  return Object.values(days).filter(d => d.enabled).length
}

function formatTimeRange(days: Record<string, DayConfig> | null): string {
  if (!days) return '—'
  const enabled = Object.values(days).filter(d => d.enabled)
  if (enabled.length === 0) return '—'
  const starts = [...new Set(enabled.map(d => d.start))]
  const ends = [...new Set(enabled.map(d => d.end))]
  if (starts.length === 1 && ends.length === 1) return `${starts[0]} – ${ends[0]}`
  return 'Varies'
}

// ─── Schedule Form Dialog ────────────────────────────────────────────────────

function ScheduleFormDialog({
  open,
  editing,
  viewOnly: initialViewOnly,
  onClose,
}: {
  open: boolean
  editing: Schedule | null
  viewOnly?: boolean
  onClose: () => void
}) {
  const [viewOnly, setViewOnly] = useState(initialViewOnly ?? false)
  const createSchedule = useCreateSchedule()
  const updateSchedule = useUpdateSchedule()

  const form = useForm<ScheduleFormValues>({
    defaultValues: {
      name: editing?.name ?? '',
      days: (editing?.days as ScheduleFormValues['days'] | undefined) ?? defaultDays(),
    },
  })

  // Reset when dialog opens with new data
  useState(() => {
    form.reset({
      name: editing?.name ?? '',
      days: (editing?.days as ScheduleFormValues['days'] | undefined) ?? defaultDays(),
    })
    setViewOnly(initialViewOnly ?? false)
  })

  async function onSave(values: ScheduleFormValues) {
    if (!editing) {
      await createSchedule.mutateAsync({
        name: values.name,
        days: values.days as unknown as ScheduleInsert['days'],
      })
    } else {
      await updateSchedule.mutateAsync({
        id: editing.id,
        name: values.name,
        days: values.days as unknown as ScheduleUpdate['days'],
      })
    }
    onClose()
  }

  const isPending = createSchedule.isPending || updateSchedule.isPending

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {viewOnly ? 'View Schedule' : editing ? 'Edit Schedule' : 'New Schedule'}
          </DialogTitle>
        </DialogHeader>

        {viewOnly && (
          <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1">
            View only —{' '}
            <button type="button" className="underline hover:text-foreground" onClick={() => setViewOnly(false)}>
              click to edit
            </button>
          </p>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              rules={{ required: !viewOnly && 'Required' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Schedule Name</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={viewOnly} placeholder="e.g. Standard Workweek" />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <p className="text-sm font-medium">Working Days</p>
              <div className="rounded-md border border-border divide-y divide-border">
                {DAYS.map(day => {
                  const enabled = form.watch(`days.${day}.enabled`)
                  return (
                    <div key={day} className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 py-2.5 text-sm">
                      <Switch
                        checked={enabled}
                        disabled={viewOnly}
                        onCheckedChange={v => !viewOnly && form.setValue(`days.${day}.enabled`, v)}
                      />
                      <span className="w-20 text-sm font-medium">{DAY_LABELS[day]}</span>
                      {enabled && (
                        <>
                          <Input
                            type="time"
                            className="w-28 h-8 text-sm"
                            disabled={viewOnly}
                            {...form.register(`days.${day}.start`)}
                          />
                          <span className="text-muted-foreground">–</span>
                          <Input
                            type="time"
                            className="w-28 h-8 text-sm"
                            disabled={viewOnly}
                            {...form.register(`days.${day}.end`)}
                          />
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>Break</span>
                            <Input
                              type="time"
                              className="w-28 h-8 text-xs"
                              disabled={viewOnly}
                              {...form.register(`days.${day}.break_start`)}
                            />
                            <span>for</span>
                            <Input
                              type="number"
                              min={0}
                              max={180}
                              className="w-14 h-8 text-xs"
                              disabled={viewOnly}
                              {...form.register(`days.${day}.break_minutes`, { valueAsNumber: true })}
                            />
                            <span>min</span>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {viewOnly ? 'Close' : 'Cancel'}
              </Button>
              {!viewOnly && (
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Saving…' : editing ? 'Update' : 'Create'}
                </Button>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Schedule Card ───────────────────────────────────────────────────────────

function ScheduleCard({
  schedule,
  onView,
  onEdit,
  onDelete,
}: {
  schedule: Schedule
  onView: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [divExpanded, setDivExpanded] = useState(false)
  const { data: divisions = [] } = useDivisionsWithSchedule()
  const assignDivisionSchedule = useAssignDivisionSchedule()

  const days = schedule.days as Record<string, DayConfig> | null
  const assignedDivisions = divisions.filter(d => d.calendar_schedule_id === schedule.id)
  const unassignedDivisions = divisions.filter(d => d.calendar_schedule_id !== schedule.id)

  const workDayNames = days
    ? DAYS.filter(d => days[d]?.enabled).map(d => d.charAt(0).toUpperCase() + d.slice(1, 3))
    : []

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm hover:shadow-md transition-shadow">
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm text-foreground">{schedule.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {countWorkDays(days)} work days · {formatTimeRange(days)}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 text-xs">
            {countWorkDays(days)}d/wk
          </Badge>
        </div>

        {/* Day chips */}
        <div className="flex flex-wrap gap-1">
          {DAYS.map(day => (
            <span
              key={day}
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                days?.[day]?.enabled
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground/40'
              }`}
            >
              {day}
            </span>
          ))}
        </div>

        {/* Division badges */}
        {assignedDivisions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {assignedDivisions.map(d => (
              <span
                key={d.id}
                className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700"
              >
                {d.short_name ?? d.name}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 pt-1 border-t border-border/60">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setDivExpanded(!divExpanded)}
          >
            {divExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Divisions
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onView}>
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Division assignment panel */}
      {divExpanded && (
        <div className="border-t bg-muted/30 px-4 py-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Calendar divisions
          </p>
          {assignedDivisions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No divisions assigned yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {assignedDivisions.map(d => (
                <span
                  key={d.id}
                  className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700"
                >
                  {d.short_name ?? d.name}
                  <button
                    type="button"
                    className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                    title="Remove"
                    onClick={() => assignDivisionSchedule.mutate({ divisionId: d.id, scheduleId: null })}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {unassignedDivisions.length > 0 && (
            <Select
              onValueChange={divisionId => {
                if (divisionId) assignDivisionSchedule.mutate({ divisionId, scheduleId: schedule.id })
              }}
            >
              <SelectTrigger className="h-7 w-44 text-xs">
                <SelectValue placeholder="Add division…" />
              </SelectTrigger>
              <SelectContent>
                {unassignedDivisions.map(d => (
                  <SelectItem key={d.id} value={d.id} className="text-xs">
                    {d.short_name ?? d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function WorkSchedulePage() {
  const { data: schedules = [], isLoading } = useSchedules()
  const deleteSchedule = useDeleteSchedule()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Schedule | null>(null)
  const [viewOnly, setViewOnly] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null)

  function openNew() {
    setEditing(null)
    setViewOnly(false)
    setFormOpen(true)
  }

  function openView(s: Schedule) {
    setEditing(s)
    setViewOnly(true)
    setFormOpen(true)
  }

  function openEdit(s: Schedule) {
    setEditing(s)
    setViewOnly(false)
    setFormOpen(true)
  }

  return (
    <PageWrapper>
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">
            {schedules.length} schedule{schedules.length !== 1 ? 's' : ''}
          </h2>
        </div>
        <Button className="h-8 text-sm gap-1.5" onClick={openNew}>
          <Plus className="h-4 w-4" />
          New Schedule
        </Button>
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-40 rounded-lg border border-border bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : schedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Clock className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No schedules found</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Click &quot;+ New Schedule&quot; to get started
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {schedules.map(s => (
            <ScheduleCard
              key={s.id}
              schedule={s}
              onView={() => openView(s)}
              onEdit={() => openEdit(s)}
              onDelete={() => setDeleteTarget(s)}
            />
          ))}
        </div>
      )}

      {/* Form dialog */}
      {formOpen && (
        <ScheduleFormDialog
          open={formOpen}
          editing={editing}
          viewOnly={viewOnly}
          onClose={() => { setFormOpen(false); setEditing(null); setViewOnly(false) }}
        />
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete schedule"
        description={`Delete "${deleteTarget?.name}"? This will also remove all team and division assignments.`}
        confirmLabel="Delete"
        variant="destructive"
        isPending={deleteSchedule.isPending}
        onConfirm={() => deleteTarget && deleteSchedule.mutate(deleteTarget.id)}
        onOpenChange={o => { if (!o) setDeleteTarget(null) }}
      />
    </PageWrapper>
  )
}
