'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signIn(formData: FormData) {
  const supabase = await createClient()
  const raw = ((formData.get('username') ?? formData.get('email') ?? '') as string).trim().toLowerCase()
  // Resolve username → real stored email (domain-agnostic; see resolve_login_email).
  const { data: resolved } = await supabase.rpc(
    'resolve_login_email' as never,
    { p_username: raw } as never,
  )
  const email = (resolved as unknown as string | null) ?? raw
  const data = {
    email,
    password: formData.get('password') as string,
  }
  const { error } = await supabase.auth.signInWithPassword(data)
  if (error) {
    return { error: error.message }
  }
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
