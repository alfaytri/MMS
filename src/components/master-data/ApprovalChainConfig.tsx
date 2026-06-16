'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Archive, Star, Zap, Loader2, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  type WorkflowStep,
} from '@/hooks/useWorkflowSteps'
import { useRoles, type CustomRole } from '@/hooks/useRoles'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { usePermissions } from '@/hooks/usePermissions'

// ─── Types ────────────────────────────────────────────────────────────────────

type Workflow = 'po' | 'inv_check' | 'stock_adj'

const WORKFLOW_LABELS: Record<Workflow, string> = {
  po:        'PO Approvals',
  inv_check: 'Inventory Check',
  stock_adj: 'Stock Adjustment',
}

const WORKFLOWS: Workflow[] = ['po', 'inv_check', 'stock_adj']

// ─── Add-step inline row ──────────────────────────────────────────────────────

interface AddStepRowProps {
  workflow:       Workflow
  availableRoles: CustomRole[]
  onDone:         () => void
}

function AddStepRow({ workflow, availableRoles, onDone }: AddStepRowProps) {
  const add = useAddWorkflowStepForRole()

  function handlePick(roleId: string) {
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

  function handleRoleChange(roleId: string) {
    if (roleId === step.role_id) return
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

          {isConditional && (
            <Badge
              variant="secondary"
              className="flex items-center gap-0.5 text-[10px] py-0 px-1 h-4 shrink-0"
            >
              <Zap className="h-2.5 w-2.5" />
              {step.condition_types.join('/')}
            </Badge>
          )}
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
