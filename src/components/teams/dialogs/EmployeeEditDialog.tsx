'use client'

import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { useCreateEmployee, useArchiveEmployee } from '@/hooks/useTeams'
import { useTeamsPage } from '../TeamsPageContext'
import type { EmployeeStatus } from '@/hooks/useTeams'

interface EmployeeFormValues {
  name:                 string
  phone:                string
  nationality:          string
  join_date:            string
  status:               EmployeeStatus
  site_visit_order:     boolean
  site_visit_quotation: boolean
  avatar_url:           string
  serviceIds:           string[]
}

const STATUSES: EmployeeStatus[] = ['unassigned', 'active', 'vacation', 'on-task', 'archived']

export function EmployeeEditDialog() {
  const { employeeDialog, closeEmployeeDialog } = useTeamsPage()
  const { open, employee } = employeeDialog
  const isEdit = !!employee

  const qc = useQueryClient()
  const createEmployee  = useCreateEmployee()
  const archiveEmployee = useArchiveEmployee()

  const fileRef = useRef<HTMLInputElement>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isPending,   setIsPending]   = useState(false)

  const form = useForm<EmployeeFormValues>({
    defaultValues: {
      name: '', phone: '', nationality: '', join_date: '',
      status: 'unassigned', site_visit_order: false, site_visit_quotation: false,
      avatar_url: '', serviceIds: [],
    },
  })

  useEffect(() => {
    if (!open) return
    setSubmitError(null)
    if (employee) {
      form.reset({
        name:                 employee.name ?? '',
        phone:                employee.phone ?? '',
        nationality:          employee.nationality ?? '',
        join_date:            employee.join_date ?? '',
        status:               (employee.status as EmployeeStatus) ?? 'unassigned',
        site_visit_order:     employee.site_visit_order ?? false,
        site_visit_quotation: employee.site_visit_quotation ?? false,
        avatar_url:           employee.avatar_url ?? '',
        serviceIds:           [],
      })
      // Load existing skill IDs for the employee
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(createClient() as any)
        .from('employee_services')
        .select('service_id')
        .eq('employee_id', employee.id)
        .then(({ data }: { data: { service_id: string }[] | null }) => {
          if (data) form.setValue('serviceIds', data.map(r => r.service_id))
        })
    } else {
      form.reset({
        name: '', phone: '', nationality: '', join_date: '',
        status: 'unassigned', site_visit_order: false, site_visit_quotation: false,
        avatar_url: '', serviceIds: [],
      })
    }
  }, [employee, open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadAvatar(file: File): Promise<string> {
    const supabase = createClient()
    // Errata 7: UUID path to prevent collisions
    const ext  = file.name.split('.').pop()
    const path = `${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('employee-avatars').upload(path, file, { upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from('employee-avatars').getPublicUrl(path)
    return data.publicUrl
  }

  // Errata 11: Wrap onSubmit in try/catch and surface errors via submitError state
  async function onSubmit(values: EmployeeFormValues) {
    setSubmitError(null)
    setIsPending(true)
    try {
      let avatarUrl = values.avatar_url
      if (fileRef.current?.files?.[0]) {
        avatarUrl = await uploadAvatar(fileRef.current.files[0])
      }

      if (isEdit) {
        // Errata 2: Atomic edit — save_employee RPC updates employee + skills in one transaction
        const supabase = createClient()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).rpc('save_employee', {
          p_employee_id:          employee!.id,
          p_name:                 values.name,
          p_phone:                values.phone || null,
          p_nationality:          values.nationality || null,
          p_join_date:            values.join_date || null,
          p_status:               values.status,
          p_site_visit_order:     values.site_visit_order,
          p_site_visit_quotation: values.site_visit_quotation,
          p_avatar_url:           avatarUrl || null,
          p_service_ids:          values.serviceIds,
        })
        if (error) throw error
        // Manually invalidate since we bypassed mutation hooks
        qc.invalidateQueries({ queryKey: ['employees'] })
        qc.invalidateQueries({ queryKey: ['teams'] })
        qc.invalidateQueries({ queryKey: ['team-activity-log'] })
        qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
        // Log the edit (save_employee RPC doesn't log internally)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (createClient() as any).from('team_activity_log').insert({
          action:      'employee-edited',
          entity_type: 'employee',
          entity_id:   employee!.id,
          after_data:  { name: values.name, status: values.status },
        })
      } else {
        // Create path: create employee first, then upsert skills
        const payload = {
          name:                 values.name,
          phone:                values.phone || null,
          nationality:          values.nationality || null,
          join_date:            values.join_date || null,
          status:               values.status,
          site_visit_order:     values.site_visit_order,
          site_visit_quotation: values.site_visit_quotation,
          avatar_url:           avatarUrl || null,
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const created = await createEmployee.mutateAsync(payload as any)
        if (values.serviceIds.length > 0) {
          const supabase = createClient()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any).rpc('upsert_employee_services', {
            p_employee_id: created.id,
            p_service_ids: values.serviceIds,
          })
          if (error) throw error
        }
      }
      closeEmployeeDialog()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Save failed. Please try again.')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) closeEmployeeDialog() }}>
      <DialogContent className="w-full max-w-lg rounded-none md:rounded-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Employee' : 'New Employee'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              rules={{ required: 'Required' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Phone / Nationality / Join Date / Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl><Input {...field} type="tel" /></FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nationality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nationality</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="join_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Join Date</FormLabel>
                    <FormControl><Input {...field} type="date" /></FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STATUSES.map(s => (
                          <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            {/* Avatar upload */}
            <div>
              <p className="text-sm font-medium mb-1">Avatar</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="text-sm"
              />
              {form.watch('avatar_url') && (
                <img
                  src={form.watch('avatar_url')}
                  alt="Current avatar"
                  className="mt-2 h-12 w-12 rounded-full object-cover"
                />
              )}
            </div>

            {/* Permissions */}
            <div className="flex flex-wrap gap-6">
              <FormField
                control={form.control}
                name="site_visit_order"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Site Visit Order (SVO)</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="site_visit_quotation"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Site Visit Quotation (SVC)</FormLabel>
                  </FormItem>
                )}
              />
            </div>

            {/* Errata 11: Surface submit errors */}
            {submitError && (
              <p className="text-sm text-destructive border border-destructive/20 rounded p-2">
                {submitError}
              </p>
            )}

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={closeEmployeeDialog}>
                Cancel
              </Button>
              {isEdit && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={archiveEmployee.isPending}
                  onClick={async () => {
                    try {
                      await archiveEmployee.mutateAsync(employee!.id)
                      closeEmployeeDialog()
                    } catch (err) {
                      setSubmitError(err instanceof Error ? err.message : 'Archive failed')
                    }
                  }}
                >
                  Archive
                </Button>
              )}
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
