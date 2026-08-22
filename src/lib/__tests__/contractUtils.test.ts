import { describe, it, expect } from 'vitest'
import {
  paymentPeriodCount,
  computeMilestoneAmounts,
  generateAllVisits,
  validateTreeIntegrity,
  rebuildServicePaths,
  validateBeforeSave,
} from '../contractUtils'
import type { ContractService, ContractMilestone, BuildingTree, ContractFormData } from '@/types/contracts'

describe('paymentPeriodCount', () => {
  it('counts 12 monthly periods for a full year', () => {
    expect(paymentPeriodCount('2026-01-01', '2027-01-01', 'monthly')).toBe(12)
  })

  it('counts 4 quarterly periods for a full year', () => {
    expect(paymentPeriodCount('2026-01-01', '2027-01-01', 'quarterly')).toBe(4)
  })

  it('counts 2 semi-annual periods for a full year', () => {
    expect(paymentPeriodCount('2026-01-01', '2027-01-01', 'semi_annual')).toBe(2)
  })

  it('counts 1 annual period for a full year', () => {
    expect(paymentPeriodCount('2026-01-01', '2027-01-01', 'annual')).toBe(1)
  })

  it('returns minimum 1 for very short contracts', () => {
    expect(paymentPeriodCount('2026-01-01', '2026-01-15', 'monthly')).toBe(1)
  })

  it('handles Jan 15 to Jan 14 next year as 12 monthly periods', () => {
    expect(paymentPeriodCount('2026-01-15', '2027-01-15', 'monthly')).toBe(12)
  })
})

describe('computeMilestoneAmounts', () => {
  it('distributes amounts with remainder on last milestone', () => {
    const milestones: ContractMilestone[] = [
      { id: '1', contract_id: 'c', name: 'A', percentage: 33.33, amount: 0, due_date: null, sort_order: 0 },
      { id: '2', contract_id: 'c', name: 'B', percentage: 33.33, amount: 0, due_date: null, sort_order: 1 },
      { id: '3', contract_id: 'c', name: 'C', percentage: 33.34, amount: 0, due_date: null, sort_order: 2 },
    ]
    const result = computeMilestoneAmounts(milestones, 100000)
    expect(result[0].amount).toBe(33330)
    expect(result[1].amount).toBe(33330)
    expect(result[2].amount).toBe(33340)
    expect(result.reduce((s, m) => s + m.amount, 0)).toBe(100000)
  })

  it('returns empty array for empty milestones', () => {
    expect(computeMilestoneAmounts([], 100000)).toEqual([])
  })
})

describe('generateAllVisits', () => {
  it('generates visits per service frequency', () => {
    const services: Partial<ContractService>[] = [
      { id: 's1', service_name: 'AC', frequency: 'monthly', building_node_id: 'n1' },
      { id: 's2', service_name: 'Floor', frequency: 'quarterly', building_node_id: null },
    ]
    const visits = generateAllVisits(services as ContractService[], '2026-01-01', '2026-12-31')
    const acVisits = visits.filter(v => v.service_name === 'AC')
    const floorVisits = visits.filter(v => v.service_name === 'Floor')
    expect(acVisits.length).toBe(12)
    expect(floorVisits.length).toBe(4)
  })

  it('sorts visits by date then service name', () => {
    const services: Partial<ContractService>[] = [
      { id: 's1', service_name: 'B-Service', frequency: 'monthly', building_node_id: null },
      { id: 's2', service_name: 'A-Service', frequency: 'monthly', building_node_id: null },
    ]
    const visits = generateAllVisits(services as ContractService[], '2026-01-01', '2026-03-31')
    expect(visits[0].service_name).toBe('A-Service')
    expect(visits[0].scheduled_date).toBe('2026-01-01')
  })
})

describe('validateTreeIntegrity', () => {
  it('detects orphaned services', () => {
    const tree: BuildingTree = { nodes: [{ id: 'n1', name: 'A', type: 'area', parentId: null }] }
    const services: Partial<ContractService>[] = [
      { id: 's1', building_node_id: 'n1', service_name: 'OK' },
      { id: 's2', building_node_id: 'n_deleted', service_name: 'Orphan' },
    ]
    const result = validateTreeIntegrity(tree, services as ContractService[])
    expect(result.valid).toBe(false)
    expect(result.orphanedServices).toHaveLength(1)
    expect(result.orphanedServices[0].id).toBe('s2')
  })

  it('passes when all references valid', () => {
    const tree: BuildingTree = { nodes: [{ id: 'n1', name: 'A', type: 'area', parentId: null }] }
    const services: Partial<ContractService>[] = [
      { id: 's1', building_node_id: 'n1', service_name: 'OK' },
    ]
    const result = validateTreeIntegrity(tree, services as ContractService[])
    expect(result.valid).toBe(true)
  })
})

describe('rebuildServicePaths', () => {
  it('rebuilds paths after node rename', () => {
    const tree: BuildingTree = {
      nodes: [
        { id: 'n1', name: 'Tower RENAMED', type: 'complex', parentId: null },
        { id: 'n2', name: 'Floor 1', type: 'floor', parentId: 'n1' },
      ],
    }
    const services: Partial<ContractService>[] = [
      { id: 's1', building_node_id: 'n2', service_name: 'AC Clean', service_path: ['Tower', 'Floor 1', 'AC Clean'], is_general: false },
    ]
    const result = rebuildServicePaths(tree, services as ContractService[])
    expect(result[0].service_path).toEqual(['Tower RENAMED', 'Floor 1', 'AC Clean'])
    expect(result[0]._isDirty).toBe(true)
  })

  it('skips general services', () => {
    const tree: BuildingTree = { nodes: [] }
    const services: Partial<ContractService>[] = [
      { id: 's1', building_node_id: null, service_name: 'General', service_path: [], is_general: true },
    ]
    const result = rebuildServicePaths(tree, services as ContractService[])
    expect(result[0]._isDirty).toBeUndefined()
  })
})

describe('validateBeforeSave', () => {
  const baseFormData: Partial<ContractFormData> = {
    paymentMode: 'fixed',
    milestones: [],
    services: [],
    discount: 0,
  }

  it('passes for valid fixed-mode data', () => {
    const result = validateBeforeSave(baseFormData as ContractFormData)
    expect(result.valid).toBe(true)
  })

  it('fails when milestone percentages do not sum to 100', () => {
    const data = {
      ...baseFormData,
      paymentMode: 'milestone' as const,
      milestones: [
        { id: '1', contract_id: 'c', name: 'A', percentage: 50, amount: 0, due_date: null, sort_order: 0 },
        { id: '2', contract_id: 'c', name: 'B', percentage: 30, amount: 0, due_date: null, sort_order: 1 },
      ],
    }
    const result = validateBeforeSave(data as ContractFormData)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('80.00%')
  })

  it('fails when discount exceeds subtotal', () => {
    const data = {
      ...baseFormData,
      discount: 5000,
      services: [{ total_price: 3000 }],
    }
    const result = validateBeforeSave(data as ContractFormData)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('exceeds subtotal')
  })
})
