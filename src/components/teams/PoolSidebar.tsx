'use client'

import { VehiclePool } from './VehiclePool'
import { EmployeePool } from './EmployeePool'

export function PoolSidebar() {
  return (
    <div className="hidden lg:flex w-80 shrink-0 border-l flex-col gap-5 p-5 overflow-y-auto">
      <VehiclePool />
      <div className="border-t pt-4">
        <EmployeePool />
      </div>
    </div>
  )
}
