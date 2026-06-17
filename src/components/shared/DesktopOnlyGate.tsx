import { Monitor } from 'lucide-react'

interface DesktopOnlyGateProps {
  children: React.ReactNode
  title?: string
  message?: string
}

export function DesktopOnlyGate({
  children,
  title = 'Best viewed on a desktop or tablet',
  message = 'This page needs more screen space than a phone provides. Please open it on a laptop, desktop, or tablet in landscape.',
}: DesktopOnlyGateProps) {
  return (
    <>
      <div
        data-desktop-gate
        className="lg:hidden flex flex-col items-center justify-center text-center px-6 py-16 gap-4 text-muted-foreground"
      >
        <Monitor className="h-12 w-12 opacity-60" aria-hidden />
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="max-w-sm text-sm">{message}</p>
      </div>
      <div data-desktop-content className="hidden lg:block">
        {children}
      </div>
    </>
  )
}
