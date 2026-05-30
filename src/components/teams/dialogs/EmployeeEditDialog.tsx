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
import { useCreateEmployee, useArchiveEmployee, useDisableEmployee, useEnableEmployee, logActivity } from '@/hooks/useTeams'
import { useDivisions } from '@/hooks/useDivisions'
import { PhoneInputWithCode, splitPhone } from '@/components/shared/PhoneInputWithCode'
import { useTeamsPage } from '../TeamsPageContext'

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
          className={cn(
            'px-3 py-2.5 text-xs hover:underline border-l shrink-0',
            allSelected ? 'text-destructive' : 'text-primary',
          )}
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

  const leafIds      = hasChildren ? getLeafIds(node) : []
  const selectedCount = hasChildren ? leafIds.filter(id => selectedIds.has(id)).length : 0
  const allSelected  = hasChildren && leafIds.length > 0 && selectedCount === leafIds.length
  const someSelected = hasChildren && selectedCount > 0 && !allSelected

  // Progressive indent: 12px base + 20px per depth level
  const paddingLeft = 12 + depth * 20

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-2 pr-3 py-2 hover:bg-muted/20',
          // Depth 0: medium text, no track
          depth === 0 && 'text-sm',
          // Depth 1: slightly muted, left track
          depth === 1 && 'text-sm border-l-2',
          // Depth 2+: smaller, lighter, thinner track
          depth >= 2 && 'text-xs border-l-2',
          // Track colour driven by selection state (depth > 0)
          depth > 0 && !someSelected && !allSelected && 'border-l-border/50',
          depth > 0 && someSelected  && 'border-l-amber-400',
          depth > 0 && allSelected   && 'border-l-primary/60',
        )}
        style={{ paddingLeft }}
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
            depth >= 2 && 'text-muted-foreground font-normal',
          )}
        >
          {node.name_en}
        </label>

        {/* Arabic name */}
        {node.name_ar && (
          <span className={cn('text-muted-foreground shrink-0', depth >= 2 ? 'text-[10px]' : 'text-xs')} dir="rtl">
            {node.name_ar}
          </span>
        )}

        {/* Selection count badge — visible when collapsed and something is selected */}
        {hasChildren && selectedCount > 0 && !expanded && (
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0',
            allSelected
              ? 'bg-primary/10 text-primary'
              : 'bg-amber-100 text-amber-700',
          )}>
            {selectedCount}/{leafIds.length}
          </span>
        )}

        {/* Select all / Deselect — parent nodes only */}
        {hasChildren && (
          <button
            type="button"
            onClick={() => onBulkChange(leafIds, !allSelected)}
            className={cn(
              'text-xs hover:underline shrink-0 ml-1',
              allSelected ? 'text-destructive' : 'text-primary',
            )}
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
  division_id: string
}

// ─── Main dialog ──────────────────────────────────────────────────────────────
export function EmployeeEditDialog() {
  const { employeeDialog, closeEmployeeDialog } = useTeamsPage()
  const { open, employee } = employeeDialog
  const isEdit = !!employee

  const qc             = useQueryClient()
  const createEmployee  = useCreateEmployee()
  const disableEmployee = useDisableEmployee()
  const enableEmployee  = useEnableEmployee()
  const archiveEmployee = useArchiveEmployee()

  const isArchived = employee?.status === 'archived'

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
      join_date: todayStr, avatar_url: '', division_id: '',
    },
  })

  useEffect(() => {
    if (!open) return
    setSubmitError(null)
    setPreviewUrl(null)
    setSelectedIds(new Set())
    setDivisionSlug('')

    if (employee) {
      const { code: parsedCode, digits: parsedDigits } = splitPhone(employee.phone)
      const divId = employee.division_id ?? ''
      form.reset({
        name:        employee.name        ?? '',
        countryCode: parsedCode,
        phoneNumber: parsedDigits,
        nationality: employee.nationality ?? '',
        join_date:   employee.join_date   ?? todayStr,
        avatar_url:  employee.avatar_url  ?? '',
        division_id: divId,
      })
      setPreviewUrl(employee.avatar_url ?? null)
      // Pre-set skillset filter to match the employee's division
      const matchedDiv = divisions.find(d => d.id === divId)
      setDivisionSlug(matchedDiv?.slug ?? '')
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
        join_date: todayStr, avatar_url: '', division_id: '',
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
        ? `${values.countryCode}${values.phoneNumber}`
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
          p_division_id: values.division_id || null,
        })
        if (error) throw error
        // Log and invalidate only after the RPC fully succeeded
        await logActivity({
          action: 'employee-edited', entityType: 'employee', entityId: employee!.id,
          afterData: { name: values.name, status: employee!.status ?? 'active' },
        })
        qc.invalidateQueries({ queryKey: ['employees'] })
        qc.invalidateQueries({ queryKey: ['teams'] })
        qc.invalidateQueries({ queryKey: ['team-activity-log'] })
        qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
      } else {
        const payload = {
          name:        values.name,
          phone:       fullPhone || null,
          nationality: values.nationality || null,
          join_date:   values.join_date,
          status:      'unassigned' as const,
          avatar_url:  avatarUrl || null,
          division_id: values.division_id || null,
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
        // Log only after employee + services both committed successfully
        await logActivity({
          action: 'employee-created', entityType: 'employee', entityId: created.id,
          afterData: { name: values.name },
        })
        qc.invalidateQueries({ queryKey: ['employees'] })
        qc.invalidateQueries({ queryKey: ['teams'] })
        qc.invalidateQueries({ queryKey: ['team-activity-log'] })
        qc.invalidateQueries({ queryKey: ['team-activity-log-count'] })
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
      <DialogContent className="w-full h-full max-h-[100dvh] rounded-none md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-lg lg:max-w-5xl lg:h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <DialogTitle>{isEdit ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">

            {/* ── Scrollable body ── */}
            <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
              <div className="px-6 py-5 lg:flex lg:gap-0 lg:h-full lg:divide-x">

                {/* ── LEFT COLUMN: personal info ── */}
                <div className="space-y-5 lg:w-80 lg:shrink-0 lg:pr-8">

                  {/* Photo + Name */}
                  <div className="flex items-start gap-4">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="shrink-0 h-20 w-20 rounded-full border-2 border-dashed border-muted-foreground/40 flex flex-col items-center justify-center gap-1 hover:border-primary hover:bg-muted/30 transition-colors overflow-hidden"
                      aria-label="Upload photo"
                    >
                      {displayAvatar ? (
                        <img src={displayAvatar} alt="avatar" className="h-full w-full object-cover" />
                      ) : (
                        <>
                          <Camera className="h-6 w-6 text-muted-foreground" />
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

                  {/* Phone */}
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <PhoneInputWithCode
                      value={form.watch('phoneNumber')}
                      onChange={(v) => form.setValue('phoneNumber', v)}
                      countryCode={form.watch('countryCode')}
                      onCountryCodeChange={(v) => form.setValue('countryCode', v)}
                    />
                  </FormItem>

                  {/* Nationality */}
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

                  {/* Join Date */}
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

                  {/* Division */}
                  <FormField
                    control={form.control}
                    name="division_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Division</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={val => {
                            field.onChange(val)
                            const matched = divisions.find(d => d.id === val)
                            setDivisionSlug(matched?.slug ?? '')
                          }}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select division…" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="">No division</SelectItem>
                            {divisions.map(d => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  {/* Error (left column, visible without scroll) */}
                  {submitError && (
                    <p className="text-sm text-destructive border border-destructive/20 rounded p-3">
                      {submitError}
                    </p>
                  )}
                </div>

                {/* ── RIGHT COLUMN: skillset ── */}
                <div className="mt-6 lg:mt-0 lg:flex-1 lg:pl-8 lg:overflow-y-auto space-y-3">
                  <p className="text-sm font-semibold">Skillset (Services)</p>

                  {/* Division filter */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Filter by Division
                    </label>
                    <Select value={divisionSlug} onValueChange={v => setDivisionSlug(v ?? '')}>
                      <SelectTrigger className="h-9 text-sm">
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

                  {/* bottom padding inside scroll area */}
                  <div className="h-4" />
                </div>
              </div>
            </div>

            {/* ── Sticky footer ── */}
            <DialogFooter className="px-6 py-4 flex-col sm:flex-row gap-2 border-t shrink-0">
              <Button type="button" variant="outline" onClick={closeEmployeeDialog}>
                Cancel
              </Button>

              {isEdit && (
                <>
                  {/* Re-enable — only for archived employees */}
                  {isArchived && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={enableEmployee.isPending}
                      onClick={async () => {
                        try {
                          await enableEmployee.mutateAsync(employee!.id)
                          closeEmployeeDialog()
                        } catch (err) {
                          setSubmitError(err instanceof Error ? err.message : 'Failed to re-enable')
                        }
                      }}
                    >
                      {enableEmployee.isPending ? 'Enabling...' : 'Re-enable'}
                    </Button>
                  )}

                  {/* Disable — sets status=archived, stays visible in Archive tab */}
                  {!isArchived && (
                    <Button
                      type="button"
                      variant="outline"
                      className="text-amber-600 border-amber-300 hover:bg-amber-50"
                      disabled={disableEmployee.isPending}
                      onClick={async () => {
                        try {
                          await disableEmployee.mutateAsync(employee!.id)
                          closeEmployeeDialog()
                        } catch (err) {
                          setSubmitError(err instanceof Error ? err.message : 'Failed to disable')
                        }
                      }}
                    >
                      {disableEmployee.isPending ? 'Disabling...' : 'Disable'}
                    </Button>
                  )}

                  {/* Remove — permanent soft-delete, disappears from all lists */}
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={archiveEmployee.isPending}
                    onClick={async () => {
                      try {
                        await archiveEmployee.mutateAsync(employee!.id)
                        closeEmployeeDialog()
                      } catch (err) {
                        setSubmitError(err instanceof Error ? err.message : 'Failed to remove')
                      }
                    }}
                  >
                    {archiveEmployee.isPending ? 'Removing...' : 'Remove'}
                  </Button>
                </>
              )}

              <Button type="submit" disabled={isPending} className="sm:ml-auto">
                {isPending ? 'Saving...' : isEdit ? 'Save' : 'Add Employee'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
