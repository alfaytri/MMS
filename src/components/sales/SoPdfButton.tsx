'use client'

import { PDFDownloadLink } from '@react-pdf/renderer'
import { Button } from '@/components/ui/button'
import { QuotationDocument } from './SoQuotationPdf'
import type { SaleOrder } from '@/hooks/useSaleOrders'

interface SoPdfButtonProps {
  so: SaleOrder
}

export function SoPdfButton({ so }: SoPdfButtonProps) {
  return (
    <PDFDownloadLink
      document={
        <QuotationDocument
          so={so}
          lines={so.sale_order_lines ?? []}
          customerName={so.customer_name ?? ''}
          customerPhone={so.customer_phone ?? null}
        />
      }
      fileName={`Quotation-${so.so_number}.pdf`}
    >
      {({ loading }: { loading: boolean }) => (
        <Button variant="outline" size="sm" disabled={loading}>
          {loading ? 'Preparing…' : 'Download PDF'}
        </Button>
      )}
    </PDFDownloadLink>
  )
}
