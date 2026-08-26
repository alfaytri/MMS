'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AddressFinder, type AddressValue } from '@/components/shared/AddressFinder'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import {
  GuardedFormDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { useCreateWarehouse, useUpdateWarehouse, type Warehouse, type WarehouseInsert, type WarehouseUpdate } from '@/hooks/useWarehouses'
import {
  useResponsiblePersonCandidates,
  useWarehouseResponsiblePersons,
  useReplaceWarehouseResponsiblePersons,
} from '@/hooks/useWarehouseResponsiblePersons'
import { useCompanies } from '@/hooks/useCompanies'

const WAREHOUSE_KINDS = [
  { value: 'general', label: 'Physical stock', hint: 'A real warehouse that holds stock — receivals, transfers, sales.' },
  { value: 'custody', label: 'Custody',        hint: 'Virtual — holds custody locations (teams, projects, sites) as sub-containers.' },
  { value: 'repair',  label: 'Repair',         hint: 'Virtual — repair vendors as sub-containers; the send-for-repair target.' },
] as const

const warehouseSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    warehouse_kind: z.enum(['general', 'custody', 'repair']),
    location: z.string().optional(),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    company_id: z.string().optional(),
    can_transfer_custody: z.boolean().optional(),
  })
  .refine((v) => v.warehouse_kind !== 'general' || !!v.company_id, {
    message: 'Company is required',
    path: ['company_id'],
  })

type WarehouseFormValues = z.infer<typeof warehouseSchema>

interface WarehouseFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  warehouse?: Warehouse | null
}

export function WarehouseFormDialog({ open, onOpenChange, warehouse }: WarehouseFormDialogProps) {
  const isEditing = !!warehouse
  const create = useCreateWarehouse()
  const update = useUpdateWarehouse()
  const { data: rpCandidates = [] } = useResponsiblePersonCandidates()
  const { data: currentRPs = [] } = useWarehouseResponsiblePersons(warehouse?.id ?? null)
  const replaceRPs = useReplaceWarehouseResponsiblePersons()
  const { data: companies = [] } = useCompanies()
  const isPending = create.isPending || update.isPending || replaceRPs.isPending

  const [selectedRPIds, setSelectedRPIds] = useState<string[]>([])
  const [rpPopoverOpen, setRpPopoverOpen] = useState(false)
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  const form = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: { name: '', warehouse_kind: 'general', location: '', latitude: null, longitude: null, company_id: '', can_transfer_custody: false },
  })
  const kind = form.watch('warehouse_kind')
  const isVirtual = kind !== 'general'

  useEffect(() => {
    if (!open) return
    if (warehouse) {
      form.reset({
        name: warehouse.name,
        warehouse_kind: (warehouse.warehouse_kind as 'general' | 'custody' | 'repair') ?? 'general',
        location: warehouse.location ?? '',
        latitude: warehouse.latitude ?? null,
        longitude: warehouse.longitude ?? null,
        company_id: warehouse.company_id ?? '',
        can_transfer_custody: warehouse.can_transfer_custody ?? false,
      })
    } else {
      const defaultCompany = companies.length === 1 ? companies[0].id : ''
      form.reset({
        name: '',
        warehouse_kind: 'general',
        location: '',
        latitude: null,
        longitude: null,
        company_id: defaultCompany,
        can_transfer_custody: false,
      })
    }
    setSelectedRPIds([])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, warehouse?.id, form, companies])

  useEffect(() => {
    if (open && warehouse && currentRPs.length > 0) {
      setSelectedRPIds(currentRPs.map((rp) => rp.profile_id))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, warehouse?.id, currentRPs])

  // RP-list dirty check — form.formState.isDirty alone won't catch RP-only edits.
  const initialRPIds = useMemo(
    () => (warehouse ? currentRPs.map((rp) => rp.profile_id) : []),
    [warehouse, currentRPs]
  )
  const rpsDirty = useMemo(() => {
    if (selectedRPIds.length !== initialRPIds.length) return true
    const a = [...selectedRPIds].sort()
    const b = [...initialRPIds].sort()
    return a.some((id, i) => id !== b[i])
  }, [selectedRPIds, initialRPIds])

  async function onSubmit(values: WarehouseFormValues) {
    try {
      const virtual = values.warehouse_kind !== 'general'
      const companyId = virtual ? null : (values.company_id || null)
      const location  = virtual ? null : (values.location || null)
      // Virtual warehouses have no physical location → no coordinates either.
      const latitude  = virtual ? null : (values.latitude ?? null)
      const longitude = virtual ? null : (values.longitude ?? null)
      // Only meaningful on custody warehouses; forced false everywhere else.
      const canTransferCustody = values.warehouse_kind === 'custody' ? !!values.can_transfer_custody : false
      let whId: string
      if (isEditing && warehouse) {
        // warehouse_kind is fixed at creation — an edit must never reclassify a
        // warehouse that already holds stock / sub-containers.
        await update.mutateAsync({
          id: warehouse.id,
          name: values.name,
          location,
          latitude,
          longitude,
          company_id: companyId,
          can_transfer_custody: canTransferCustody,
        } as WarehouseUpdate & { id: string })
        whId = warehouse.id
      } else {
        const created = await create.mutateAsync({
          name: values.name,
          warehouse_kind: values.warehouse_kind,
          is_virtual: virtual,
          location,
          latitude,
          longitude,
          company_id: companyId,
          can_transfer_custody: canTransferCustody,
        } as WarehouseInsert)
        whId = created.id
      }
      await replaceRPs.mutateAsync({ warehouseId: whId, profileIds: virtual ? [] : selectedRPIds })
      toast.success(warehouse ? 'Warehouse updated' : 'Warehouse created')
      guardRef.current?.closeAfterSubmit()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <GuardedFormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      extraDirty={rpsDirty}
      ref={guardRef}
    >
      <DialogContent className="w-full sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Warehouse</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-4 py-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Main Warehouse" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="warehouse_kind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={isEditing}>
                      <FormControl>
                        <SelectTrigger className="w-full h-9">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {WAREHOUSE_KINDS.map((k) => (
                          <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      {WAREHOUSE_KINDS.find((k) => k.value === field.value)?.hint}
                      {isEditing ? ' Type is fixed after creation.' : ''}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {kind === 'custody' && (
                <FormField
                  control={form.control}
                  name="can_transfer_custody"
                  render={({ field }) => (
                    <FormItem className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <FormLabel className="text-sm">Can hand out stock to other custody locations</FormLabel>
                          <p className="text-[10px] text-muted-foreground">
                            When on, every location in this warehouse gets a Transfer button on the Custody
                            page to send stock to another custody location. Leave off for team warehouses
                            that should only receive.
                          </p>
                        </div>
                        <FormControl>
                          <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </div>
                    </FormItem>
                  )}
                />
              )}
              {!isVirtual ? (
              <>
              <FormField
                control={form.control}
                name="company_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company *</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={companies.length <= 1}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full h-9">
                          <SelectValue placeholder="Select company" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {companies.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name_en}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      Divisions are now managed per sub-container, not on the warehouse.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {/* Plain Label (not FormLabel) — AddressFinder isn't a single RHF
                  field, and FormLabel's useFormField() throws outside a FormField. */}
              <div className="space-y-2">
                <Label>Location (Blue Plate / coordinates)</Label>
                <AddressFinder
                  key={warehouse?.id ?? 'new'}
                  value={{
                    address: form.watch('location') ?? '',
                    latitude: form.watch('latitude') ?? null,
                    longitude: form.watch('longitude') ?? null,
                  }}
                  onChange={(v: AddressValue) => {
                    form.setValue('location', v.address, { shouldDirty: true })
                    form.setValue('latitude', v.latitude, { shouldDirty: true })
                    form.setValue('longitude', v.longitude, { shouldDirty: true })
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  Warehouse RPs
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-muted-foreground cursor-help text-[10px] border-b border-dashed border-muted-foreground/40">(RP)</span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs">
                          Responsible Persons — users who physically manage this warehouse
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                {rpCandidates.length === 0 ? (
                  <p className="text-xs text-muted-foreground border rounded-md py-3 text-center">
                    No users with Warehouse RP role found. Assign the role in User Management first.
                  </p>
                ) : (
                  <>
                    <Popover open={rpPopoverOpen} onOpenChange={setRpPopoverOpen}>
                      <PopoverTrigger className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background hover:bg-accent/50 cursor-pointer">
                        <span className="text-muted-foreground truncate">
                          {selectedRPIds.length === 0
                            ? 'Select Warehouse RPs...'
                            : `${selectedRPIds.length} selected`}
                        </span>
                        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                      </PopoverTrigger>
                      <PopoverContent className="w-[var(--trigger-width)] p-1" align="start">
                        <div className="max-h-[180px] overflow-y-auto space-y-0.5">
                          {rpCandidates.map((c) => {
                            const checked = selectedRPIds.includes(c.profile_id)
                            return (
                              <button
                                key={c.profile_id}
                                type="button"
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent cursor-pointer"
                                onClick={() => {
                                  setSelectedRPIds((prev) =>
                                    checked
                                      ? prev.filter((id) => id !== c.profile_id)
                                      : [...prev, c.profile_id]
                                  )
                                }}
                              >
                                <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${checked ? 'bg-primary border-primary text-primary-foreground' : 'border-input'}`}>
                                  {checked && <Check className="h-3 w-3" />}
                                </div>
                                {c.full_name ?? 'Unnamed'}
                              </button>
                            )
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>
                    {selectedRPIds.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {selectedRPIds.map((id) => {
                          const name =
                            rpCandidates.find((c) => c.profile_id === id)?.full_name ?? 'Unnamed'
                          return (
                            <Badge key={id} variant="secondary" className="text-[10px] gap-1 pr-1">
                              {name}
                              <button
                                type="button"
                                className="hover:bg-muted rounded-full p-0.5 cursor-pointer"
                                onClick={() =>
                                  setSelectedRPIds((prev) => prev.filter((pid) => pid !== id))
                                }
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </Badge>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
              </>
              ) : (
                <div className="rounded-md border bg-muted/30 px-3 py-3 text-[11px] text-muted-foreground">
                  Virtual warehouse — no company, location, or warehouse RPs. Its members are
                  managed as sub-containers (custody locations / repair vendors) inside it.
                </div>
              )}
            </div>

            <DialogFooter className="pt-4 border-t mt-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => guardRef.current?.requestClose()}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving…' : isEditing ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </GuardedFormDialog>
  )
}
