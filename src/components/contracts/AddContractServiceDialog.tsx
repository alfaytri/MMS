'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { nanoid } from 'nanoid'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useServiceBrands } from '@/hooks/useServiceBrands'
import { computeUnitPrice, buildPathFromTree } from '@/lib/contractUtils'
import type { ContractService, BuildingTree, ServiceFrequency } from '@/types/contracts'

const FREQUENCIES: { value: ServiceFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'bi_weekly', label: 'Bi-Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'semi_annual', label: 'Semi-Annual' },
  { value: 'annual', label: 'Annual' },
]

const CONDITIONS = [
  { value: 'good', label: 'Good', factor: 1.0 },
  { value: 'fair', label: 'Fair', factor: 1.25 },
  { value: 'poor', label: 'Poor', factor: 1.5 },
]

interface ServiceNode {
  id: string
  name_en: string
  price: number | null
  contract_type: string | null
  item_kind: string | null
  pricing_mode: string | null
  discount: number | null
  discount_scope: string | null
  price_unit: string | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  buildingTree: BuildingTree
  nodeId: string | null
  divisions: string[]
  editService?: ContractService | null
  onSave: (service: ContractService) => void
}

function useServiceChildren(parentId: string | null, enabled: boolean) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['contractServiceChildren', parentId],
    queryFn: async () => {
      let query = (supabase.from('services') as any)
        .select('id, name_en, price, contract_type, item_kind, pricing_mode, discount, discount_scope, price_unit')
        .eq('tree_type', 'contract')
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })

      if (parentId === null) {
        query = query.is('parent_id', null)
      } else {
        query = query.eq('parent_id', parentId)
      }

      const { data } = await query
      return (data || []) as ServiceNode[]
    },
    enabled,
  })
}

export function AddContractServiceDialog({
  open,
  onOpenChange,
  buildingTree,
  nodeId,
  divisions,
  editService,
  onSave,
}: Props) {
  const [step, setStep] = useState(1)

  // Cascading picker: array of selected IDs at each depth
  const [selectedPath, setSelectedPath] = useState<string[]>([])

  // Resolved leaf service
  const [selectedService, setSelectedService] = useState<ServiceNode | null>(null)

  // Step 2: Configuration
  const [frequency, setFrequency] = useState<ServiceFrequency>('monthly')
  const [brandId, setBrandId] = useState<string | null>(null)
  const [brandName, setBrandName] = useState<string | null>(null)
  const [reliabilityFactor, setReliabilityFactor] = useState(1.0)
  const [condition, setCondition] = useState<string | null>(null)
  const [conditionFactor, setConditionFactor] = useState(1.0)
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')
  const [serviceDivisions, setServiceDivisions] = useState<string[]>([])

  const { data: brands } = useServiceBrands(selectedService?.id ?? null)

  // Dynamic level queries: root + up to 4 child levels
  const rootQuery = useServiceChildren(null, open && step === 1)
  const l1Query = useServiceChildren(selectedPath[0] ?? null, open && step === 1 && selectedPath.length >= 1)
  const l2Query = useServiceChildren(selectedPath[1] ?? null, open && step === 1 && selectedPath.length >= 2)
  const l3Query = useServiceChildren(selectedPath[2] ?? null, open && step === 1 && selectedPath.length >= 3)
  const l4Query = useServiceChildren(selectedPath[3] ?? null, open && step === 1 && selectedPath.length >= 4)

  const levelQueries = [rootQuery, l1Query, l2Query, l3Query, l4Query]

  function handleLevelSelect(depth: number, nodeId: string) {
    const newPath = selectedPath.slice(0, depth)
    newPath.push(nodeId)
    setSelectedPath(newPath)
    setSelectedService(null)
  }

  // Detect when a selected node is a leaf (next query returns empty children)
  useEffect(() => {
    if (step !== 1 || selectedPath.length === 0) return
    const depth = selectedPath.length
    const childQuery = levelQueries[depth]

    if (childQuery && childQuery.isFetched && !childQuery.isLoading) {
      const children = childQuery.data || []
      if (children.length === 0) {
        const lastId = selectedPath[selectedPath.length - 1]
        const parentQuery = levelQueries[depth - 1]
        const node = (parentQuery?.data || []).find((n: ServiceNode) => n.id === lastId)
        if (node) {
          setSelectedService(node)
          setStep(2)
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath, l1Query.data, l2Query.data, l3Query.data, l4Query.data, l1Query.isFetched, l2Query.isFetched, l3Query.isFetched, l4Query.isFetched])

  // Pre-fill when editing
  useEffect(() => {
    if (editService) {
      setStep(2)
      setSelectedService({
        id: editService.service_id || '',
        name_en: editService.service_name,
        price: editService.base_price,
        contract_type: editService.contract_type,
        item_kind: editService.item_kind,
        pricing_mode: editService.pricing_mode,
        discount: editService.discount,
        discount_scope: editService.discount_scope,
        price_unit: editService.price_unit,
      })
      setFrequency(editService.frequency)
      setBrandId(editService.brand_id)
      setBrandName(editService.brand_name)
      setReliabilityFactor(editService.reliability_factor)
      setCondition(editService.condition)
      setConditionFactor(editService.condition_factor)
      setQuantity(editService.quantity)
      setNote(editService.note || '')
      setServiceDivisions(editService.divisions)
    } else {
      resetForm()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editService, open])

  function resetForm() {
    setStep(1)
    setSelectedPath([])
    setSelectedService(null)
    setFrequency('monthly')
    setBrandId(null)
    setBrandName(null)
    setReliabilityFactor(1.0)
    setCondition(null)
    setConditionFactor(1.0)
    setQuantity(1)
    setNote('')
    setServiceDivisions([...divisions])
  }

  function handleBrandChange(bId: string | null) {
    if (!bId) return
    const brand = brands?.find((b) => b.brand_id === bId)
    if (brand) {
      setBrandId(brand.brand_id)
      setBrandName(brand.brand_name)
      setReliabilityFactor(brand.reliability_factor)
    } else {
      setBrandId(null)
      setBrandName(null)
      setReliabilityFactor(1.0)
    }
  }

  function handleConditionChange(cond: string | null) {
    if (!cond) return
    const c = CONDITIONS.find((co) => co.value === cond)
    setCondition(cond)
    setConditionFactor(c?.factor || 1.0)
  }

  function toggleDivision(div: string) {
    setServiceDivisions((prev) =>
      prev.includes(div) ? prev.filter((d) => d !== div) : [...prev, div],
    )
  }

  // Type-aware pricing
  const contractType = selectedService?.contract_type || 'preventive'
  const pricingMode = selectedService?.pricing_mode || 'by_condition'
  const basePrice = selectedService?.price || 0
  const serviceDiscount = selectedService?.discount || 0
  const discountScope = selectedService?.discount_scope || 'services_only'
  const priceUnit = selectedService?.price_unit || null
  const itemKind = selectedService?.item_kind || 'service'

  const showBrand = contractType === 'preventive' && pricingMode === 'by_condition'
  const showCondition = contractType === 'preventive' && pricingMode === 'by_condition'
  const showFrequency = contractType !== 'general'

  const unitPrice = showBrand || showCondition
    ? computeUnitPrice(basePrice, reliabilityFactor, conditionFactor)
    : basePrice
  const totalPrice = unitPrice * quantity

  function handleSave() {
    if (!selectedService) return
    const isGeneral = !nodeId
    const servicePath = nodeId
      ? buildPathFromTree(buildingTree, nodeId, selectedService.name_en)
      : [selectedService.name_en]

    const service: ContractService = {
      id: editService?.id || nanoid(),
      contract_id: editService?.contract_id || '',
      service_id: selectedService.id || null,
      building_node_id: nodeId,
      service_name: selectedService.name_en,
      service_path: servicePath,
      brand_id: showBrand ? brandId : null,
      brand_name: showBrand ? brandName : null,
      reliability_factor: showBrand ? reliabilityFactor : 1.0,
      condition: showCondition ? (condition as ContractService['condition']) : null,
      condition_factor: showCondition ? conditionFactor : 1.0,
      frequency: showFrequency ? frequency : 'monthly',
      quantity,
      base_price: basePrice,
      unit_price: unitPrice,
      total_price: totalPrice,
      divisions: serviceDivisions,
      note: note || null,
      is_general: isGeneral,
      contract_type: contractType as ContractService['contract_type'],
      item_kind: itemKind as ContractService['item_kind'],
      pricing_mode: pricingMode as ContractService['pricing_mode'],
      discount: serviceDiscount,
      discount_scope: discountScope as ContractService['discount_scope'],
      price_unit: priceUnit,
      sort_order: editService?.sort_order || 0,
      _isNew: !editService,
      _isDirty: !!editService,
    }

    onSave(service)
    onOpenChange(false)
    resetForm()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editService ? 'Edit Service' : step === 1 ? 'Select Service' : 'Configure Service'}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {[0, 1, 2, 3].map((depth) => {
                const query = levelQueries[depth]
                const items = query?.data || []
                const isLoading = query?.isLoading
                const hasParent = depth === 0 || selectedPath.length >= depth
                const hasItems = hasParent && items.length > 0
                const labels = ['Category', 'Sub-Category', 'Service', 'Type']

                return (
                  <div key={depth} className="space-y-1.5 min-w-0">
                    <Label className="text-xs text-muted-foreground">{labels[depth]}</Label>
                    {isLoading ? (
                      <div className="min-h-[2.5rem] flex items-center px-3 border rounded-md bg-muted/30">
                        <span className="text-sm text-muted-foreground">Loading...</span>
                      </div>
                    ) : (
                      <Select
                        value={selectedPath[depth] || ''}
                        onValueChange={(v) => { if (v) handleLevelSelect(depth, v) }}
                        disabled={!hasItems}
                      >
                        <SelectTrigger className={`w-full min-h-[2.5rem] h-auto whitespace-normal text-left [&>span]:line-clamp-2 ${!hasItems ? 'opacity-50' : ''}`}>
                          <SelectValue placeholder={`Select ${labels[depth].toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map((node: ServiceNode) => (
                            <SelectItem key={node.id} value={node.id}>
                              <span className="whitespace-normal">{node.name_en}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )
              })}
            </div>

            {(() => {
              const query = levelQueries[4]
              const items = query?.data || []
              const isLoading = query?.isLoading
              const hasParent = selectedPath.length >= 4

              if (!hasParent || (!isLoading && items.length === 0)) return null

              return (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Option</Label>
                  {isLoading ? (
                    <div className="min-h-[2.5rem] flex items-center px-3 border rounded-md bg-muted/30">
                      <span className="text-sm text-muted-foreground">Loading...</span>
                    </div>
                  ) : (
                    <Select
                      value={selectedPath[4] || ''}
                      onValueChange={(v) => { if (v) handleLevelSelect(4, v) }}
                    >
                      <SelectTrigger className="w-full min-h-[2.5rem] h-auto whitespace-normal text-left [&>span]:line-clamp-2">
                        <SelectValue placeholder="Select option" />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((node: ServiceNode) => (
                          <SelectItem key={node.id} value={node.id}>
                            <span className="whitespace-normal">{node.name_en}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {step === 2 && selectedService && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium">{selectedService.name_en}</p>
              <Badge variant="outline" className="text-xs capitalize">{contractType}</Badge>
              {itemKind === 'product' && (
                <Badge variant="secondary" className="text-xs">Product</Badge>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Frequency — hidden for general type */}
              {showFrequency && (
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <Select value={frequency} onValueChange={(v) => setFrequency(v as ServiceFrequency)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Brand — only for preventive + by_condition */}
              {showBrand && (
                <div className="space-y-2">
                  <Label>Brand (optional)</Label>
                  <Select value={brandId || 'none'} onValueChange={(v) => handleBrandChange(v === 'none' ? null : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="No brand" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No brand</SelectItem>
                      {(brands || []).map((b) => (
                        <SelectItem key={b.brand_id} value={b.brand_id}>
                          {b.brand_name} ({b.reliability_factor}x)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Condition — only for preventive + by_condition */}
              {showCondition && (
                <div className="space-y-2">
                  <Label>Condition (optional)</Label>
                  <Select value={condition || 'none'} onValueChange={(v) => handleConditionChange(v === 'none' ? null : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="No condition" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No condition</SelectItem>
                      {CONDITIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label} ({c.factor}x)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Quantity — label adapts for area type */}
              <div className="space-y-2">
                <Label>
                  {contractType === 'area' && priceUnit
                    ? `Area (${priceUnit})`
                    : 'Quantity'}
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                />
              </div>
            </div>

            {/* General type: discount info (read-only) */}
            {contractType === 'general' && serviceDiscount > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Discount</span>
                  <span className="font-bold text-amber-700">{serviceDiscount}%</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Scope</span>
                  <Badge variant="outline" className="text-xs">
                    {discountScope === 'services_and_products' ? 'Services & Products' : 'Services Only'}
                  </Badge>
                </div>
              </div>
            )}

            {/* Divisions */}
            <div className="space-y-2">
              <Label>Divisions</Label>
              <div className="flex flex-wrap gap-2">
                {divisions.map((d) => (
                  <Badge
                    key={d}
                    variant={serviceDivisions.includes(d) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleDivision(d)}
                  >
                    {d}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Note */}
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Additional notes about this service..."
              />
            </div>

            {/* Price breakdown */}
            <div className="rounded-lg bg-blue-50 p-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Base Price</span>
                <span>{basePrice.toLocaleString()} QAR</span>
              </div>
              {showBrand && reliabilityFactor !== 1.0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Brand reliability</span>
                  <span>&times; {reliabilityFactor}</span>
                </div>
              )}
              {showCondition && conditionFactor !== 1.0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Condition factor</span>
                  <span>&times; {conditionFactor}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1">
                <span>Unit Price</span>
                <span className="font-medium">{unitPrice.toLocaleString()} QAR</span>
              </div>
              <div className="flex justify-between font-bold text-base">
                <span>
                  Total ({quantity} {contractType === 'area' && priceUnit ? priceUnit : 'units'})
                </span>
                <span>{totalPrice.toLocaleString()} QAR</span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 2 && !editService && (
            <Button variant="ghost" onClick={() => { setStep(1); setSelectedService(null) }}>Back</Button>
          )}
          <Button variant="ghost" onClick={() => { onOpenChange(false); resetForm() }}>Cancel</Button>
          {step === 2 && (
            <Button onClick={handleSave} disabled={!selectedService || serviceDivisions.length === 0}>
              {editService ? 'Update Service' : 'Add Service'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
