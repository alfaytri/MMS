import { redirect } from 'next/navigation'

// Draft quotations and live contracts were merged into a single page at
// /contracts (blended list with status filters). This route now redirects
// there so existing links keep working.
export default function ContractQuotationsRedirect() {
  redirect('/contracts')
}
