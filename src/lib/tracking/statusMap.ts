import type { ShipmentStatus } from '@/hooks/useShipments'

export const STATUS_WEIGHTS: Record<ShipmentStatus, number> = {
  booked:     1,
  in_transit: 2,
  customs:    3.0,
  delayed:    3.1,
  delivered:  4,
}

// Passed as p_status_map to the append_shipment_events RPC
export const STATUS_MAP_JSON = { ...STATUS_WEIGHTS }

// Returns null for tags that should not change shipment status
export function map17trackTag(tag: string): ShipmentStatus | null {
  switch (tag) {
    case 'InTransit':   return 'in_transit'
    case 'Delivered':   return 'delivered'
    case 'Exception':
    case 'Undelivered': return 'delayed'
    case 'Customs':     return 'customs'
    default:            return null
  }
}
