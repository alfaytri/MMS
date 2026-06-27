'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { nanoid } from 'nanoid'
import {
  ArrowLeft, Save, Send, CheckCircle, XCircle, Loader2,
  Wrench, Calendar, Building2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useContractDetail } from '@/hooks/useContractDetail'
import { useUpdateContract } from '@/hooks/useUpdateContract'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { useUserDivisionScope } from '@/hooks/useUserDivisionScope'
import {
  computeSubtotal, computeNetTotal, computeMonthlyValue, computePaymentValue,
  validateBeforeSave, validateTreeIntegrity, generateAllVisits,
} from '@/lib/contractUtils'
import { saveContractFull } from '@/hooks/useUpdateContract'
import { SectionCard, FieldDisplay } from '@/components/contracts/ContractQuotationShared'
import { WorkflowProgressBar } from '@/components/contracts/WorkflowProgressBar'
import { ContractBuildingTree } from '@/components/contracts/ContractBuildingTree'
import { AreaServiceCard } from '@/components/contracts/AreaServiceCard'
import { AddContractServiceDialog } from '@/components/contracts/AddContractServiceDialog'
import { PaymentScheduleSection } from '@/components/contracts/PaymentScheduleSection'
import { ContractTermsSection } from '@/components/contracts/ContractTermsSection'
import { VisitSummarySection } from '@/components/contracts/VisitSummarySection'
import { ServiceScheduleSection } from '@/components/contracts/ServiceScheduleSection'
import { SignedDocUploadBanner } from '@/components/contracts/SignedDocUploadBanner'
import { STATUS_CONFIG, QUOTATION_STATUSES } from '@/types/contracts'
import type {
  BuildingTree, ContractService, ContractMilestone,
  ContractFormData, ContractQuotationStatus, ContractStatus,
} from '@/types/contracts'

export default function ContractDetailPage() {
  const params = useParams()
  const router = useRouter()
  const contractId = params.contractId as string
  const sessionId = useRef(nanoid())
  const { data: profile } = useCurrentUserProfile()
  const { divisions: userDivisions } = useUserDivisionScope()
  const updateContract = useUpdateContract()

  const {
    contract, services: loadedServices, visits, payments,
    milestones: loadedMilestones, isLoading, createTentativeVisits,
  } = useContractDetail(contractId)

  // Determine phase
  const isQuotation = contract
    ? QUOTATION_STATUSES.includes(contract.status as ContractQuotationStatus)
    : true
  const isEditable = contract?.status === 'draft' || contract?.status === 'rejected'
  const isApproved = contract?.status === 'approved'

  // Local editing state (initialized from loaded data)
  const [localTree, setLocalTree] = useState<BuildingTree>({ nodes: [] })
  const [localServices, setLocalServices] = useState<ContractService[]>([])
  const [localMilestones, setLocalMilestones] = useState<ContractMilestone[]>([])
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [siteName, setSiteName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [discount, setDiscount] = useState(0)
  const [paymentMode, setPaymentMode] = useState<'fixed' | 'milestone' | 'completion'>('fixed')
  const [paymentFrequency, setPaymentFrequency] = useState('monthly')
  const [notes, setNotes] = useState('')
  const [divisions, setDivisions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // Dialog state
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false)
  const [serviceDialogNodeId, setServiceDialogNodeId] = useState<string | null>(null)
  const [editingService, setEditingService] = useState<ContractService | null>(null)

  // Initialize from loaded contract
  useEffect(() => {
    if (!contract) return
    setLocalTree(contract.building_tree || { nodes: [] })
    setCustomerName(contract.customer_name || '')
    setPhone(contract.phone || '')
    setAddress(contract.address || '')
    setSiteName(contract.site_name || '')
    setStartDate(contract.start_date || '')
    setEndDate(contract.end_date || '')
    setDiscount(contract.discount || 0)
    setPaymentMode((contract.payment_mode || 'fixed') as 'fixed' | 'milestone' | 'completion')
    setPaymentFrequency(contract.payment_frequency || 'monthly')
    setNotes(contract.notes || '')
    setDivisions(contract.divisions || [])
  }, [contract])

  useEffect(() => {
    setLocalServices(loadedServices)
  }, [loadedServices])

  useEffect(() => {
    setLocalMilestones(loadedMilestones)
  }, [loadedMilestones])

  // Computed
  const subtotal = computeSubtotal(localServices, startDate, endDate)
  const netTotal = computeNetTotal(subtotal, discount)
  const monthlyValue = startDate && endDate ? computeMonthlyValue(netTotal, startDate, endDate) : 0
  const paymentValue = startDate && endDate ? computePaymentValue(netTotal, startDate, endDate, paymentFrequency) : 0
  const frequencyLabel: Record<string, string> = {
    monthly: 'Monthly', quarterly: 'Quarterly',
    semi_annual: 'Semi-Annual', annual: 'Annual',
  }
  const generalServices = localServices.filter((s) => s.is_general)
  const statusConfig = contract ? STATUS_CONFIG[contract.status] : null

  const handleAddService = useCallback((nodeId: string) => {
    setServiceDialogNodeId(nodeId)
    setEditingService(null)
    setServiceDialogOpen(true)
  }, [])

  const handleEditService = useCallback((serviceId: string) => {
    const svc = localServices.find((s) => s.id === serviceId)
    if (svc) {
      setEditingService(svc)
      setServiceDialogNodeId(svc.building_node_id)
      setServiceDialogOpen(true)
    }
  }, [localServices])

  const handleRemoveService = useCallback((serviceId: string) => {
    setLocalServices((prev) => prev.filter((s) => s.id !== serviceId))
  }, [])

  const handleServiceSave = useCallback((service: ContractService) => {
    setLocalServices((prev) => {
      const idx = prev.findIndex((s) => s.id === service.id)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = service
        return updated
      }
      return [...prev, service]
    })
  }, [])

  async function handleSave() {
    if (!contract) return
    const formData: ContractFormData = {
      sourceType: contract.source_type as 'direct' | 'site_visit',
      customerName, phone, address, siteName,
      divisions,
      startDate, endDate, discount,
      paymentMode, paymentFrequency,
      buildingTree: localTree,
      notes,
      services: localServices,
      milestones: localMilestones,
      agentName: contract.agent_name || '',
      createdBy: contract.created_by || '',
      areaCount: localTree.nodes.filter((n) => n.type === 'area').length,
      servicesSummary: localServices.map((s) => s.service_name).join(', '),
      totalValue: netTotal,
      monthlyValue,
      subtotal,
    }

    const validation = validateBeforeSave(formData)
    if (!validation.valid) {
      validation.errors.forEach((e) => toast.error(e))
      return
    }

    setSaving(true)
    try {
      await saveContractFull(contractId, formData, sessionId.current)
      toast.success('Saved')
    } catch (err: any) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleTransition(newStatus: ContractStatus, reason?: string) {
    if (!profile || !contract) return
    try {
      await updateContract.mutateAsync({
        contractId,
        updates: {},
        newStatus,
        context: {
          userId: profile.id,
          userName: profile.full_name || '',
          reason,
        },
      })
      toast.success(`Status updated to ${STATUS_CONFIG[newStatus]?.label || newStatus}`)
    } catch (err: any) {
      toast.error(err.message || 'Transition failed')
    }
  }

  async function handleGenerateVisits() {
    if (!contract) return
    const pendingVisits = generateAllVisits(localServices, startDate, endDate)
    if (pendingVisits.length === 0) {
      toast.error('No visits to generate')
      return
    }
    try {
      await createTentativeVisits.mutateAsync(pendingVisits)
      toast.success(`${pendingVisits.length} visits generated`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate visits')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!contract) {
    return (
      <div className="text-center py-24 text-muted-foreground">
        <p>Contract not found</p>
        <Button variant="ghost" onClick={() => router.back()} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-1" /> Go back
        </Button>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="space-y-1.5">
            <div className="flex items-baseline gap-3">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {contract.contract_id || contract.quotation_number || 'Contract'}
              </h1>
              {contract.divisions.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {contract.divisions.join(' · ')}
                </span>
              )}
            </div>
            {isQuotation ? (
              <WorkflowProgressBar currentStatus={contract.status} />
            ) : (
              statusConfig && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {statusConfig.label}
                </span>
              )
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isEditable && (
            <>
              <Button variant="outline" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-1" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
              {contract.status === 'draft' && (
                <Button onClick={() => handleTransition('manager_review')}>
                  <Send className="h-4 w-4 mr-1" />
                  Send for Review
                </Button>
              )}
            </>
          )}
          {contract.status === 'manager_review' && (
            <>
              <Button onClick={() => handleTransition('customer_pending')}>
                <CheckCircle className="h-4 w-4 mr-1" />
                Approve
              </Button>
              <Button variant="destructive" onClick={() => {
                const reason = prompt('Rejection reason:')
                if (reason) handleTransition('rejected', reason)
              }}>
                <XCircle className="h-4 w-4 mr-1" />
                Reject
              </Button>
            </>
          )}
          {contract.status === 'customer_pending' && (
            <Button onClick={() => handleTransition('approved')}>
              <CheckCircle className="h-4 w-4 mr-1" />
              Customer Approved
            </Button>
          )}
        </div>
      </div>

      {/* Signed doc upload banner */}
      {isApproved && (
        <SignedDocUploadBanner
          contractId={contractId}
          onActivate={() => handleTransition('active')}
          isActivating={updateContract.isPending}
        />
      )}

      {/* Customer Info */}
      <SectionCard title="Customer Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {isEditable ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="cd-customer-name">Customer Name</Label>
                <Input id="cd-customer-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cd-phone">Phone</Label>
                <Input id="cd-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="cd-address">Address</Label>
                <Input id="cd-address" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cd-site-name">Site Name</Label>
                <Input id="cd-site-name" value={siteName} onChange={(e) => setSiteName(e.target.value)} />
              </div>
            </>
          ) : (
            <>
              <FieldDisplay label="Customer" value={contract.customer_name} />
              <FieldDisplay label="Phone" value={contract.phone} />
              <FieldDisplay label="Address" value={contract.address} />
              <FieldDisplay label="Site" value={contract.site_name} />
              <FieldDisplay label="Agent" value={contract.agent_name} />
            </>
          )}
        </div>
      </SectionCard>

      {/* Contract Details */}
      <SectionCard title="Contract Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {isEditable ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="cd-start-date">Start Date</Label>
                <DatePicker value={startDate} onChange={setStartDate} placeholder="dd-mm-yyyy" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cd-end-date">End Date</Label>
                <DatePicker value={endDate} onChange={setEndDate} placeholder="dd-mm-yyyy" />
              </div>
            </>
          ) : (
            <>
              <FieldDisplay label="Start Date" value={contract.start_date} />
              <FieldDisplay label="End Date" value={contract.end_date} />
              <FieldDisplay label="Total Value" value={`${contract.total_value.toLocaleString('en-QA')} QAR`} />
              <FieldDisplay label={`${frequencyLabel[contract.payment_frequency || 'monthly'] || 'Monthly'} Value`} value={`${contract.monthly_value.toLocaleString('en-QA')} QAR`} />
            </>
          )}
        </div>
      </SectionCard>

      {/* Building Structure + Services */}
      <SectionCard
        title="Building Structure & Services"
        actions={
          isEditable ? (
            <Button variant="outline" size="sm" onClick={() => {
              setServiceDialogNodeId(null)
              setEditingService(null)
              setServiceDialogOpen(true)
            }}>
              <Wrench className="h-3.5 w-3.5 mr-1" />
              Add General Service
            </Button>
          ) : undefined
        }
      >
        <ContractBuildingTree
          buildingTree={localTree}
          services={localServices.filter((s) => !s.is_general)}
          editable={isEditable}
          onTreeChange={setLocalTree}
          onServicesChange={setLocalServices}
          onAddService={handleAddService}
          onEditService={handleEditService}
          onRemoveService={handleRemoveService}
          renderServiceCard={(svc) => (
            <AreaServiceCard
              key={svc.id}
              service={svc}
              editable={isEditable}
              onEdit={() => handleEditService(svc.id)}
              onRemove={() => handleRemoveService(svc.id)}
            />
          )}
        />

        {generalServices.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">General Services</h4>
            <div className="space-y-2">
              {generalServices.map((svc) => (
                <AreaServiceCard
                  key={svc.id}
                  service={svc}
                  editable={isEditable}
                  onEdit={() => handleEditService(svc.id)}
                  onRemove={() => handleRemoveService(svc.id)}
                />
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Visit Summary (quotation phase) */}
      {isQuotation && localServices.length > 0 && startDate && endDate && (
        <SectionCard title="Visit Summary">
          <VisitSummarySection services={localServices} startDate={startDate} endDate={endDate} />
        </SectionCard>
      )}

      {/* Live phase: team scheduling (drag-and-drop) */}
      {!isQuotation && visits.length > 0 && (
        <SectionCard title="Team Scheduling">
          <ServiceScheduleSection
            contractId={contractId}
            divisions={contract.divisions || []}
          />
        </SectionCard>
      )}

      {/* Live phase: visit generator + visit list */}
      {!isQuotation && (
        <SectionCard title="Visits">
          <div className="space-y-4">
            {contract.status === 'active' && visits.length === 0 && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 space-y-3">
                <p className="text-sm font-medium text-blue-800">
                  Generate visits for this contract
                </p>
                <p className="text-xs text-blue-600">
                  This will create {localServices.length} service visit schedule(s) based on their frequencies.
                </p>
                <Button
                  size="sm"
                  onClick={handleGenerateVisits}
                  disabled={createTentativeVisits.isPending}
                >
                  <Calendar className="h-3.5 w-3.5 mr-1" />
                  {createTentativeVisits.isPending ? 'Generating...' : 'Auto-Generate All Visits'}
                </Button>
              </div>
            )}

            {visits.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-4 font-medium">Date</th>
                      <th className="py-2 pr-4 font-medium">Service</th>
                      <th className="py-2 pr-4 font-medium hidden md:table-cell">Location</th>
                      <th className="py-2 pr-4 font-medium">Team</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visits.slice(0, 50).map((v) => (
                      <tr key={v.id} className="border-b border-dashed">
                        <td className="py-2 pr-4">{v.scheduled_date}</td>
                        <td className="py-2 pr-4">{v.service_name}</td>
                        <td className="py-2 pr-4 text-muted-foreground hidden md:table-cell">
                          {v.service_path?.slice(0, -1).join(' > ') || '—'}
                        </td>
                        <td className="py-2 pr-4">
                          {v.team_name || <span className="text-yellow-600">Unassigned</span>}
                        </td>
                        <td className="py-2 pr-4">
                          {v.completed ? (
                            <Badge className="bg-green-100 text-green-700 text-xs">Done</Badge>
                          ) : (
                            <Badge className="bg-yellow-100 text-yellow-700 text-xs">Pending</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visits.length > 50 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Showing first 50 of {visits.length} visits
                  </p>
                )}
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* Payment info (live phase) */}
      {!isQuotation && payments.length > 0 && (
        <SectionCard title="Payments">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4 font-medium">Due Date</th>
                  <th className="py-2 pr-4 font-medium text-right">Amount</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-dashed">
                    <td className="py-2 pr-4">{p.due_date}</td>
                    <td className="py-2 pr-4 text-right">{p.amount.toLocaleString('en-QA')} QAR</td>
                    <td className="py-2 pr-4">
                      <Badge className={
                        p.status === 'paid'
                          ? 'bg-green-100 text-green-700'
                          : p.status === 'overdue'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                      }>
                        {p.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Terms */}
      {isQuotation && (
        <SectionCard title="Terms & Conditions">
          <ContractTermsSection divisions={divisions} services={localServices} termsSnapshot={contract.terms_snapshot} />
        </SectionCard>
      )}

      {/* Notes */}
      <SectionCard title="Notes">
        {isEditable ? (
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        ) : (
          <p className="text-sm">{contract.notes || '—'}</p>
        )}
      </SectionCard>

      {/* Payment Schedule (quotation phase) */}
      {isQuotation && (
        <SectionCard title="Payment Schedule">
          <PaymentScheduleSection
            mode={paymentMode}
            frequency={paymentFrequency}
            milestones={localMilestones}
            contractTotal={subtotal}
            discount={discount}
            startDate={startDate}
            endDate={endDate}
            editable={isEditable}
            onChange={(updates) => {
              if (updates.mode) setPaymentMode(updates.mode)
              if (updates.frequency) setPaymentFrequency(updates.frequency)
              if (updates.milestones) setLocalMilestones(updates.milestones)
            }}
          />
        </SectionCard>
      )}

      {/* Pricing Summary */}
      {isQuotation && (
        <SectionCard title="Pricing Summary">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {isEditable ? (
              <div className="space-y-2">
                <Label htmlFor="cd-discount">Discount (QAR)</Label>
                <Input
                  id="cd-discount"
                  type="number"
                  min={0}
                  value={discount || ''}
                  onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
                />
              </div>
            ) : (
              <FieldDisplay label="Discount" value={`${discount.toLocaleString('en-QA')} QAR`} />
            )}
            <FieldDisplay label="Subtotal" value={`${subtotal.toLocaleString('en-QA')} QAR`} />
            <FieldDisplay label="Net Total" value={`${netTotal.toLocaleString('en-QA')} QAR`} />
            <FieldDisplay label={`${frequencyLabel[paymentFrequency] || 'Monthly'} Value`} value={`${paymentValue.toLocaleString('en-QA')} QAR`} />
          </div>
        </SectionCard>
      )}

      {/* Service Dialog */}
      <AddContractServiceDialog
        open={serviceDialogOpen}
        onOpenChange={setServiceDialogOpen}
        buildingTree={localTree}
        nodeId={serviceDialogNodeId}
        divisions={divisions}
        editService={editingService}
        onSave={handleServiceSave}
      />
    </div>
  )
}
