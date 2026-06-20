'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { ChevronDown, ChevronRight, Lock, MoreHorizontal, Shield, UserPlus, AlertCircle, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { SearchInput } from '@/components/shared/SearchInput'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { RoleFormDialog } from '@/components/master-data/RoleFormDialog'
import { ApprovalChainManagement } from '@/components/master-data/ApprovalChainConfig'
import { AddUserDialog } from '@/components/master-data/AddUserDialog'
import { EditUserDialog } from '@/components/master-data/EditUserDialog'
import { ResetPasswordDialog } from '@/components/master-data/ResetPasswordDialog'
import { useRoles, useDeleteRole, type CustomRole } from '@/hooks/useRoles'
import {
  useProfiles, useCurrentUserProfile, useCreateMyProfile, type Profile,
} from '@/hooks/useProfiles'

import { PERMISSION_GROUPS, ALL_PERMISSIONS, groupKeys, groupEntries, roleColor } from '@/lib/permissions'
import { PermissionGate } from '@/components/shared/PermissionGate'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ─── Role color map (Tailwind classes) ───────────────────────────────────────

const ROLE_COLOR_CLASSES: Record<string, string> = {
  blue:   'bg-blue-50   text-blue-700   border-blue-200',
  green:  'bg-success/10  text-green-700  border-green-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  teal:   'bg-teal-50   text-teal-700   border-teal-200',
  rose:   'bg-rose-50   text-rose-700   border-rose-200',
  amber:  'bg-amber-50  text-amber-700  border-amber-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
}

// ─── Role card ────────────────────────────────────────────────────────────────

function RoleCard({ role, onEdit, onDelete }: { role: CustomRole; onEdit: () => void; onDelete: () => void }) {
  const permissions = (role.permissions as string[]) ?? []
  const color = role.is_system ? 'blue' : roleColor(role.name)
  const colorClass = ROLE_COLOR_CLASSES[color] ?? ROLE_COLOR_CLASSES.blue

  const coverageChips = useMemo(() =>
    PERMISSION_GROUPS
      .map((g) => {
        const all = groupKeys(g)
        const assigned = all.filter((k) => permissions.includes(k)).length
        if (assigned === 0) return null
        return { module: g.module, assigned, total: all.length }
      })
      .filter(Boolean) as Array<{ module: string; assigned: number; total: number }>,
    [permissions]
  )

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${colorClass}`}>
            {role.name}
          </span>
          {role.is_system && (
            <Badge variant="outline" className="text-xs px-1.5 py-0">System</Badge>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Description */}
      {role.description && (
        <p className="text-sm text-muted-foreground leading-snug">{role.description}</p>
      )}

      {/* Coverage chips */}
      {coverageChips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {coverageChips.map((chip) => (
            <span
              key={chip.module}
              className="inline-flex items-center rounded border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground"
            >
              {chip.module} {chip.assigned}/{chip.total}
            </span>
          ))}
        </div>
      )}

      {/* Total count */}
      <p className="text-xs text-muted-foreground mt-auto">
        {permissions.length} / {ALL_PERMISSIONS.length} permissions
      </p>

      {/* Capability badges row */}
      <div className="flex flex-wrap gap-1 mt-1">
        {permissions.length > 0 && (
          <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0">
            🔑 {permissions.length} permissions
          </Badge>
        )}
        {(role as CustomRole & { is_approval_slot?: boolean }).is_approval_slot && (
          <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 border-primary/40 bg-primary/5 text-primary">
            ✅ Approval slot
          </Badge>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UsersRolesPage() {
  const [activeTab, setActiveTab] = useState('permissions')
  const [roleSearch, setRoleSearch] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
  const [roleDialog, setRoleDialog] = useState<{ open: boolean; role: CustomRole | null }>({ open: false, role: null })
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<CustomRole | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editDialog, setEditDialog] = useState<{ open: boolean; profile: Profile | null }>({ open: false, profile: null })
  const [resetDialog, setResetDialog] = useState<{ open: boolean; profile: Profile | null }>({ open: false, profile: null })
  const [myName, setMyName] = useState('')

  const { data: roles, isLoading: loadingRoles } = useRoles()
  const { data: profiles, isLoading: loadingProfiles } = useProfiles()
  const { data: myProfile, isLoading: loadingMyProfile } = useCurrentUserProfile()
  const createMyProfile = useCreateMyProfile()
  const deleteRole = useDeleteRole()

  function handleCreateMyProfile() {
    const name = myName.trim()
    if (!name) { toast.error('Please enter your full name'); return }
    createMyProfile.mutate(
      { full_name: name },
      {
        onSuccess: () => { toast.success('Profile created'); setMyName('') },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function toggleModule(module: string) {
    setExpandedModules((prev) => {
      const next = new Set(prev)
      if (next.has(module)) next.delete(module); else next.add(module)
      return next
    })
  }

  // Role search filter
  const filteredRoles = useMemo(() =>
    (roles ?? []).filter((r) => r.name.toLowerCase().includes(roleSearch.toLowerCase())),
    [roles, roleSearch]
  )

  // Permissions search filter
  const permSearch = roleSearch // reuse search state when on permissions tab

  const userColumns = useMemo<ColumnDef<Profile>[]>(() => [
    {
      accessorKey: 'full_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue('full_name')}</span>,
    },
    {
      accessorKey: 'email',
      header: 'Username',
      cell: ({ row }) => {
        const email = row.getValue('email') as string | null
        if (!email) return <span className="text-muted-foreground">—</span>
        return email.replace(/@mms\.local$/, '')
      },
    },
    {
      id: 'roles',
      header: 'Roles',
      cell: ({ row }) => {
        const userRoles = (row.original as Profile & {
          user_custom_roles?: Array<{
            role_id: string
            approval_scopes: string[] | null
            custom_roles: { name: string; color: string | null; is_approval_slot: boolean } | null
          }>
        }).user_custom_roles
        if (!userRoles?.length) return <span className="text-muted-foreground text-xs">None</span>

        const SHORT_SCOPE: Record<string, string> = { po: 'PO', inv_check: 'Inv', stock_adj: 'Adj' }

        return (
          <div className="flex gap-1 flex-wrap">
            {userRoles.slice(0, 3).map((ur, i) => {
              const cr = ur.custom_roles
              if (!cr) return null
              const isAS = cr.is_approval_slot
              const scopeSuffix =
                isAS && ur.approval_scopes && ur.approval_scopes.length < 3
                  ? ` (${ur.approval_scopes.map((s) => SHORT_SCOPE[s] ?? s).join(', ')})`
                  : ''
              return (
                <Badge
                  key={i}
                  variant="outline"
                  className={`text-xs ${isAS ? 'border-primary/40 bg-primary/5 text-primary' : ''}`}
                  title={isAS ? 'Approval slot' : 'Permission role'}
                >
                  {cr.name}{scopeSuffix}
                </Badge>
              )
            })}
            {userRoles.length > 3 && <Badge variant="outline" className="text-xs">+{userRoles.length - 3}</Badge>}
          </div>
        )
      },
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <StatusBadge variant={row.getValue('is_active') ? 'active' : 'inactive'}>
          {row.getValue('is_active') ? 'Active' : 'Inactive'}
        </StatusBadge>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Actions</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setEditDialog({ open: true, profile: row.original })}>
                <Shield className="h-4 w-4 mr-2" />Edit User
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setResetDialog({ open: true, profile: row.original })}>
                <Shield className="h-4 w-4 mr-2" />Reset Password
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [])

  const moduleCount = PERMISSION_GROUPS.length
  const permCount   = ALL_PERMISSIONS.length
  const rolesCount  = roles?.length ?? 0
  const usersCount  = (profiles as Profile[] | undefined)?.length ?? 0

  return (
    <PermissionGate permission={['master_data.users.view', 'master_data.roles.view']}>
    <PageWrapper>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl 2xl:text-2xl font-semibold">Users &amp; Roles</h1>
            <p className="text-sm 2xl:text-base text-muted-foreground">
              {usersCount} users · {rolesCount} roles · {permCount} permissions
            </p>
          </div>
        </div>
        <div className="sm:w-64">
          <SearchInput value={roleSearch} onChange={setRoleSearch} placeholder="Search…" />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-6">
        <div className="flex justify-center">
          <TabsList className="h-10 bg-muted p-1 gap-1">
            <TabsTrigger
              value="permissions"
              className="gap-2 px-4 py-1.5 data-active:bg-primary data-active:text-primary-foreground data-active:shadow-sm"
            >
              Permissions
              <span className="inline-flex h-4 min-w-5 items-center justify-center rounded-full border border-border bg-white px-1.5 text-[10px] font-semibold text-foreground tabular-nums">
                {permCount}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="roles"
              className="gap-2 px-4 py-1.5 data-active:bg-primary data-active:text-primary-foreground data-active:shadow-sm"
            >
              Roles
              <span className="inline-flex h-4 min-w-5 items-center justify-center rounded-full border border-border bg-white px-1.5 text-[10px] font-semibold text-foreground tabular-nums">
                {rolesCount}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="users"
              className="gap-2 px-4 py-1.5 data-active:bg-primary data-active:text-primary-foreground data-active:shadow-sm"
            >
              Users
              <span className="inline-flex h-4 min-w-5 items-center justify-center rounded-full border border-border bg-white px-1.5 text-[10px] font-semibold text-foreground tabular-nums">
                {usersCount}
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Permissions tab ── */}
        <TabsContent value="permissions">
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {permCount} permissions across {moduleCount} modules. Permissions are assigned to roles, not directly to users.
              </p>
              <div className="flex gap-3 shrink-0">
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setExpandedModules(new Set(PERMISSION_GROUPS.map((g) => g.module)))}
                >
                  Expand All
                </button>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setExpandedModules(new Set())}
                >
                  Collapse All
                </button>
              </div>
            </div>

            <div className="border rounded-md divide-y divide-border">
              {PERMISSION_GROUPS.map((group) => {
                const isExpanded = expandedModules.has(group.module)
                const Icon = group.icon
                const allEntries = groupEntries(group)
                const matchesSearch = (label: string, key: string) =>
                  !permSearch ||
                  label.toLowerCase().includes(permSearch.toLowerCase()) ||
                  key.toLowerCase().includes(permSearch.toLowerCase())
                const filteredFlat = group.permissions.filter((p) => matchesSearch(p.label, p.key))
                const filteredSections = (group.sections ?? []).map((s) => ({
                  label: s.label,
                  permissions: s.permissions.filter((p) => matchesSearch(p.label, p.key)),
                })).filter((s) => s.permissions.length > 0)

                const totalVisible = filteredFlat.length + filteredSections.reduce((n, s) => n + s.permissions.length, 0)
                if (permSearch && totalVisible === 0) return null

                return (
                  <div key={group.module}>
                    <button
                      type="button"
                      className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-muted/40 text-left"
                      onClick={() => toggleModule(group.module)}
                    >
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      }
                      <Icon className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-semibold text-sm flex-1">{group.module}</span>
                      <Badge variant="outline" className="text-xs tabular-nums">{allEntries.length}</Badge>
                    </button>

                    {isExpanded && (
                      <div className="divide-y divide-border/50 bg-muted/10">
                        {filteredFlat.map((perm) => (
                          <div key={perm.key} className="flex items-start gap-3 px-6 py-2.5">
                            <Lock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-primary block">{perm.label}</span>
                              <span className="text-xs text-muted-foreground">{perm.description}</span>
                            </div>
                            <code className="text-xs text-muted-foreground font-mono shrink-0 hidden sm:block">
                              {perm.key}
                            </code>
                          </div>
                        ))}
                        {filteredSections.map((section) => (
                          <div key={section.label}>
                            <div className="px-6 py-1.5 bg-muted/40 border-y border-border/40">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {section.label}
                              </span>
                            </div>
                            {section.permissions.map((perm) => (
                              <div key={perm.key} className="flex items-start gap-3 px-6 py-2.5">
                                <Lock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-medium text-primary block">{perm.label}</span>
                                  <span className="text-xs text-muted-foreground">{perm.description}</span>
                                </div>
                                <code className="text-xs text-muted-foreground font-mono shrink-0 hidden sm:block">
                                  {perm.key}
                                </code>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </TabsContent>

        {/* ── Roles tab ── */}
        <TabsContent value="roles">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setRoleDialog({ open: true, role: null })}>
                + New Role
              </Button>
            </div>

            {loadingRoles ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1,2,3].map((i) => <div key={i} className="h-36 rounded-lg border border-border bg-muted/30 animate-pulse" />)}
              </div>
            ) : filteredRoles.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No roles found.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRoles.map((role) => (
                  <RoleCard
                    key={role.id}
                    role={role}
                    onEdit={() => setRoleDialog({ open: true, role })}
                    onDelete={() => setDeleteRoleTarget(role)}
                  />
                ))}
              </div>
            )}

            {/* Approval Chain Management */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 shrink-0">
                  <Shield className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Approval Chain Management</h3>
                  <p className="text-xs text-muted-foreground">
                    Configure which steps are active in each approval workflow.
                  </p>
                </div>
              </div>
              <ApprovalChainManagement />
            </div>
          </div>
        </TabsContent>

        {/* ── Users tab ── */}
        <TabsContent value="users">
          <div className="space-y-4">
            {!loadingMyProfile && !myProfile && (
              <div className="rounded-md border border-warning bg-warning/5 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">You don&apos;t have a profile yet</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Create your profile so you appear in the user list and can be assigned roles.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 sm:pl-7">
                  <Input placeholder="Your full name" value={myName} onChange={(e) => setMyName(e.target.value)} className="flex-1" />
                  <Button onClick={handleCreateMyProfile} disabled={createMyProfile.isPending}>
                    {createMyProfile.isPending ? 'Creating…' : 'Create My Profile'}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <SearchInput value={userSearch} onChange={setUserSearch} placeholder="Search users…" />
              <Button onClick={() => setAddOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />Add User
              </Button>
            </div>

            <DataTable
              columns={userColumns}
              data={(profiles as Profile[] | undefined) ?? []}
              isLoading={loadingProfiles}
              globalFilter={userSearch}
            />
          </div>
        </TabsContent>
      </Tabs>

      <RoleFormDialog
        open={roleDialog.open}
        onOpenChange={(open) => setRoleDialog((s) => ({ ...s, open }))}
        role={roleDialog.role}
      />
      <ConfirmDialog
        open={!!deleteRoleTarget}
        title="Delete role"
        description={`Delete "${deleteRoleTarget?.name}"? This cannot be undone. Users with this role will lose its permissions.`}
        confirmLabel="Delete"
        variant="destructive"
        isPending={deleteRole?.isPending ?? false}
        onConfirm={() => {
          if (!deleteRoleTarget) return
          deleteRole?.mutate(deleteRoleTarget.id, {
            onSuccess: () => { toast.success('Role deleted'); setDeleteRoleTarget(null) },
            onError: (err) => toast.error(err.message),
          })
        }}
        onOpenChange={(open) => { if (!open) setDeleteRoleTarget(null) }}
      />
      <AddUserDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditUserDialog
        open={editDialog.open}
        onOpenChange={(open) => setEditDialog((s) => ({ ...s, open }))}
        profile={editDialog.profile as (Profile & { user_custom_roles?: Array<{ role_id: string }> }) | null}
      />
      <ResetPasswordDialog
        open={resetDialog.open}
        onOpenChange={(open) => setResetDialog((s) => ({ ...s, open }))}
        profile={resetDialog.profile}
      />
    </PageWrapper>
    </PermissionGate>
  )
}
