'use client'

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useUserDivisionScope } from '@/hooks/useUserDivisionScope'

export interface DivisionFilterValue {
  companyId:  string | null
  divisionId: string | null
}

interface Props {
  value:    DivisionFilterValue
  onChange: (v: DivisionFilterValue) => void
}

export function DivisionFilter({ value, onChange }: Props) {
  const { isSuperViewer, companies, divisions } = useUserDivisionScope()

  if (!isSuperViewer) return null

  const filteredDivisions = value.companyId
    ? divisions.filter((d) => d.company_id === value.companyId)
    : divisions

  function handleCompanyChange(companyId: string | null) {
    const resolvedCompany = !companyId || companyId === '__all__' ? null : companyId
    onChange({ companyId: resolvedCompany, divisionId: null })
  }

  function handleDivisionChange(divisionId: string | null) {
    const resolved = !divisionId || divisionId === '__all__' ? null : divisionId
    onChange({ ...value, divisionId: resolved })
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Select
        value={value.companyId ?? '__all__'}
        onValueChange={handleCompanyChange}
      >
        <SelectTrigger className="w-44 h-9">
          <SelectValue placeholder="All Companies" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Companies</SelectItem>
          {companies.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.divisionId ?? '__all__'}
        onValueChange={handleDivisionChange}
      >
        <SelectTrigger className="w-44 h-9">
          <SelectValue placeholder="All Divisions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All Divisions</SelectItem>
          {filteredDivisions.map((d) => (
            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
