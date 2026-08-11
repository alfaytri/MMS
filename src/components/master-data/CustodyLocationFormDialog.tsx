'use client'

import { useEffect, useRef } from 'react'
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
import {
  GuardedFormDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { useDivisions } from '@/hooks/useDivisions'
import { useResponsiblePersonCandidates } from '@/hooks/useWarehouseResponsiblePersons'

const NONE = '__none__'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  division_id: z.string().min(1, 'Division is required'),
  responsible_person_profile_id: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export interface CustodyLocationEditRow {
  id: string
  name: string
  division_id: string | null
  responsible_person_profile_id: string | null
}

export interface CustodyLocationSubmitValues {
  name: string
  division_id: string
  responsible_person_profile_id: string | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  warehouseName: string
  row?: CustodyLocationEditRow | null
  isPending: boolean
  onSubmit: (values: CustodyLocationSubmitValues) => Promise<void>
}

export function CustodyLocationFormDialog({
  open, onOpenChange, warehouseName, row, isPending, onSubmit,
}: Props) {
  const isEditing = !!row
  const { data: divisions = [] } = useDivisions()
  const { data: rpCandidates = [] } = useResponsiblePersonCandidates()
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', division_id: '', responsible_person_profile_id: NONE },
  })

  useEffect(() => {
    if (!open) return
    if (row) {
      form.reset({
        name: row.name,
        division_id: row.division_id ?? '',
        responsible_person_profile_id: row.responsible_person_profile_id ?? NONE,
      })
    } else {
      form.reset({
        name: '',
        division_id: divisions.length === 1 ? divisions[0].id : '',
        responsible_person_profile_id: NONE,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id, form, divisions])

  async function submit(values: FormValues) {
    try {
      await onSubmit({
        name: values.name,
        division_id: values.division_id,
        responsible_person_profile_id:
          values.responsible_person_profile_id === NONE
            ? null
            : values.responsible_person_profile_id ?? null,
      })
      toast.success(isEditing ? 'Location updated' : 'Location created')
      guardRef.current?.closeAfterSubmit()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <GuardedFormDialog open={open} onOpenChange={onOpenChange} form={form} ref={guardRef}>
      <DialogContent className="w-full sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit' : 'Add'} location — {warehouseName}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. AC Team 1 / F004 — Client Site" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="division_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Division *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full h-9">
                        <SelectValue placeholder="Select division" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {divisions.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="responsible_person_profile_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Responsible Person</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full h-9">
                        <SelectValue placeholder="Optional" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {rpCandidates.map((c) => (
                        <SelectItem key={c.profile_id} value={c.profile_id}>
                          {c.full_name ?? 'Unnamed'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-2">
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
