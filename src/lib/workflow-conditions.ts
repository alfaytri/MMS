/**
 * Per-workflow catalog of condition values that an approval step can be gated on.
 *
 * A step in `approval_workflow_steps` can be marked `is_conditional = true` with
 * `condition_types = ['damage', 'write_off']`. At runtime the workflow engine
 * builds the active chain by including non-conditional steps unconditionally
 * and conditional steps only when the workflow's discriminator value (e.g.
 * adjustment_type) is in `condition_types`.
 *
 * To add a new workflow:
 *   1. Add an entry below with its condition options.
 *   2. Loosen the CHECK constraint on approval_workflow_steps.workflow if needed.
 *   3. Wire the runtime engine to evaluate condition_types against the workflow's
 *      discriminator field (e.g. the gate function for stock_adj already does this).
 */

export type WorkflowConditionOption = {
  value: string
  label: string
}

export type WorkflowKey =
  | 'po'
  | 'inv_check'
  | 'stock_adj'
  | 'sales_margin'
  | 'sales_credit'
  | 'credit_group'
  | 'receival_edit'
  | 'consumption_edit'

/** Human-readable name shown in the Approval Chain panel section header. */
export const WORKFLOW_LABELS: Record<WorkflowKey, string> = {
  po:               'PO Approvals',
  inv_check:        'Inventory Check',
  stock_adj:        'Stock Adjustment',
  sales_margin:     'Sales — Margin',
  sales_credit:     'Sales — Credit',
  credit_group:     'Customer — Credit Group',
  receival_edit:    'Receival — Edit Approval',
  consumption_edit: 'Consumption — Cancellation Approval',
}

/** What the runtime discriminator is called for each workflow — for UI hints. */
export const WORKFLOW_DISCRIMINATOR_LABEL: Record<WorkflowKey, string> = {
  po:               'PO type',
  inv_check:        'Adjustment type',
  stock_adj:        'Adjustment type',
  sales_margin:     'Trigger',
  sales_credit:     'Trigger',
  credit_group:     'Trigger',
  receival_edit:    'Trigger',
  consumption_edit: 'Trigger',
}

/**
 * Conditional trigger values per workflow. Empty list = this workflow does not
 * currently expose conditional triggers (the UI will hide the conditional toggle).
 */
export const WORKFLOW_CONDITIONS: Record<WorkflowKey, WorkflowConditionOption[]> = {
  inv_check: [
    { value: 'increase',  label: 'Increase' },
    { value: 'decrease',  label: 'Decrease' },
    { value: 'damage',    label: 'Damage' },
    { value: 'write_off', label: 'Write-off' },
  ],
  stock_adj: [
    { value: 'increase',  label: 'Increase' },
    { value: 'decrease',  label: 'Decrease' },
    { value: 'damage',    label: 'Damage' },
    { value: 'write_off', label: 'Write-off' },
  ],
  po:               [],
  sales_margin:     [],
  sales_credit:     [],
  credit_group:     [],
  receival_edit:    [],
  consumption_edit: [],
}

export function conditionLabel(workflow: string, value: string): string {
  const list = WORKFLOW_CONDITIONS[workflow as WorkflowKey] ?? []
  return list.find((o) => o.value === value)?.label ?? value
}
