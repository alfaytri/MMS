'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Shield } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { RoleFormDialog } from '@/components/master-data/RoleFormDialog'
import { UserRoleDialog } from '@/components/master-data/UserRoleDialog'
import { useRoles, type CustomRole } from '@/hooks/useRoles'
import { useProfiles, type Profile } from '@/hooks/useProfiles'
import { PERMISSION_GROUPS } from '@/lib/permissions'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export default function UsersRolesPage() {
  const [activeTab, setActiveTab] = useState('permissions')
  const [roleSearch, setRoleSearch] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [roleDialog, setRoleDialog] = useState<{ open: boolean; role: CustomRole | null }>({ open: false, role: null })
  const [userRoleDialog, setUserRoleDialog] = useState<{ open: boolean; profile: Profile | null }>({ open: false, profile: null })

  const { data: roles, isLoading: loadingRoles } = useRoles()
  const { data: profiles, isLoading: loadingProfiles } = useProfiles()

  const roleColumns = useMemo<ColumnDef<CustomRole>[]>(() => [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Role" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="font-medium">{row.getValue('name')}</span>
        </div>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => row.getValue('description') || <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'permissions',
      header: 'Permissions',
      cell: ({ row }) => {
        const perms = row.getValue('permissions') as string[]
        return <Badge variant="outline">{perms?.length ?? 0} permissions</Badge>
      },
    },
    {
      accessorKey: 'is_system',
      header: 'Type',
      cell: ({ row }) => row.getValue('is_system') ? <Badge>System</Badge> : <Badge variant="outline">Custom</Badge>,
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
              <DropdownMenuItem onClick={() => setRoleDialog({ open: true, role: row.original })} disabled={!!row.original.is_system}>
                <Shield className="h-4 w-4 mr-2" />Edit
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [])

  const userColumns = useMemo<ColumnDef<Profile>[]>(() => [
    {
      accessorKey: 'full_name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue('full_name')}</span>,
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => row.getValue('email') || <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'user_type',
      header: 'Type',
      cell: ({ row }) => <Badge variant="outline">{row.getValue('user_type') as string}</Badge>,
    },
    {
      id: 'roles',
      header: 'Roles',
      cell: ({ row }) => {
        const userRoles = (row.original as Profile & { user_custom_roles?: Array<{ custom_roles: { name: string } | null }> }).user_custom_roles
        if (!userRoles?.length) return <span className="text-muted-foreground">None</span>
        return (
          <div className="flex gap-1 flex-wrap">
            {userRoles.slice(0, 2).map((ur, i) => (
              <Badge key={i} variant="outline" className="text-xs">{ur.custom_roles?.name}</Badge>
            ))}
            {userRoles.length > 2 && <Badge variant="outline" className="text-xs">+{userRoles.length - 2}</Badge>}
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
              <DropdownMenuItem onClick={() => setUserRoleDialog({ open: true, profile: row.original })}>
                <Shield className="h-4 w-4 mr-2" />Manage Roles
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [])

  return (
    <div className="space-y-6">
      <PageHeader title="Users & Roles" description="Manage user accounts, roles, and permissions" />
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>

        <TabsContent value="permissions">
          <div className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">Read-only registry of all permission keys grouped by module.</p>
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.module} className="border rounded-md p-4">
                <h3 className="text-sm font-semibold mb-2">{group.module}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {group.keys.map((key) => (
                    <Badge key={key} variant="outline" className="text-xs font-mono">{key}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="roles">
          <div className="space-y-4 mt-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <SearchInput value={roleSearch} onChange={setRoleSearch} placeholder="Search roles…" />
              <Button onClick={() => setRoleDialog({ open: true, role: null })}>Create Role</Button>
            </div>
            <DataTable columns={roleColumns} data={roles ?? []} isLoading={loadingRoles} globalFilter={roleSearch} />
          </div>
        </TabsContent>

        <TabsContent value="users">
          <div className="space-y-4 mt-4">
            <SearchInput value={userSearch} onChange={setUserSearch} placeholder="Search users…" />
            <DataTable columns={userColumns} data={(profiles as Profile[] | undefined) ?? []} isLoading={loadingProfiles} globalFilter={userSearch} />
          </div>
        </TabsContent>
      </Tabs>

      <RoleFormDialog open={roleDialog.open} onOpenChange={(open) => setRoleDialog((s) => ({ ...s, open }))} role={roleDialog.role} />
      <UserRoleDialog open={userRoleDialog.open} onOpenChange={(open) => setUserRoleDialog((s) => ({ ...s, open }))} profile={userRoleDialog.profile} />
    </div>
  )
}
