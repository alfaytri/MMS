'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog,
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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { useCreateWarehouse, useUpdateWarehouse, type Warehouse } from '@/hooks/useWarehouses'
import { useFieldRPCandidates, useWarehouseFieldRPs, useReplaceWarehouseFieldRPs } from '@/hooks/useWarehouseFieldRPs'

const warehouseSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  location: z.string().optional(),
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
  const { data: rpCandidates = [] } = useFieldRPCandidates()
  const { data: currentRPs = [] } = useWarehouseFieldRPs(warehouse?.id ?? null)
  const replaceRPs = useReplaceWarehouseFieldRPs()
  const isPending = create.isPending || update.isPending || replaceRPs.isPending

  const [selectedRPIds, setSelectedRPIds] = useState<string[]>([])
  const [rpPopoverOpen, setRpPopoverOpen] = useState(false)

  const form = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: { name: '', location: '' },
  })

  // Reset everything when dialog opens or warehouse changes
  useEffect(() => {
    if (!open) return
    if (warehouse) {
      form.reset({ name: warehouse.name, location: warehouse.location ?? '' })
    } else {
      form.reset({ name: '', location: '' })
    }
    setSelectedRPIds([])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on identity (id), not object reference
  }, [open, warehouse?.id, form])

  // Pre-fill Warehouse RPs once loaded for the current warehouse
  useEffect(() => {
    if (open && warehouse && currentRPs.length > 0) {
      setSelectedRPIds(currentRPs.map((rp) => rp.profile_id))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on identity (id), not object reference
  }, [open, warehouse?.id, currentRPs])

  async function onSubmit(values: WarehouseFormValues) {
    try {
      let whId: string
      if (isEditing && warehouse) {
        await update.mutateAsync({ id: warehouse.id, name: values.name, location: values.location || null })
        whId = warehouse.id
      } else {
        const created = await create.mutateAsync({ name: values.name, location: values.location || null })
        whId = created.id
      }
      // Save Warehouse RP assignments
      await replaceRPs.mutateAsync({ warehouseId: whId, profileIds: selectedRPIds })
      toast.success(warehouse ? 'Warehouse updated' : 'Warehouse created')
      onOpenChange(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Warehouse</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input placeholder="Address or area" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* ── Warehouse RPs multi-select dropdown ── */}
            <div className="space-y-2">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                Warehouse RPs
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-muted-foreground cursor-help text-[10px] border-b border-dashed border-muted-foreground/40">(RP)</span>
                    </TooltipTrigger>
                    <TooltipContent side="top"><p className="text-xs">Responsible Persons — users who physically manage this warehouse</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              {rpCandidates.length === 0 ? (
                <p className="text-xs text-muted-foreground border rounded-md py-3 text-center">No users with Warehouse RP role found. Assign the role in User Management first.</p>
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
                                  checked ? prev.filter((id) => id !== c.profile_id) : [...prev, c.profile_id]
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
                        const name = rpCandidates.find((c) => c.profile_id === id)?.full_name ?? 'Unnamed'
                        return (
                          <Badge key={id} variant="secondary" className="text-[10px] gap-1 pr-1">
                            {name}
                            <button
                              type="button"
                              className="hover:bg-muted rounded-full p-0.5 cursor-pointer"
                              onClick={() => setSelectedRPIds((prev) => prev.filter((pid) => pid !== id))}
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
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
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
    </Dialog>
  )
}
