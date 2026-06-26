'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Users } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useCreateTeam, useUpdateTeam, useArchiveTeam } from '@/hooks/useTeams'
import { useCompanies } from '@/hooks/useCompanies'
import { useDivisionsByCompany } from '@/hooks/useDivisions'
import { useTraccarDevices } from '@/hooks/useTraccar'
import { PhoneInputWithCode, splitPhone } from '@/components/shared/PhoneInputWithCode'
import { useTeamsPage } from '../TeamsPageContext'

interface TeamFormValues {
  name_en:              string
  name_ar:              string
  company_id:           string
  division_id:          string
  countryCode:          string
  phoneNumber:          string
  is_normal:            boolean
  is_emergency:         boolean
  is_qc:                boolean
  site_visit_order:     boolean
  site_visit_quotation: boolean
  traccar_device_id:    string
}

export function TeamEditDialog() {
  const { teamDialog, closeTeamDialog } = useTeamsPage()
  const { open, team } = teamDialog
  const isEdit = !!team

  const [saveError, setSaveError] = useState<string | null>(null)
  const [traccarError, setTraccarError] = useState<string | null>(null)

  const createTeam  = useCreateTeam()
  const updateTeam  = useUpdateTeam()
  const archiveTeam = useArchiveTeam()
  const { data: companies = [] } = useCompanies()
  const { data: traccarDevices = [], isLoading: isLoadingDevices } = useTraccarDevices()

  const form = useForm<TeamFormValues>({
    defaultValues: {
      name_en: '', name_ar: '', company_id: '', division_id: '',
      countryCode: '+974', phoneNumber: '',
      is_normal: true, is_emergency: false, is_qc: false,
      site_visit_order: false, site_visit_quotation: false,
      traccar_device_id: '',
    },
  })

  const selectedCompanyId = form.watch('company_id')
  const { data: divisionsForCompany = [] } = useDivisionsByCompany(selectedCompanyId || null)

  const isNormal    = form.watch('is_normal')
  const isEmergency = form.watch('is_emergency')
  const isQc        = form.watch('is_qc')

  useEffect(() => {
    setSaveError(null)
    setTraccarError(null)
    if (team) {
      const parsed = splitPhone(team.phone ?? '')
      form.reset({
        name_en:           team.name_en ?? team.name ?? '',
        name_ar:           team.name_ar ?? '',
        company_id:        team.division?.company_id ?? '',
        division_id:       team.division_id ?? '',
        countryCode:       parsed.code,
        phoneNumber:       parsed.digits,
        is_normal:            team.is_normal            ?? !(team.is_qc ?? false),
        is_emergency:         team.is_emergency         ?? false,
        is_qc:                team.is_qc                ?? false,
        site_visit_order:     team.site_visit_order     ?? false,
        site_visit_quotation: team.site_visit_quotation ?? false,
        traccar_device_id:    team.traccar_device_id    ?? '',
      })
    } else {
      form.reset({
        name_en: '', name_ar: '', company_id: '', division_id: '',
        countryCode: '+974', phoneNumber: '',
        is_normal: true, is_emergency: false, is_qc: false,
        site_visit_order: false, site_visit_quotation: false,
        traccar_device_id: '',
      })
    }
  }, [team, open, form])

  async function onSubmit(values: TeamFormValues) {
    setSaveError(null)
    setTraccarError(null)
    try {
      // Uniqueness check: a Traccar device can be linked to at most one team
      if (values.traccar_device_id) {
        const supabase = createClient()
        const { count } = await supabase.from('teams')
          .select('id', { count: 'exact', head: true })
          .eq('traccar_device_id', values.traccar_device_id)
          .is('deleted_at', null)
          .neq('id', team?.id ?? '00000000-0000-0000-0000-000000000000')
        if ((count ?? 0) > 0) {
          setTraccarError('This device is already linked to another team')
          return
        }
      }

      const fullPhone = values.phoneNumber
        ? `${values.countryCode}${values.phoneNumber}`
        : null

      const payload = {
        name:              values.name_en,
        name_en:           values.name_en,
        name_ar:           values.name_ar           || null,
        division_id:       values.division_id        || null,
        phone:             fullPhone,
        is_normal:            values.is_normal,
        is_emergency:         values.is_emergency,
        is_qc:                values.is_qc,
        site_visit_order:     values.site_visit_order,
        site_visit_quotation: values.site_visit_quotation,
        traccar_device_id:    values.traccar_device_id || null,
      }

      if (isEdit) {
        await updateTeam.mutateAsync({
          id:     team!.id,
          before: team as unknown as Record<string, unknown>,
          ...payload,
        })
      } else {
        await createTeam.mutateAsync(payload)
      }

      closeTeamDialog()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed. Please try again.')
    }
  }

  async function handleArchive() {
    try {
      await archiveTeam.mutateAsync(team!.id)
      closeTeamDialog()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Archive failed.')
    }
  }

  // Type chip handlers: QC is exclusive; Normal and Emergency can coexist
  function toggleNormal() {
    form.setValue('is_normal', !isNormal)
    if (!isNormal) form.setValue('is_qc', false)
  }
  function toggleEmergency() {
    form.setValue('is_emergency', !isEmergency)
    if (!isEmergency) form.setValue('is_qc', false)
  }
  function toggleQc() {
    const next = !isQc
    form.setValue('is_qc', next)
    if (next) {
      form.setValue('is_normal', false)
      form.setValue('is_emergency', false)
    }
  }

  const isPending = createTeam.isPending || updateTeam.isPending

  return (
    <Dialog open={open} onOpenChange={isOpen => { if (!isOpen) closeTeamDialog() }}>
      <DialogContent className="w-full max-w-lg rounded-none md:rounded-xl max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 space-y-1 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center">
              <Users className="h-4 w-4 text-orange-600" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {isEdit ? 'Edit team' : 'New team'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {isEdit ? 'Update team identity, capabilities, and contact.' : 'Create a team and assign it to a company and division.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col min-h-0 flex-1"
          >
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 border-t border-border/60">

              {/* Identity */}
              <section className="space-y-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Identity</p>

                <FormField
                  control={form.control}
                  name="name_en"
                  rules={{ required: 'English name is required' }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-muted-foreground">Name (English)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Team Alpha" className="h-9" {...field} />
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
                      <FormLabel className="text-xs font-medium text-muted-foreground">Name (Arabic) <span className="text-muted-foreground/60">(optional)</span></FormLabel>
                      <FormControl>
                        <Input placeholder="الاسم بالعربية" className="h-9" dir="rtl" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </section>

              {/* Organization */}
              <section className="space-y-4 pt-4 border-t border-border/60">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Organization</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="company_id"
                    rules={{ required: 'Company is required' }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground">Company</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={v => {
                            field.onChange(v)
                            form.setValue('division_id', '')
                          }}
                        >
                          <FormControl>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Select company" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {companies.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="division_id"
                    rules={{ required: 'Division is required' }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-muted-foreground">Division</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={!selectedCompanyId}
                        >
                          <FormControl>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder={selectedCompanyId ? 'Select division' : 'Pick company first'} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {divisionsForCompany.map(d => (
                              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              {/* Type chips — Normal + Emergency multi, QC exclusive */}
              <section className="space-y-3 pt-4 border-t border-border/60">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Team type</p>
                <div className="flex flex-wrap gap-1.5">
                  <TypeChip label="Normal"    active={isNormal}    onClick={toggleNormal} />
                  <TypeChip label="Emergency" active={isEmergency} onClick={toggleEmergency} accent="red" />
                  <TypeChip label="QC"        active={isQc}        onClick={toggleQc}        accent="purple" />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Normal and Emergency can be combined. QC is exclusive.
                </p>
              </section>

              {/* Site visit capability */}
              <section className="space-y-3 pt-4 border-t border-border/60">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Site visit capability</p>

                <FormField
                  control={form.control}
                  name="site_visit_order"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 bg-muted/30">
                      <div>
                        <FormLabel className="!mt-0 font-medium text-sm cursor-pointer">Orders</FormLabel>
                        <p className="text-[11px] text-muted-foreground">Can be assigned to site visits on customer orders.</p>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="site_visit_quotation"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 bg-muted/30">
                      <div>
                        <FormLabel className="!mt-0 font-medium text-sm cursor-pointer">Contracts</FormLabel>
                        <p className="text-[11px] text-muted-foreground">Can be assigned to site visits during contract quoting.</p>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </section>

              {/* Contact */}
              <section className="space-y-3 pt-4 border-t border-border/60">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contact</p>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Phone</label>
                  <PhoneInputWithCode
                    value={form.watch('phoneNumber')}
                    onChange={(v) => form.setValue('phoneNumber', v)}
                    countryCode={form.watch('countryCode')}
                    onCountryCodeChange={(v) => form.setValue('countryCode', v)}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="traccar_device_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-muted-foreground">Traccar device <span className="text-muted-foreground/60">(optional)</span></FormLabel>
                      <Select
                        value={field.value || '__none__'}
                        onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                      >
                        <FormControl>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="No device linked" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-60 overflow-y-auto" sideOffset={4}>
                          <SelectItem value="__none__">No device linked</SelectItem>
                          {traccarDevices.map(d => (
                            <SelectItem key={d.id} value={String(d.id)}>
                              {d.name} — {d.uniqueId}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isLoadingDevices && (
                        <p className="text-[11px] text-muted-foreground">Loading devices…</p>
                      )}
                      {traccarError && (
                        <p className="text-xs text-destructive">{traccarError}</p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              {saveError && (
                <p className="text-sm text-destructive">{saveError}</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 px-6 py-3 border-t border-border/60 bg-muted/20 shrink-0">
              <div>
                {isEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={archiveTeam.isPending}
                    onClick={handleArchive}
                  >
                    {archiveTeam.isPending ? 'Archiving…' : 'Archive'}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={closeTeamDialog}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isPending}>
                  {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create team'}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function TypeChip({ label, active, onClick, accent }: {
  label:  string
  active: boolean
  onClick: () => void
  accent?: 'red' | 'purple'
}) {
  const activeClass = !accent
    ? 'bg-foreground text-background border-foreground'
    : accent === 'red'
      ? 'bg-red-100 text-red-700 border-red-300'
      : 'bg-purple-100 text-purple-700 border-purple-300'

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-8 px-3 rounded-full text-xs border transition-colors',
        active
          ? activeClass
          : 'bg-background border-border text-muted-foreground hover:text-foreground hover:bg-muted/40',
      )}
    >
      {label}
    </button>
  )
}
