import type { Metadata } from 'next'

// The one public page — give it a real tab title ("Sign in · Alfaytri").
export const metadata: Metadata = { title: 'Sign in' }

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      {children}
    </div>
  )
}
