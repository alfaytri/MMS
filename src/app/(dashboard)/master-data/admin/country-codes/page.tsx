import { PageWrapper } from '@/components/shared/PageWrapper'
import { CountryCodesAdmin } from '@/components/master-data/CountryCodesAdmin'

export const metadata = { title: 'Country Codes' }

export default function CountryCodesPage() {
  return (
    <PageWrapper>
      <CountryCodesAdmin />
    </PageWrapper>
  )
}
