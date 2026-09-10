// src/components/team-leader/shared/SignaturePad.tsx
// Fix 4: Persists signature blob to IndexedDB on confirm.
// Re-hydrates on mount for crash recovery.
'use client'

import { useRef, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Eraser, CheckCircle2 } from 'lucide-react'
import { saveDraftSignature, getDraftSignature, clearDraftSignature } from '@/lib/visitDrafts'
import { cn } from '@/lib/utils'

interface Props {
  visitId: string
  value: Blob | null
  onChange: (sig: Blob | null) => void
}

export function SignaturePad({ visitId, value, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing   = useRef(false)
  const [confirmed, setConfirmed] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  // Re-hydrate from IndexedDB on mount
  useEffect(() => {
    if (value) {
      setPreview(URL.createObjectURL(value))
      setConfirmed(true)
      return
    }
    getDraftSignature(visitId).then((saved) => {
      if (saved) {
        onChange(saved)
        setPreview(URL.createObjectURL(saved))
        setConfirmed(true)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId])

  function getCtx() {
    const canvas = canvasRef.current
    if (!canvas) return null
    return canvas.getContext('2d')
  }

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true
    const ctx = getCtx()
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = getCtx()
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.lineWidth   = 2
    ctx.strokeStyle = '#000'
    ctx.lineCap     = 'round'
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  function onPointerUp() { drawing.current = false }

  function resetSignature() {
    // Reset state regardless of whether the <canvas> is currently mounted. In
    // the confirmed/preview view the canvas is NOT rendered, so the previous
    // canvas-gated guard made "Re-sign" a silent no-op (it returned early
    // before clearing state). Revoke the old preview URL + drop the persisted
    // draft so it can't re-hydrate.
    setPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return null })
    setConfirmed(false)
    onChange(null)
    void clearDraftSignature(visitId)
    const canvas = canvasRef.current
    if (canvas) getCtx()?.clearRect(0, 0, canvas.width, canvas.height)
  }

  async function confirm() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob(async (blob) => {
      if (!blob) return
      await saveDraftSignature(visitId, blob)
      onChange(blob)
      setPreview(URL.createObjectURL(blob))
      setConfirmed(true)
    }, 'image/png')
  }

  if (confirmed && preview) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">Customer Signature</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt="signature" className="w-full max-h-32 object-contain border rounded-md bg-white" />
        <Button type="button" variant="ghost" size="sm" onClick={resetSignature} className="gap-2">
          <Eraser className="h-3.5 w-3.5" /> Re-sign
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Customer Signature</p>
      <canvas
        ref={canvasRef}
        width={600}
        height={180}
        className={cn('w-full border-2 border-dashed rounded-md bg-white touch-none')}
        style={{ height: 180 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={resetSignature} className="gap-2">
          <Eraser className="h-3.5 w-3.5" /> Clear
        </Button>
        <Button type="button" size="sm" onClick={confirm} className="gap-2 flex-1 min-h-11">
          <CheckCircle2 className="h-4 w-4" /> Confirm Signature
        </Button>
      </div>
    </div>
  )
}
