'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Archive, Star, Zap, Loader2, Shield, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import {
  useWorkflowSteps,
  useAddWorkflowStepForRole,
  useToggleWorkflowStep,
  useArchiveWorkflowStep,
  useUpdateWorkflowStepRole,
  useUpdateWorkflowStepConditions,
  type WorkflowStep,
} from '@/hooks/useWorkflowSteps'
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

const WORKFLOWS: Workflow[] = ['po', 'inv_check', 'stock_adj', 'sales_margin', 'sales_credit', 'credit_group']

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

  // Reset draft when popover opens
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

  // Read-only display for non-admins
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
  availableRoles: CustomRole[]
  onDone:         () => void
}

function AddStepRow({ workflow, availableRoles, onDone }: AddStepRowProps) {
  const add = useAddWorkflowStepForRole()

  function handlePick(roleId: string | null) {
    if (!roleId) return
    add.mutateAsync({ workflow, role_id: roleId })
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
        <SelectContent>
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
  const archive     = useArchiveWorkflowStep()
  const updateRole  = useUpdateWorkflowStepRole()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const isOwnerStep   = step.step_key === 'owner'
  const isConditional = step.is_conditional && step.condition_types.length > 0
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

  function handleArchiveConfirm() {
    if (!profileId) return
    archive.mutateAsync({ stepId: step.id, profileId })
      .then(() => { toast.success('Step archived'); setConfirmOpen(false) })
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
            <SelectContent>
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
            disabled={archive.isPending}
            aria-label="Archive step"
          >
            <Archive className="h-3.5 w-3.5" />
          </Button>
        )}

        {(!isOwner || isOwnerStep) && (
          <span className="w-6 shrink-0" />
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Archive step?"
        description={`This will remove "${displayName}" from the approval chain. This cannot be undone.`}
        confirmLabel="Archive"
        variant="destructive"
        isPending={archive.isPending}
        onConfirm={handleArchiveConfirm}
      />
    </>
  )
}

// ─── Workflow section ─────────────────────────────────────────────────────────

interface WorkflowSectionProps {
  workflow:      Workflow
  steps:         WorkflowStep[]
  isOwner:       boolean
  profileId:     string | null
  approvalRoles: CustomRole[]
}

function WorkflowSection({ workflow, steps, isOwner, profileId, approvalRoles }: WorkflowSectionProps) {
  const [expanded,   setExpanded]   = useState(true)
  const [addingStep, setAddingStep] = useState(false)

  const activeCount = steps.filter((s) => s.is_active).length
  const totalCount  = steps.length
  const label       = WORKFLOW_LABELS[workflow]

  // Roles not yet used in this workflow
  const usedRoleIds  = new Set(steps.map((s) => s.role_id))
  const availableRoles = approvalRoles.filter((r) => !usedRoleIds.has(r.id))

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
        <span className="text-[10px] text-muted-foreground tabular-nums">
          ({activeCount}/{totalCount})
        </span>
      </button>

      {expanded && (
        <div className="py-1 divide-y divide-border/50">
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
            <AddStepRow workflow={workflow} availableRoles={availableRoles} onDone={() => setAddingStep(false)} />
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
      )}
    </div>
  )
}

// ─── Global chain management view ─────────────────────────────────────────────

export function ApprovalChainManagement() {
  const { data: steps, isLoading } = useWorkflowSteps()
  const { data: roles }            = useRoles()
  const { data: profile }          = useCurrentUserProfile()
  const { data: permissions }      = usePermissions()

  const isOwner = permissions?.isSystemAdmin === true ||
    (permissions?.permissions ?? []).includes('system.admin')
  const profileId = profile?.id ?? null

  const approvalRoles = (roles ?? []).filter(
    (r) => Boolean((r as CustomRole & { is_approval_slot?: boolean }).is_approval_slot)
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Loading approval chains…</span>
      </div>
    )
  }

  const allSteps   = steps ?? []
  const byWorkflow = (w: Workflow) => allSteps.filter((s) => s.workflow === w)

  return (
    <div className="flex flex-col gap-3">
      {WORKFLOWS.map((w) => (
        <WorkflowSection
          key={w}
          workflow={w}
          steps={byWorkflow(w)}
          isOwner={isOwner}
          profileId={profileId}
          approvalRoles={approvalRoles}
        />
      ))}

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        <Star className="inline h-2.5 w-2.5 text-amber-500 mr-0.5 -mt-0.5" />
        Owner step.{' '}
        <Zap className="inline h-2.5 w-2.5 mr-0.5 -mt-0.5" />
        Conditional steps only apply for matching types. Use the role dropdown to
        bind each step to any approval-slot role.
        {!isOwner && ' Only owners can archive steps.'}
      </p>
    </div>
  )
}
