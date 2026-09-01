'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useMemo, useRef, useState, useEffect } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, Power } from 'lucide-react'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import {
  GuardedFormDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import {
  DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  useWarrantyPolicies,
  useCreateWarrantyPolicy,
  useUpdateWarrantyPolicy,
  useToggleWarrantyPolicyActive,
  COVERAGE_TYPES,
  COVERAGE_TYPE_LABELS,
  STARTS_FROM_OPTIONS,
  STARTS_FROM_LABELS,
  type WarrantyPolicy,
  type CoverageType,
  type StartsFrom,
} from '@/hooks/useWarrantyPolicies'

// ── Form schema ───────────────────────────────────────────────────────────
const schema = z.object({
  name:             z.string().min(1, 'Name is required').max(120),
  duration_months:  z.coerce.number().int().min(0, 'Must be 0 or greater').max(600),
  coverage_type:    z.enum(COVERAGE_TYPES),
  starts_from:      z.enum(STARTS_FROM_OPTIONS),
  terms_en:         z.string().max(4000).optional().nullable(),
  terms_ar:         z.string().max(4000).optional().nullable(),
  void_conditions:  z.string().max(2000).optional().nullable(),
  is_active:        z.boolean(),
})

type FormValues = z.infer<typeof schema>

const EMPTY_DEFAULTS: FormValues = {
  name:             '',
  duration_months:  12,
  coverage_type:    'parts_only',
  starts_from:      'delivery_date',
  terms_en:         '',
  terms_ar:         '',
  void_conditions:  '',
  is_active:        true,
}

function parseVoidConditions(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function formatVoidConditions(list: string[] | null | undefined): string {
  if (!list || list.length === 0) return ''
  return list.join('\n')
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function WarrantyPoliciesPage() {
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<WarrantyPolicy | null>(null)
  const { data: policies = [], isLoading } = useWarrantyPolicies()
  const toggleActive = useToggleWarrantyPolicyActive()

  const stats = useMemo(() => {
    const total    = policies.length
    const active   = policies.filter((p) => p.is_active).length
    const inactive = total - active
    return { total, active, inactive }
  }, [policies])

  const columns = useMemo<ColumnDef<WarrantyPolicy>[]>(() => [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => <span className="font-medium">{row.getValue('name')}</span>,
    },
    {
      accessorKey: 'duration_months',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" />,
      cell: ({ row }) => {
        const m = row.getValue('duration_months') as number
        if (m === 0) return <span className="text-muted-foreground">No warranty</span>
        return <span>{m} month{m === 1 ? '' : 's'}</span>
      },
    },
    {
      accessorKey: 'coverage_type',
      header: 'Coverage',
      cell: ({ row }) => (
        <Badge variant="outline">
          {COVERAGE_TYPE_LABELS[row.getValue('coverage_type') as CoverageType]}
        </Badge>
      ),
    },
    {
      accessorKey: 'starts_from',
      header: 'Starts From',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {STARTS_FROM_LABELS[row.getValue('starts_from') as StartsFrom]}
        </span>
      ),
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <StatusBadge variant={row.getValue('is_active') ? 'active' : 'inactive'}>
          {row.getValue('is_active') ? 'Active' : 'Inactive'}
        </StatusBadge>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const p = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Actions</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => { setEditing(p); setDialogOpen(true) }}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    toggleActive.mutate(
                      { id: p.id, is_active: !p.is_active },
                      {
                        onSuccess: () => toast.success(p.is_active ? 'Deactivated' : 'Activated'),
                        onError:   (e: Error) => toast.error(humanizeDbError(e)),
                      },
                    )
                  }
                >
                  <Power className="mr-2 h-4 w-4" />
                  {p.is_active ? 'Deactivate' : 'Activate'}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ], [toggleActive])

  return (
    <PageWrapper>
      <div className="space-y-4">
        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Warranty Policies</h2>
            <p className="text-sm text-muted-foreground">
              Reusable templates. Attach to categories or override per item.
            </p>
          </div>
          <div className="flex gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search policies…" />
            <Button onClick={() => { setEditing(null); setDialogOpen(true) }}>Add Policy</Button>
          </div>
        </div>

        {/* ── Stat strip ───────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Total"    value={stats.total}    tone="neutral" />
          <StatCard label="Active"   value={stats.active}   tone="success" />
          <StatCard label="Inactive" value={stats.inactive} tone="muted" />
        </div>

        {/* ── Table ───────────────────────────────────────────────── */}
        <DataTable
          columns={columns}
          data={policies}
          isLoading={isLoading}
          globalFilter={search}
        />
      </div>

      <PolicyDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null) }}
        editing={editing}
      />
    </PageWrapper>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────
function StatCard({
  label, value, tone,
}: {
  label: string
  value: number
  tone: 'neutral' | 'success' | 'muted'
}) {
  const toneClasses =
    tone === 'success' ? 'text-green-600'
    : tone === 'muted' ? 'text-muted-foreground'
    : 'text-foreground'
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneClasses}`}>{value}</div>
    </div>
  )
}

// ── Dialog ────────────────────────────────────────────────────────────────
interface PolicyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: WarrantyPolicy | null
}

function PolicyDialog({ open, onOpenChange, editing }: PolicyDialogProps) {
  const guardRef = useRef<GuardedFormDialogHandle>(null)
  const createMut = useCreateWarrantyPolicy()
  const updateMut = useUpdateWarrantyPolicy()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: EMPTY_DEFAULTS,
  })

  // Re-seed when the dialog opens (fresh for add, hydrated for edit).
  useEffect(() => {
    if (!open) return
    if (editing) {
      form.reset({
        name:            editing.name,
        duration_months: editing.duration_months,
        coverage_type:   editing.coverage_type as CoverageType,
        starts_from:     editing.starts_from as StartsFrom,
        terms_en:        editing.terms_en ?? '',
        terms_ar:        editing.terms_ar ?? '',
        void_conditions: formatVoidConditions(editing.void_conditions),
        is_active:       editing.is_active,
      })
    } else {
      form.reset(EMPTY_DEFAULTS)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id])

  const isPending = createMut.isPending || updateMut.isPending

  async function onSubmit(values: FormValues) {
    const payload = {
      name:            values.name.trim(),
      duration_months: values.duration_months,
      coverage_type:   values.coverage_type,
      starts_from:     values.starts_from,
      terms_en:        values.terms_en?.trim() || null,
      terms_ar:        values.terms_ar?.trim() || null,
      void_conditions: parseVoidConditions(values.void_conditions),
      is_active:       values.is_active,
    }
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, ...payload })
        toast.success('Policy updated')
      } else {
        await createMut.mutateAsync(payload)
        toast.success('Policy created')
      }
      guardRef.current?.closeAfterSubmit()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <GuardedFormDialog<FormValues>
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      ref={guardRef}
    >
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit' : 'Add'} Warranty Policy</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Name + is_active */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-start">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Policy Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Standard 12 months" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="is_active" render={({ field }) => (
                <FormItem className="flex flex-col gap-1.5">
                  <FormLabel>Active</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )} />
            </div>

            {/* Duration + Coverage + Starts-from */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField control={form.control} name="duration_months" render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration (months) *</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} max={600} {...field} />
                  </FormControl>
                  <p className="text-[10px] text-muted-foreground">0 = No warranty template</p>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="coverage_type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Coverage *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {COVERAGE_TYPES.map((c) => (
                        <SelectItem key={c} value={c}>{COVERAGE_TYPE_LABELS[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="starts_from" render={({ field }) => (
                <FormItem>
                  <FormLabel>Starts From *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {STARTS_FROM_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>{STARTS_FROM_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Terms EN + AR */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <FormField control={form.control} name="terms_en" render={({ field }) => (
                <FormItem>
                  <FormLabel>Terms (English)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={6}
                      placeholder="Long-form terms — printed on the certificate."
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="terms_ar" render={({ field }) => (
                <FormItem>
                  <FormLabel>Terms (Arabic)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={6}
                      dir="rtl"
                      placeholder="النص العربي المطبوع على شهادة الضمان."
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Void conditions */}
            <FormField control={form.control} name="void_conditions" render={({ field }) => (
              <FormItem>
                <FormLabel>Void Conditions</FormLabel>
                <FormControl>
                  <Textarea
                    rows={4}
                    placeholder="One per line. e.g.&#10;Physical damage&#10;Unauthorized repair or modification"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <p className="text-[10px] text-muted-foreground">
                  One reason per line. Listed on the certificate.
                </p>
                <FormMessage />
              </FormItem>
            )} />

            <DialogFooter className="sticky bottom-0 -mx-6 -mb-6 border-t bg-background px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => guardRef.current?.requestClose()}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving…' : editing ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </GuardedFormDialog>
  )
}
