'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { useCreateVehicle, useUpdateVehicle, useArchiveVehicle } from '@/hooks/useTeams'
import { useTeamsPage } from '../TeamsPageContext'

interface VehicleFormValues {
  type:              string
  plate:             string
  traccar_device_id: string
}

const VEHICLE_TYPES = ['car', 'van', 'truck', 'pickup', 'motorcycle']

export function VehicleEditDialog() {
  const { vehicleDialog, closeVehicleDialog } = useTeamsPage()
  const { open, vehicle } = vehicleDialog
  const isEdit = !!vehicle

  const createVehicle  = useCreateVehicle()
  const updateVehicle  = useUpdateVehicle()
  const archiveVehicle = useArchiveVehicle()

  const [plateError,       setPlateError]     = useState<string | null>(null)
  const [isValidatingPlate, setIsValidating]  = useState(false) // Errata 5

  const form = useForm<VehicleFormValues>({
    defaultValues: { type: 'car', plate: '', traccar_device_id: '' },
  })

  useEffect(() => {
    if (!open) return
    setPlateError(null)
    setIsValidating(false)
    const traccarId = (vehicle as Record<string, unknown> | null)?.traccar_device_id as string | null
    form.reset(
      vehicle
        ? { type: vehicle.type ?? 'car', plate: vehicle.plate ?? '', traccar_device_id: traccarId ?? '' }
        : { type: 'car', plate: '', traccar_device_id: '' }
    )
  }, [vehicle, open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Returns true if plate is available, false if already in use.
  async function validatePlate(plate: string): Promise<boolean> {
    if (!plate) return true
    setIsValidating(true)
    setPlateError(null)
    try {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (supabase.from('vehicles') as any)
        .select('id', { count: 'exact', head: true })
        .eq('plate', plate)
        .is('deleted_at', null)
        .neq('id', vehicle?.id ?? '00000000-0000-0000-0000-000000000000')
      if ((count ?? 0) > 0) {
        setPlateError('Plate already in use')
        return false
      }
      return true
    } finally {
      setIsValidating(false)
    }
  }

  async function onSubmit(values: VehicleFormValues) {
    // Always validate on submit — handles the case where the user clicks Save
    // without tabbing away from the plate field first (blur never fired).
    const valid = await validatePlate(values.plate)
    if (!valid) return

    const payload = {
      type:              values.type,
      plate:             values.plate,
      traccar_device_id: values.traccar_device_id || null,
    }
    if (isEdit) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateVehicle.mutateAsync({ id: vehicle!.id, before: vehicle as unknown as Record<string, unknown>, ...payload } as any)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await createVehicle.mutateAsync(payload as any)
    }
    closeVehicleDialog()
  }

  const isMutating = createVehicle.isPending || updateVehicle.isPending

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) closeVehicleDialog() }}>
      <DialogContent className="w-full max-w-md rounded-none md:rounded-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Vehicle' : 'New Vehicle'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            {/* Vehicle type */}
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {VEHICLE_TYPES.map(t => (
                        <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            {/* Plate number with async uniqueness validation */}
            <FormField
              control={form.control}
              name="plate"
              rules={{ required: 'Required' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plate Number</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      className={plateError ? 'border-destructive' : ''}
                    />
                  </FormControl>
                  {isValidatingPlate && (
                    <p className="text-xs text-muted-foreground">Checking plate...</p>
                  )}
                  {plateError && (
                    <p className="text-sm text-destructive">{plateError}</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Traccar device ID */}
            <FormField
              control={form.control}
              name="traccar_device_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Traccar Device ID</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                </FormItem>
              )}
            />

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={closeVehicleDialog}>
                Cancel
              </Button>
              {isEdit && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={archiveVehicle.isPending}
                  onClick={async () => {
                    await archiveVehicle.mutateAsync(vehicle!.id)
                    closeVehicleDialog()
                  }}
                >
                  Archive
                </Button>
              )}
              <Button
                type="submit"
                disabled={isMutating || isValidatingPlate}
              >
                {isValidatingPlate ? 'Checking...' : isMutating ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
