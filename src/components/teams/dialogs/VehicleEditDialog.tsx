'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Truck } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useCreateVehicle, useUpdateVehicle, useArchiveVehicle } from '@/hooks/useTeams'
import { useTeamsPage } from '../TeamsPageContext'
import { useTraccarDevices } from '@/hooks/useTraccar'

interface VehicleFormValues {
  name:              string
  type:              string
  plate:             string
  traccar_device_id: string
}

const VEHICLE_TYPES = [
  { value: 'car',        label: 'Car'        },
  { value: 'van',        label: 'Van'        },
  { value: 'truck',      label: 'Truck'      },
  { value: 'pickup',     label: 'Pickup'     },
  { value: 'motorcycle', label: 'Motorcycle' },
]

export function VehicleEditDialog() {
  const { vehicleDialog, closeVehicleDialog } = useTeamsPage()
  const { open, vehicle } = vehicleDialog
  const isEdit = !!vehicle

  const createVehicle  = useCreateVehicle()
  const updateVehicle  = useUpdateVehicle()
  const archiveVehicle = useArchiveVehicle()

  const { data: traccarDevices = [], isLoading: isLoadingDevices } = useTraccarDevices()
  const [traccarError, setTraccarError] = useState<string | null>(null)

  const [plateError,       setPlateError]     = useState<string | null>(null)
  const [isValidatingPlate, setIsValidating]  = useState(false)

  const form = useForm<VehicleFormValues>({
    defaultValues: { name: '', type: 'car', plate: '', traccar_device_id: '' },
  })

  useEffect(() => {
    if (!open) return
    setPlateError(null)
    setTraccarError(null)
    setIsValidating(false)
    const traccarId = (vehicle as Record<string, unknown> | null)?.traccar_device_id as string | null
    form.reset(
      vehicle
        ? { name: vehicle.name ?? '', type: vehicle.type ?? 'car', plate: vehicle.plate ?? '', traccar_device_id: traccarId ?? '' }
        : { name: '', type: 'car', plate: '', traccar_device_id: '' }
    )
  }, [vehicle, open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function validatePlate(plate: string): Promise<boolean> {
    if (!plate) return true
    setIsValidating(true)
    setPlateError(null)
    try {
      const supabase = createClient()
      const { count } = await supabase.from('vehicles')
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
    const valid = await validatePlate(values.plate)
    if (!valid) return

    if (values.traccar_device_id) {
      const supabase = createClient()
      const { count } = await supabase.from('vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('traccar_device_id', values.traccar_device_id)
        .is('deleted_at', null)
        .neq('id', vehicle?.id ?? '00000000-0000-0000-0000-000000000000')
      if ((count ?? 0) > 0) {
        setTraccarError('This device is already linked to another vehicle')
        return
      }
      setTraccarError(null)
    }

    const payload = {
      name:              values.name || null,
      type:              values.type,
      plate:             values.plate,
      traccar_device_id: values.traccar_device_id || null,
    }
    if (isEdit) {
      await updateVehicle.mutateAsync({ id: vehicle!.id, before: vehicle as Record<string, unknown>, ...payload })
    } else {
      await createVehicle.mutateAsync(payload)
    }
    closeVehicleDialog()
  }

  const isMutating = createVehicle.isPending || updateVehicle.isPending

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) closeVehicleDialog() }}>
      <DialogContent className="w-full max-w-lg rounded-none md:rounded-xl p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center">
              <Truck className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {isEdit ? 'Edit vehicle' : 'New vehicle'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {isEdit ? 'Update vehicle details and tracking link.' : 'Add a vehicle to your fleet.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            {/* Body */}
            <div className="px-6 py-4 space-y-5 border-t border-border/60">
              {/* Identity section */}
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-muted-foreground">Name <span className="text-muted-foreground/60">(optional)</span></FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Mohamed's Van" className="h-9" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="plate"
                  rules={{ required: 'Required' }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-muted-foreground">Plate number</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="QA 1234"
                          className={cn('h-9 font-mono uppercase tracking-wide', plateError && 'border-destructive')}
                        />
                      </FormControl>
                      {isValidatingPlate && (
                        <p className="text-[11px] text-muted-foreground">Checking plate…</p>
                      )}
                      {plateError && (
                        <p className="text-xs text-destructive">{plateError}</p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Type as chip selector */}
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-muted-foreground">Type</FormLabel>
                      <div className="flex flex-wrap gap-1.5">
                        {VEHICLE_TYPES.map(t => (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => field.onChange(t.value)}
                            className={cn(
                              'h-8 px-3 rounded-full text-xs border transition-colors',
                              field.value === t.value
                                ? 'bg-foreground text-background border-foreground'
                                : 'bg-background border-border text-muted-foreground hover:text-foreground hover:bg-muted/40',
                            )}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              {/* Tracking section */}
              <div className="pt-4 border-t border-border/60 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tracking</p>
                <FormField
                  control={form.control}
                  name="traccar_device_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-muted-foreground">Traccar device <span className="text-muted-foreground/60">(optional)</span></FormLabel>
                      <Select
                        value={field.value || '__none__'}
                        onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                      >
                        <FormControl>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="No device linked" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-60 overflow-y-auto" sideOffset={4}>
                          <SelectItem value="__none__">No device linked</SelectItem>
                          {traccarDevices.map(d => (
                            <SelectItem key={d.id} value={String(d.id)}>
                              {d.name} — {d.uniqueId}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isLoadingDevices && (
                        <p className="text-[11px] text-muted-foreground">Loading devices…</p>
                      )}
                      {traccarError && (
                        <p className="text-xs text-destructive">{traccarError}</p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 px-6 py-3 border-t border-border/60 bg-muted/20">
              <div>
                {isEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={archiveVehicle.isPending}
                    onClick={async () => {
                      await archiveVehicle.mutateAsync(vehicle!.id)
                      closeVehicleDialog()
                    }}
                  >
                    Archive
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={closeVehicleDialog}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isMutating || isValidatingPlate}
                >
                  {isValidatingPlate ? 'Checking…' : isMutating ? 'Saving…' : isEdit ? 'Save changes' : 'Create vehicle'}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
