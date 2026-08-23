'use client'

import { useState } from 'react'
import {
  ChevronDown, ChevronRight, Plus, Star, Zap, Loader2,
  Shield, Pencil, GitBranch, Trash2, Check, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import {
  useWorkflowSteps,
  useAddWorkflowStepForRole,
  useToggleWorkflowStep,
  useDeleteWorkflowStep,
  useUpdateWorkflowStepRole,
  useUpdateWorkflowStepConditions,
  type WorkflowStep,
} from '@/hooks/useWorkflowSteps'
import {
  useWorkflowGroups,
  useCreateWorkflowGroup,
  useUpdateWorkflowGroup,
  useDeleteWorkflowGroup,
  type WorkflowGroup,
} from '@/hooks/useWorkflowGroups'
import { useRoles, type CustomRole } from '@/hooks/useRoles'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { usePermissions } from '@/hooks/usePermissions'
import {
  WORKFLOW_CONDITIONS,
  WORKFLOW_LABELS as WORKFLOW_LABELS_CATALOG,
  WORKFLOW_DISCRIMINATOR_LABEL,
  conditionLabel,
  type WorkflowKey,
} from '@/lib/workflow-conditions'

// ─── Types ────────────────────────────────────────────────────────────────────

type Workflow = WorkflowKey

const WORKFLOW_LABELS = WORKFLOW_LABELS_CATALOG

const WORKFLOWS: Workflow[] = ['po', 'inv_check', 'stock_adj', 'sales_margin', 'sales_credit', 'credit_group', 'receival_edit', 'consumption_edit']

// ─── Step conditional popover ─────────────────────────────────────────────────

interface StepConditionPopoverProps {
  step: WorkflowStep
  canEdit: boolean
}

function StepConditionPopover({ step, canEdit }: StepConditionPopoverProps) {
  const [open, setOpen] = useState(false)
  const [draftConditional, setDraftConditional] = useState(step.is_conditional)
  const [draftTypes, setDraftTypes] = useState<string[]>(step.condition_types ?? [])

  const update = useUpdateWorkflowStepConditions()

  const workflowKey = step.workflow as WorkflowKey
  const options = WORKFLOW_CONDITIONS[workflowKey] ?? []
  const isConditional = step.is_conditional && (step.condition_types?.length ?? 0) > 0

  function handleOpenChange(next: boolean) {
    if (next) {
      setDraftConditional(step.is_conditional)
      setDraftTypes(step.condition_types ?? [])
    }
    setOpen(next)
  }

  function toggleType(value: string) {
    setDraftTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    )
  }

  function handleSave() {
    if (draftConditional && draftTypes.length === 0) {
      toast.error('Pick at least one trigger value, or switch to "Always trigger".')
      return
    }
    update.mutateAsync({
      stepId: step.id,
      isConditional: draftConditional,
      conditionTypes: draftConditional ? draftTypes : [],
    })
      .then(() => { toast.success('Step trigger updated'); setOpen(false) })
      .catch((err: Error) => toast.error(err.message))
  }

  if (!canEdit) {
    if (!isConditional) return null
    return (
      <Badge
        variant="secondary"
        className="flex items-center gap-0.5 text-[10px] py-0 px-1 h-4 shrink-0"
      >
        <Zap className="h-2.5 w-2.5" />
        {step.condition_types.map((v) => conditionLabel(step.workflow, v)).join('/')}
      </Badge>
    )
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        className={`inline-flex items-center gap-0.5 rounded text-[10px] py-0 px-1 h-4 shrink-0 transition-colors ${
          isConditional
            ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            : 'border border-dashed border-muted-foreground/40 text-muted-foreground hover:text-foreground hover:border-foreground/40'
        }`}
        aria-label={isConditional ? 'Edit conditional trigger' : 'Make step conditional'}
      >
        <Zap className="h-2.5 w-2.5" />
        {isConditional ? (
          <span>{step.condition_types.map((v) => conditionLabel(step.workflow, v)).join('/')}</span>
        ) : (
          <Pencil className="h-2.5 w-2.5" />
        )}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-3">
          <div className="space-y-0.5">
            <h4 className="text-sm font-semibold">When does this step trigger?</h4>
            <p className="text-xs text-muted-foreground">
              Conditional steps are included in the chain only when the workflow&apos;s{' '}
              <span className="font-medium">
                {WORKFLOW_DISCRIMINATOR_LABEL[workflowKey] ?? 'discriminator'}
              </span>{' '}
              matches one of the values you pick.
            </p>
          </div>

          {options.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No conditional triggers configured for this workflow yet.
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="flex items-start gap-2 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name={`cond-${step.id}`}
                    checked={!draftConditional}
                    onChange={() => setDraftConditional(false)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-medium text-foreground">Always trigger</div>
                    <div className="text-muted-foreground">Step runs on every workflow instance.</div>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name={`cond-${step.id}`}
                    checked={draftConditional}
                    onChange={() => setDraftConditional(true)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-medium text-foreground">Only on:</div>
                    <div className="text-muted-foreground">Pick one or more trigger values below.</div>
                  </div>
                </label>
              </div>

              {draftConditional && (
                <div className="rounded border p-2 space-y-1.5">
                  {options.map((opt) => {
                    const checked = draftTypes.includes(opt.value)
                    return (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-xs">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleType(opt.value)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    )
                  })}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setOpen(false)}
                  disabled={update.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleSave}
                  disabled={update.isPending}
                >
                  {update.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  Save
                </Button>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── Add-step inline row ──────────────────────────────────────────────────────

interface AddStepRowProps {
  workflow:       Workflow
  groupId:        string
  availableRoles: CustomRole[]
  onDone:         () => void
}

function AddStepRow({ workflow, groupId, availableRoles, onDone }: AddStepRowProps) {
  const add = useAddWorkflowStepForRole()

  function handlePick(roleId: string | null) {
    if (!roleId) return
    add.mutateAsync({ workflow, role_id: roleId, group_id: groupId })
      .then(() => {
        toast.success('Step added')
        onDone()
      })
      .catch((err: Error) => toast.error(err.message))
  }

  return (
    <div className="flex items-center gap-2 pl-5 pr-1 py-1.5">
      <Select
        value=""
        onValueChange={handlePick}
        disabled={add.isPending || availableRoles.length === 0}
      >
        <SelectTrigger className="h-8 text-xs flex-1">
          <Shield className="h-3 w-3 text-muted-foreground mr-1" />
          <SelectValue placeholder={
            availableRoles.length === 0
              ? 'All approval-slot roles already in this workflow'
              : 'Select an approval-slot role…'
          } />
        </SelectTrigger>
        <SelectContent className="max-h-60 overflow-y-auto">
          {availableRoles.map((r) => (
            <SelectItem key={r.id} value={r.id} className="text-xs">
              <span className="flex items-center gap-2">
                <Shield className="h-3 w-3 text-primary/70" />
                {r.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 text-xs px-2"
        onClick={onDone}
        disabled={add.isPending}
      >
        {add.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Cancel'}
      </Button>
    </div>
  )
}

// ─── Single step row ──────────────────────────────────────────────────────────

interface StepRowProps {
  step:             WorkflowStep
  index:            number
  isOwner:          boolean
  profileId:        string | null
  approvalRoles:    CustomRole[]
}

function StepRow({ step, index, isOwner, profileId, approvalRoles }: StepRowProps) {
  const toggle      = useToggleWorkflowStep()
  const deleteStep  = useDeleteWorkflowStep()
  const updateRole  = useUpdateWorkflowStepRole()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const isOwnerStep   = step.step_key === 'owner'
  const displayName   = step.custom_roles?.name ?? step.step_label

  function handleToggle(checked: boolean) {
    toggle.mutateAsync({ stepId: step.id, active: checked })
      .catch((err: Error) => toast.error(err.message))
  }

  function handleRoleChange(roleId: string | null) {
    if (!roleId || roleId === step.role_id) return
    updateRole.mutateAsync({ stepId: step.id, roleId })
      .then(() => toast.success('Step role updated'))
      .catch((err: Error) => toast.error(err.message))
  }

  function handleDeleteConfirm() {
    if (!profileId) return
    deleteStep.mutateAsync({ stepId: step.id, profileId })
      .then(() => { toast.success('Step deleted'); setConfirmOpen(false) })
      .catch((err: Error) => { toast.error(err.message); setConfirmOpen(false) })
  }

  return (
    <>
      <div className="flex items-center gap-2 pl-5 pr-1 py-1.5 group">
        <span className="text-[10px] text-muted-foreground w-4 shrink-0 tabular-nums text-right">
          {index + 1}.
        </span>

        <div className="flex flex-1 items-center gap-1.5 min-w-0">
          <Select
            value={step.role_id}
            onValueChange={handleRoleChange}
            disabled={updateRole.isPending || !step.is_active}
          >
            <SelectTrigger className="h-7 text-xs w-44 min-w-0">
              <SelectValue>{displayName}</SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-60 overflow-y-auto">
              {approvalRoles.map((r) => (
                <SelectItem key={r.id} value={r.id} className="text-xs">
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isOwnerStep && (
            <Star className="h-3 w-3 text-amber-500 shrink-0" aria-label="Owner step" />
          )}

          {!isOwnerStep && <StepConditionPopover step={step} canEdit={isOwner} />}
        </div>

        <Switch
          checked={step.is_active}
          onCheckedChange={handleToggle}
          disabled={toggle.isPending}
          className="shrink-0"
        />

        {isOwner && !isOwnerStep && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={deleteStep.isPending}
            aria-label="Delete step"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}

        {(!isOwner || isOwnerStep) && (
          <span className="w-6 shrink-0" />
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete step?"
        description={`This will remove "${displayName}" from the approval chain. This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        isPending={deleteStep.isPending}
        onConfirm={handleDeleteConfirm}
      />
    </>
  )
}

// ─── Group section (path within a workflow) ──────────────────────────────────

interface GroupSectionProps {
  group:            WorkflowGroup
  steps:            WorkflowStep[]
  allWorkflowSteps: WorkflowStep[]
  isOwner:          boolean
  profileId:        string | null
  approvalRoles:    CustomRole[]
  groupCount:       number
}

function GroupSection({ group, steps, allWorkflowSteps, isOwner, profileId, approvalRoles, groupCount }: GroupSectionProps) {
  const [addingStep, setAddingStep] = useState(false)
  const [editingLabel, setEditingLabel] = useState(false)
  const [draftLabel, setDraftLabel] = useState(group.group_label)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const updateGroup = useUpdateWorkflowGroup()
  const deleteGroup = useDeleteWorkflowGroup()

  const usedRoleIds = new Set(allWorkflowSteps.map((s) => s.role_id))
  const availableRoles = approvalRoles.filter((r) => !usedRoleIds.has(r.id))
  const activeCount = steps.filter((s) => s.is_active).length

  function handleModeChange(mode: string | null) {
    if (!mode) return
    updateGroup.mutateAsync({ id: group.id, mode: mode as 'any_one' | 'all_must' })
      .then(() => toast.success('Path mode updated'))
      .catch((err: Error) => toast.error(err.message))
  }

  function handleRenameConfirm() {
    const trimmed = draftLabel.trim()
    if (!trimmed || trimmed === group.group_label) {
      setEditingLabel(false)
      return
    }
    updateGroup.mutateAsync({ id: group.id, group_label: trimmed })
      .then(() => { toast.success('Path renamed'); setEditingLabel(false) })
      .catch((err: Error) => toast.error(err.message))
  }

  function handleDeleteConfirm() {
    deleteGroup.mutateAsync(group.id)
      .then(() => { toast.success('Path deleted'); setConfirmDelete(false) })
      .catch((err: Error) => { toast.error(err.message); setConfirmDelete(false) })
  }

  return (
    <>
      <div className="border-l-2 border-primary/20 ml-3">
        {/* Group header */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/20">
          <GitBranch className="h-3 w-3 text-primary/60 shrink-0" />

          {editingLabel ? (
            <div className="flex items-center gap-1 flex-1">
              <Input
                className="h-6 text-xs w-32"
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameConfirm()
                  if (e.key === 'Escape') setEditingLabel(false)
                }}
                autoFocus
              />
              <Button size="icon" variant="ghost" className="h-5 w-5 text-green-600" onClick={handleRenameConfirm}>
                <Check className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setEditingLabel(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              className="text-xs font-medium text-foreground/80 hover:text-foreground flex items-center gap-1"
              onClick={() => { setDraftLabel(group.group_label); setEditingLabel(true) }}
              disabled={!isOwner}
            >
              {group.group_label}
              {isOwner && <Pencil className="h-2.5 w-2.5 text-muted-foreground" />}
            </button>
          )}

          <Select value={group.mode} onValueChange={handleModeChange} disabled={!isOwner}>
            <SelectTrigger className="h-6 text-[10px] w-auto min-w-[130px] gap-1 border-dashed">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-60 overflow-y-auto">
              <SelectItem value="any_one" className="text-xs">Any one approves</SelectItem>
              <SelectItem value="all_must" className="text-xs">All must approve</SelectItem>
            </SelectContent>
          </Select>

          <span className="text-[10px] text-muted-foreground tabular-nums ml-auto">
            {activeCount}/{steps.length}
          </span>

          {isOwner && groupCount > 1 && steps.length === 0 && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-5 w-5 text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={deleteGroup.isPending}
              aria-label="Delete path"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Steps */}
        <div className="divide-y divide-border/30">
          {steps.map((step, i) => (
            <StepRow
              key={step.id}
              step={step}
              index={i}
              isOwner={isOwner}
              profileId={profileId}
              approvalRoles={approvalRoles}
            />
          ))}

          {addingStep ? (
            <AddStepRow
              workflow={group.workflow as Workflow}
              groupId={group.id}
              availableRoles={availableRoles}
              onDone={() => setAddingStep(false)}
            />
          ) : (
            <div className="pl-5 pr-1 py-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
                onClick={() => setAddingStep(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add step
              </Button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete path?"
        description={`This will remove the "${group.group_label}" path. Steps must be deleted first.`}
        confirmLabel="Delete"
        variant="destructive"
        isPending={deleteGroup.isPending}
        onConfirm={handleDeleteConfirm}
      />
    </>
  )
}

// ─── Workflow section ─────────────────────────────────────────────────────────

interface WorkflowSectionProps {
  workflow:      Workflow
  groups:        WorkflowGroup[]
  steps:         WorkflowStep[]
  isOwner:       boolean
  profileId:     string | null
  approvalRoles: CustomRole[]
}

function WorkflowSection({ workflow, groups, steps, isOwner, profileId, approvalRoles }: WorkflowSectionProps) {
  const [expanded, setExpanded] = useState(true)
  const createGroup = useCreateWorkflowGroup()

  const label = WORKFLOW_LABELS[workflow]
  const activeSteps = steps.filter((s) => s.is_active).length
  const totalSteps  = steps.length

  function stepsByGroup(groupId: string) {
    return steps.filter((s) => s.group_id === groupId)
  }

  function handleAddPath() {
    createGroup.mutateAsync({
      workflow,
      group_label: `Path ${groups.length + 1}`,
      mode: 'any_one',
    })
      .then(() => toast.success('New path added'))
      .catch((err: Error) => toast.error(err.message))
  }

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded
          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        }
        <span className="text-xs font-semibold flex-1">{label}</span>
        {groups.length > 1 && (
          <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">
            {groups.length} paths
          </Badge>
        )}
        <span className="text-[10px] text-muted-foreground tabular-nums">
          ({activeSteps}/{totalSteps})
        </span>
      </button>

      {expanded && (
        <div className="py-1 space-y-1">
          {groups.length > 1 && (
            <p className="px-3 py-0.5 text-[10px] text-muted-foreground italic">
              Any path completing = approved
            </p>
          )}

          {groups.length === 0 && totalSteps === 0 && !isOwner && (
            <p className="px-3 py-3 text-xs text-muted-foreground text-center">
              No approval steps configured for this workflow.
            </p>
          )}

          {groups.map((g) => (
            <GroupSection
              key={g.id}
              group={g}
              steps={stepsByGroup(g.id)}
              allWorkflowSteps={steps}
              isOwner={isOwner}
              profileId={profileId}
              approvalRoles={approvalRoles}
              groupCount={groups.length}
            />
          ))}

          {isOwner && (
            <div className="px-3 py-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
                onClick={handleAddPath}
                disabled={createGroup.isPending}
              >
                {createGroup.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <GitBranch className="h-3.5 w-3.5" />
                }
                Add path
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Global chain management view ─────────────────────────────────────────────

export function ApprovalChainManagement() {
  const { data: steps, isLoading: stepsLoading }   = useWorkflowSteps()
  const { data: groups, isLoading: groupsLoading }  = useWorkflowGroups()
  const { data: roles }                             = useRoles()
  const { data: profile }                           = useCurrentUserProfile()
  const { data: permissions }                       = usePermissions()

  const isOwner = permissions?.isSystemAdmin === true ||
    (permissions?.permissions ?? []).includes('system.admin')
  const profileId = profile?.id ?? null

  const approvalRoles = (roles ?? []).filter(
    (r) => Boolean((r as CustomRole & { is_approval_slot?: boolean }).is_approval_slot)
  )

  const isLoading = stepsLoading || groupsLoading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Loading approval chains…</span>
      </div>
    )
  }

  const allSteps  = steps ?? []
  const allGroups = groups ?? []

  const groupsByWorkflow = (w: Workflow) =>
    allGroups.filter((g) => g.workflow === w).sort((a, b) => a.group_order - b.group_order)

  const stepsByWorkflow = (w: Workflow) =>
    allSteps.filter((s) => s.workflow === w)

  return (
    <div className="flex flex-col gap-3">
      {WORKFLOWS.map((w) => (
        <WorkflowSection
          key={w}
          workflow={w}
          groups={groupsByWorkflow(w)}
          steps={stepsByWorkflow(w)}
          isOwner={isOwner}
          profileId={profileId}
          approvalRoles={approvalRoles}
        />
      ))}

      <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
        <p>
          <Star className="inline h-2.5 w-2.5 text-amber-500 mr-0.5 -mt-0.5" />
          Owner step.{' '}
          <Zap className="inline h-2.5 w-2.5 mr-0.5 -mt-0.5" />
          Conditional steps only apply for matching types.{' '}
          <GitBranch className="inline h-2.5 w-2.5 mr-0.5 -mt-0.5" />
          Paths are OR — any path completing approves the request.
          {!isOwner && ' Only owners can manage paths and delete steps.'}
        </p>
      </div>
    </div>
  )
}
