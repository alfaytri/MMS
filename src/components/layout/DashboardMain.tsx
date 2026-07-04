'use client'

export function DashboardMain({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 min-h-0 overflow-y-auto flex flex-col print:overflow-visible">
      {children}
    </main>
  )
}
