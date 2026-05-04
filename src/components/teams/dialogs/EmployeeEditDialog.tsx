'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, ChevronRight, ChevronDown } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useServiceTree, type Service } from '@/hooks/useServices'
import { useCreateEmployee, useArchiveEmployee } from '@/hooks/useTeams'
import { useDivisions } from '@/hooks/useDivisions'
import { useTeamsPage } from '../TeamsPageContext'

// ─── Country codes ────────────────────────────────────────────────────────────
const COUNTRY_CODES = [
  { code: '+974', label: 'QA +974' },
  { code: '+966', label: 'SA +966' },
  { code: '+971', label: 'AE +971' },
  { code: '+965', label: 'KW +965' },
  { code: '+973', label: 'BH +973' },
  { code: '+968', label: 'OM +968' },
  { code: '+20',  label: 'EG +20'  },
  { code: '+92',  label: 'PK +92'  },
  { code: '+91',  label: 'IN +91'  },
  { code: '+880', label: 'BD +880' },
]

function parsePhone(phone: string): { code: string; number: string } {
  for (const c of COUNTRY_CODES) {
    if (phone.startsWith(c.code + ' ')) {
      return { code: c.code, number: phone.slice(c.code.length + 1) }
    }
    if (phone.startsWith(c.code)) {
      return { code: c.code, number: phone.slice(c.code.length) }
    }
  }
  return { code: '+974', number: phone }
}

// ─── Service tree builder ─────────────────────────────────────────────────────
interface ServiceNode extends Service {
  children: ServiceNode[]
}

function buildTree(flat: Service[]): ServiceNode[] {
  const map = new Map<string, ServiceNode>()
  flat.forEach(s => map.set(s.id, { ...s, children: [] }))
  const roots: ServiceNode[] = []
  flat.forEach(s => {
    if (s.parent_id && map.has(s.parent_id)) {
      map.get(s.parent_id)!.children.push(map.get(s.id)!)
    } else {
      roots.push(map.get(s.id)!)
    }
  })
  return roots
}

/** Recursively collect all leaf IDs under a node */
function getLeafIds(node: ServiceNode): string[] {
  if (node.children.length === 0) return [node.id]
  return node.children.flatMap(getLeafIds)
}

/** Collect all leaf IDs across a list of root nodes */
function getSectionLeafIds(nodes: ServiceNode[]): string[] {
  return nodes.flatMap(getLeafIds)
}

// ─── Shared prop types ────────────────────────────────────────────────────────
interface TreeSharedProps {
  selectedIds:   Set<string>
  onToggle:      (id: string) => void
  onBulkChange:  (ids: string[], selected: boolean) => void
}

// ─── ServiceTreeSection ───────────────────────────────────────────────────────
function ServiceTreeSection({
  title,
  nodes,
  selectedIds,
  onToggle,
  onBulkChange,
}: { title: string; nodes: ServiceNode[] } & TreeSharedProps) {
  const [open, setOpen] = useState(true)
  if (nodes.length === 0) return null

  const leafIds    = getSectionLeafIds(nodes)
  const allSelected = leafIds.length > 0 && leafIds.every(id => selectedIds.has(id))

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header row — expand toggle on left, select-all on right */}
      <div className="flex items-center bg-muted/40 hover:bg-muted/60 transition-colors">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex-1 flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-left"
        >
          <span>{title}</span>
          {open
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
          }
        </button>
        <button
          type="button"
          onClick={() => onBulkChange(leafIds, !allSelected)}
          className="px-3 py-2.5 text-xs text-primary hover:underline border-l shrink-0"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      {open && (
        <div className="divide-y">
          {nodes.map(node => (
            <ServiceNodeRow
              key={node.id}
              node={node}
              selectedIds={selectedIds}
              onToggle={onToggle}
              onBulkChange={onBulkChange}
              depth={0}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── ServiceNodeRow ───────────────────────────────────────────────────────────
function ServiceNodeRow({
  node,
  selectedIds,
  onToggle,
  onBulkChange,
  depth,
}: { node: ServiceNode; depth: number } & TreeSharedProps) {
  const [expanded, setExpanded] = useState(false)
  const hasChildren = node.children.length > 0
  const isLeaf      = !hasChildren

  // For parent nodes: check if all descendants are selected
  const leafIds     = hasChildren ? getLeafIds(node) : []
  const allSelected = hasChildren && leafIds.length > 0 && leafIds.every(id => selectedIds.has(id))

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/20',
          depth > 0 && 'pl-8',
        )}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="p-0.5 hover:text-foreground text-muted-foreground shrink-0"
          >
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />
            }
          </button>
        ) : (
          <Checkbox
            id={node.id}
            checked={selectedIds.has(node.id)}
            onCheckedChange={() => onToggle(node.id)}
            className="shrink-0"
          />
        )}

        <label
          htmlFor={isLeaf ? node.id : undefined}
          className={cn(
            'flex-1 min-w-0 truncate',
            isLeaf ? 'cursor-pointer' : 'font-medium',
          )}
        >
          {node.name_en}
        </label>

        {/* Arabic name */}
        {node.name_ar && (
          <span className="text-xs text-muted-foreground shrink-0" dir="rtl">
            {node.name_ar}
          </span>
        )}

        {/* Select all — parent nodes only */}
        {hasChildren && (
          <button
            type="button"
            onClick={() => onBulkChange(leafIds, !allSelected)}
            className="text-xs text-primary hover:underline shrink-0 ml-1"
          >
            {allSelected ? 'Deselect' : 'Select all'}
          </button>
        )}
      </div>

      {hasChildren && expanded && node.children.map(child => (
        <ServiceNodeRow
          key={child.id}
          node={child}
          selectedIds={selectedIds}
          onToggle={onToggle}
          onBulkChange={onBulkChange}
          depth={depth + 1}
        />
      ))}
    </>
  )
}

// ─── Form values ──────────────────────────────────────────────────────────────
interface EmployeeFormValues {
  name:        string
  countryCode: string
  phoneNumber: string
  nationality: string
  join_date:   string
  avatar_url:  string
}

// ─── Main dialog ──────────────────────────────────────────────────────────────
export function EmployeeEditDialog() {
  const { employeeDialog, closeEmployeeDialog } = useTeamsPage()
  const { open, employee } = employeeDialog
  const isEdit = !!employee

  const qc             = useQueryClient()
  const createEmployee  = useCreateEmployee()
  const archiveEmployee = useArchiveEmployee()

  const fileRef = useRef<HTMLInputElement>(null)
  const [submitError,    setSubmitError]    = useState<string | null>(null)
  const [isPending,      setIsPending]      = useState(false)
  const [previewUrl,     setPreviewUrl]     = useState<string | null>(null)
  const [divisionSlug,   setDivisionSlug]   = useState<string>('')

  // ─── Divisions ─────────────────────────────────────────────────────────────
  const { data: divisions = [] } = useDivisions()

  // ─── Services (filtered by selected division) ───────────────────────────────
  const slugFilter = divisionSlug ? [divisionSlug] : []
  const { data: normalFlat   = [] } = useServiceTree('normal',   slugFilter)
  const { data: contractFlat = [] } = useServiceTree('contract', slugFilter)
  const { data: mobileFlat   = [] } = useServiceTree('mobile',   slugFilter)

  const normalTree   = useMemo(() => buildTree(normalFlat),   [normalFlat])
  const contractTree = useMemo(() => buildTree(contractFlat), [contractFlat])
  const mobileTree   = useMemo(() => buildTree(mobileFlat),   [mobileFlat])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  function toggleService(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function bulkChange(ids: string[], selected: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      ids.forEach(id => selected ? next.add(id) : next.delete(id))
      return next
    })
  }

  // ─── Form ──────────────────────────────────────────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10)

  const form = useForm<EmployeeFormValues>({
    defaultValues: {
      name: '', countryCode: '+974', phoneNumber: '', nationality: '',
      join_date: todayStr, avatar_url: '',
    },
  })

  useEffect(() => {
    if (!open) return
    setSubmitError(null)
    setPreviewUrl(null)
    setSelectedIds(new Set())
    setDivisionSlug('')

    if (employee) {
      const parsed = parsePhone(employee.phone ?? '')
      form.reset({
        name:        employee.name        ?? '',
        countryCode: parsed.code,
        phoneNumber: parsed.number,
        nationality: employee.nationality ?? '',
        join_date:   employee.join_date   ?? todayStr,
        avatar_url:  employee.avatar_url  ?? '',
      })
      setPreviewUrl(employee.avatar_url ?? null)
      // Load existing skill IDs (employee_services not in generated types — cast required)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(createClient() as any)
        .from('employee_services')
        .select('service_id')
        .eq('employee_id', employee.id)
        .then(({ data }: { data: { service_id: string }[] | null }) => {
          if (data) setSelectedIds(new Set(data.map(r => r.service_id)))
        })
    } else {
      form.reset({
        name: '', countryCode: '+974', phoneNumber: '', nationality: '',
        join_date: todayStr, avatar_url: '',
      })
    }
  }, [employee, open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Avatar upload ──────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPreviewUrl(URL.createObjectURL(file))
  }

  async function uploadAvatar(file: File): Promise<string> {
    const supabase = createClient()
    const ext  = file.name.split('.').pop()
    const path = `${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage
      .from('employee-avatars')
      .upload(path, file, { upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from('employee-avatars').getPublicUrl(path)
    return data.publicUrl
  }

  // ─── Submit ─────────────────────────────────────────────────────────────────
  async function onSubmit(values: EmployeeFormValues) {
    setSubmitError(null)
    setIsPending(true)
    try {
      let avatarUrl = values.avatar_url
      if (fileRef.current?.files?.[0]) {
        avatarUrl = await uploadAvatar(fileRef.current.files[0])
      }

      const fullPhone = values.phoneNumber
        ? `${values.countryCode} ${values.phoneNumber}`
        : ''

      const serviceIds = Array.from(selectedIds)

      if (isEdit) {
        const supabase = createClient()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).rpc('save_employee', {
          p_employee_id: employee!.id,
          p_name:        values.name,
          p_phone:       fullPhone || null,
          p_nationality: values.nationality || null,
          p_join_date:   values.join_date || null,
          p_status:      employee!.status ?? 'active',
          p_avatar_url:  avatarUrl || null,
          p_service_ids: serviceIds,
        })
        if (error) throw error
        qc.invalidateQueries({ queryKey: ['employees'] })
        qc.invalidateQueries({ queryKey: ['teams'] })
        qc.invalidateQueries({ queryKey: ['team-activity-log'] })
        qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (createClient() as any).from('team_activity_log').insert({
          action:      'employee-edited',
          entity_type: 'employee',
          entity_id:   employee!.id,
          after_data:  { name: values.name, status: employee!.status ?? 'active' },
        })
      } else {
        const payload = {
          name:        values.name,
          phone:       fullPhone || null,
          nationality: values.nationality || null,
          join_date:   values.join_date,
          status:      'unassigned' as const,
          avatar_url:  avatarUrl || null,
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const created = await createEmployee.mutateAsync(payload as any)
        if (serviceIds.length > 0) {
          const supabase = createClient()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any).rpc('upsert_employee_services', {
            p_employee_id: created.id,
            p_service_ids: serviceIds,
          })
          if (error) throw error
        }
      }
      closeEmployeeDialog()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Save failed. Please try again.')
    } finally {
      setIsPending(false)
    }
  }

  const avatarWatchUrl = form.watch('avatar_url')
  const displayAvatar  = previewUrl || avatarWatchUrl || null

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) closeEmployeeDialog() }}>
      <DialogContent className="w-full max-w-lg rounded-none md:rounded-lg max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle>{isEdit ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="px-6 py-4 space-y-4">

              {/* ── Photo + Name row ── */}
              <div className="flex items-start gap-4">
                {/* Circular photo placeholder */}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="shrink-0 h-16 w-16 rounded-full border-2 border-dashed border-muted-foreground/40 flex flex-col items-center justify-center gap-0.5 hover:border-primary hover:bg-muted/30 transition-colors overflow-hidden"
                  aria-label="Upload photo"
                >
                  {displayAvatar ? (
                    <img src={displayAvatar} alt="avatar" className="h-full w-full object-cover" />
                  ) : (
                    <>
                      <Camera className="h-5 w-5 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground leading-none">Photo</span>
                    </>
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />

                {/* Name field */}
                <FormField
                  control={form.control}
                  name="name"
                  rules={{ required: 'Name is required' }}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>
                        Name <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Full name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* ── Phone row ── */}
              <div className="flex gap-2 items-end">
                <FormField
                  control={form.control}
                  name="countryCode"
                  render={({ field }) => (
                    <FormItem className="w-32 shrink-0">
                      <FormLabel>Phone</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {COUNTRY_CODES.map(c => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      {/* invisible label keeps vertical alignment with country code label */}
                      <FormLabel className="invisible select-none" aria-hidden>
                        Number
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="tel"
                          placeholder="XXXX XXXX"
                          className="h-9"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {/* ── Nationality ── */}
              <FormField
                control={form.control}
                name="nationality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nationality</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. Qatari" />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* ── Join Date ── */}
              <FormField
                control={form.control}
                name="join_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Join Date</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" className="w-full" />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* ── Skillset (Services) ── */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Skillset (Services)</p>

                {/* Division filter */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Filter by Division
                  </label>
                  <Select value={divisionSlug} onValueChange={v => setDivisionSlug(v ?? '')}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="All divisions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All divisions</SelectItem>
                      {divisions.map(d => (
                        <SelectItem key={d.id} value={d.slug ?? d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <ServiceTreeSection
                  title="Normal Services"
                  nodes={normalTree}
                  selectedIds={selectedIds}
                  onToggle={toggleService}
                  onBulkChange={bulkChange}
                />
                <ServiceTreeSection
                  title="Contract Services"
                  nodes={contractTree}
                  selectedIds={selectedIds}
                  onToggle={toggleService}
                  onBulkChange={bulkChange}
                />
                <ServiceTreeSection
                  title="Mobile Services"
                  nodes={mobileTree}
                  selectedIds={selectedIds}
                  onToggle={toggleService}
                  onBulkChange={bulkChange}
                />
              </div>

              {/* ── Error ── */}
              {submitError && (
                <p className="text-sm text-destructive border border-destructive/20 rounded p-2">
                  {submitError}
                </p>
              )}
            </div>

            <DialogFooter className="px-6 pb-5 flex-col sm:flex-row gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={closeEmployeeDialog}
              >
                Cancel
              </Button>
              {isEdit && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={archiveEmployee.isPending}
                  onClick={async () => {
                    try {
                      await archiveEmployee.mutateAsync(employee!.id)
                      closeEmployeeDialog()
                    } catch (err) {
                      setSubmitError(
                        err instanceof Error ? err.message : 'Archive failed',
                      )
                    }
                  }}
                >
                  Archive
                </Button>
              )}
              <Button
                type="submit"
                disabled={isPending}
                className="sm:ml-auto"
              >
                {isPending ? 'Saving...' : isEdit ? 'Save' : 'Add Employee'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
