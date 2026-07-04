'use client'

export function TopNavV2Offset({ children }: { children: React.ReactNode }) {
  return (
    <div className="print:hidden">
      {children}
    </div>
  )
}
