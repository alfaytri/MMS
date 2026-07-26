import { format, formatDistanceToNow } from 'date-fns'

export function formatCurrency(amount: number | null | undefined, currency: string): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-QA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: string | Date | null | undefined): string {
  if (date == null) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  return format(d, 'dd MMM yyyy')
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (date == null) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  return format(d, 'dd MMM yyyy, HH:mm')
}

export function formatDateTime12h(date: string | Date | null | undefined): string {
  if (date == null) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  return format(d, 'MMM d, h:mm a')
}

export function formatDateTime12hFull(date: string | Date | null | undefined): string {
  if (date == null) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  return format(d, 'MMM d, yyyy h:mm a')
}

export function formatDateTime12hShort(date: string | Date | null | undefined): string {
  if (date == null) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  return format(d, 'M/d h:mma')
}

export function formatRelative(date: string | Date | null | undefined): string {
  if (date == null) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  return formatDistanceToNow(d, { addSuffix: true })
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-QA').format(value)
}
