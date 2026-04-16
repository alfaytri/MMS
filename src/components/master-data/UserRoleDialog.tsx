'use client'

import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { useRoles, useUserRoles, useAssignRole, useRemoveRole } from '@/hooks/useRoles'
import { useDivisions } from '@/hooks/useDivisions'
import { useUserDivisions, useAssignDivision, useRemoveDivision, type Profile } from '@/hooks/useProfiles'

interface UserRoleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: Profile | null
}

export function UserRoleDialog({ open, onOpenChange, profile }: UserRoleDialogProps) {
  const { data: allRoles } = useRoles()
  const { data: allDivisions } = useDivisions()
  const { data: userRoles, isLoading: loadingRoles } = useUserRoles(profile?.id ?? null)
  const { data: userDivisions, isLoading: loadingDivisions } = useUserDivisions(profile?.id ?? null)

  const assignRole = useAssignRole()
  const removeRole = useRemoveRole()
  const assignDivision = useAssignDivision()
  const removeDivision = useRemoveDivision()

  if (!profile) return null

  const assignedRoleIds = new Set(userRoles?.map((ur) => ur.role_id) ?? [])
  const assignedDivisionIds = new Set(userDivisions?.map((ud) => ud.division_id) ?? [])

  function handleToggleRole(roleId: string) {
    const existing = userRoles?.find((ur) => ur.role_id === roleId)
    if (existing) {
      removeRole.mutate({ id: existing.id, profileId: profile!.id }, { onError: (err) => toast.error(err.message) })
    } else {
      assignRole.mutate({ profile_id: profile!.id, role_id: roleId }, { onError: (err) => toast.error(err.message) })
    }
  }

  function handleToggleDivision(divisionId: string) {
    const existing = userDivisions?.find((ud) => ud.division_id === divisionId)
    if (existing) {
      removeDivision.mutate({ id: existing.id, profileId: profile!.id }, { onError: (err) => toast.error(err.message) })
    } else {
      assignDivision.mutate({ profile_id: profile!.id, division_id: divisionId }, { onError: (err) => toast.error(err.message) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage User: {profile.full_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-medium mb-2">Roles</h3>
            {loadingRoles ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className="space-y-1 border rounded-md p-3 max-h-48 overflow-y-auto">
                {allRoles?.map((role) => (
                  <label key={role.id} className="flex items-center gap-2 text-sm py-1 px-1 rounded hover:bg-muted cursor-pointer min-h-[44px] sm:min-h-0">
                    <Checkbox checked={assignedRoleIds.has(role.id)} onCheckedChange={() => handleToggleRole(role.id)} />
                    <span>{role.name}</span>
                    {role.description && <span className="text-muted-foreground text-xs">— {role.description}</span>}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div>
            <h3 className="text-sm font-medium mb-2">Divisions</h3>
            {loadingDivisions ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className="space-y-1 border rounded-md p-3">
                {allDivisions?.map((div) => (
                  <label key={div.id} className="flex items-center gap-2 text-sm py-1 px-1 rounded hover:bg-muted cursor-pointer min-h-[44px] sm:min-h-0">
                    <Checkbox checked={assignedDivisionIds.has(div.id)} onCheckedChange={() => handleToggleDivision(div.id)} />
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: div.color }} />
                    <span>{div.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
