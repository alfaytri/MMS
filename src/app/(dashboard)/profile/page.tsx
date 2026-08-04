'use client'

import { useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Camera, Loader2, Eye, EyeOff, KeyRound, User, Save } from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { PhoneInputWithCode, splitPhone } from '@/components/shared/PhoneInputWithCode'
import { useCurrentUserProfile, useUpdateProfile } from '@/hooks/useProfiles'
import { useUserDivisions } from '@/hooks/useProfiles'
import { usePermissions } from '@/hooks/usePermissions'
import { passwordSchema } from '@/lib/auth/password-policy'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

const passwordFormSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: passwordSchema,
  confirm: z.string(),
}).refine((v) => v.new_password === v.confirm, {
  message: 'Passwords do not match',
  path: ['confirm'],
})

type PasswordValues = z.infer<typeof passwordFormSchema>

export default function ProfilePage() {
  const { data: profile, isLoading } = useCurrentUserProfile()
  const { data: divisions } = useUserDivisions(profile?.id ?? null)
  const { data: perms } = usePermissions()
  const updateProfile = useUpdateProfile()
  const queryClient = useQueryClient()

  const [uploading, setUploading] = useState(false)
  const [freshAvatarUrl, setFreshAvatarUrl] = useState<string | null>(null)
  const [showCurrent, setShowCurrent] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [phoneCountryCode, setPhoneCountryCode] = useState('')
  const [phoneDigits, setPhoneDigits] = useState('')
  const [phoneEditing, setPhoneEditing] = useState(false)
  const [phoneSaving, setPhoneSaving] = useState(false)

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordFormSchema) as never,
    defaultValues: { current_password: '', new_password: '', confirm: '' },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Profile not found.</p>
      </div>
    )
  }

  const initials = profile.full_name
    ? profile.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : (profile.email ?? '??').slice(0, 2).toUpperCase()

  function startPhoneEdit() {
    const { code, digits } = splitPhone(profile!.phone)
    setPhoneCountryCode(code)
    setPhoneDigits(digits)
    setPhoneEditing(true)
  }

  async function savePhone() {
    if (!profile) return
    setPhoneSaving(true)
    try {
      const fullPhone = phoneDigits ? `${phoneCountryCode}${phoneDigits}` : null
      await updateProfile.mutateAsync({ id: profile.id, phone: fullPhone })
      queryClient.invalidateQueries({ queryKey: queryKeys.profiles.my })
      toast.success('Phone number updated')
      setPhoneEditing(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save phone')
    } finally {
      setPhoneSaving(false)
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5 MB')
      return
    }

    setUploading(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() ?? 'jpg'
      const filePath = `${profile.auth_user_id}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })
      if (uploadErr) throw uploadErr

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath)

      // Path is deterministic + upsert=true, so the URL stays the same
      // across uploads. Bust the cache with ?t= so TopNav / other viewers
      // pick up the new bytes on next fetch. `freshAvatarUrl` overrides
      // the display in this tab immediately.
      const bustedUrl = `${urlData.publicUrl}?t=${Date.now()}`
      await updateProfile.mutateAsync({ id: profile.id, avatar_url: bustedUrl })
      setFreshAvatarUrl(bustedUrl)
      queryClient.invalidateQueries({ queryKey: queryKeys.profiles.my })
      toast.success('Photo updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handlePasswordChange(values: PasswordValues) {
    setChangingPassword(true)
    try {
      const res = await fetch('/api/users/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: values.current_password,
          new_password: values.new_password,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Change failed')
      const supabase = createClient()
      await supabase.auth.refreshSession()
      toast.success('Password changed successfully')
      passwordForm.reset()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Password change failed')
    } finally {
      setChangingPassword(false)
    }
  }

  const roleName = perms?.roles?.[0] ?? null

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account settings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — Avatar + Identity */}
        <Card className="lg:row-span-2">
          <CardContent className="flex flex-col items-center pt-8 pb-6 space-y-4">
            <div className="relative group">
              <Avatar className="h-28 w-28">
                {(freshAvatarUrl ?? profile.avatar_url) && (
                  <AvatarImage src={freshAvatarUrl ?? profile.avatar_url ?? undefined} alt={profile.full_name} />
                )}
                <AvatarFallback className="bg-primary text-primary-foreground text-3xl">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {uploading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                ) : (
                  <Camera className="h-6 w-6 text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>

            <div className="text-center space-y-1">
              <h2 className="text-xl font-semibold">{profile.full_name}</h2>
              {profile.email && (
                <p className="text-sm text-muted-foreground">{profile.email}</p>
              )}
              {roleName && (
                <Badge variant="secondary" className="text-xs mt-2">{roleName}</Badge>
              )}
            </div>

            <Separator />

            <div className="w-full space-y-3 px-2">
              <div className="flex items-center justify-between min-h-[28px]">
                <span className="text-xs text-muted-foreground">Phone</span>
                {phoneEditing ? (
                  <div className="flex items-center gap-2">
                    <div className="w-[200px]">
                      <PhoneInputWithCode
                        value={phoneDigits}
                        onChange={setPhoneDigits}
                        countryCode={phoneCountryCode}
                        onCountryCodeChange={setPhoneCountryCode}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 w-9 p-0"
                      disabled={phoneSaving}
                      onClick={savePhone}
                    >
                      {phoneSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={startPhoneEdit}
                    className="text-sm font-medium text-right hover:text-primary transition-colors cursor-pointer"
                  >
                    {profile.phone || 'Add phone'}
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between min-h-[28px]">
                <span className="text-xs text-muted-foreground">Status</span>
                <Badge variant={profile.is_active ? 'default' : 'secondary'} className="text-xs">
                  {profile.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              {profile.full_name_ar && (
                <div className="flex items-center justify-between min-h-[28px]">
                  <span className="text-xs text-muted-foreground">Arabic Name</span>
                  <span className="text-sm font-medium" dir="rtl">{profile.full_name_ar}</span>
                </div>
              )}
            </div>

            {divisions && divisions.length > 0 && (
              <>
                <Separator />
                <div className="w-full px-2 space-y-2">
                  <span className="text-xs text-muted-foreground">Divisions</span>
                  <div className="flex flex-wrap gap-2">
                    {divisions.map((d) => (
                      <Badge
                        key={d.id}
                        variant="outline"
                        className="text-xs"
                        style={{
                          borderColor: d.divisions?.color ?? undefined,
                          color: d.divisions?.color ?? undefined,
                        }}
                      >
                        {d.divisions?.name ?? d.division_id}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Right column — Personal Information */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Personal Information
            </CardTitle>
            <CardDescription>Your account details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Full Name</Label>
                <p className="text-sm font-medium">{profile.full_name}</p>
              </div>
              {profile.full_name_ar && (
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Name (Arabic)</Label>
                  <p className="text-sm font-medium" dir="rtl">{profile.full_name_ar}</p>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Email</Label>
                <p className="text-sm font-medium">{profile.email ?? '—'}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Phone</Label>
                <p className="text-sm font-medium">{profile.phone ?? '—'}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Status</Label>
                <div>
                  <Badge variant={profile.is_active ? 'default' : 'secondary'} className="text-xs">
                    {profile.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Role</Label>
                <p className="text-sm font-medium">{roleName ?? '—'}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">Divisions</Label>
                {divisions && divisions.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {divisions.map((d) => (
                      <Badge
                        key={d.id}
                        variant="outline"
                        className="text-xs"
                        style={{
                          borderColor: d.divisions?.color ?? undefined,
                          color: d.divisions?.color ?? undefined,
                        }}
                      >
                        {d.divisions?.name ?? d.division_id}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">None assigned</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right column — Change Password */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Change Password
            </CardTitle>
            <CardDescription>Enter your current password to set a new one</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={passwordForm.handleSubmit(handlePasswordChange)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="current_password">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="current_password"
                      type={showCurrent ? 'text' : 'password'}
                      autoComplete="current-password"
                      {...passwordForm.register('current_password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrent(!showCurrent)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordForm.formState.errors.current_password && (
                    <p className="text-xs text-destructive">{passwordForm.formState.errors.current_password.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new_password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new_password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      {...passwordForm.register('new_password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordForm.formState.errors.new_password && (
                    <p className="text-xs text-destructive">{passwordForm.formState.errors.new_password.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirm"
                      type={showConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      {...passwordForm.register('confirm')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordForm.formState.errors.confirm && (
                    <p className="text-xs text-destructive">{passwordForm.formState.errors.confirm.message}</p>
                  )}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                At least 8 characters, with uppercase, lowercase, digit, and symbol.
              </p>

              <Button type="submit" disabled={changingPassword}>
                {changingPassword ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Changing…
                  </>
                ) : (
                  'Change Password'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
