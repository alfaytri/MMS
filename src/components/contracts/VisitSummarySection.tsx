'use client'

import { AlertTriangle } from 'lucide-react'
import { visitCountForService } from '@/lib/contractUtils'
import type { ContractService, ServiceFrequency } from '@/types/contracts'

interface Props {
  services: ContractService[]
  startDate: string
  endDate: string
}

export function VisitSummarySection({ services, startDate, endDate }: Props) {
  if (!startDate || !endDate || services.length === 0) return null

  const rows = services.map((svc) => {
    const count = visitCountForService(svc.frequency as ServiceFrequency, startDate, endDate)
    return { service: svc, count }
  })

  const totalVisits = rows.reduce((sum, r) => sum + r.count, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md bg-yellow-50 border border-yellow-200 p-3">
        <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
        <p className="text-sm text-yellow-700">
          Tentative visit counts based on contract dates. Team assignment happens after approval.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4 font-medium">Service</th>
              <th className="py-2 pr-4 font-medium hidden sm:table-cell">Location</th>
              <th className="py-2 pr-4 font-medium">Frequency</th>
              <th className="py-2 pr-4 font-medium text-right">Visits</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.service.id} className="border-b border-dashed">
                <td className="py-2 pr-4">{row.service.service_name}</td>
                <td className="py-2 pr-4 text-muted-foreground hidden sm:table-cell">
                  {row.service.service_path.length > 1
                    ? row.service.service_path.slice(0, -1).join(' > ')
                    : row.service.is_general
                      ? 'General'
                      : '—'}
                </td>
                <td className="py-2 pr-4 capitalize">
                  {row.service.frequency.replace('_', '-')}
                </td>
                <td className="py-2 pr-4 text-right">{row.count}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2 pr-4">Total</td>
              <td className="py-2 pr-4 hidden sm:table-cell"></td>
              <td className="py-2 pr-4"></td>
              <td className="py-2 pr-4 text-right">{totalVisits}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
