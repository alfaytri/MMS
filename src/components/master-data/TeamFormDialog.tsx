'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Users2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useDivisions } from '@/hooks/useDivisions'
import { useAllProfiles } from '@/hooks/useProfiles'
import { useCreateTeam, useUpdateTeam, type TeamRow } from '@/hooks/useTeamSubContainers'

interface Props {
  open:         boolean
  onOpenChange: (open: boolean) => void
  team:         TeamRow | null
}

/**
 * Create / edit dialog for a Team sub-container. The sub-container's
 * `name` doubles as the team name (link to the future teams table lives
 * on the `team_id` column, unused for now).
 */
export function TeamFormDialog({ open, onOpenChange, team }: Props) {
  const isEdit = !!team

  const { data: divisions = [] } = useDivisions()
  const { data: users = [] }     = useAllProfiles()
  const create = useCreateTeam()
  const update = useUpdateTeam()

  const [name, setName]             = useState('')
  const [divisionId, setDivisionId] = useState('')
  // '' sentinel = no responsible person; any uuid = assigned.
  const [responsibleId, setResponsibleId] = useState<string>('')

  useEffect(() => {
    if (!open) return
    if (team) {
      setName(team.name)
      setDivisionId(team.division_id)
      setResponsibleId(team.responsible_person_profile_id ?? '')
    } else {
      setName('')
      setDivisionId(divisions.length === 1 ? divisions[0].id : '')
      setResponsibleId('')
    }
  }, [open, team, divisions])

  const canSubmit = name.trim().length > 0 && !!divisionId && !(create.isPending || update.isPending)

  function handleSubmit() {
    const responsible = responsibleId ? responsibleId : null
    if (isEdit && team) {
      update.mutate(
        {
          id: team.id,
          name: name.trim(),
          division_id: divisionId,
          responsible_person_profile_id: responsible,
        },
        {
          onSuccess: () => { toast.success('Team updated'); onOpenChange(false) },
          onError:   (err) => toast.error(err.message),
        },
      )
    } else {
      create.mutate(
        {
          name: name.trim(),
          division_id: divisionId,
          responsible_person_profile_id: responsible,
        },
        {
          onSuccess: () => { toast.success('Team created'); onOpenChange(false) },
          onError:   (err) => toast.error(err.message),
        },
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full rounded-none sm:w-auto sm:h-auto sm:max-w-md sm:rounded-lg p-0 gap-0 flex flex-col sm:max-h-[90vh] overflow-hidden">
        <div className="px-6 pt-6 pb-2 flex-shrink-0">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <Users2 className="h-4 w-4 text-primary" />
              {isEdit ? 'Edit team' : 'New team'}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Teams hold stock assigned out of the warehouse. Each team is scoped to one division.
            </p>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-5 overflow-y-auto sm:flex-1 sm:min-h-0">
          <div className="space-y-2">
            <Label htmlFor="team-name">Team name *</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Team 1, Van 2, Kitchen Crew A"
              className="w-full h-10"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="team-division">Division *</Label>
            <Select value={divisionId} onValueChange={(v) => v && setDivisionId(v)}>
              <SelectTrigger id="team-division" className="w-full h-10">
                <SelectValue placeholder="Pick division" />
              </SelectTrigger>
              <SelectContent>
                {divisions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Team stock is bookkept under this division. Later this will link to a real teams table.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="team-responsible">Responsible person</Label>
            <Select
              value={responsibleId || 'none'}
              onValueChange={(v) => setResponsibleId(v === 'none' ? '' : v)}
            >
              <SelectTrigger id="team-responsible" className="w-full h-10">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="none">Unassigned</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name?.trim() || u.email || 'Unnamed user'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Physical custodian of this team&apos;s stock. Accepts inbound custody assigns and initiates returns.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 border-t bg-background px-6 py-5 gap-3 sm:justify-end sm:space-x-0">
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)} disabled={create.isPending || update.isPending}>
            Cancel
          </Button>
          <Button size="lg" onClick={handleSubmit} disabled={!canSubmit}>
            {(create.isPending || update.isPending) ? 'Saving…' : (isEdit ? 'Save changes' : 'Create team')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
