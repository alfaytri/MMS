'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useCreateTeam, useUpdateTeam, useArchiveTeam } from '@/hooks/useTeams'
import { useDivisions } from '@/hooks/useDivisions'
import { useTeamsPage } from '../TeamsPageContext'

// ---------------------------------------------------------------------------
// Form value types
// ---------------------------------------------------------------------------

interface TeamFormValues {
  name_en:           string
  name_ar:           string
  division_id:       string
  phone:             string
  is_emergency:      boolean
  is_qc:             boolean
  traccar_device_id: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TeamEditDialog() {
  const { teamDialog, closeTeamDialog } = useTeamsPage()
  const { open, team } = teamDialog
  const isEdit = !!team

  const createTeam  = useCreateTeam()
  const updateTeam  = useUpdateTeam()
  const archiveTeam = useArchiveTeam()

  const { data: divisions = [], isLoading: divisionsLoading } = useDivisions()

  const form = useForm<TeamFormValues>({
    defaultValues: {
      name_en:           '',
      name_ar:           '',
      division_id:       '',
      phone:             '',
      is_emergency:      false,
      is_qc:             false,
      traccar_device_id: '',
    },
  })

  // Populate form when opening in edit mode.
  // Errata 6: normalize both-true data (pre-constraint legacy rows) — prefer emergency over QC.
  useEffect(() => {
    if (team) {
      const rawEmergency = team.is_emergency ?? false
      const rawQc        = team.is_qc ?? false
      const isEmergency  = rawEmergency
      const isQc         = isEmergency ? false : rawQc   // mutual exclusion — emergency wins

      form.reset({
        name_en:           team.name_en           ?? '',
        name_ar:           team.name_ar           ?? '',
        division_id:       team.division_id        ?? '',
        phone:             team.phone              ?? '',
        is_emergency:      isEmergency,
        is_qc:             isQc,
        traccar_device_id: team.traccar_device_id ?? '',
      })
    } else {
      form.reset({
        name_en:           '',
        name_ar:           '',
        division_id:       '',
        phone:             '',
        is_emergency:      false,
        is_qc:             false,
        traccar_device_id: '',
      })
    }
  }, [team, open, form])

  async function onSubmit(values: TeamFormValues) {
    const payload = {
      name_en:           values.name_en,
      name_ar:           values.name_ar           || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      division_id:       values.division_id        || null as any,
      phone:             values.phone              || null,
      is_emergency:      values.is_emergency,
      is_qc:             values.is_qc,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      traccar_device_id: values.traccar_device_id || null as any,
    }

    if (isEdit) {
      await updateTeam.mutateAsync({
        id:     team!.id,
        before: team as unknown as Record<string, unknown>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(payload as any),
      })
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await createTeam.mutateAsync(payload as any)
    }

    closeTeamDialog()
  }

  async function handleArchive() {
    await archiveTeam.mutateAsync(team!.id)
    closeTeamDialog()
  }

  const isPending = createTeam.isPending || updateTeam.isPending

  return (
    <Dialog open={open} onOpenChange={isOpen => { if (!isOpen) closeTeamDialog() }}>
      <DialogContent className="w-full max-w-lg rounded-none md:rounded-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Team' : 'New Team'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            {/* Name fields — EN required, AR optional */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name_en"
                rules={{ required: 'Name (EN) is required' }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name (EN) <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Team Alpha" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name_ar"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name (AR)</FormLabel>
                    <FormControl>
                      <Input placeholder="الاسم بالعربية" dir="rtl" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Division — required */}
            <FormField
              control={form.control}
              name="division_id"
              rules={{ required: 'Division is required' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Division <span className="text-destructive">*</span></FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={divisionsLoading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={divisionsLoading ? 'Loading…' : 'Select division'} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {divisions.map(div => (
                        <SelectItem key={div.id} value={div.id}>
                          {div.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Phone */}
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input type="tel" placeholder="+966 5x xxx xxxx" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* EMR / QC switches — mutually exclusive */}
            <div className="flex flex-wrap gap-6">
              <FormField
                control={form.control}
                name="is_emergency"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={checked => {
                          field.onChange(checked)
                          // Turning ON emergency must turn OFF QC
                          if (checked) form.setValue('is_qc', false)
                        }}
                      />
                    </FormControl>
                    <FormLabel className="!mt-0 cursor-pointer">Emergency (EMR)</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_qc"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={checked => {
                          field.onChange(checked)
                          // Turning ON QC must turn OFF emergency
                          if (checked) form.setValue('is_emergency', false)
                        }}
                      />
                    </FormControl>
                    <FormLabel className="!mt-0 cursor-pointer">QC</FormLabel>
                  </FormItem>
                )}
              />
            </div>

            {/* Traccar Device ID */}
            <FormField
              control={form.control}
              name="traccar_device_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Traccar Device ID</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional GPS tracker identifier" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={closeTeamDialog}
                className="min-h-11"
              >
                Cancel
              </Button>
              {isEdit && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={archiveTeam.isPending}
                  onClick={handleArchive}
                  className="min-h-11"
                >
                  {archiveTeam.isPending ? 'Archiving…' : 'Archive'}
                </Button>
              )}
              <Button
                type="submit"
                disabled={isPending}
                className="min-h-11"
              >
                {isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>

          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
