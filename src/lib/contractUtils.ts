import { parseISO, format, addDays, addWeeks, addMonths, addYears } from 'date-fns'
import { nanoid } from 'nanoid'
import type {
  ContractService,
  ContractMilestone,
  BuildingTree,
  PendingVisit,
  ServiceFrequency,
  ContractFormData,
  SaveValidationResult,
  TreeValidationResult,
} from '@/types/contracts'

const frequencyStep: Record<ServiceFrequency, (d: Date) => Date> = {
  daily: (d) => addDays(d, 1),
  weekly: (d) => addWeeks(d, 1),
  bi_weekly: (d) => addWeeks(d, 2),
  monthly: (d) => addMonths(d, 1),
  quarterly: (d) => addMonths(d, 3),
  semi_annual: (d) => addMonths(d, 6),
  annual: (d) => addYears(d, 1),
}

export function paymentPeriodCount(
  startDate: string,
  endDate: string,
  frequency: string,
): number {
  const start = parseISO(startDate)
  const end = parseISO(endDate)
  const stepFn = frequencyStep[frequency as ServiceFrequency]
  if (!stepFn) return 1

  let count = 0
  let current = start
  while (current < end) {
    count++
    current = stepFn(current)
  }
  return Math.max(count, 1)
}

export function computeSubtotal(services: ContractService[]): number {
  return services.reduce((sum, s) => sum + s.total_price, 0)
}

export function computeNetTotal(subtotal: number, discount: number): number {
  return Math.max(subtotal - discount, 0)
}

export function computeMonthlyValue(
  netTotal: number,
  startDate: string,
  endDate: string,
): number {
  const months = paymentPeriodCount(startDate, endDate, 'monthly')
  return months > 0 ? Math.round(netTotal / months) : netTotal
}

export function computeUnitPrice(
  basePrice: number,
  reliabilityFactor: number,
  conditionFactor: number,
): number {
  return Math.round(basePrice * reliabilityFactor * conditionFactor)
}

export function computeMilestoneAmounts(
  milestones: ContractMilestone[],
  netTotal: number,
): ContractMilestone[] {
  if (milestones.length === 0) return []

  const computed = milestones.map((m) => ({
    ...m,
    amount: Math.round((netTotal * m.percentage) / 100),
  }))

  const sumWithoutLast = computed
    .slice(0, -1)
    .reduce((sum, m) => sum + m.amount, 0)
  computed[computed.length - 1].amount = netTotal - sumWithoutLast

  return computed
}

export function generateAllVisits(
  services: ContractService[],
  startDate: string,
  endDate: string,
): PendingVisit[] {
  const visits: PendingVisit[] = []
  for (const svc of services) {
    const step = frequencyStep[svc.frequency]
    if (!step) continue
    let current = parseISO(startDate)
    const end = parseISO(endDate)
    while (current <= end) {
      visits.push({
        temp_id: nanoid(),
        scheduled_date: format(current, 'yyyy-MM-dd'),
        service_name: svc.service_name,
        service_id: svc.id,
        building_node_id: svc.building_node_id,
        team_id: null,
        notes: '',
      })
      current = step(current)
    }
  }
  return visits.sort(
    (a, b) =>
      a.scheduled_date.localeCompare(b.scheduled_date) ||
      a.service_name.localeCompare(b.service_name),
  )
}

export function visitCountForService(
  frequency: ServiceFrequency,
  startDate: string,
  endDate: string,
): number {
  return paymentPeriodCount(startDate, endDate, frequency)
}

export function validateTreeIntegrity(
  tree: BuildingTree,
  services: ContractService[],
): TreeValidationResult {
  const nodeIds = new Set(tree.nodes.map((n) => n.id))
  const orphaned: ContractService[] = []

  for (const svc of services) {
    if (svc.building_node_id && !nodeIds.has(svc.building_node_id)) {
      orphaned.push(svc)
    }
  }

  return {
    valid: orphaned.length === 0,
    orphanedServices: orphaned,
    message:
      orphaned.length > 0
        ? `${orphaned.length} service(s) reference nodes that no longer exist in the tree.`
        : null,
  }
}

export function rebuildServicePaths(
  tree: BuildingTree,
  services: ContractService[],
): ContractService[] {
  return services.map((svc) => {
    if (!svc.building_node_id || svc.is_general) return svc

    const ancestorNames: string[] = []
    let nodeId: string | null = svc.building_node_id
    while (nodeId) {
      const node = tree.nodes.find((n) => n.id === nodeId)
      if (!node) break
      ancestorNames.unshift(node.name)
      nodeId = node.parentId
    }

    const newPath = [...ancestorNames, svc.service_name]
    const pathChanged =
      JSON.stringify(newPath) !== JSON.stringify(svc.service_path)

    return pathChanged
      ? { ...svc, service_path: newPath, _isDirty: true }
      : svc
  })
}

export function buildPathFromTree(
  tree: BuildingTree,
  nodeId: string,
  serviceName: string,
): string[] {
  const path: string[] = []
  let current = tree.nodes.find((n) => n.id === nodeId)
  while (current) {
    path.unshift(current.name)
    current = current.parentId
      ? tree.nodes.find((n) => n.id === current!.parentId)
      : undefined
  }
  path.push(serviceName)
  return path
}

export function getNodeAndDescendantIds(
  tree: BuildingTree,
  nodeId: string,
): Set<string> {
  const ids = new Set<string>([nodeId])
  let added = true
  while (added) {
    added = false
    for (const node of tree.nodes) {
      if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id)
        added = true
      }
    }
  }
  return ids
}

export function validateBeforeSave(
  formData: ContractFormData,
): SaveValidationResult {
  const errors: string[] = []

  if (
    formData.paymentMode === 'milestone' &&
    formData.milestones.length > 0
  ) {
    const percentSum = formData.milestones.reduce(
      (sum, m) => sum + m.percentage,
      0,
    )
    if (Math.abs(percentSum - 100) > 0.01) {
      errors.push(
        `Milestone percentages total ${percentSum.toFixed(2)}% — must equal exactly 100%.`,
      )
    }
  }

  const subtotal = formData.services.reduce(
    (sum, s) => sum + s.total_price,
    0,
  )
  if (formData.discount > subtotal) {
    errors.push(
      `Discount (${formData.discount} QAR) exceeds subtotal (${subtotal} QAR).`,
    )
  }

  return { valid: errors.length === 0, errors }
}

export const NODE_TYPE_CHILDREN: Record<string, string[]> = {
  complex: ['building', 'floor', 'area'],
  building: ['floor', 'area'],
  floor: ['area'],
  area: [],
}

export const ROOT_NODE_TYPES = ['complex', 'building']

export const NODE_TYPE_CONFIG: Record<string, { icon: string; borderColor: string }> = {
  complex: { icon: 'Building2', borderColor: 'border-blue-500' },
  building: { icon: 'Layers', borderColor: 'border-indigo-500' },
  floor: { icon: 'MapPinned', borderColor: 'border-violet-500' },
  area: { icon: 'MapPinned', borderColor: 'border-purple-500' },
}
