import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { Toaster } from 'sonner'

const inter = Inter({ subsets: ['latin'] })

// Company name hardcoded here by request: metadata renders pre-auth, where
// companies.name_en isn't readable (RLS is authenticated-only).
export const metadata: Metadata = {
  // `default` is the tab title when a page sets none; any page that exports its
  // own `title` gets "<that title> · Alfaytri".
  title: {
    default: 'Alfaytri',
    template: '%s · Alfaytri',
  },
  description: 'Inventory & warehouse management',
  // Private, login-gated ERP: reinforce "do not index" at the page-meta level
  // too (belt-and-braces with robots.ts), so no page is ever indexed.
  robots: { index: false, follow: false },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <QueryProvider>
            {children}
          </QueryProvider>
          <Toaster richColors position="top-right" theme="system" />
        </ThemeProvider>
      </body>
    </html>
  )
}
