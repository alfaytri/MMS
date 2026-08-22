import { differenceInDays, differenceInMonths, startOfDay } from 'date-fns'
import type { CustomerAddress, WarrantyInfo } from '@/types/orders'

export function getWarrantyInfo(
  warrantyExpiresAt: string | null,
  warrantyMonths: number
): WarrantyInfo {
  if (warrantyMonths === 0 || !warrantyExpiresAt) {
    return { status: 'expired', label: 'No warranty' }
  }
  const today = startOfDay(new Date())
  const expiry = startOfDay(new Date(warrantyExpiresAt))
  const daysLeft = differenceInDays(expiry, today)

  if (daysLeft < 0) return { status: 'expired', label: 'Warranty expired' }
  if (daysLeft <= 30) return { status: 'expiring_soon', label: `Expires in ${daysLeft} days` }
  const monthsLeft = differenceInMonths(expiry, today)
  return { status: 'active', label: `${monthsLeft} months remaining` }
}

export function formatAddressLine(address: CustomerAddress): string {
  if (address.address_type === 'blue-plate') {
    const parts = [
      address.unit     && `U-${address.unit}`,
      address.building && `B ${address.building}`,
      address.street   && `St ${address.street}`,
      address.zone     && `Zone ${address.zone}`,
    ].filter(Boolean)
    return parts.length > 0 ? parts.join(', ') + ', Qatar' : 'Qatar'
  }
  if (address.lat && address.lng) {
    return `${address.lat.toFixed(4)}, ${address.lng.toFixed(4)}`
  }
  return 'Address on file'
}
