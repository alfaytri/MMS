'use client'

import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { LogOut, User, Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { createClient } from '@/lib/supabase/client'
import { resetSessionVerified } from '@/components/auth/SessionGuard'
import { resetCachedProfileId } from '@/hooks/useNotifications'

interface UserMenuProps {
  email: string
  name?: string
  avatarUrl?: string | null
}

export function UserMenu({ email, name, avatarUrl }: UserMenuProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { resolvedTheme, setTheme } = useTheme()
  const initials = name
    ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : email.slice(0, 2).toUpperCase()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    queryClient.clear()
    resetSessionVerified()
    resetCachedProfileId()
    router.push('/login')
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full h-8 w-8 p-0 inline-flex items-center justify-center hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Avatar className="h-8 w-8">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={name ?? email} />}
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
            {initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              {name && <p className="text-sm font-medium">{name}</p>}
              <p className="text-xs text-muted-foreground truncate">{email}</p>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem className="gap-2" onClick={() => router.push('/profile')}>
            <User className="h-4 w-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            onClick={(e) => {
              e.preventDefault()
              setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
            }}
          >
            {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {resolvedTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            className="gap-2 text-destructive focus:text-destructive"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
