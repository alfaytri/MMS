'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global error:', error)
  }, [error])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '16px', fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Something went wrong</h2>
      <p style={{ fontSize: '14px', color: '#64748b', maxWidth: '400px', textAlign: 'center' }}>
        An unexpected error occurred. Try refreshing the page.
      </p>
      <button
        onClick={reset}
        style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
      >
        Try again
      </button>
    </div>
  )
}
