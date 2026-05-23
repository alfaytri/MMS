'use client'

import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  useUpdateUser, useUserDivisions, useAssignDivision, useRemoveDivision, type Profile,
} from '@/hooks/useProfiles'
import { useRoles } from '@/hooks/useRoles'
import { useAllDivisions } from '@/hooks/useDivisions'
import { useCompanies } from '@/hooks/useCompanies'
import {
  useApprovalRoleAssignments,
  useAddApprovalRoleAssignment,
  useSoftDeleteApprovalRoleAssignment,
} from '@/hooks/useApprovalRoleAssignments'
import type { ApprovalRole } from '@/lib/approvalChainResolution'
import { createClient } from '@/lib/supabase/client'

const APPROVAL_ROLES: { role: ApprovalRole; label: string }[] = [
  { role: 'purchase_manager',  label: 'Purchase Manager' },
  { role: 'accountant',        label: 'Accountant' },
  { role: 'owner',             label: 'Owner' },
  { role: 'employee',          label: 'Employee' },
  { role: 'warehouse_manager', label: 'Warehouse Manager' },
]

const schema = z.object({
  full_name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  is_active: z.boolean(),
  role_ids: z.array(z.string().uuid()).default([]),
})

type Values = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  profile: (Profile & { user_custom_roles?: Array<{ role_id: string }> }) | null
}

export function EditUserDialog({ open, onOpenChange, profile }: Props) {
  const updateUser = useUpdateUser()
  const { data: roles } = useRoles()
  const { data: allAssignments = [] } = useApprovalRoleAssignments()
  const addApprovalRole = useAddApprovalRoleAssignment()
  const removeApprovalRole = useSoftDeleteApprovalRoleAssignment()

  // ── Division assignment ──────────────────────────────────────────────
  const { data: allDivisions = [] } = useAllDivisions()
  const { data: companies = [] } = useCompanies()
  const { data: userDivisions = [] } = useUserDivisions(profile?.id ?? null)
  const assignDivision = useAssignDivision()
  const removeDivision = useRemoveDivision()
  const [divisionPickValue, setDivisionPickValue] = useState('')

  // ── Team Leader toggle ──────────────────────────────────────────────
  const currentlyTl = profile?.user_type === 'team-leader'
  const [isTl, setIsTl] = useState(currentlyTl)
  const [linkedEmployeeId, setLinkedEmployeeId] = useState<string | null>(null)

  // ── Division Manager toggle ────────────────────────────────────────
  const [isDivMgr, setIsDivMgr] = useState(false)

  useEffect(() => {
    setIsTl(profile?.user_type === 'team-leader')
    setIsDivMgr(profile?.is_division_manager ?? false)
    setLinkedEmployeeId(null)
  }, [profile])

  const { data: currentEmployee } = useQuery({
    queryKey: ['tl-current-employee', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('employees')
        .select('id, name, team_id, teams!fk_employee_team(name)')
        .eq('profile_id', profile.id)
        .maybeSingle()
      return data ?? null
    },
    enabled: !!profile?.id && currentlyTl,
  })

  const { data: tlEmployees = [] } = useQuery({
    queryKey: ['tl-linkable-employees-edit'],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('employees')
        .select('id, name, team_id, teams!fk_employee_team(id, name)')
        .is('profile_id', null)
        .not('team_id', 'is', null)
        .eq('status', 'active')
        .order('name')
      return (data ?? []) as { id: string; name: string; team_id: string; teams: { id: string; name: string } }[]
    },
    enabled: isTl,
  })

  const companiesWithUnassigned = useMemo(() => {
    const assignedIds = new Set(userDivisions.map((ud) => ud.division_id))
    const map = new Map<string, { companyName: string; items: typeof allDivisions }>()
    for (const d of allDivisions) {
      if (assignedIds.has(d.id)) continue
      const groupKey = d.company_id ?? '__no_company__'
      if (!map.has(groupKey)) {
        const co = d.company_id ? companies.find((c) => c.id === d.company_id) : undefined
        map.set(groupKey, { companyName: co?.name_en ?? groupKey, items: [] })
      }
      map.get(groupKey)!.items.push(d)
    }
    return Array.from(map.values()).filter((g) => g.items.length > 0)
  }, [allDivisions, companies, userDivisions])

  function handleAssignDivision(divisionId: string) {
    if (!profile?.id || !divisionId) return
    assignDivision.mutate(
      { profile_id: profile.id, division_id: divisionId },
      {
        onSuccess: () => {
          setDivisionPickValue('')
          toast.success("Division assigned. Changes take effect on the user's next login.")
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleRemoveDivision(id: string) {
    if (!profile?.id) return
    removeDivision.mutate(
      { id, profileId: profile.id },
      {
        onSuccess: () => toast.success('Division removed.'),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  // Find this user's current approval role assignment (if any)
  const myAssignment = profile
    ? allAssignments.find((a) => a.profile_id === profile.id)
    : undefined

  function handleApprovalRoleToggle(role: ApprovalRole) {
    if (!profile) return
    if (myAssignment?.role === role) {
      // Clicking the active role → remove it
      removeApprovalRole.mutate(myAssignment.id, {
        onError: (e) => toast.error(e.message),
      })
    } else {
      // Switch to a different role: remove existing first (if any), then add new
      const doAdd = () =>
        addApprovalRole.mutate(
          { profile_id: profile.id, role, division_id: null },
          { onError: (e) => toast.error(e.message) }
        )
      if (myAssignment) {
        removeApprovalRole.mutate(myAssignment.id, {
          onSuccess: doAdd,
          onError: (e) => toast.error(e.message),
        })
      } else {
        doAdd()
      }
    }
  }

  const form = useForm<Values>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      full_name: '', email: '', is_active: true, role_ids: [],
    },
  })

  useEffect(() => {
    if (profile && open) {
      form.reset({
        full_name: profile.full_name ?? '',
        email: profile.email ?? '',
        is_active: profile.is_active ?? true,
        role_ids: (profile.user_custom_roles ?? []).map((r) => r.role_id),
      })
    }
  }, [profile, open, form])

  const selectedRoles = form.watch('role_ids') ?? []
  const isActive = form.watch('is_active')

  function onSubmit(values: Values) {
    if (!profile) return
    updateUser.mutate(
      {
        auth_user_id: profile.auth_user_id,
        ...values,
        role_ids: isTl ? [] : values.role_ids,
        is_team_leader: isTl,
        employee_id: linkedEmployeeId && linkedEmployeeId !== '__change__'
          ? linkedEmployeeId
          : undefined,
        demote_team_leader: !isTl && currentlyTl,
        is_division_manager: isDivMgr,
      },
      {
        onSuccess: () => {
          toast.success('User updated')
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl><Input type="email" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={isActive}
                onCheckedChange={(checked) => form.setValue('is_active', Boolean(checked))}
              />
              <span className="text-sm">Active</span>
            </label>

            {/* Team Leader toggle */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">Team Leader Account</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Links this account to a team leader employee
                </p>
              </div>
              <Switch checked={isTl} onCheckedChange={setIsTl} />
            </div>

            {isTl && currentEmployee && !linkedEmployeeId && (
              <div className="rounded-lg border p-3 bg-muted/50 text-sm">
                <p className="font-medium">{currentEmployee.name}</p>
                <p className="text-xs text-muted-foreground">
                  {currentEmployee.teams?.name ?? 'Unknown Team'}
                </p>
                <button
                  type="button"
                  className="text-xs text-primary mt-1 underline"
                  onClick={() => setLinkedEmployeeId('__change__')}
                >
                  Change employee
                </button>
              </div>
            )}

            {isTl && (!currentEmployee || linkedEmployeeId) && (
              <div className="space-y-1.5">
                <Label>Linked Employee *</Label>
                <Select
                  value={linkedEmployeeId && linkedEmployeeId !== '__change__' ? linkedEmployeeId : ''}
                  onValueChange={setLinkedEmployeeId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select team leader employee…" />
                  </SelectTrigger>
                  <SelectContent>
                    {tlEmployees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} — {e.teams?.name ?? 'Unknown Team'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {tlEmployees.length === 0 && (
                  <p className="text-xs text-muted-foreground">No unlinked team leaders found.</p>
                )}
              </div>
            )}

            {/* Division Manager toggle */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-medium">Division Manager</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Can access the Team Leader page for all teams in their assigned divisions
                </p>
              </div>
              <Switch checked={isDivMgr} onCheckedChange={setIsDivMgr} />
            </div>

            {!isTl && (
            <div className="space-y-1.5">
              <Label>Roles</Label>
              {/* Selected roles as removable badges */}
              <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
                {selectedRoles.length === 0 && (
                  <p className="text-xs text-muted-foreground">No roles assigned.</p>
                )}
                {selectedRoles.map((id) => {
                  const role = (roles ?? []).find((r) => r.id === id)
                  if (!role) return null
                  return (
                    <Badge key={id} variant="secondary" className="gap-1 pr-1">
                      {role.name}
                      <button
                        type="button"
                        className="rounded-full hover:bg-muted p-0.5"
                        onClick={() => {
                          const current = form.getValues('role_ids')
                          form.setValue('role_ids', current.filter((r) => r !== id))
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )
                })}
              </div>
              {/* Dropdown to add a role */}
              {(roles ?? []).filter((r) => !selectedRoles.includes(r.id)).length > 0 && (
                <Select
                  value=""
                  onValueChange={(id) => {
                    if (!id) return
                    const current = form.getValues('role_ids')
                    if (!current.includes(id)) form.setValue('role_ids', [...current, id])
                  }}
                >
                  <SelectTrigger className="w-64 h-9 text-sm">
                    <SelectValue placeholder="Add role…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(roles ?? [])
                      .filter((r) => !selectedRoles.includes(r.id))
                      .map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            )}

            <div className="space-y-1.5">
              <Label>Approval Role</Label>
              <p className="text-xs text-muted-foreground">Determines who this user can act as in the PO approval chain and warehouse approvals.</p>
              <Select
                value={myAssignment?.role ?? '__none__'}
                onValueChange={(v) => {
                  if (v === '__none__') {
                    if (myAssignment) removeApprovalRole.mutate(myAssignment.id, { onError: (e) => toast.error(e.message) })
                  } else {
                    handleApprovalRoleToggle(v as ApprovalRole)
                  }
                }}
                disabled={addApprovalRole.isPending || removeApprovalRole.isPending}
              >
                <SelectTrigger className="w-64 h-9 text-sm">
                  <SelectValue placeholder="No approval role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— No approval role —</SelectItem>
                  {APPROVAL_ROLES.map(({ role, label }) => (
                    <SelectItem key={role} value={role}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ── Divisions ── */}
            <div className="space-y-2 pt-2">
              <p className="text-sm font-semibold">Divisions</p>

              <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
                {userDivisions.length === 0 && (
                  <p className="text-xs text-muted-foreground">No divisions assigned — user cannot create orders.</p>
                )}
                {userDivisions.map((ud) => {
                  const divName = allDivisions.find((d) => d.id === ud.division_id)?.name ?? ud.division_id
                  return (
                    <Badge key={ud.id} variant="secondary" className="gap-1 pr-1">
                      {divName}
                      <button
                        type="button"
                        className="rounded-full hover:bg-muted p-0.5"
                        onClick={() => handleRemoveDivision(ud.id)}
                        disabled={removeDivision.isPending}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  )
                })}
              </div>

              {companiesWithUnassigned.length > 0 && (
                <Select
                  value={divisionPickValue}
                  onValueChange={(v) => { if (v) { setDivisionPickValue(v); handleAssignDivision(v) } }}
                >
                  <SelectTrigger className="w-64 h-8 text-xs">
                    <SelectValue placeholder="Add division…" />
                  </SelectTrigger>
                  <SelectContent>
                    {companiesWithUnassigned.map((group) => (
                      <SelectGroup key={group.companyName}>
                        <SelectLabel>{group.companyName}</SelectLabel>
                        {group.items.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={updateUser.isPending}>
                {updateUser.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
