// src/components/purchase/ApprovalRoleAssignmentsTab.tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  useApprovalRoleAssignments,
  useAddApprovalRoleAssignment,
  useSoftDeleteApprovalRoleAssignment,
} from '@/hooks/useApprovalRoleAssignments'
import { useAllProfiles, profileDisplayName } from '@/hooks/useProfiles'
import type { ApprovalRole } from '@/lib/approvalChainResolution'

const APPROVAL_ROLES: ApprovalRole[] = ['purchase_manager', 'accountant', 'owner']
const ROLE_LABELS: Record<ApprovalRole, string> = {
  purchase_manager: 'Purchase Manager',
  accountant: 'Accountant',
  owner: 'Owner',
}

export function ApprovalRoleAssignmentsTab() {
  const { data: assignments = [], isLoading } = useApprovalRoleAssignments()
  const { data: profiles = [] } = useAllProfiles()
  const addAssignment = useAddApprovalRoleAssignment()
  const removeAssignment = useSoftDeleteApprovalRoleAssignment()

  const [form, setForm] = useState({ profile_id: '', role: '' as ApprovalRole | '' })
  const [showForm, setShowForm] = useState(false)

  function handleAdd() {
    if (!form.profile_id || !form.role) { toast.error('Select a user and a role'); return }
    addAssignment.mutate(
      { profile_id: form.profile_id, role: form.role as ApprovalRole, division_id: null },
      {
        onSuccess: () => { setForm({ profile_id: '', role: '' }); setShowForm(false); toast.success('Role assigned') },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading…</div>

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1" /> Assign Role
        </Button>
      </div>

      {showForm && (
        <div className="rounded-md border p-3 space-y-3 bg-muted/30">
          <p className="text-sm font-medium">New Role Assignment</p>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">User</label>
              <Select value={form.profile_id} onValueChange={(v) => setForm((f) => ({ ...f, profile_id: v ?? '' }))}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Select user…" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{profileDisplayName(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Role</label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as ApprovalRole }))}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select role…" />
                </SelectTrigger>
                <SelectContent>
                  {APPROVAL_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={handleAdd} disabled={addAssignment.isPending}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground h-16 text-sm">
                  No role assignments yet
                </TableCell>
              </TableRow>
            ) : (
              assignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.profiles ? profileDisplayName(a.profiles) : '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{ROLE_LABELS[a.role as ApprovalRole] ?? a.role}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.division_id ? 'Division-specific' : 'Company-wide'}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => removeAssignment.mutate(a.id, { onError: (e) => toast.error(e.message) })}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
