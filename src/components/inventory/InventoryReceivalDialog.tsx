'use client'

import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import { format } from 'date-fns'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

import { useWarehouses } from '@/hooks/useWarehouses'
import {
  useCreateInventoryReceival,
  useFifoLayersForVariant,
} from '@/hooks/useInventoryReceivals'

const schema = z.object({
  mode: z.enum(['carve', 'new_stock']),
  warehouse_id: z.string().min(1, 'Warehouse is required'),
  source_layer_id: z.string().nullable(),
  qty: z.coerce.number().int().positive('Qty must be > 0'),
  unit_cost: z.coerce.number().nonnegative('Cost must be ≥ 0'),
  date: z.string().min(1, 'Date is required'),
  notes: z.string().nullable(),
}).refine(
  (v) => v.mode === 'new_stock' || (v.mode === 'carve' && !!v.source_layer_id),
  { message: 'Source batch is required for carve mode', path: ['source_layer_id'] },
)

type FormValues = z.infer<typeof schema>

export interface InventoryReceivalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  brandVariantId: string
  variantLabel: string
  variantCode: string
}

export function InventoryReceivalDialog({
  open,
  onOpenChange,
  brandVariantId,
  variantLabel,
  variantCode,
}: InventoryReceivalDialogProps) {
  const [costEditable, setCostEditable] = useState(false)
  const [confirmCostEdit, setConfirmCostEdit] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      mode: 'carve',
      warehouse_id: '',
      source_layer_id: null,
      qty: 0,
      unit_cost: 0,
      date: format(new Date(), 'yyyy-MM-dd'),
      notes: '',
    },
  })

  const mode = form.watch('mode')
  const warehouseId = form.watch('warehouse_id')
  const sourceLayerId = form.watch('source_layer_id')

  const { data: warehouses = [] } = useWarehouses()
  const { data: layers = [] } = useFifoLayersForVariant(
    mode === 'carve' ? brandVariantId : null,
    mode === 'carve' ? warehouseId || null : null,
  )
  const createMutation = useCreateInventoryReceival()

  // Pre-fill unit cost when source layer selected
  useEffect(() => {
    if (mode === 'carve' && sourceLayerId) {
      const layer = layers.find((l) => l.id === sourceLayerId)
      if (layer) form.setValue('unit_cost', Number(layer.unit_cost))
    }
    if (mode === 'new_stock') {
      form.setValue('source_layer_id', null)
    }
  }, [sourceLayerId, mode, layers, form])

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setCostEditable(false)
      form.reset({
        mode: 'carve',
        warehouse_id: '',
        source_layer_id: null,
        qty: 0,
        unit_cost: 0,
        date: format(new Date(), 'yyyy-MM-dd'),
        notes: '',
      })
    }
  }, [open, form])

  const selectedLayer = useMemo(
    () => layers.find((l) => l.id === sourceLayerId) ?? null,
    [layers, sourceLayerId],
  )
  const maxQty = mode === 'carve' && selectedLayer ? selectedLayer.remaining_qty : undefined

  async function onSubmit(v: FormValues) {
    if (maxQty !== undefined && v.qty > maxQty) {
      form.setError('qty', {
        message: `Cannot exceed ${maxQty} units available in source batch`,
      })
      return
    }

    try {
      const result = await createMutation.mutateAsync({
        mode: v.mode,
        warehouse_id: v.warehouse_id,
        brand_variant_id: brandVariantId,
        qty: v.qty,
        unit_cost: v.unit_cost,
        source_layer_id: v.mode === 'carve' ? v.source_layer_id : null,
        date: v.date,
        notes: v.notes?.trim() || null,
      })
      toast.success(`Inventory Receival ${result.receival_number} created`, {
        action: {
          label: 'View Receivals',
          onClick: () => {
            window.location.href = '/purchase/receivals?source=inventory'
          },
        },
      })
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create receival'
      toast.error(msg)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full h-full sm:h-auto sm:max-w-lg rounded-none sm:rounded-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Inventory Receival</DialogTitle>
            <DialogDescription>
              {variantLabel} · <span className="font-mono text-xs">{variantCode}</span>
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Mode toggle — two big buttons */}
              <FormField
                control={form.control}
                name="mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mode</FormLabel>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => field.onChange('carve')}
                        className={cn(
                          'flex items-center gap-2 rounded-md border p-3 text-sm transition-colors',
                          field.value === 'carve'
                            ? 'border-primary bg-primary/5 font-medium'
                            : 'border-input hover:bg-muted/50',
                        )}
                      >
                        <span
                          className={cn(
                            'h-4 w-4 rounded-full border-2',
                            field.value === 'carve' ? 'border-primary bg-primary' : 'border-input',
                          )}
                        />
                        Carve from stock
                      </button>
                      <button
                        type="button"
                        onClick={() => field.onChange('new_stock')}
                        className={cn(
                          'flex items-center gap-2 rounded-md border p-3 text-sm transition-colors',
                          field.value === 'new_stock'
                            ? 'border-primary bg-primary/5 font-medium'
                            : 'border-input hover:bg-muted/50',
                        )}
                      >
                        <span
                          className={cn(
                            'h-4 w-4 rounded-full border-2',
                            field.value === 'new_stock' ? 'border-primary bg-primary' : 'border-input',
                          )}
                        />
                        Add new stock
                      </button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Warehouse */}
              <FormField
                control={form.control}
                name="warehouse_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Warehouse *</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select warehouse…" />
                        </SelectTrigger>
                        <SelectContent>
                          {warehouses.map((w) => (
                            <SelectItem key={w.id} value={w.id}>
                              {w.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Source layer — carve only */}
              {mode === 'carve' && (
                <FormField
                  control={form.control}
                  name="source_layer_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Source Batch *</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value ?? ''}
                          onValueChange={(val) => field.onChange(val || null)}
                          disabled={!warehouseId || layers.length === 0}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                !warehouseId
                                  ? 'Select a warehouse first'
                                  : layers.length === 0
                                    ? 'No stock in this warehouse'
                                    : 'Select source batch…'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {layers.map((l) => (
                              <SelectItem key={l.id} value={l.id}>
                                {(l.receival_number || 'INIT-IMPORT')} — {l.remaining_qty} available
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Qty */}
              <FormField
                control={form.control}
                name="qty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        {...field}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    {maxQty !== undefined && (
                      <p className="text-xs text-muted-foreground">Max: {maxQty} units</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Unit cost — locked until Edit */}
              <FormField
                control={form.control}
                name="unit_cost"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Unit Cost (QAR) *</FormLabel>
                      {!costEditable && (
                        <button
                          type="button"
                          onClick={() => setConfirmCostEdit(true)}
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                      )}
                    </div>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        readOnly={!costEditable}
                        className={!costEditable ? 'bg-muted' : undefined}
                        {...field}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Date */}
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={2}
                        placeholder="Optional notes…"
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="sticky bottom-0 bg-background pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? 'Creating…' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmCostEdit} onOpenChange={setConfirmCostEdit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to edit the unit cost?</AlertDialogTitle>
            <AlertDialogDescription>
              This affects your inventory valuation and future landed cost calculations.
              Only change this if you have a specific reason (correction, currency
              conversion, etc.).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setCostEditable(true)
                setConfirmCostEdit(false)
              }}
            >
              Yes, edit unit cost
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
