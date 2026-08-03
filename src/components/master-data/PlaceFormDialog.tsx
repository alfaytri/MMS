'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { MapPin } from 'lucide-react'
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
import { useCreatePlace, useUpdatePlace, type PlaceRow } from '@/hooks/usePlaceSubContainers'

interface Props {
  open:         boolean
  onOpenChange: (open: boolean) => void
  place:        PlaceRow | null
}

/**
 * Create / edit dialog for a Place sub-container. Places represent
 * off-site custody locations: client sites (coded like F004), office
 * storage rooms, satellite locations. Name doubles as the site code —
 * a proper places metadata table is a follow-up.
 */
export function PlaceFormDialog({ open, onOpenChange, place }: Props) {
  const isEdit = !!place

  const { data: divisions = [] } = useDivisions()
  const { data: users = [] }     = useAllProfiles()
  const create = useCreatePlace()
  const update = useUpdatePlace()

  const [name, setName]                   = useState('')
  const [divisionId, setDivisionId]       = useState('')
  const [responsibleId, setResponsibleId] = useState<string>('')

  useEffect(() => {
    if (!open) return
    if (place) {
      setName(place.name)
      setDivisionId(place.division_id)
      setResponsibleId(place.responsible_person_profile_id ?? '')
    } else {
      setName('')
      setDivisionId(divisions.length === 1 ? divisions[0].id : '')
      setResponsibleId('')
    }
  }, [open, place, divisions])

  const canSubmit = name.trim().length > 0 && !!divisionId && !(create.isPending || update.isPending)

  function handleSubmit() {
    const responsible = responsibleId ? responsibleId : null
    if (isEdit && place) {
      update.mutate(
        {
          id: place.id,
          name: name.trim(),
          division_id: divisionId,
          responsible_person_profile_id: responsible,
        },
        {
          onSuccess: () => { toast.success('Place updated'); onOpenChange(false) },
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
          onSuccess: () => { toast.success('Place created'); onOpenChange(false) },
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
              <MapPin className="h-4 w-4 text-primary" />
              {isEdit ? 'Edit place' : 'New place'}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Off-site custody locations: client sites (coded like F004), office storage rooms, satellite spots. Each place is scoped to one division.
            </p>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-5 overflow-y-auto sm:flex-1 sm:min-h-0">
          <div className="space-y-2">
            <Label htmlFor="place-name">Place code / name *</Label>
            <Input
              id="place-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. F004, OFFICE-01, SITE-Q-115"
              className="w-full h-10"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              Short code used as the identifier. Displayed everywhere the place appears.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="place-division">Division *</Label>
            <Select value={divisionId} onValueChange={(v) => v && setDivisionId(v)}>
              <SelectTrigger id="place-division" className="w-full h-10">
                <SelectValue placeholder="Pick division" />
              </SelectTrigger>
              <SelectContent>
                {divisions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Place stock is bookkept under this division.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="place-responsible">Responsible person</Label>
            <Select
              value={responsibleId || 'none'}
              onValueChange={(v) => setResponsibleId(v === 'none' ? '' : v)}
            >
              <SelectTrigger id="place-responsible" className="w-full h-10">
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
              Physical custodian of this place&apos;s stock. Accepts inbound custody assigns and initiates returns.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 border-t bg-background px-6 py-5 gap-3 sm:justify-end sm:space-x-0">
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)} disabled={create.isPending || update.isPending}>
            Cancel
          </Button>
          <Button size="lg" onClick={handleSubmit} disabled={!canSubmit}>
            {(create.isPending || update.isPending) ? 'Saving…' : (isEdit ? 'Save changes' : 'Create place')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
