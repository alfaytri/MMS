// src/app/(dashboard)/reports/overtime/page.tsx
import { OvertimeReportTable } from '@/components/reports/OvertimeReportTable'

export const metadata = { title: 'Overtime Report' }

export default function OvertimeReportPage() {
  return (
    <div className="p-4 sm:p-6 max-w-screen-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Overtime Report</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monthly overtime hours per team, grouped by division
        </p>
      </div>
      <OvertimeReportTable />
    </div>
  )
}
