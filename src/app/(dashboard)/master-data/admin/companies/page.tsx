'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CompanyFormDialog } from '@/components/master-data/CompanyFormDialog'
import { DivisionFormDialog } from '@/components/master-data/DivisionFormDialog'
import { useCompanies, type Company } from '@/hooks/useCompanies'
import { useDivisions, type Division } from '@/hooks/useDivisions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Building2, Pencil, Plus } from 'lucide-react'

export default function CompaniesPage() {
  const { data: companies, isLoading: loadingCompanies } = useCompanies()
  const { data: divisions, isLoading: loadingDivisions } = useDivisions()

  const [companyDialog, setCompanyDialog] = useState<{ open: boolean; company: Company | null }>({
    open: false,
    company: null,
  })
  const [divisionDialog, setDivisionDialog] = useState<{
    open: boolean
    division: Division | null
    companyId: string
  }>({ open: false, division: null, companyId: '' })

  if (loadingCompanies || loadingDivisions) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Companies & Divisions"
        description="Manage your company entities and their divisions"
        action={{
          label: 'Add Company',
          onClick: () => setCompanyDialog({ open: true, company: null }),
        }}
      />

      {companies?.map((company) => {
        const companyDivisions = divisions?.filter((d) => d.company_id === company.id) ?? []
        return (
          <Card key={company.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-lg">{company.name_en}</CardTitle>
                  {company.name_ar && (
                    <p className="text-sm text-muted-foreground" dir="rtl">
                      {company.name_ar}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge variant={company.is_active ? 'active' : 'inactive'}>
                  {company.is_active ? 'Active' : 'Inactive'}
                </StatusBadge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCompanyDialog({ open: true, company })}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground">
                  Divisions ({companyDivisions.length})
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDivisionDialog({ open: true, division: null, companyId: company.id })
                  }
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Division
                </Button>
              </div>
              {companyDivisions.length > 0 ? (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Division</TableHead>
                        <TableHead className="hidden sm:table-cell">Short Name</TableHead>
                        <TableHead className="hidden md:table-cell">Currency</TableHead>
                        <TableHead className="hidden md:table-cell">Tax %</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {companyDivisions.map((div) => (
                        <TableRow key={div.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-3 w-3 rounded-full shrink-0"
                                style={{ backgroundColor: div.color }}
                              />
                              <span className="font-medium">{div.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {div.short_name || <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {div.default_currency}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {String(div.default_tax_rate)}%
                          </TableCell>
                          <TableCell>
                            <StatusBadge variant={div.is_active ? 'active' : 'inactive'}>
                              {div.is_active ? 'Active' : 'Inactive'}
                            </StatusBadge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() =>
                                setDivisionDialog({
                                  open: true,
                                  division: div,
                                  companyId: company.id,
                                })
                              }
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No divisions yet.
                </p>
              )}
            </CardContent>
          </Card>
        )
      })}

      <CompanyFormDialog
        open={companyDialog.open}
        onOpenChange={(open) => setCompanyDialog((s) => ({ ...s, open }))}
        company={companyDialog.company}
      />
      <DivisionFormDialog
        open={divisionDialog.open}
        onOpenChange={(open) => setDivisionDialog((s) => ({ ...s, open }))}
        division={divisionDialog.division}
        companyId={divisionDialog.companyId}
        companies={companies ?? []}
      />
    </div>
  )
}
