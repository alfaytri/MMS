// src/components/purchase/ApprovalChainsTab.tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Pencil, Check, X, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  useApprovalChains, useUpsertApprovalChain,
  useUpsertApprovalChainTier, useSoftDeleteApprovalChainTier,
} from '@/hooks/useApprovalChains'
import { useApprovalRoleAssignments } from '@/hooks/useApprovalRoleAssignments'
import { useIsAdmin } from '@/hooks/useProfiles'
import type { ApprovalRole } from '@/lib/approvalChainResolution'

const APPROVAL_ROLES: ApprovalRole[] = ['purchase_manager', 'accountant', 'owner']
const ROLE_LABELS: Record<ApprovalRole, string> = {
  purchase_manager:  'Purchase Manager',
  accountant:        'Accountant',
  owner:             'Owner',
  employee:          'Employee',
  warehouse_manager: 'Warehouse Manager',
}

type TierForm = { rank: string; min_amount: string; max_amount: string; roles: ApprovalRole[] }
const EMPTY_FORM: TierForm = { rank: '', min_amount: '', max_amount: '', roles: [] }

export function ApprovalChainsTab() {
  const { data: chains = [], isLoading } = useApprovalChains()
  const { data: assignments = [] } = useApprovalRoleAssignments()
  const { data: isAdmin } = useIsAdmin()
  const upsertChain = useUpsertApprovalChain()
  const upsertTier = useUpsertApprovalChainTier()
  const deleteTier = useSoftDeleteApprovalChainTier()

  const [newChainName, setNewChainName] = useState('')
  const [addingTierFor, setAddingTierFor] = useState<string | null>(null)
  const [tierForm, setTierForm] = useState<TierForm>(EMPTY_FORM)
  // editingTierId → { tierId, chainId, form }
  const [editingTier, setEditingTier] = useState<{ tierId: string; chainId: string; form: TierForm } | null>(null)

  function rolesHaveAssignees(roles: ApprovalRole[]): boolean {
    return roles.every((role) => assignments.some((a) => a.role === role && !a.deleted_at))
  }

  function parseTierForm(form: TierForm) {
    return {
      rank: parseInt(form.rank),
      min_amount: parseFloat(form.min_amount),
      max_amount: form.max_amount ? parseFloat(form.max_amount) : null,
    }
  }

  function handleAddChain() {
    if (!newChainName.trim()) return
    upsertChain.mutate(
      { division_id: null, name: newChainName.trim() },
      {
        onSuccess: () => { setNewChainName(''); toast.success('Chain created') },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  function handleAddTier(chainId: string) {
    const { rank, min_amount } = parseTierForm(tierForm)
    if (isNaN(rank) || isNaN(min_amount) || tierForm.roles.length === 0) {
      toast.error('Fill rank, min amount, and select at least one role')
      return
    }
    upsertTier.mutate(
      { chain_id: chainId, rank, min_amount, max_amount: parseTierForm(tierForm).max_amount, required_roles: tierForm.roles },
      {
        onSuccess: () => { setAddingTierFor(null); setTierForm(EMPTY_FORM); toast.success('Tier added') },
        onError: (e) => toast.error(e.message),
      }
    )
  }

  function startEditTier(tier: any, chainId: string) {
    setEditingTier({
      tierId: tier.id,
      chainId,
      form: {
        rank: String(tier.rank),
        min_amount: String(tier.min_amount),
        max_amount: tier.max_amount ? String(tier.max_amount) : '',
        roles: tier.required_roles as ApprovalRole[],
      },
    })
  }

  function handleSaveEdit() {
    if (!editingTier) return
    const { rank, min_amount } = parseTierForm(editingTier.form)
    if (isNaN(rank) || isNaN(min_amount) || editingTier.form.roles.length === 0) {
      toast.error('Fill rank, min amount, and select at least one role')
      return
    }
    upsertTier.mutate(
      {
        id: editingTier.tierId,
        chain_id: editingTier.chainId,
        rank,
        min_amount,
        max_amount: parseTierForm(editingTier.form).max_amount,
        required_roles: editingTier.form.roles,
      },
      {
        onSuccess: () => { setEditingTier(null); toast.success('Tier updated') },
        onError: (e) => toast.error(e.message),
      }
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
          .filter((t: any) => !t.deleted_at)
          .sort((a: any, b: any) => a.rank - b.rank)

        return (
          <div key={chain.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold">{chain.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {chain.division_id ? 'Division-specific' : 'Company Default'}
                </span>
              </div>
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={() => { setAddingTierFor(chain.id); setTierForm(EMPTY_FORM) }}>
                  <Plus className="h-3 w-3 mr-1" /> Add Tier
                </Button>
              )}
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rank</TableHead>
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
                  tiers.map((tier: any) => {
                    const isEditing = editingTier?.tierId === tier.id
                    const missingRoles = !rolesHaveAssignees(tier.required_roles)

                    if (isEditing) {
                      return (
                        <TableRow key={tier.id} className="bg-muted/30">
                          <TableCell>
                            <Input
                              className="h-7 w-16 text-xs"
                              value={editingTier!.form.rank}
                              onChange={(e) => setEditingTier((s) => s ? { ...s, form: { ...s.form, rank: e.target.value } } : s)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-7 w-28 text-xs"
                              value={editingTier!.form.min_amount}
                              onChange={(e) => setEditingTier((s) => s ? { ...s, form: { ...s.form, min_amount: e.target.value } } : s)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-7 w-28 text-xs"
                              placeholder="∞"
                              value={editingTier!.form.max_amount}
                              onChange={(e) => setEditingTier((s) => s ? { ...s, form: { ...s.form, max_amount: e.target.value } } : s)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {APPROVAL_ROLES.map((role) => {
                                const active = editingTier!.form.roles.includes(role)
                                return (
                                  <button
                                    key={role}
                                    type="button"
                                    onClick={() => setEditingTier((s) => {
                                      if (!s) return s
                                      const roles = active
                                        ? s.form.roles.filter((r) => r !== role)
                                        : [...s.form.roles, role]
                                      return { ...s, form: { ...s.form, roles } }
                                    })}
                                    className={`rounded border px-2 py-0.5 text-xs transition-colors ${active ? 'border-primary bg-primary/10 text-primary' : 'border-muted-foreground/30 hover:bg-muted'}`}
                                  >
                                    {ROLE_LABELS[role]}
                                  </button>
                                )
                              })}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSaveEdit} disabled={upsertTier.isPending}>
                                <Check className="h-3.5 w-3.5 text-green-600" />
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
                        <TableCell className="font-mono">{tier.rank}</TableCell>
                        <TableCell>{Number(tier.min_amount).toLocaleString()}</TableCell>
                        <TableCell>{tier.max_amount ? Number(tier.max_amount).toLocaleString() : '∞'}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 items-center">
                            {tier.required_roles.map((r: ApprovalRole) => (
                              <Badge key={r} variant="outline">{ROLE_LABELS[r]}</Badge>
                            ))}
                            {missingRoles && (
                              <span title="Some roles have no assignees">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                              </span>
                            )}
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
              <div className="rounded-md border p-3 space-y-3 bg-muted/30">
                <p className="text-sm font-medium">New Tier</p>
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder="Rank (e.g. 1)" value={tierForm.rank} onChange={(e) => setTierForm((f) => ({ ...f, rank: e.target.value }))} />
                  <Input placeholder="Min Amount (QAR)" value={tierForm.min_amount} onChange={(e) => setTierForm((f) => ({ ...f, min_amount: e.target.value }))} />
                  <Input placeholder="Max Amount (optional)" value={tierForm.max_amount} onChange={(e) => setTierForm((f) => ({ ...f, max_amount: e.target.value }))} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {APPROVAL_ROLES.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setTierForm((f) => ({
                        ...f,
                        roles: f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role],
                      }))}
                      className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                        tierForm.roles.includes(role) ? 'border-primary bg-primary/10 text-primary' : 'border-muted-foreground/30 hover:bg-muted'
                      }`}
                    >
                      {ROLE_LABELS[role]}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleAddTier(chain.id)} disabled={upsertTier.isPending}>Save Tier</Button>
                  <Button size="sm" variant="outline" onClick={() => setAddingTierFor(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {isAdmin && (
        <div className="flex gap-2 items-center">
          <Input
            placeholder="New chain name (e.g. Division Override)"
            value={newChainName}
            onChange={(e) => setNewChainName(e.target.value)}
            className="max-w-sm"
          />
          <Button onClick={handleAddChain} disabled={upsertChain.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Create Chain
          </Button>
        </div>
      )}
    </div>
  )
}
