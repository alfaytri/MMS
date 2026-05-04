'use client'

import { VehiclePool } from './VehiclePool'
import { EmployeePool } from './EmployeePool'

export function PoolSidebar() {
  return (
    <div className="w-56 lg:w-64 shrink-0 border-l flex flex-col gap-4 p-3 overflow-y-auto">
      <VehiclePool />
      <div className="border-t pt-3">
        <EmployeePool />
      </div>
    </div>
  )
}
