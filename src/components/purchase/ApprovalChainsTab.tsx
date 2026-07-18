// src/components/purchase/ApprovalChainsTab.tsx
'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Plus, Trash2, Pencil, Check, X, AlertTriangle, Archive,
  Wallet, Infinity as InfinityIcon, ShieldCheck, Users2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { cn } from '@/lib/utils'
import {
  useApprovalChains, useUpsertApprovalChain,
  useUpsertApprovalChainTier, useSoftDeleteApprovalChainTier,
  useToggleChainActive, useArchiveApprovalChain,
} from '@/hooks/useApprovalChains'
import { useIsAdmin } from '@/hooks/useProfiles'
import { useDivisions } from '@/hooks/useDivisions'
import { useRoles, useApprovalRoleCoverage } from '@/hooks/useRoles'
import { useWorkflowSteps } from '@/hooks/useWorkflowSteps'

type TierForm = { min_amount: string; max_amount: string; roles: string[] }
const EMPTY_FORM: TierForm = { min_amount: '', max_amount: '', roles: [] }

const FALLBACK_ROLE_COLOR = 'bg-muted text-muted-foreground border-border'

function formatAmountDisplay(raw: string): string {
  const digits = raw.replace(/[^0-9.]/g, '')
  if (!digits) return ''
  const [whole, dec] = digits.split('.')
  const formatted = Number(whole).toLocaleString('en-US')
  return dec !== undefined ? `${formatted}.${dec}` : formatted
}

function stripCommas(v: string): string {
  return v.replace(/,/g, '')
}

export function ApprovalChainsTab() {
  const { data: chains = [], isLoading } = useApprovalChains()
  const { data: isAdmin } = useIsAdmin()
  const { data: allRoles = [], isLoading: rolesLoading } = useRoles()
  const { data: coveredRoles } = useApprovalRoleCoverage()
  const { data: workflowSteps = [], isLoading: stepsLoading } = useWorkflowSteps()
  const upsertChain = useUpsertApprovalChain()
  const upsertTier = useUpsertApprovalChainTier()
  const deleteTier = useSoftDeleteApprovalChainTier()
  const toggleActive = useToggleChainActive()
  const archiveChain = useArchiveApprovalChain()

  const { data: divisions = [] } = useDivisions()

  // PO-chain roles = roles bound to an ACTIVE step in the "po" workflow
  // (Approval Chain Management → PO Approvals). Order follows step_order so
  // chips read in the same sequence as the workflow.
  const approvalRoles = useMemo(() => {
    const poStepRoleIds = workflowSteps
      .filter((s) => s.workflow === 'po' && s.is_active)
      .sort((a, b) => a.step_order - b.step_order)
      .map((s) => s.role_id)
    const byId = new Map(allRoles.map((r) => [r.id, r]))
    return poStepRoleIds
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => !!r && !r.deleted_at)
  }, [allRoles, workflowSteps])

  const roleColorByName = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of approvalRoles) m.set(r.name, r.color ?? FALLBACK_ROLE_COLOR)
    return m
  }, [approvalRoles])

  const [newChainName, setNewChainName] = useState('')
  const [newChainDivision, setNewChainDivision] = useState<string>('')
  const [addingTierFor, setAddingTierFor] = useState<string | null>(null)
  const [tierForm, setTierForm] = useState<TierForm>(EMPTY_FORM)
  const [editingTier, setEditingTier] = useState<{ tierId: string; chainId: string; form: TierForm } | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null)

  const hasGlobalChain = chains.some((c) => !c.division_id)
  const usedDivisionIds = useMemo(() => new Set(chains.map((c) => c.division_id).filter(Boolean)), [chains])
  const availableDivisions = divisions.filter((d) => !usedDivisionIds.has(d.id))

  function getDivisionName(chain: (typeof chains)[number]): string | null {
    if (!chain.division_id) return null
    if (chain.divisions) return chain.divisions.short_name ?? chain.divisions.name
    const div = divisions.find((d) => d.id === chain.division_id)
    return div ? (div.short_name ?? div.name) : null
  }

  function missingAssigneeRoles(roles: string[]): string[] {
    if (!coveredRoles) return []
    return roles.filter((r) => !coveredRoles.has(r))
  }

  function parseTierForm(form: TierForm) {
    return {
      min_amount: parseFloat(form.min_amount),
      max_amount: form.max_amount ? parseFloat(form.max_amount) : null,
    }
  }

  function nextRank(chainId: string): number {
    const chain = chains.find((c) => c.id === chainId)
    const tiers = (chain?.approval_chain_tiers ?? []).filter((t) => !t.deleted_at)
    return tiers.length + 1
  }

  function toggleRoleIn(roles: string[], roleName: string): string[] {
    return roles.includes(roleName)
      ? roles.filter((r) => r !== roleName)
      : [...roles, roleName]
  }

  function handleAddChain() {
    if (!newChainName.trim()) return
    const divisionId = newChainDivision || null
    if (!divisionId && hasGlobalChain) {
      toast.error('A company default chain already exists. Select a division for an override.')
      return
    }
    upsertChain.mutate(
      { division_id: divisionId, name: newChainName.trim() },
      {
        onSuccess: () => { setNewChainName(''); setNewChainDivision(''); toast.success('Chain created') },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  function handleAddTier(chainId: string) {
    const { min_amount } = parseTierForm(tierForm)
    if (isNaN(min_amount) || tierForm.roles.length === 0) {
      toast.error('Fill min amount and select at least one role')
      return
    }
    upsertTier.mutate(
      { chain_id: chainId, rank: nextRank(chainId), min_amount, max_amount: parseTierForm(tierForm).max_amount, required_roles: tierForm.roles },
      {
        onSuccess: () => { setAddingTierFor(null); setTierForm(EMPTY_FORM); toast.success('Tier added') },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  function startEditTier(tier: NonNullable<(typeof chains)[number]['approval_chain_tiers']>[number], chainId: string) {
    setEditingTier({
      tierId: tier.id,
      chainId,
      form: {
        min_amount: String(tier.min_amount),
        max_amount: tier.max_amount ? String(tier.max_amount) : '',
        roles: tier.required_roles as string[],
      },
    })
  }

  function handleSaveEdit() {
    if (!editingTier) return
    const { min_amount } = parseTierForm(editingTier.form)
    if (isNaN(min_amount) || editingTier.form.roles.length === 0) {
      toast.error('Fill min amount and select at least one role')
      return
    }
    const chain = chains.find((c) => c.id === editingTier.chainId)
    const tiers = (chain?.approval_chain_tiers ?? []).filter((t) => !t.deleted_at)
    const existingTier = tiers.find((t) => t.id === editingTier.tierId)
    upsertTier.mutate(
      {
        id: editingTier.tierId,
        chain_id: editingTier.chainId,
        rank: existingTier?.rank ?? 1,
        min_amount,
        max_amount: parseTierForm(editingTier.form).max_amount,
        required_roles: editingTier.form.roles,
      },
      {
        onSuccess: () => { setEditingTier(null); toast.success('Tier updated') },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  function handleToggleActive(chain: (typeof chains)[number]) {
    const newActive = !chain.is_active
    const divName = getDivisionName(chain)
    toggleActive.mutate(
      { id: chain.id, is_active: newActive },
      {
        onSuccess: () => {
          toast.success(
            newActive
              ? `"${chain.name}" is now active for ${divName ?? 'company'}`
              : `${divName ?? 'Division'} will use Company Default`,
          )
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading…</div>

  return (
    <div className="space-y-6">
      {chains.length === 0 && (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No approval chains configured. Create a company default chain below.
        </div>
      )}

      {chains.map((chain) => {
        const tiers = (chain.approval_chain_tiers ?? [])
          .filter((t) => !t.deleted_at)
          .sort((a, b) => a.rank - b.rank)
        const divName = getDivisionName(chain)
        const isGlobal = !chain.division_id
        const isActive = chain.is_active

        return (
          <div
            key={chain.id}
            className={cn(
              'rounded-lg border p-4 space-y-3 transition-opacity',
              !isActive && !isGlobal && 'opacity-60 border-dashed',
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{chain.name}</span>
                {isGlobal ? (
                  <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                    Company Default
                  </Badge>
                ) : (
                  <Badge className="text-[10px] bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100">
                    {divName ?? 'Division'}
                  </Badge>
                )}
                {!isGlobal && !isActive && (
                  <span className="text-[10px] text-muted-foreground italic">Using Company Default</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!isGlobal && isAdmin && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {isActive ? 'Active' : 'Inactive'}
                    </span>
                    <Switch
                      checked={isActive}
                      onCheckedChange={() => handleToggleActive(chain)}
                      disabled={toggleActive.isPending}
                    />
                  </div>
                )}
                {isAdmin && (
                  <Button size="sm" variant="outline" onClick={() => { setAddingTierFor(chain.id); setTierForm(EMPTY_FORM) }}>
                    <Plus className="h-3 w-3 mr-1" /> Add Tier
                  </Button>
                )}
                {!isGlobal && isAdmin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setArchiveTarget({ id: chain.id, name: chain.name })}
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Min Amount (QAR)</TableHead>
                  <TableHead>Max Amount</TableHead>
                  <TableHead>Required Roles</TableHead>
                  {isAdmin && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tiers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 5 : 4} className="text-center text-muted-foreground text-sm h-10">
                      No tiers yet
                    </TableCell>
                  </TableRow>
                ) : (
                  tiers.map((tier, idx) => {
                    const isEditing = editingTier?.tierId === tier.id
                    const missing = missingAssigneeRoles(tier.required_roles as string[])

                    if (isEditing) {
                      return (
                        <TableRow key={tier.id} className="bg-muted/30">
                          <TableCell className="font-mono text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell>
                            <Input
                              className="h-8 w-28 text-xs"
                              inputMode="decimal"
                              value={formatAmountDisplay(editingTier!.form.min_amount)}
                              onChange={(e) => setEditingTier((s) => s ? { ...s, form: { ...s.form, min_amount: stripCommas(e.target.value) } } : s)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 w-28 text-xs"
                              inputMode="decimal"
                              placeholder="∞"
                              value={formatAmountDisplay(editingTier!.form.max_amount)}
                              onChange={(e) => setEditingTier((s) => s ? { ...s, form: { ...s.form, max_amount: stripCommas(e.target.value) } } : s)}
                            />
                          </TableCell>
                          <TableCell>
                            <RoleChipGroup
                              roles={approvalRoles}
                              loading={rolesLoading || stepsLoading}
                              selected={editingTier!.form.roles}
                              coveredRoles={coveredRoles}
                              onToggle={(name) => setEditingTier((s) =>
                                s ? { ...s, form: { ...s.form, roles: toggleRoleIn(s.form.roles, name) } } : s,
                              )}
                              size="sm"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSaveEdit} disabled={upsertTier.isPending}>
                                <Check className="h-3.5 w-3.5 text-success" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingTier(null)}>
                                <X className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    }

                    return (
                      <TableRow key={tier.id}>
                        <TableCell className="font-mono text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>{Number(tier.min_amount).toLocaleString('en-QA')}</TableCell>
                        <TableCell>
                          {tier.max_amount ? (
                            Number(tier.max_amount).toLocaleString('en-QA')
                          ) : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <InfinityIcon className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1.5 items-center">
                            {tier.required_roles.map((r: string) => {
                              const isMissing = missing.includes(r)
                              return (
                                <span
                                  key={r}
                                  className={cn(
                                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                                    isMissing
                                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                                      : roleColorByName.get(r) ?? FALLBACK_ROLE_COLOR,
                                  )}
                                  title={isMissing ? `${r} has no assignees — assign a user in Users & Roles` : undefined}
                                >
                                  {isMissing && <AlertTriangle className="h-3 w-3" />}
                                  {r}
                                </span>
                              )
                            })}
                          </div>
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditTier(tier, chain.id)}>
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => deleteTier.mutate({ tierId: tier.id, chainId: chain.id }, { onError: (e) => toast.error(e.message) })}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>

            {addingTierFor === chain.id && isAdmin && (
              <NewTierCard
                form={tierForm}
                onChange={setTierForm}
                roles={approvalRoles}
                rolesLoading={rolesLoading || stepsLoading}
                coveredRoles={coveredRoles}
                onCancel={() => { setAddingTierFor(null); setTierForm(EMPTY_FORM) }}
                onSave={() => handleAddTier(chain.id)}
                saving={upsertTier.isPending}
              />
            )}
          </div>
        )
      })}

      {isAdmin && (
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Chain name"
            value={newChainName}
            onChange={(e) => setNewChainName(e.target.value)}
            className="max-w-[200px]"
          />
          {hasGlobalChain ? (
            <Select value={newChainDivision} onValueChange={(v) => setNewChainDivision(v ?? '')}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select division…" />
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                {availableDivisions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.short_name ?? d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-muted-foreground">Company Default</span>
          )}
          <Button onClick={handleAddChain} disabled={upsertChain.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Create Chain
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!archiveTarget}
        title="Archive approval chain"
        description={`Archive "${archiveTarget?.name}"? The division will fall back to the Company Default chain. You can recreate it later if needed.`}
        confirmLabel="Archive"
        variant="destructive"
        isPending={archiveChain.isPending}
        onConfirm={() => {
          if (archiveTarget) {
            archiveChain.mutate(archiveTarget.id, {
              onSuccess: () => { toast.success('Chain archived'); setArchiveTarget(null) },
              onError: (e) => toast.error(e.message),
            })
          }
        }}
        onOpenChange={(o) => { if (!o) setArchiveTarget(null) }}
      />
    </div>
  )
}

/* ─────────────────────────── helpers ─────────────────────────── */

type Role = { id: string; name: string; color: string | null; is_approval_slot?: boolean; deleted_at: string | null }

function RoleChipGroup({
  roles, loading, selected, coveredRoles, onToggle, size = 'md',
}: {
  roles: Role[]
  loading: boolean
  selected: string[]
  coveredRoles?: Set<string>
  onToggle: (name: string) => void
  size?: 'sm' | 'md'
}) {
  if (loading) {
    return <span className="text-xs text-muted-foreground">Loading roles…</span>
  }
  if (roles.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        No active roles in the PO Approvals workflow. Add a step in Users &amp; Roles → Approval Chain Management.
      </span>
    )
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {roles.map((r) => {
        const active = selected.includes(r.name)
        const color = r.color ?? FALLBACK_ROLE_COLOR
        const unassigned = !!coveredRoles && !coveredRoles.has(r.name)
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onToggle(r.name)}
            className={cn(
              'group inline-flex items-center gap-1 rounded-full border font-medium transition-all duration-150',
              size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-xs',
              active
                ? cn(color, 'ring-2 ring-offset-1 ring-primary/40 shadow-sm')
                : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground',
            )}
            aria-pressed={active}
            title={unassigned ? `${r.name} has no users assigned in Users & Roles` : r.name}
          >
            <Check
              className={cn(
                'h-3 w-3 transition-all',
                active ? 'opacity-100 scale-100' : 'opacity-0 scale-75 -ml-3.5',
              )}
            />
            <span>{r.name}</span>
            {unassigned && (
              <AlertTriangle className={cn(
                'h-3 w-3 shrink-0',
                active ? 'text-amber-700' : 'text-amber-500',
              )} />
            )}
          </button>
        )
      })}
    </div>
  )
}

function NewTierCard({
  form, onChange, roles, rolesLoading, coveredRoles, onCancel, onSave, saving,
}: {
  form: TierForm
  onChange: (next: TierForm) => void
  roles: Role[]
  rolesLoading: boolean
  coveredRoles?: Set<string>
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  function patch<K extends keyof TierForm>(key: K, value: TierForm[K]) {
    onChange({ ...form, [key]: value })
  }
  function toggleRole(name: string) {
    onChange({
      ...form,
      roles: form.roles.includes(name)
        ? form.roles.filter((r) => r !== name)
        : [...form.roles, name],
    })
  }

  const canSave =
    form.min_amount.trim() !== '' &&
    form.roles.length > 0 &&
    !saving

  return (
    <div className="relative rounded-xl border bg-gradient-to-b from-primary/5 via-background to-background p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-none">New Tier</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Set the amount band and pick who must approve.
            </p>
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground"
          onClick={onCancel}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FieldWithIcon
          id="tier-min"
          label="Min Amount (QAR)"
          icon={<Wallet className="h-3.5 w-3.5" />}
          placeholder="0"
          value={form.min_amount}
          onChange={(v) => patch('min_amount', v)}
          formatCommas
        />
        <FieldWithIcon
          id="tier-max"
          label="Max Amount"
          icon={<InfinityIcon className="h-3.5 w-3.5" />}
          placeholder="Leave empty for ∞"
          value={form.max_amount}
          onChange={(v) => patch('max_amount', v)}
          formatCommas
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium text-muted-foreground inline-flex items-center gap-1.5">
            <Users2 className="h-3.5 w-3.5" />
            Approvers required at this tier
          </Label>
          <span className="text-[10px] text-muted-foreground">
            {form.roles.length} selected
          </span>
        </div>
        <RoleChipGroup
          roles={roles}
          loading={rolesLoading}
          selected={form.roles}
          coveredRoles={coveredRoles}
          onToggle={toggleRole}
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" onClick={onSave} disabled={!canSave}>
          {saving ? 'Saving…' : 'Save Tier'}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function FieldWithIcon({
  id, label, icon, placeholder, value, onChange, formatCommas,
}: {
  id: string
  label: string
  icon: React.ReactNode
  placeholder: string
  value: string
  onChange: (v: string) => void
  formatCommas?: boolean
}) {
  return (
    <div className="space-y-1">
      <Label
        htmlFor={id}
        className="text-[11px] font-medium text-muted-foreground inline-flex items-center gap-1.5"
      >
        {icon}
        {label}
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        placeholder={placeholder}
        value={formatCommas ? formatAmountDisplay(value) : value}
        onChange={(e) => onChange(formatCommas ? stripCommas(e.target.value) : e.target.value)}
        className="h-9"
      />
    </div>
  )
}
