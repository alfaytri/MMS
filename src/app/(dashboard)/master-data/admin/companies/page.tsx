'use client'

import { useState } from 'react'
import { Building2, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CompanyFormDialog } from '@/components/master-data/CompanyFormDialog'
import { DivisionFormDialog } from '@/components/master-data/DivisionFormDialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useCompanies, type Company } from '@/hooks/useCompanies'
import { useAllDivisions, useDeleteDivision, type Division } from '@/hooks/useDivisions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Division card ────────────────────────────────────────────────────────────

function DivisionCard({
  division,
  companyName,
  onEdit,
  onDelete,
}: {
  division: Division & { name_ar?: string | null }
  companyName: string
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div
      className="relative flex gap-3 rounded-lg border border-border bg-card shadow-sm hover:shadow-md transition-shadow overflow-hidden"
      style={{ borderLeftColor: division.color, borderLeftWidth: 4 }}
    >
      {/* Logo / icon area */}
      <div className="flex items-start justify-center pt-4 pl-3">
        {division.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={division.logo_url}
            alt={division.name}
            className="h-12 w-12 rounded-md object-contain bg-muted/30 border border-border"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-muted/40 border border-border shrink-0">
            <Building2 className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-3 pr-2">
        {/* Top row: name + badges + actions */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-sm truncate">{division.name}</span>
              {division.short_name && (
                <Badge variant="outline" className="text-xs px-1.5 py-0 shrink-0">{division.short_name}</Badge>
              )}
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: division.is_active ? division.color : '#94a3b8' }}
                title={division.is_active ? 'Active' : 'Inactive'}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{companyName}</p>
            {division.address_en && (
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground truncate">{division.address_en}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Stamp indicator */}
        <div className="mt-2">
          <Badge
            variant={division.stamp_url ? 'default' : 'outline'}
            className={`text-xs px-1.5 py-0 ${division.stamp_url ? 'bg-green-50 text-green-700 border-green-200' : ''}`}
          >
            {division.stamp_url ? 'Has stamp' : 'No stamp'}
          </Badge>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompaniesPage() {
  const { data: companies, isLoading: loadingCompanies } = useCompanies()
  const { data: divisions, isLoading: loadingDivisions } = useAllDivisions()
  const deleteDivision = useDeleteDivision()

  const [companyDialog, setCompanyDialog] = useState<{ open: boolean; company: Company | null }>({ open: false, company: null })
  const [divisionDialog, setDivisionDialog] = useState<{ open: boolean; division: Division | null; companyId: string }>({ open: false, division: null, companyId: '' })
  const [deleteTarget, setDeleteTarget] = useState<Division | null>(null)

  if (loadingCompanies || loadingDivisions) {
    return (
      <PageWrapper>
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Companies & Divisions"
        description="Manage company entities and their divisions"
        action={{ label: 'Add Company', onClick: () => setCompanyDialog({ open: true, company: null }) }}
      />

      {companies?.map((company) => {
        const companyDivisions = (divisions ?? []).filter((d) => d.company_id === company.id)
        return (
          <section key={company.id} className="space-y-3">
            {/* Company header */}
            <div className="flex items-center gap-3 pb-2 border-b border-border">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold">{company.name_en}</h2>
                  <StatusBadge variant={company.is_active ? 'active' : 'inactive'}>
                    {company.is_active ? 'Active' : 'Inactive'}
                  </StatusBadge>
                </div>
                {company.name_ar && <p className="text-xs text-muted-foreground" dir="rtl">{company.name_ar}</p>}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setCompanyDialog({ open: true, company })}>
                <Pencil className="h-4 w-4" />
              </Button>
            </div>

            {/* Division card grid */}
            {companyDivisions.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {companyDivisions.map((div) => (
                  <DivisionCard
                    key={div.id}
                    division={div as Division & { name_ar?: string | null }}
                    companyName={company.name_en}
                    onEdit={() => setDivisionDialog({ open: true, division: div, companyId: company.id })}
                    onDelete={() => setDeleteTarget(div)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-3 text-center border border-dashed border-border rounded-lg">
                No divisions yet.
              </p>
            )}

            {/* Add division button */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setDivisionDialog({ open: true, division: null, companyId: company.id })}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Division
            </Button>
          </section>
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
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete division"
        description={`Delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        isPending={deleteDivision.isPending}
        onConfirm={() => {
          if (!deleteTarget) return
          deleteDivision.mutate(deleteTarget.id, {
            onSuccess: () => { toast.success('Division deleted'); setDeleteTarget(null) },
            onError: (err) => toast.error(err.message),
          })
        }}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
      />
    </PageWrapper>
  )
}
