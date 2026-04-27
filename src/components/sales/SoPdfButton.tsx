'use client'

import { PDFDownloadLink } from '@react-pdf/renderer'
import { Button } from '@/components/ui/button'
import { QuotationDocument } from './SoQuotationPdf'
import { useCompanies } from '@/hooks/useCompanies'
import type { SaleOrder } from '@/hooks/useSaleOrders'

interface SoPdfButtonProps {
  so: SaleOrder
}

export function SoPdfButton({ so }: SoPdfButtonProps) {
  const { data: companies } = useCompanies()
  const c = companies?.find((co) => co.is_active) ?? companies?.[0]

  const company = c ? {
    name:      c.name_en,
    address:   c.address_en ?? null,
    vat_id:    c.vat_id ?? null,
    cr_number: c.cr_number ?? null,
  } : undefined

  return (
    <PDFDownloadLink
      document={
        <QuotationDocument
          so={so}
          lines={so.sale_order_lines ?? []}
          customerName={so.customer_name ?? ''}
          customerPhone={so.customer_phone ?? null}
          company={company}
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
