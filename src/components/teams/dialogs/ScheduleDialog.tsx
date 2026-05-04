'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { format, parseISO, isAfter, isBefore } from 'date-fns'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  useSchedules,
  useTeamScheduleAssignments,
  useCreateSchedule,
  useUpdateSchedule,
  useDeleteSchedule,
  useAttachSchedule,
  useDetachSchedule,
  type Schedule,
  type ScheduleInsert,
  type ScheduleUpdate,
} from '@/hooks/useTeams'
import { useTeamsPage } from '../TeamsPageContext'

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
type Day = (typeof DAYS)[number]

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
  // Errata 13: Sun–Thu default (Saudi Arabia workweek)
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

interface AttachFormValues {
  scheduleId: string
  startDate: string
  endDate: string
}

export function ScheduleDialog() {
  const { scheduleDialog, closeScheduleDialog } = useTeamsPage()
  const { open, teamId } = scheduleDialog
  const isTeamMode = !!teamId
  // Narrow type for use inside isTeamMode branches
  const teamIdStr = teamId as string

  const { data: schedules = [] } = useSchedules()
  const { data: assignments = [] } = useTeamScheduleAssignments(teamId)
  const createSchedule = useCreateSchedule()
  const updateSchedule = useUpdateSchedule()
  const deleteSchedule = useDeleteSchedule()
  const attachSchedule = useAttachSchedule()
  const detachSchedule = useDetachSchedule()

  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [viewOnly, setViewOnly] = useState(false)
  const [showAttachForm, setShowAttachForm] = useState(false)

  const form = useForm<ScheduleFormValues>({
    defaultValues: { name: '', days: defaultDays() },
  })
  const attachForm = useForm<AttachFormValues>({
    defaultValues: { scheduleId: '', startDate: '', endDate: '' },
  })

  function startEdit(schedule?: Schedule) {
    setViewOnly(false)
    setEditingId(schedule?.id ?? 'new')
    form.reset({
      name: schedule?.name ?? '',
      days: (schedule?.days as ScheduleFormValues['days'] | undefined) ?? defaultDays(),
    })
  }

  function startView(schedule: Schedule) {
    setViewOnly(true)
    setEditingId(schedule.id)
    form.reset({
      name: schedule.name ?? '',
      days: (schedule.days as unknown as ScheduleFormValues['days'] | undefined) ?? defaultDays(),
    })
  }

  async function onSaveSchedule(values: ScheduleFormValues) {
    if (editingId === 'new') {
      await createSchedule.mutateAsync({
        name: values.name,
        days: values.days as unknown as ScheduleInsert['days'],
      })
    } else if (editingId) {
      await updateSchedule.mutateAsync({
        id: editingId,
        name: values.name,
        days: values.days as unknown as ScheduleUpdate['days'],
      })
    }
    setEditingId(null)
  }

  async function onAttach(values: AttachFormValues) {
    if (!teamIdStr) return
    await attachSchedule.mutateAsync({
      teamId: teamIdStr,
      scheduleId: values.scheduleId,
      startDate: values.startDate,
      endDate: values.endDate || null,
    })
    setShowAttachForm(false)
    attachForm.reset()
  }

  function getAssignmentStatus(a: (typeof assignments)[number]) {
    const today = new Date()
    const start = parseISO(a.start_date)
    const end = a.end_date ? parseISO(a.end_date) : null
    if (isAfter(start, today)) return 'upcoming'
    if (end && isBefore(end, today)) return 'past'
    return 'active'
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) closeScheduleDialog() }}>
      <DialogContent className="w-full max-w-2xl rounded-none md:rounded-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isTeamMode ? 'Team Schedules' : 'Manage Schedules'}</DialogTitle>
        </DialogHeader>

        {/* LIST MODE — global schedule library */}
        {!isTeamMode && (
          <div className="space-y-3">
            <Button size="sm" onClick={() => startEdit()}>+ New Schedule</Button>

            {editingId && (
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSaveSchedule)}
                  className="border rounded p-3 space-y-3"
                >
                  {viewOnly && (
                    <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1">
                      View only — <button type="button" className="underline hover:text-foreground" onClick={() => setViewOnly(false)}>click to edit</button>
                    </p>
                  )}

                  <FormField
                    control={form.control}
                    name="name"
                    rules={{ required: !viewOnly && 'Required' }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={viewOnly} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <div className="space-y-2">
                    {DAYS.map(day => {
                      const enabled = form.watch(`days.${day}.enabled`)
                      return (
                        <div
                          key={day}
                          className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm"
                        >
                          <Switch
                            checked={enabled}
                            disabled={viewOnly}
                            onCheckedChange={v => !viewOnly && form.setValue(`days.${day}.enabled`, v)}
                          />
                          <span className="w-8 uppercase text-xs font-mono">{day}</span>
                          {enabled && (
                            <>
                              <Input
                                type="time"
                                className="w-32 h-8"
                                disabled={viewOnly}
                                {...form.register(`days.${day}.start`)}
                              />
                              <span>–</span>
                              <Input
                                type="time"
                                className="w-32 h-8"
                                disabled={viewOnly}
                                {...form.register(`days.${day}.end`)}
                              />
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <span>Break @</span>
                                <Input
                                  type="time"
                                  className="w-32 h-8"
                                  disabled={viewOnly}
                                  {...form.register(`days.${day}.break_start`)}
                                />
                                <span>for</span>
                                <Input
                                  type="number"
                                  min={0}
                                  max={180}
                                  className="w-14 h-8"
                                  disabled={viewOnly}
                                  {...form.register(`days.${day}.break_minutes`, {
                                    valueAsNumber: true,
                                  })}
                                />
                                <span>min</span>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex gap-2">
                    {!viewOnly && (
                      <Button type="submit" size="sm">
                        {createSchedule.isPending || updateSchedule.isPending
                          ? 'Saving...'
                          : 'Save'}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => { setEditingId(null); setViewOnly(false) }}
                    >
                      {viewOnly ? 'Close' : 'Cancel'}
                    </Button>
                  </div>
                </form>
              </Form>
            )}

            <div className="space-y-2">
              {schedules.map(s => (
                <div
                  key={s.id}
                  className="flex items-center justify-between border rounded px-3 py-2 text-sm"
                >
                  <span className="font-medium">{s.name}</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => startView(s)}>
                      View
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => startEdit(s)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteSchedule.mutate(s.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
              {schedules.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No schedules yet
                </p>
              )}
            </div>
          </div>
        )}

        {/* TEAM-ATTACHMENT MODE */}
        {isTeamMode && (
          <div className="space-y-3">
            {!showAttachForm && (
              <Button size="sm" onClick={() => setShowAttachForm(true)}>
                + Attach Schedule
              </Button>
            )}

            {showAttachForm && (
              <form
                onSubmit={attachForm.handleSubmit(onAttach)}
                className="border rounded p-3 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm font-medium">Schedule</label>
                    <Select onValueChange={v => attachForm.setValue('scheduleId', v ?? '')}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {schedules.map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Start Date</label>
                    <Input
                      type="date"
                      className="h-8"
                      {...attachForm.register('startDate', { required: true })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">End Date (optional)</label>
                    <Input
                      type="date"
                      className="h-8"
                      {...attachForm.register('endDate')}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={attachSchedule.isPending}>
                    {attachSchedule.isPending ? 'Attaching...' : 'Attach'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAttachForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {assignments.map(a => {
                const status = getAssignmentStatus(a)
                return (
                  <div key={a.id} className="border rounded px-3 py-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{a.schedule.name}</span>
                      <Badge
                        className={
                          status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : status === 'upcoming'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-700'
                        }
                      >
                        {status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(a.start_date), 'dd MMM yyyy')}
                      {a.end_date
                        ? ` → ${format(parseISO(a.end_date), 'dd MMM yyyy')}`
                        : ' → ongoing'}
                    </p>
                    {status !== 'past' && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          detachSchedule.mutate({ assignmentId: a.id, teamId: teamIdStr })
                        }
                      >
                        Detach
                      </Button>
                    )}
                  </div>
                )
              })}
              {assignments.length === 0 && (
                <p className="text-sm text-muted-foreground">No schedule assignments</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
