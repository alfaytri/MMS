'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { KeyRound, ShieldCheck, Loader2, LogOut, Eye, EyeOff, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { queryKeys } from '@/lib/queryKeys'

/**
 * Forces a one-time password reset right after login. Shown whenever the
 * signed-in user's `user_data.must_change_password` is true — set on
 * account creation and admin resets, cleared by the change-password route.
 * Mounted inside <SessionGuard> in (dashboard)/layout.tsx, wrapping the shell,
 * so it only renders for authenticated users. While the profile is still
 * loading it renders the app untouched (no flash for users who don't need it).
 *
 * Testing escape hatch: press "i" three times (while NOT focused in a text
 * field) to skip the gate for the current browser session — see BYPASS below.
 */
const BYPASS_KEY = 'pwreset_bypass'

export function PasswordResetGate({ children }: { children: React.ReactNode }) {
  const { data: profile, isLoading } = useCurrentUserProfile()
  const [bypassed, setBypassed] = useState(false)
  const presses = useRef<number[]>([])

  // Restore a bypass set earlier this session.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(BYPASS_KEY) === '1') setBypassed(true)
    } catch {
      /* sessionStorage unavailable — ignore */
    }
  }, [])

  // "iii" bypass — three quick "i" presses skip the gate for this session.
  // Ignored while typing in a field so a password containing "i" can't trigger it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat) return // ignore held-key auto-repeat — three DELIBERATE taps only
      if (e.key !== 'i' && e.key !== 'I') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const now = Date.now()
      presses.current = [...presses.current.filter((p) => now - p < 1200), now]
      if (presses.current.length >= 3) {
        presses.current = []
        try {
          sessionStorage.setItem(BYPASS_KEY, '1')
        } catch {
          /* ignore */
        }
        setBypassed(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (isLoading) return <>{children}</>
  const mustReset = profile?.must_change_password === true
  if (!mustReset || bypassed) return <>{children}</>
  return (
    <PasswordResetScreen
      name={profile?.full_name || profile?.email || null}
    />
  )
}

const REQUIREMENTS: { label: string; test: (v: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { label: 'An uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { label: 'A lowercase letter', test: (v) => /[a-z]/.test(v) },
  { label: 'A number', test: (v) => /\d/.test(v) },
  { label: 'A symbol', test: (v) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(v) },
]

function PasswordResetScreen({ name }: { name: string | null }) {
  const queryClient = useQueryClient()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const passed = REQUIREMENTS.map((r) => r.test(pw))
  const allOk = passed.every(Boolean)
  const match = pw.length > 0 && pw === confirm
  const canSubmit = allOk && match && !submitting

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!allOk) return setError('Please meet all the password requirements.')
    if (!match) return setError('The two passwords do not match.')
    setSubmitting(true)
    try {
      const res = await fetch('/api/users/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: pw }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.error ?? 'Could not update your password. Please try again.')
        return
      }
      // Flag is cleared server-side; refetch the profile so the gate closes.
      await queryClient.invalidateQueries({ queryKey: queryKeys.profiles.my })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function signOut() {
    setSigningOut(true)
    try {
      await createClient().auth.signOut()
    } finally {
      window.location.href = '/login'
    }
  }

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border bg-card shadow-sm p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-300">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <KeyRound className="h-7 w-7" aria-hidden />
        </div>

        <h1 className="mt-5 text-xl font-semibold text-foreground text-center text-balance">
          Set a new password
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-center">
          For your security, please choose a new password before you continue. You&apos;ll only
          need to do this once.
        </p>
        {name && (
          <p className="mt-3 text-xs text-muted-foreground text-center">
            Signed in as <span className="font-medium text-foreground">{name}</span>
          </p>
        )}

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="pw-new" className="text-sm font-medium text-foreground">
              New password
            </label>
            <div className="relative">
              <Input
                id="pw-new"
                type={show ? 'text' : 'password'}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
                className="pr-10 h-11"
                placeholder="Enter a new password"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                aria-label={show ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="pw-confirm" className="text-sm font-medium text-foreground">
              Confirm new password
            </label>
            <Input
              id="pw-confirm"
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="h-11"
              placeholder="Re-enter the new password"
            />
            {confirm.length > 0 && !match && (
              <p className="text-xs text-destructive">Passwords do not match.</p>
            )}
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-muted/40 p-3">
            {REQUIREMENTS.map((r, i) => (
              <li
                key={r.label}
                className={`flex items-center gap-1.5 text-xs ${
                  passed[i] ? 'text-success' : 'text-muted-foreground'
                }`}
              >
                <Check className={`h-3.5 w-3.5 shrink-0 ${passed[i] ? 'opacity-100' : 'opacity-30'}`} />
                {r.label}
              </li>
            ))}
          </ul>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full h-11" disabled={!canSubmit}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Updating…
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Save new password
              </>
            )}
          </Button>
        </form>

        <Button
          variant="ghost"
          className="mt-2 w-full h-11 text-muted-foreground"
          onClick={signOut}
          disabled={signingOut}
        >
          {signingOut ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <LogOut className="h-4 w-4" aria-hidden />
          )}
          Sign out
        </Button>
      </div>
    </div>
  )
}
