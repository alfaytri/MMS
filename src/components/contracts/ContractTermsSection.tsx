'use client'

import { useState } from 'react'
import DOMPurify from 'dompurify'
import { ChevronDown, ChevronRight, ChevronsUpDown } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ContractService } from '@/types/contracts'
import { queryKeys } from '@/lib/queryKeys'

interface Props {
  divisions: string[]
  services: ContractService[]
  termsSnapshot?: object | null
}

interface TermItem {
  id: string
  title: string
  content: string
  source: 'division' | 'service'
}

type DivisionTermRow = { id: string; content_en: string; division_id: string | null; divisions: { name: string } | null }
type ServiceTermRow  = { id: string; content_en: string; document_type: string }

export function ContractTermsSection({ divisions, services, termsSnapshot }: Props) {
  const supabase = createClient()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const { data: divisionTerms } = useQuery({
    queryKey: queryKeys.contracts.divisionTerms(divisions),
    queryFn: async () => {
      if (divisions.length === 0) return []
      const { data } = await supabase
        .from('document_terms')
        .select('id, content_en, division_id, divisions:company_divisions(name)')
        .eq('document_type', 'contract')
        .in('division_id', divisions)
      return (data || []) as DivisionTermRow[]
    },
    enabled: divisions.length > 0,
  })

  const serviceIds = services
    .map((s) => s.service_id)
    .filter((id): id is string => !!id)
  const uniqueServiceIds = [...new Set(serviceIds)]

  const { data: serviceTerms } = useQuery({
    queryKey: queryKeys.contracts.serviceTerms(uniqueServiceIds),
    queryFn: async () => {
      if (uniqueServiceIds.length === 0) return []
      const { data } = await supabase
        .from('document_terms')
        .select('id, content_en, document_type')
        .in('document_type', uniqueServiceIds)
      return (data || []) as ServiceTermRow[]
    },
    enabled: uniqueServiceIds.length > 0,
  })

  const terms: TermItem[] = []

  if (divisionTerms) {
    for (const dt of divisionTerms) {
      terms.push({
        id: dt.id,
        title: `${dt.divisions?.name || 'Division'} Terms`,
        content: dt.content_en || '',
        source: 'division',
      })
    }
  }

  if (serviceTerms) {
    for (const st of serviceTerms) {
      const svc = services.find((s) => s.service_id === st.document_type)
      terms.push({
        id: st.id,
        title: `${svc?.service_name || 'Service'} Terms`,
        content: st.content_en || '',
        source: 'service',
      })
    }
  }

  if (terms.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No terms and conditions found for the selected divisions and services.
      </p>
    )
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (expandedIds.size === terms.length) {
      setExpandedIds(new Set())
    } else {
      setExpandedIds(new Set(terms.map((t) => t.id)))
    }
  }

  const allExpanded = expandedIds.size === terms.length

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={toggleAll}>
          <ChevronsUpDown className="h-3.5 w-3.5 mr-1" />
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </Button>
      </div>

      {terms.map((term) => {
        const isOpen = expandedIds.has(term.id)
        return (
          <div key={term.id} className="rounded-md border">
            <button
              onClick={() => toggleExpand(term.id)}
              className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/50"
            >
              {isOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className="text-sm font-medium">{term.title}</span>
              <span
                className={cn(
                  'ml-auto text-xs px-1.5 py-0.5 rounded',
                  term.source === 'division'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-purple-100 text-purple-700',
                )}
              >
                {term.source}
              </span>
            </button>
            {isOpen && (
              <div className="px-3 pb-3 border-t">
                <div
                  className="prose prose-sm max-w-none pt-2 text-sm text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(term.content) }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
