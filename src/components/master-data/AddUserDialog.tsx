'use client'

import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { Users2, Building2, X } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { passwordSchema } from '@/lib/auth/password-policy'
import { PhoneInputWithCode } from '@/components/shared/PhoneInputWithCode'
import { useCreateUser } from '@/hooks/useProfiles'
import { useRoles } from '@/hooks/useRoles'
import { useAllDivisions } from '@/hooks/useDivisions'
import { useCompanies } from '@/hooks/useCompanies'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

const SHOW_TEAMS_CONTROL = false

const schema = z.object({
  full_name: z.string().min(1, 'Name is required'),
  username: z.string().min(1, 'Username is required')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Only letters, numbers, dots, hyphens, and underscores'),
  password: passwordSchema,
  confirm: z.string(),
  role_ids: z.array(z.string().uuid()).default([]),
}).refine((v) => v.password === v.confirm, {
  message: 'Passwords do not match', path: ['confirm'],
})

type Values = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function AddUserDialog({ open, onOpenChange }: Props) {
  const createUser = useCreateUser()
  const { data: roles } = useRoles()
  const [isTl, setIsTl] = useState(false)
  const [isDivMgr, setIsDivMgr] = useState(false)
  const [hasCcAccess, setHasCcAccess] = useState(false)
  const [extension, setExtension] = useState('')
  const [extensionError, setExtensionError] = useState<string | null>(null)
  const [linkedEmployeeId, setLinkedEmployeeId] = useState<string | null>(null)
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<string[]>([])
  const [phoneCountryCode, setPhoneCountryCode] = useState('+974')
  const [phoneDigits, setPhoneDigits] = useState('')

  const { data: allDivisions = [] } = useAllDivisions()
  const { data: companies = [] } = useCompanies()

  const { data: tlEmployees = [] } = useQuery({
    queryKey: queryKeys.teamLeader.linkableEmployees,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, team_id, teams!fk_employee_team(id, name)')
        .is('profile_id', null)
        .not('team_id', 'is', null)
        .eq('status', 'active')
        .order('name')
      if (error) return []
      return (data ?? []).filter((e: { teams: unknown }) => e.teams !== null) as {
        id: string; name: string; teams: { id: string; name: string }
      }[]
    },
    enabled: isTl && SHOW_TEAMS_CONTROL,
  })

  const companiesWithAvailable = useMemo(() => {
    const selectedSet = new Set(selectedDivisionIds)
    const map = new Map<string, { companyName: string; items: typeof allDivisions }>()
    for (const d of allDivisions) {
      if (selectedSet.has(d.id)) continue
      const groupKey = d.company_id ?? '__no_company__'
      if (!map.has(groupKey)) {
        const co = d.company_id ? companies.find((c) => c.id === d.company_id) : undefined
        map.set(groupKey, { companyName: co?.name_en ?? groupKey, items: [] })
      }
      map.get(groupKey)!.items.push(d)
    }
    return Array.from(map.values()).filter((g) => g.items.length > 0)
  }, [allDivisions, companies, selectedDivisionIds])

  const form = useForm<Values>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      full_name: '', username: '', password: '', confirm: '',
      role_ids: [],
    },
  })

  const selectedRoles = form.watch('role_ids') ?? []

  function handleOpenChange(v: boolean) {
    if (!v) {
      form.reset()
      setIsTl(false)
      setIsDivMgr(false)
      setHasCcAccess(false)
      setExtension('')
      setExtensionError(null)
      setLinkedEmployeeId(null)
      setSelectedDivisionIds([])
      setPhoneCountryCode('+974')
      setPhoneDigits('')
    }
    onOpenChange(v)
  }

  async function assignDivisions(profileId: string) {
    if (selectedDivisionIds.length === 0) return
    const supabase = createClient()
    const rows = selectedDivisionIds.map((division_id) => ({
      profile_id: profileId,
      division_id,
    }))
    const { error } = await supabase.from('user_company_divisions').insert(rows)
    if (error) toast.error('User created but division assignment failed')
  }

  function onSubmit(values: Values) {
    if (hasCcAccess && extension.trim() !== '' && !/^\d{2,8}$/.test(extension.trim())) {
      setExtensionError('Extension must be 2-8 digits')
      return
    }
    setExtensionError(null)
    createUser.mutate(
      {
        full_name: values.full_name,
        username: values.username,
        password: values.password,
        role_ids: isTl ? [] : values.role_ids,
        employee_id: isTl ? linkedEmployeeId ?? undefined : undefined,
        is_team_leader: isTl,
        is_division_manager: isDivMgr,
        has_contact_centre_access: hasCcAccess,
        threecx_extension: extension.trim() === '' ? undefined : extension.trim(),
        phone: phoneDigits ? `${phoneCountryCode}${phoneDigits}` : undefined,
      },
      {
        onSuccess: async (res) => {
          await assignDivisions(res.profile.id)
          if (res.warning) toast.warning(res.warning)
          else toast.success(`User "${values.username}" created successfully`)
          handleOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add User</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name *</FormLabel>
                  <FormControl><Input placeholder="Full name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username *</FormLabel>
                  <FormControl><Input placeholder="Username" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password *</FormLabel>
                  <FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl>
                  <p className="text-xs text-muted-foreground">8+ chars, uppercase, lowercase, digit, symbol.</p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password *</FormLabel>
                  <FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <Label>Phone Number</Label>
              <div className="mt-1.5">
                <PhoneInputWithCode
                  value={phoneDigits}
                  onChange={setPhoneDigits}
                  countryCode={phoneCountryCode}
                  onCountryCodeChange={setPhoneCountryCode}
                />
              </div>
            </div>

            {/* ─── Teams Operation Control (hidden until teams module is active) ─── */}
            {SHOW_TEAMS_CONTROL && (
              <section className="rounded-xl border bg-card overflow-hidden shadow-sm">
                <header className="flex items-center gap-2 px-3.5 py-2 border-b bg-muted/40">
                  <Users2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Teams Operation Control
                  </span>
                </header>
                <div className="divide-y divide-border">
                  <div className="flex items-center justify-between px-3.5 py-3 gap-3">
                    <div className="min-w-0">
                      <Label htmlFor="add-user-is-tl" className="text-sm font-medium">Team Leader Account</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Links this account to a team leader employee
                      </p>
                    </div>
                    <Switch id="add-user-is-tl" checked={isTl} onCheckedChange={setIsTl} />
                  </div>
                  {isTl && (
                    <div className="px-3.5 py-2.5 bg-muted/30 space-y-1.5">
                      <Label htmlFor="add-user-linked-employee" className="text-xs">Linked Employee *</Label>
                      <Select value={linkedEmployeeId ?? ''} onValueChange={setLinkedEmployeeId}>
                        <SelectTrigger id="add-user-linked-employee" className="h-9">
                          <SelectValue placeholder="Select team leader employee…" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 overflow-y-auto">
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
                  <div className="flex items-center justify-between px-3.5 py-3 gap-3">
                    <div className="min-w-0">
                      <Label htmlFor="add-user-is-div-mgr" className="text-sm font-medium">Division Manager</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Can access the Team Leader page for all teams in their assigned divisions
                      </p>
                    </div>
                    <Switch id="add-user-is-div-mgr" checked={isDivMgr} onCheckedChange={setIsDivMgr} />
                  </div>
                </div>
              </section>
            )}

            {(!SHOW_TEAMS_CONTROL || !isTl) && (
            <div>
              <Label>Roles</Label>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border rounded-md p-3">
                {(roles ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">No roles defined yet.</p>
                )}
                {(roles ?? []).map((role) => (
                  <label key={role.id} className="flex items-center gap-2 py-0.5 px-2 rounded hover:bg-muted cursor-pointer min-w-[170px]">
                    <Checkbox
                      className="shrink-0"
                      checked={selectedRoles.includes(role.id)}
                      onCheckedChange={(checked) => {
                        const current = form.getValues('role_ids')
                        form.setValue(
                          'role_ids',
                          checked ? [...current, role.id] : current.filter((id) => id !== role.id)
                        )
                      }}
                    />
                    <span className="text-xs whitespace-nowrap">{role.name}</span>
                  </label>
                ))}
              </div>
            </div>
            )}

            {/* ── Divisions ── */}
            <div className="space-y-2.5">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Divisions</Label>
                <p className="text-xs text-muted-foreground">
                  Determines which divisions this user can create orders for.
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5 min-h-[2rem] items-center">
                {selectedDivisionIds.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No divisions selected.
                  </p>
                ) : (
                  selectedDivisionIds.map((divId) => {
                    const divName = allDivisions.find((d) => d.id === divId)?.name ?? divId
                    return (
                      <span
                        key={divId}
                        className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 pl-2 pr-1 py-0.5 text-xs font-medium text-foreground hover:bg-muted/70 transition-colors"
                      >
                        <Building2 className="h-3 w-3 shrink-0 opacity-70" />
                        <span>{divName}</span>
                        <button
                          type="button"
                          className="rounded-full p-0.5 opacity-60 hover:opacity-100 hover:bg-background/80 transition"
                          onClick={() => setSelectedDivisionIds((prev) => prev.filter((id) => id !== divId))}
                          aria-label={`Remove ${divName}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )
                  })
                )}
              </div>

              {companiesWithAvailable.length > 0 && (
                <Select
                  value=""
                  onValueChange={(v) => { if (v) setSelectedDivisionIds((prev) => [...prev, v]) }}
                >
                  <SelectTrigger className="w-full sm:w-72 h-9 text-sm">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground mr-1" />
                    <SelectValue placeholder="Add division…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {companiesWithAvailable.map((group) => (
                      <SelectGroup key={group.companyName}>
                        <SelectLabel className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          <Building2 className="h-3 w-3" />
                          {group.companyName}
                        </SelectLabel>
                        {group.items.map((d) => (
                          <SelectItem key={d.id} value={d.id} className="text-sm">
                            <span className="flex items-center gap-2">
                              <Building2 className="h-3 w-3 text-muted-foreground" />
                              <span>{d.name}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={createUser.isPending}>
                {createUser.isPending ? 'Creating…' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
