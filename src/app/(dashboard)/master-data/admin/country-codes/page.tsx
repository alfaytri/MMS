import { PageWrapper } from '@/components/shared/PageWrapper'
import { CountryCodesAdmin } from '@/components/master-data/CountryCodesAdmin'

export const metadata = { title: 'Country Codes' }

export default function CountryCodesPage() {
  return (
    <PageWrapper>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Country Codes</h2>
        <CountryCodesAdmin />
      </div>
    </PageWrapper>
  )
}
