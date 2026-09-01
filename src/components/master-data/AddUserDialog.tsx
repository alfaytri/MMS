'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useRef, useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Building2, X } from 'lucide-react'
import {
  DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  GuardedFormDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { passwordSchema } from '@/lib/auth/password-policy'
import { PhoneInputWithCode } from '@/components/shared/PhoneInputWithCode'
import { useCreateUser } from '@/hooks/useProfiles'
import { useRoles } from '@/hooks/useRoles'
import { rolesGrantSuperViewer } from '@/lib/auth/superViewer'
import { useAllDivisions } from '@/hooks/useDivisions'
import { useCompanies } from '@/hooks/useCompanies'
import { createClient } from '@/lib/supabase/client'

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
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<string[]>([])
  const [phoneCountryCode, setPhoneCountryCode] = useState('+974')
  const [phoneDigits, setPhoneDigits] = useState('')
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  const { data: allDivisions = [] } = useAllDivisions()
  const { data: companies = [] } = useCompanies()

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

  // Add-only dialog: any deviation from the empty defaults counts as dirty.
  const extraDirty =
    selectedDivisionIds.length > 0 ||
    phoneDigits.length > 0 ||
    phoneCountryCode !== '+974'

  function handleOpenChange(v: boolean) {
    if (!v) {
      form.reset()
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
    // Guard: every internal account must have at least one division, otherwise
    // RLS locks it out of all division-scoped data. The only exception is a
    // super-viewer (an approval-slot Owner/Accountant), who sees every division.
    const chosenRoles = (roles ?? []).filter((r) => values.role_ids.includes(r.id))
    if (selectedDivisionIds.length === 0 && !rolesGrantSuperViewer(chosenRoles)) {
      toast.error('Assign at least one division. Only Owner/Accountant accounts can be created without one.')
      return
    }
    createUser.mutate(
      {
        full_name: values.full_name,
        username: values.username,
        password: values.password,
        role_ids: values.role_ids,
        phone: phoneDigits ? `${phoneCountryCode}${phoneDigits}` : undefined,
      },
      {
        onSuccess: async (res) => {
          await assignDivisions(res.profile.id)
          if (res.warning) toast.warning(res.warning)
          else toast.success(`User "${values.username}" created successfully`)
          guardRef.current?.closeAfterSubmit()
        },
        onError: (err) => toast.error(humanizeDbError(err)),
      }
    )
  }

  return (
    <GuardedFormDialog
      open={open}
      onOpenChange={handleOpenChange}
      form={form}
      extraDirty={extraDirty}
      ref={guardRef}
    >
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
                          checked ? [...current, role.id] : current.filter((id) => id !== role.id),
                          { shouldDirty: true }
                        )
                      }}
                    />
                    <span className="text-xs whitespace-nowrap">{role.name}</span>
                  </label>
                ))}
              </div>
            </div>

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
                <div className="flex items-center gap-2">
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
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 gap-1.5"
                  onClick={() => setSelectedDivisionIds(allDivisions.map((d) => d.id))}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  All divisions
                </Button>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => guardRef.current?.requestClose()}>Cancel</Button>
              <Button type="submit" disabled={createUser.isPending}>
                {createUser.isPending ? 'Creating…' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </GuardedFormDialog>
  )
}
