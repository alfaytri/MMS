// ============================================================================
// SERVER-ONLY Supabase client with the service_role key.
// Bypasses RLS — use ONLY in Route Handlers / Server Actions, never in client
// components or browser-exposed code. Service key must stay secret.
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

if (typeof window !== 'undefined') {
  throw new Error(
    'supabase/admin.ts must not be imported in browser code. ' +
      'Use it only in /api routes or Server Actions.'
  )
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  }
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local from ' +
        'Supabase Dashboard → Project Settings → API → service_role key.'
    )
  }
  return createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
