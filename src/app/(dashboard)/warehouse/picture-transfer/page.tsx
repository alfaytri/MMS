'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { useHasPermission } from '@/hooks/usePermissions'
import { useMyTransferSources } from '@/hooks/useMyTransferSources'
import { PictureTransferHome } from '@/components/warehouse/picture-transfer/PictureTransferHome'
import { PictureSendFlow } from '@/components/warehouse/picture-transfer/PictureSendFlow'
import { PictureReceive } from '@/components/warehouse/picture-transfer/PictureReceive'

/**
 * Picture Transfer (v2) — a picture-first Send/Receive surface for low-literacy
 * warehouse staff. Gated by `warehouse.transfer.simple`; the source is derived
 * from the user's Responsible-Person assignment — at the WAREHOUSE level or the
 * SUB-CONTAINER level (`get_my_transfer_sources`) — never chosen from scratch.
 * The classic transfer surface is untouched.
 */
export default function PictureTransferPage() {
  const canUse = useHasPermission('warehouse.transfer.simple')
  const { data: sources = [], isLoading } = useMyTransferSources()
  const [mode, setMode] = useState<'home' | 'send' | 'receive'>('home')
  const [pickedWhId, setPickedWhId] = useState<string | null>(null)
  const [pickedSubId, setPickedSubId] = useState<string | null>(null)

  // Distinct warehouses across his sources.
  const warehouses = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of sources) if (!m.has(s.warehouse_id)) m.set(s.warehouse_id, s.warehouse_name)
    return Array.from(m, ([id, name]) => ({ id, name }))
  }, [sources])
  const whId = pickedWhId ?? (warehouses.length === 1 ? warehouses[0].id : null)

  // The sub-containers he may send from within the chosen warehouse.
  const subsForWh = useMemo(() => sources.filter((s) => s.warehouse_id === whId), [sources, whId])
  const subId = pickedSubId ?? (subsForWh.length === 1 ? subsForWh[0].sub_container_id : null)

  // Every sub-container he's responsible for — used to scope the Receive inbox.
  const mySubIds = useMemo(() => sources.map((s) => s.sub_container_id), [sources])

  if (!canUse) return <Center>You don’t have access to Picture Transfer.</Center>
  if (isLoading) return <Center>Loading…</Center>
  if (sources.length === 0)
    return (
      <Center>
        You’re not assigned to a warehouse or area yet.
        <br />
        Ask an admin to make you a Responsible Person.
      </Center>
    )

  if (!whId)
    return (
      <Picker title="Which store are you in?">
        {warehouses.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => setPickedWhId(w.id)}
            className="min-h-16 rounded-2xl border-2 border-border p-5 text-lg font-bold"
          >
            {w.name}
          </button>
        ))}
      </Picker>
    )

  if (!subId)
    return (
      <Picker title="Which area?">
        {subsForWh.map((s) => (
          <button
            key={s.sub_container_id}
            type="button"
            onClick={() => setPickedSubId(s.sub_container_id)}
            className="min-h-16 rounded-2xl border-2 border-border p-5 text-lg font-bold"
          >
            {s.sub_container_name}
          </button>
        ))}
      </Picker>
    )

  const source = { warehouseId: whId, subContainerId: subId }

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col bg-background">
      {mode === 'send' && <PictureSendFlow source={source} onExit={() => setMode('home')} />}
      {mode === 'receive' && <PictureReceive mySubIds={mySubIds} onExit={() => setMode('home')} />}
      {mode === 'home' && (
        <PictureTransferHome mySubIds={mySubIds} onSend={() => setMode('send')} onReceive={() => setMode('receive')} />
      )}
    </div>
  )
}

function Center({ children }: { children: ReactNode }) {
  return <div className="grid min-h-[60vh] place-items-center p-8 text-center text-base text-muted-foreground">{children}</div>
}

function Picker({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-xl font-extrabold">{title}</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </div>
  )
}
