'use client'

import { Calendar, Flag, CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { nanoid } from 'nanoid'
import { cn } from '@/lib/utils'
import { paymentPeriodCount, computeMilestoneAmounts } from '@/lib/contractUtils'
import type { ContractMilestone } from '@/types/contracts'

interface Props {
  mode: 'fixed' | 'milestone' | 'completion'
  frequency: string
  milestones: ContractMilestone[]
  contractTotal: number
  discount: number
  startDate: string
  endDate: string
  editable: boolean
  onChange: (updates: {
    mode?: 'fixed' | 'milestone' | 'completion'
    frequency?: string
    milestones?: ContractMilestone[]
  }) => void
}

const FREQUENCIES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'semi_annual', label: 'Semi-Annual' },
  { value: 'annual', label: 'Annual' },
]

export function PaymentScheduleSection({
  mode, frequency, milestones, contractTotal, discount, startDate, endDate, editable, onChange,
}: Props) {
  const netTotal = Math.max(contractTotal - discount, 0)
  const periodCount = paymentPeriodCount(startDate, endDate, frequency)
  const paymentAmount = periodCount > 0 ? Math.round(netTotal / periodCount) : netTotal

  const milestonePercentSum = milestones.reduce((s, m) => s + m.percentage, 0)
  const milestonesValid = Math.abs(milestonePercentSum - 100) < 0.01

  function handleAddMilestone() {
    const newMilestone: ContractMilestone = {
      id: nanoid(),
      contract_id: '',
      name: '',
      percentage: 0,
      amount: 0,
      due_date: null,
      sort_order: milestones.length,
      _isNew: true,
      _isDirty: true,
    }
    onChange({ milestones: [...milestones, newMilestone] })
  }

  function handleMilestoneChange(idx: number, field: string, value: unknown) {
    const updated = milestones.map((m, i) => {
      if (i !== idx) return m
      return { ...m, [field]: value, _isDirty: true }
    })
    const withAmounts = computeMilestoneAmounts(updated, netTotal)
    onChange({ milestones: withAmounts })
  }

  function handleRemoveMilestone(idx: number) {
    const updated = milestones.filter((_, i) => i !== idx)
    const withAmounts = computeMilestoneAmounts(updated, netTotal)
    onChange({ milestones: withAmounts })
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[
          { key: 'fixed' as const, icon: Calendar, label: 'Fixed' },
          { key: 'milestone' as const, icon: Flag, label: 'Milestone' },
          { key: 'completion' as const, icon: CheckCircle2, label: 'Completion' },
        ].map(({ key, icon: Icon, label }) => (
          <Button
            key={key}
            variant={mode === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => editable && onChange({ mode: key })}
            disabled={!editable}
          >
            <Icon className="h-3.5 w-3.5 mr-1" />
            {label}
          </Button>
        ))}
      </div>

      {mode === 'fixed' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {FREQUENCIES.map((f) => (
              <Button
                key={f.value}
                variant={frequency === f.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => editable && onChange({ frequency: f.value })}
                disabled={!editable}
              >
                {f.label}
              </Button>
            ))}
          </div>
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="font-medium">
              Payment Amount ({FREQUENCIES.find((f) => f.value === frequency)?.label || frequency}): {paymentAmount.toLocaleString()} QAR
            </p>
            <p className="text-sm text-muted-foreground">
              {periodCount} payment{periodCount !== 1 ? 's' : ''} over the contract period
            </p>
          </div>
        </div>
      )}

      {mode === 'milestone' && (
        <div className="space-y-3">
          {editable && (
            <Button variant="outline" size="sm" onClick={handleAddMilestone}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Milestone
            </Button>
          )}

          <div className="space-y-1">
            <div className="h-3 bg-muted rounded-full overflow-hidden flex">
              {milestones.map((m, i) => (
                <div
                  key={m.id}
                  className={cn('h-full', [
                    'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 'bg-pink-500',
                  ][i % 5])}
                  style={{ width: `${m.percentage}%` }}
                />
              ))}
            </div>
            <p className={cn('text-xs font-medium', milestonesValid ? 'text-success' : 'text-destructive')}>
              Total: {milestonePercentSum.toFixed(2)}%
              {milestonesValid ? ' ✓' : ' — Must equal 100%'}
            </p>
          </div>

          <div className="space-y-2">
            {milestones.map((m, idx) => (
              <div key={m.id} className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground w-5">{idx + 1}</span>
                <Input
                  className="h-8 text-sm flex-1 min-w-[120px]"
                  placeholder="Milestone name"
                  value={m.name}
                  onChange={(e) => handleMilestoneChange(idx, 'name', e.target.value)}
                  disabled={!editable}
                />
                <div className="flex items-center gap-1">
                  <Input
                    className="h-8 text-sm w-16"
                    type="number"
                    value={m.percentage || ''}
                    onChange={(e) => handleMilestoneChange(idx, 'percentage', Number(e.target.value))}
                    disabled={!editable}
                  />
                  <span className="text-xs">%</span>
                </div>
                <span className="text-sm w-24 text-right">{m.amount.toLocaleString()} QAR</span>
                <DatePicker
                  className="h-8 text-sm w-36"
                  value={m.due_date || ''}
                  onChange={(val) => handleMilestoneChange(idx, 'due_date', val)}
                  disabled={!editable}
                  placeholder="Due date"
                />
                {editable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive"
                    onClick={() => handleRemoveMilestone(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === 'completion' && (
        <div className="bg-yellow-50 rounded-lg p-4">
          <p className="font-medium">Full payment due upon contract completion</p>
          <p className="text-sm text-muted-foreground">
            Total: {netTotal.toLocaleString()} QAR
          </p>
          <p className="text-sm text-muted-foreground">
            Due: {endDate} (contract end date)
          </p>
        </div>
      )}
    </div>
  )
}
