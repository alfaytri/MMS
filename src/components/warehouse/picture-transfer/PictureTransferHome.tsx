'use client'

import { useMemo } from 'react'
import { PackagePlus, PackageCheck } from 'lucide-react'
import { useWarehouseTransfers } from '@/hooks/useWarehouseOperations'

/**
 * Home screen — the whole app is two big buttons. SEND (blue) + RECEIVE
 * (green, with a "waiting" count badge). No text to read to get started.
 */
export function PictureTransferHome({
  mySubIds,
  onSend,
  onReceive,
}: {
  mySubIds: string[]
  onSend: () => void
  onReceive: () => void
}) {
  const { data: inTransit = [] } = useWarehouseTransfers({ status: 'in_transit' })
  const receiveCount = useMemo(
    () => inTransit.filter((t) => t.to_sub_container_id != null && mySubIds.includes(t.to_sub_container_id)).length,
    [inTransit, mySubIds],
  )

  return (
    <div className="flex flex-1 flex-col gap-5 p-5">
      <button
        type="button"
        onClick={onSend}
        className="flex flex-1 flex-col justify-between rounded-3xl bg-gradient-to-br from-blue-600 to-blue-700 p-7 text-left text-white shadow-lg"
      >
        <PackagePlus className="h-14 w-14" />
        <div>
          <div className="text-3xl font-extrabold">SEND</div>
          <div className="text-base opacity-90">Move items out to a team</div>
        </div>
      </button>
      <button
        type="button"
        onClick={onReceive}
        className="relative flex flex-1 flex-col justify-between rounded-3xl bg-gradient-to-br from-green-600 to-green-700 p-7 text-left text-white shadow-lg"
      >
        {receiveCount > 0 && (
          <span className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-white text-lg font-extrabold text-red-600 shadow">
            {receiveCount}
          </span>
        )}
        <PackageCheck className="h-14 w-14" />
        <div>
          <div className="text-3xl font-extrabold">RECEIVE</div>
          <div className="text-base opacity-90">{receiveCount > 0 ? `${receiveCount} waiting` : 'Nothing waiting'}</div>
        </div>
      </button>
    </div>
  )
}
