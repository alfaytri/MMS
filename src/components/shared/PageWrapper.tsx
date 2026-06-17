import { PageContainer } from './PageContainer'

/** @deprecated Use PageContainer from './PageContainer'. */
export function PageWrapper({ children }: { children: React.ReactNode }) {
  return <PageContainer>{children}</PageContainer>
}
