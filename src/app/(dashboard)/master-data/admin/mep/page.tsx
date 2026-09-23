import { redirect } from 'next/navigation'

// MEP is two sidebar entries (Disciplines + Milestone Codes) rather than one
// tabbed page — the base /master-data/admin/mep lands on the first, mirroring
// how /master-data/admin redirects to its first section.
export default function AdminMepPage() {
  redirect('/master-data/admin/mep/disciplines')
}
