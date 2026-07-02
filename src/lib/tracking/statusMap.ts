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

// Maps 17track status tags to display-friendly strings.
// Tags that match a ShipmentStatus also drive shipment-level status updates via the RPC.
export function map17trackTag(tag: string): string {
  switch (tag) {
    case 'InTransit':          return 'in_transit'
    case 'Delivered':          return 'delivered'
    case 'Exception':
    case 'Undelivered':        return 'delayed'
    case 'Customs':            return 'customs'
    case 'InfoReceived':       return 'info_received'
    case 'OutForDelivery':     return 'out_for_delivery'
    case 'AvailableForPickup': return 'available_for_pickup'
    case 'PickedUp':           return 'picked_up'
    case 'Expired':            return 'expired'
    case 'NotFound':           return 'not_found'
    default:                   return tag.toLowerCase()
  }
}
