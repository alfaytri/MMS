'use client'

import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import type { SaleOrder } from '@/hooks/useSaleOrders'

interface SoPdfButtonProps {
  so: SaleOrder
}

// @react-pdf/renderer is ~1MB. Loading it dynamically keeps it out of the
// route's initial JS chunk so the page becomes interactive sooner; the PDF
// implementation streams in alongside.
const SoPdfButtonInner = dynamic(
  () => import('./SoPdfButtonInner').then((m) => m.SoPdfButtonInner),
  {
    ssr: false,
    loading: () => (
      <Button variant="outline" size="sm" disabled>
        Loading…
      </Button>
    ),
  }
)

export function SoPdfButton(props: SoPdfButtonProps) {
  return <SoPdfButtonInner {...props} />
}
