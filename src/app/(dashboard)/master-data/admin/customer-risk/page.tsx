import { PageWrapper } from '@/components/shared/PageWrapper'
import { CustomerRiskSettingsAdmin } from '@/components/master-data/CustomerRiskSettingsAdmin'

export const metadata = { title: 'Customer Risk Colors' }

export default function CustomerRiskSettingsPage() {
  return (
    <PageWrapper>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Customer Risk Colors</h2>
        <p className="text-sm text-muted-foreground">
          Configurable payment-risk tiers that color-code customers by how long their oldest unpaid order
          invoice has been outstanding, and decide which tiers require order approval.
        </p>
        <CustomerRiskSettingsAdmin />
      </div>
    </PageWrapper>
  )
}
