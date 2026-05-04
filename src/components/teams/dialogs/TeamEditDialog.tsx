'use client'

import { useEffect, useMemo } from 'react'
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
import { useCreateTeam, useUpdateTeam, useArchiveTeam, useEmployees } from '@/hooks/useTeams'
import { useDivisions } from '@/hooks/useDivisions'
import { useTeamsPage } from '../TeamsPageContext'

// ─── Country codes ─────────────────────────────────────────────────────────────
const COUNTRY_CODES = [
  { code: '+974', label: 'QA Qatar' },
  { code: '+966', label: 'SA Saudi' },
  { code: '+971', label: 'AE UAE'   },
  { code: '+965', label: 'KW Kuwait'},
  { code: '+973', label: 'BH Bahrain'},
  { code: '+968', label: 'OM Oman'  },
  { code: '+20',  label: 'EG Egypt' },
  { code: '+92',  label: 'PK Pakistan'},
  { code: '+91',  label: 'IN India' },
  { code: '+880', label: 'BD Bangladesh'},
]

function parsePhone(phone: string): { code: string; number: string } {
  for (const c of COUNTRY_CODES) {
    if (phone.startsWith(c.code + ' ')) {
      return { code: c.code, number: phone.slice(c.code.length + 1) }
    }
    if (phone.startsWith(c.code)) {
      return { code: c.code, number: phone.slice(c.code.length) }
    }
  }
  return { code: '+974', number: phone }
}

// ─── Form value types ──────────────────────────────────────────────────────────
interface TeamFormValues {
  name_en:           string
  name_ar:           string
  division_id:       string
  countryCode:       string
  phoneNumber:       string
  is_emergency:      boolean
  is_qc:             boolean
  traccar_device_id: string
}

// ─── Component ─────────────────────────────────────────────────────────────────
export function TeamEditDialog() {
  const { teamDialog, closeTeamDialog } = useTeamsPage()
  const { open, team } = teamDialog
  const isEdit = !!team

  const createTeam  = useCreateTeam()
  const updateTeam  = useUpdateTeam()
  const archiveTeam = useArchiveTeam()

  const { data: divisions = [], isLoading: divisionsLoading } = useDivisions()
  const { data: allEmployees = [] } = useEmployees()

  // Derive site visit capability from current team's members (read-only)
  const teamMembers = useMemo(
    () => (team ? allEmployees.filter(e => e.team_id === team.id) : []),
    [allEmployees, team],
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasOrderVisit      = teamMembers.some(e => (e as any).site_visit_order === true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasQuotationVisit  = teamMembers.some(e => (e as any).site_visit_quotation === true)

  const form = useForm<TeamFormValues>({
    defaultValues: {
      name_en:           '',
      name_ar:           '',
      division_id:       '',
      countryCode:       '+974',
      phoneNumber:       '',
      is_emergency:      false,
      is_qc:             false,
      traccar_device_id: '',
    },
  })

  // Populate form when opening. Errata 6: normalize both-true data — emergency wins.
  useEffect(() => {
    if (team) {
      const isEmergency = team.is_emergency ?? false
      const isQc        = isEmergency ? false : (team.is_qc ?? false)
      const parsed      = parsePhone(team.phone ?? '')

      form.reset({
        name_en:           team.name_en           ?? '',
        name_ar:           team.name_ar           ?? '',
        division_id:       team.division_id        ?? '',
        countryCode:       parsed.code,
        phoneNumber:       parsed.number,
        is_emergency:      isEmergency,
        is_qc:             isQc,
        traccar_device_id: team.traccar_device_id ?? '',
      })
    } else {
      form.reset({
        name_en:           '',
        name_ar:           '',
        division_id:       '',
        countryCode:       '+974',
        phoneNumber:       '',
        is_emergency:      false,
        is_qc:             false,
        traccar_device_id: '',
      })
    }
  }, [team, open, form])

  async function onSubmit(values: TeamFormValues) {
    const fullPhone = values.phoneNumber
      ? `${values.countryCode} ${values.phoneNumber}`
      : ''

    const payload = {
      name_en:           values.name_en,
      name_ar:           values.name_ar           || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      division_id:       values.division_id        || null as any,
      phone:             fullPhone                 || null,
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
  const isQc      = form.watch('is_qc')
  const isEmerg   = form.watch('is_emergency')
  const isNormal  = !isQc && !isEmerg

  return (
    <Dialog open={open} onOpenChange={isOpen => { if (!isOpen) closeTeamDialog() }}>
      <DialogContent className="w-full max-w-lg rounded-none md:rounded-lg max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle>{isEdit ? 'Edit Team' : 'Add Team'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="px-6 py-4 space-y-4">

              {/* ── Team Name (EN) ── */}
              <FormField
                control={form.control}
                name="name_en"
                rules={{ required: 'Team Name (EN) is required' }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team Name (EN)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Team Alpha" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* ── Team Name (AR) ── */}
              <FormField
                control={form.control}
                name="name_ar"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team Name (AR)</FormLabel>
                    <FormControl>
                      <Input placeholder="الاسم بالعربية" dir="rtl" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* ── Division ── */}
              <FormField
                control={form.control}
                name="division_id"
                rules={{ required: 'Division is required' }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Division</FormLabel>
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

              {/* ── Team Type card ── */}
              <div className="rounded-lg border p-3 space-y-3">
                <p className="text-sm font-medium">Team Type</p>

                {/* QC Team */}
                <FormField
                  control={form.control}
                  name="is_qc"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <FormLabel className="!mt-0 font-normal text-sm cursor-pointer">
                        QC Team
                      </FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={checked => {
                            field.onChange(checked)
                            if (checked) form.setValue('is_emergency', false)
                          }}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Normal — derived: neither QC nor Emergency */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-normal">Normal</span>
                  <Switch
                    checked={isNormal}
                    onCheckedChange={checked => {
                      if (checked) {
                        form.setValue('is_qc', false)
                        form.setValue('is_emergency', false)
                      }
                    }}
                  />
                </div>

                {/* Emergency */}
                <FormField
                  control={form.control}
                  name="is_emergency"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between">
                      <FormLabel className="!mt-0 font-normal text-sm cursor-pointer">
                        Emergency
                      </FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={checked => {
                            field.onChange(checked)
                            if (checked) form.setValue('is_qc', false)
                          }}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {/* ── Site Visit Capability (read-only) ── */}
              <div className="rounded-lg border p-3 space-y-3">
                <div>
                  <p className="text-sm font-medium">Site Visit Capability</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Auto-derived from team members&apos; site visit flags (read-only)
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-normal text-muted-foreground">
                    Site Visit — Orders
                  </span>
                  <Switch checked={hasOrderVisit} disabled aria-readonly />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-normal text-muted-foreground">
                    Site Visit — Contracts
                  </span>
                  <Switch checked={hasQuotationVisit} disabled aria-readonly />
                </div>
              </div>

              {/* ── Phone ── */}
              <div className="flex gap-2 items-end">
                <FormField
                  control={form.control}
                  name="countryCode"
                  render={({ field }) => (
                    <FormItem className="w-36 shrink-0">
                      <FormLabel>
                        Phone <span className="text-destructive">*</span>
                      </FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {COUNTRY_CODES.map(c => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      {/* invisible label keeps vertical alignment */}
                      <FormLabel className="invisible select-none" aria-hidden>
                        Number
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="tel"
                          placeholder="XXXX XXXX"
                          className="h-9"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {/* ── Traccar Device ID ── */}
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

            </div>

            <DialogFooter className="px-6 pb-5 flex-col sm:flex-row gap-2 border-t pt-4">
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
                className="min-h-11 sm:ml-auto"
              >
                {isPending ? 'Saving…' : isEdit ? 'Save' : 'Add Team'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
