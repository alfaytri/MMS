'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { X, Shield, KeyRound, UserPlus2, Building2 } from 'lucide-react'
import {
  DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import { PhoneInputWithCode, splitPhone } from '@/components/shared/PhoneInputWithCode'
import {
  GuardedFormDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import {
  useUpdateUser, useUserDivisions, useAssignDivision, useRemoveDivision, type Profile,
} from '@/hooks/useProfiles'
import { useRoles, type CustomRole } from '@/hooks/useRoles'
import { useAllDivisions } from '@/hooks/useDivisions'
import { useCompanies } from '@/hooks/useCompanies'

const SCOPE_VALUES = ['po', 'inv_check', 'stock_adj', 'sales_margin', 'sales_credit'] as const
type ScopeValue = typeof SCOPE_VALUES[number]

const SCOPE_LABELS: Record<ScopeValue, string> = {
  po:           'PO',
  inv_check:    'Inv Check',
  stock_adj:    'Stock Adj',
  sales_margin: 'Sales Margin',
  sales_credit: 'Sales Credit',
}

const ROLE_ASSIGNMENT = z.object({
  role_id: z.string().uuid(),
  approval_scopes: z.array(z.enum(SCOPE_VALUES)).nullable().default(null),
})

const schema = z.object({
  full_name: z.string().min(1, 'Name is required'),
  username:  z.string().min(1, 'Username is required').regex(/^[a-zA-Z0-9._@-]+$/, 'Only letters, numbers, dots, hyphens, and underscores'),
  is_active: z.boolean(),
  role_assignments: z.array(ROLE_ASSIGNMENT).default([]),
})

type Values = z.infer<typeof schema>
type RoleAssignment = z.infer<typeof ROLE_ASSIGNMENT>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  profile: (Profile & { user_custom_roles?: Array<{ role_id: string; approval_scopes?: string[] | null }> }) | null
}

function RoleScopePicker({
  scopes,
  onChange,
}: {
  scopes: ScopeValue[] | null
  onChange: (next: ScopeValue[] | null) => void
}) {
  const [open, setOpen] = useState(false)
  const allMode = scopes === null
  const summary =
    allMode ? 'All scopes' :
    scopes.length === 0 ? 'No scopes' :
    scopes.map((s) => SCOPE_LABELS[s]).join(', ')
  const tone =
    allMode ? 'text-muted-foreground' :
    scopes.length === 0 ? 'text-destructive' :
    'text-foreground'

  function toggle(scope: ScopeValue) {
    const current = scopes ?? [...SCOPE_VALUES]
    const next = current.includes(scope)
      ? current.filter((s) => s !== scope)
      : [...current, scope]
    onChange(next)
  }

  function setAllMode(on: boolean) {
    onChange(on ? null : [])
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={`rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-medium border border-border/60 hover:bg-background max-w-[180px] truncate ${tone}`}
        title="Approval scopes"
      >
        {summary}
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2 space-y-1" align="start">
        <label className="flex items-center gap-2 text-xs cursor-pointer py-1 px-1 rounded hover:bg-muted/50">
          <Checkbox
            checked={allMode}
            onCheckedChange={(c) => setAllMode(Boolean(c))}
          />
          <span className="font-medium">All scopes</span>
        </label>
        <div className="border-t my-1" />
        {SCOPE_VALUES.map((s) => (
          <label
            key={s}
            className={`flex items-center gap-2 text-xs cursor-pointer py-1 px-1 rounded hover:bg-muted/50 ${
              allMode ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <Checkbox
              checked={!allMode && (scopes ?? []).includes(s)}
              onCheckedChange={() => toggle(s)}
              disabled={allMode}
            />
            <span>{SCOPE_LABELS[s]}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  )
}

export function EditUserDialog({ open, onOpenChange, profile }: Props) {
  const updateUser = useUpdateUser()
  const { data: roles } = useRoles()

  const { data: allDivisions = [] } = useAllDivisions()
  const { data: companies = [] } = useCompanies()
  const { data: userDivisions = [] } = useUserDivisions(profile?.id ?? null)
  const assignDivision = useAssignDivision()
  const removeDivision = useRemoveDivision()
  const [divisionPickValue, setDivisionPickValue] = useState('')

  const [hasCcAccess, setHasCcAccess] = useState(false)
  const [extension, setExtension] = useState('')
  const [_extensionError, setExtensionError] = useState<string | null>(null)
  const [phoneCountryCode, setPhoneCountryCode] = useState('+974')
  const [phoneDigits, setPhoneDigits] = useState('')
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  useEffect(() => {
    setHasCcAccess(profile?.has_contact_centre_access ?? false)
    setExtension(profile?.threecx_extension ?? '')
    setExtensionError(null)
    const { code, digits } = splitPhone(profile?.phone)
    setPhoneCountryCode(code)
    setPhoneDigits(digits)
  }, [profile])

  // Divisions are managed via live mutations (assign/remove fire immediately),
  // so they aren't part of the dirty check. The useState fields below ARE:
  // phone + CC access + 3CX extension all persist only on Save.
  const initialPhone = useMemo(() => splitPhone(profile?.phone), [profile?.phone])
  const extraDirty =
    hasCcAccess !== (profile?.has_contact_centre_access ?? false) ||
    extension !== (profile?.threecx_extension ?? '') ||
    phoneCountryCode !== initialPhone.code ||
    phoneDigits !== initialPhone.digits

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

  const form = useForm<Values>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      full_name: '', username: '', is_active: true, role_assignments: [],
    },
  })

  useEffect(() => {
    if (profile && open) {
      const initialAssignments: RoleAssignment[] = (profile.user_custom_roles ?? [])
        .map((r: { role_id: string; approval_scopes?: string[] | null }) => ({
          role_id: r.role_id,
          approval_scopes: (r.approval_scopes ?? null) as ScopeValue[] | null,
        }))
      form.reset({
        full_name: profile.full_name ?? '',
        username: (profile.email ?? '').replace(/@mms\.local$/, ''),
        is_active: profile.is_active ?? true,
        role_assignments: initialAssignments,
      })
    }
  }, [profile, open, form])

  const isActive = form.watch('is_active')

  function onSubmit(values: Values) {
    if (!profile) return
    if (hasCcAccess && extension.trim() !== '' && !/^\d{2,8}$/.test(extension.trim())) {
      setExtensionError('Extension must be 2-8 digits')
      return
    }
    setExtensionError(null)
    const email = values.username.includes('@') ? values.username : `${values.username}@mms.local`
    updateUser.mutate(
      {
        auth_user_id: profile.auth_user_id,
        full_name: values.full_name,
        email,
        is_active: values.is_active,
        role_assignments: values.role_assignments.map((a) => ({
          role_id: a.role_id,
          approval_scopes: a.approval_scopes ?? null,
        })),
        has_contact_centre_access: hasCcAccess,
        threecx_extension: extension.trim() === '' ? null : extension.trim(),
        phone: phoneDigits ? `${phoneCountryCode}${phoneDigits}` : null,
      },
      {
        onSuccess: () => {
          toast.success('User updated')
          guardRef.current?.closeAfterSubmit()
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <GuardedFormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      extraDirty={extraDirty}
      ref={guardRef}
    >
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
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username *</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={isActive}
                onCheckedChange={(checked) => form.setValue('is_active', Boolean(checked), { shouldDirty: true })}
              />
              <span className="text-sm">Active</span>
            </label>

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

            <div className="space-y-2.5">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Roles</Label>
                <p className="text-xs text-muted-foreground">
                  Grants permissions and/or makes this user eligible to fill approval-chain steps.
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5 min-h-[2rem] items-center">
                {form.watch('role_assignments').length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No roles assigned.</p>
                ) : (
                  form.watch('role_assignments').map((assignment, idx) => {
                    const role = (roles ?? []).find((r) => r.id === assignment.role_id)
                    if (!role) return null

                    const isAS = Boolean((role as CustomRole & { is_approval_slot?: boolean }).is_approval_slot)
                    const hasPerms = ((role.permissions as string[] | null)?.length ?? 0) > 0

                    function removeAssignment() {
                      const updated = form.getValues('role_assignments').filter((_, i) => i !== idx)
                      form.setValue('role_assignments', updated, { shouldDirty: true })
                    }

                    const chipClass = isAS
                      ? 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/10'
                      : 'border-border bg-muted/40 text-foreground hover:bg-muted/70'

                    const Icon = isAS ? Shield : KeyRound

                    return (
                      <span
                        key={assignment.role_id}
                        className={`group inline-flex items-center gap-1.5 rounded-full border pl-2 pr-1 py-0.5 text-xs font-medium transition-colors ${chipClass}`}
                        title={isAS && hasPerms ? 'Permissions + approval slot' : isAS ? 'Approval slot' : 'Permission role'}
                      >
                        <Icon className="h-3 w-3 shrink-0 opacity-70" />
                        <span>{role.name}</span>
                        {isAS && (
                          <RoleScopePicker
                            scopes={(assignment.approval_scopes ?? null) as ScopeValue[] | null}
                            onChange={(next) => {
                              const updated = [...form.getValues('role_assignments')]
                              updated[idx] = { ...updated[idx], approval_scopes: next }
                              form.setValue('role_assignments', updated, { shouldDirty: true })
                            }}
                          />
                        )}
                        <button
                          type="button"
                          className="rounded-full p-0.5 opacity-60 hover:opacity-100 hover:bg-background/80 transition"
                          onClick={removeAssignment}
                          aria-label={`Remove ${role.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )
                  })
                )}
              </div>

              {(roles ?? []).filter((r) =>
                !form.watch('role_assignments').some((a) => a.role_id === r.id)
              ).length > 0 && (() => {
                const available = (roles ?? []).filter(
                  (r) => !form.watch('role_assignments').some((a) => a.role_id === r.id)
                )
                const approvalRoles   = available.filter((r) => Boolean((r as CustomRole & { is_approval_slot?: boolean }).is_approval_slot))
                const permissionRoles = available.filter((r) => !Boolean((r as CustomRole & { is_approval_slot?: boolean }).is_approval_slot))

                return (
                  <Select
                    value=""
                    onValueChange={(id) => {
                      if (!id) return
                      const current = form.getValues('role_assignments')
                      if (current.some((a) => a.role_id === id)) return
                      form.setValue('role_assignments', [...current, { role_id: id, approval_scopes: null }], { shouldDirty: true })
                    }}
                  >
                    <SelectTrigger className="w-full sm:w-72 h-9 text-sm">
                      <UserPlus2 className="h-3.5 w-3.5 text-muted-foreground mr-1" />
                      <SelectValue placeholder="Add role…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      {approvalRoles.length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                            <Shield className="h-3 w-3" />
                            Approval Roles
                          </SelectLabel>
                          {approvalRoles.map((r) => {
                            const hasPerms = ((r.permissions as string[] | null)?.length ?? 0) > 0
                            return (
                              <SelectItem key={r.id} value={r.id} className="text-sm">
                                <span className="flex items-center gap-2">
                                  <Shield className="h-3 w-3 text-primary/70" />
                                  <span>{r.name}</span>
                                  {hasPerms && (
                                    <span className="text-[10px] text-muted-foreground">+ perms</span>
                                  )}
                                </span>
                              </SelectItem>
                            )
                          })}
                        </SelectGroup>
                      )}
                      {permissionRoles.length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                            <KeyRound className="h-3 w-3" />
                            Permission Roles
                          </SelectLabel>
                          {permissionRoles.map((r) => (
                            <SelectItem key={r.id} value={r.id} className="text-sm">
                              <span className="flex items-center gap-2">
                                <KeyRound className="h-3 w-3 text-muted-foreground" />
                                <span>{r.name}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                )
              })()}
            </div>

            <div className="space-y-2.5 pt-2">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Divisions</Label>
                <p className="text-xs text-muted-foreground">
                  Determines which divisions this user can create orders for.
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5 min-h-[2rem] items-center">
                {userDivisions.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No divisions assigned — user cannot create orders.
                  </p>
                ) : (
                  userDivisions.map((ud) => {
                    const divName = allDivisions.find((d) => d.id === ud.division_id)?.name ?? ud.division_id
                    return (
                      <span
                        key={ud.id}
                        className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 pl-2 pr-1 py-0.5 text-xs font-medium text-foreground hover:bg-muted/70 transition-colors"
                      >
                        <Building2 className="h-3 w-3 shrink-0 opacity-70" />
                        <span>{divName}</span>
                        <button
                          type="button"
                          className="rounded-full p-0.5 opacity-60 hover:opacity-100 hover:bg-background/80 transition disabled:opacity-30"
                          onClick={() => handleRemoveDivision(ud.id)}
                          disabled={removeDivision.isPending}
                          aria-label={`Remove ${divName}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )
                  })
                )}
              </div>

              {companiesWithUnassigned.length > 0 && (
                <Select
                  value={divisionPickValue}
                  onValueChange={(v) => { if (v) { setDivisionPickValue(v); handleAssignDivision(v) } }}
                >
                  <SelectTrigger className="w-full sm:w-72 h-9 text-sm">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground mr-1" />
                    <SelectValue placeholder="Add division…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {companiesWithUnassigned.map((group) => (
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
              <Button type="button" variant="outline" onClick={() => guardRef.current?.requestClose()}>Cancel</Button>
              <Button type="submit" disabled={updateUser.isPending}>
                {updateUser.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </GuardedFormDialog>
  )
}
