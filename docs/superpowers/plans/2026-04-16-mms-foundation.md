# MMS Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the MMS Next.js 15 project with auth, design system, and full navigation shell so every Phase 1 module has a working foundation to build on.

**Architecture:** Next.js 15 App Router with route groups — `(auth)` for login, `(dashboard)` for all protected pages sharing the TopNav layout. Supabase handles auth via `@supabase/ssr` middleware that refreshes sessions on every request. TanStack Query wraps the whole app for data fetching in later modules.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, Supabase (`@supabase/ssr`), TanStack Query v5, Lucide React, date-fns

**Design Spec:** `docs/superpowers/specs/2026-04-16-mms-phase1-design.md`

**Progress tracker:** `PROGRESS.md`

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | Dependencies |
| `tailwind.config.ts` | Tailwind + custom color tokens |
| `src/app/globals.css` | shadcn/ui CSS variables (orange+blue palette) |
| `src/app/layout.tsx` | Root HTML shell + QueryProvider |
| `src/app/(auth)/login/page.tsx` | Login form UI |
| `src/app/(auth)/login/actions.ts` | Server Action: signIn, signOut |
| `src/app/(dashboard)/layout.tsx` | Auth guard + TopNav wrapper |
| `src/app/(dashboard)/page.tsx` | Dashboard stats page |
| `src/components/providers/QueryProvider.tsx` | TanStack Query client provider |
| `src/components/layout/TopNav.tsx` | Top navigation bar |
| `src/components/layout/NavDropdown.tsx` | Dropdown menu for nav items |
| `src/components/layout/nav-config.ts` | All nav items, groups, comingSoon flags |
| `src/components/layout/DivisionFilter.tsx` | Clickable division badge filter |
| `src/components/layout/UserMenu.tsx` | User avatar dropdown (sign out) |
| `src/lib/supabase/client.ts` | Browser Supabase client |
| `src/lib/supabase/server.ts` | Server Supabase client (async cookies) |
| `src/lib/utils.ts` | `cn()` helper |
| `src/hooks/useDivisions.ts` | Fetch divisions for filter bar |
| `src/types/database.types.ts` | Auto-generated from Supabase schema |
| `middleware.ts` | Session refresh + route protection |
| `.env.local` | Supabase URL + anon key (never commit) |
| `src/lib/utils.test.ts` | Unit tests for `cn()` |
| `src/lib/supabase/server.test.ts` | Smoke test: server client instantiates |

---

## Task 1: Clean Up and Initialize Next.js 15

**Files:**
- Delete: `package.json`, `package-lock.json`, `node_modules/`
- Create: everything via `create-next-app`

- [ ] **Step 1: Remove the existing stub files**

```bash
cd D:/MMS
rm -f package.json package-lock.json
rm -rf node_modules
```

- [ ] **Step 2: Initialize Next.js 15 in current directory**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

When prompted:
- Would you like to use Turbopack? → **No** (more stable for production)

- [ ] **Step 3: Verify the scaffold**

```bash
npm run dev
```

Expected: Server starts at `http://localhost:3000`, default Next.js page visible. Stop with Ctrl+C.

- [ ] **Step 4: Commit baseline**

```bash
git init
git add -A
git commit -m "chore: initialize Next.js 15 project"
```

---

## Task 2: Install All Phase 1 Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime dependencies**

```bash
npm install @supabase/ssr @supabase/supabase-js
npm install @tanstack/react-query @tanstack/react-query-devtools
npm install lucide-react date-fns clsx tailwind-merge
npm install papaparse
npm install -D @types/papaparse
```

- [ ] **Step 2: Verify no peer conflicts**

```bash
npm ls --depth=0
```

Expected: clean output with no peer dependency warnings for the packages above.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add supabase, react-query, lucide, date-fns dependencies"
```

---

## Task 3: Initialize shadcn/ui and Install Components

**Files:**
- Create: `components.json`, `src/components/ui/` (multiple files)

- [ ] **Step 1: Run shadcn init**

```bash
npx shadcn@latest init
```

When prompted:
- Which style? → **Default**
- Which base color? → **Neutral**
- Use CSS variables? → **Yes**

- [ ] **Step 2: Install all components needed for Phase 1**

```bash
npx shadcn@latest add badge button card checkbox command dialog dropdown-menu form input label popover select separator sheet skeleton table tabs textarea toast
```

- [ ] **Step 3: Verify components exist**

```bash
ls src/components/ui/
```

Expected: `badge.tsx button.tsx card.tsx checkbox.tsx command.tsx dialog.tsx dropdown-menu.tsx form.tsx input.tsx label.tsx popover.tsx select.tsx separator.tsx sheet.tsx skeleton.tsx table.tsx tabs.tsx textarea.tsx toast.tsx toaster.tsx`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: initialize shadcn/ui with all Phase 1 components"
```

---

## Task 4: Design System — Tailwind Config and Global CSS

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Write the design system CSS variables**

Replace the entire `src/app/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* shadcn/ui variables mapped to White + Orange + Blue palette */
    --background: 0 0% 100%;
    --foreground: 222 84% 5%;

    --card: 0 0% 100%;
    --card-foreground: 222 84% 5%;

    --popover: 0 0% 100%;
    --popover-foreground: 222 84% 5%;

    /* Orange #F97316 as primary */
    --primary: 25 95% 53%;
    --primary-foreground: 0 0% 100%;

    /* Blue #3B82F6 as secondary */
    --secondary: 217 91% 60%;
    --secondary-foreground: 0 0% 100%;

    /* slate-50 surface */
    --muted: 210 40% 98%;
    --muted-foreground: 215 16% 47%;

    --accent: 210 40% 96%;
    --accent-foreground: 222 47% 11%;

    /* red-500 */
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;

    /* slate-200 borders */
    --border: 214 32% 91%;
    --input: 214 32% 91%;

    /* Orange focus ring */
    --ring: 25 95% 53%;

    --radius: 0.5rem;

    /* Custom semantic tokens */
    --success: 142 71% 45%;
    --success-foreground: 0 0% 100%;
    --warning: 48 96% 53%;
    --warning-foreground: 0 0% 0%;
  }

  .dark {
    --background: 222 84% 5%;
    --foreground: 210 40% 98%;
    --card: 222 84% 5%;
    --card-foreground: 210 40% 98%;
    --popover: 222 84% 5%;
    --popover-foreground: 210 40% 98%;
    --primary: 25 95% 53%;
    --primary-foreground: 0 0% 100%;
    --secondary: 217 91% 60%;
    --secondary-foreground: 0 0% 100%;
    --muted: 217 33% 17%;
    --muted-foreground: 215 20% 65%;
    --accent: 217 33% 17%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 63% 31%;
    --destructive-foreground: 210 40% 98%;
    --border: 217 33% 17%;
    --input: 217 33% 17%;
    --ring: 25 95% 53%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}

/* Semantic utility classes */
@layer utilities {
  .text-success { color: hsl(var(--success)); }
  .text-warning { color: hsl(var(--warning)); }
  .bg-success { background-color: hsl(var(--success)); }
  .bg-warning { background-color: hsl(var(--warning)); }
  .bg-success\/10 { background-color: hsl(var(--success) / 0.1); }
  .bg-warning\/10 { background-color: hsl(var(--warning) / 0.1); }
}
```

- [ ] **Step 2: Extend Tailwind config with semantic tokens**

Replace `tailwind.config.ts` with:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
```

- [ ] **Step 3: Run dev and verify colors**

```bash
npm run dev
```

Open `http://localhost:3000`. If the default page still loads without errors, the CSS is valid. Stop server.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css tailwind.config.ts
git commit -m "feat: apply White+Orange+Blue design system to shadcn/ui tokens"
```

---

## Task 5: Supabase Client Setup

**Files:**
- Create: `.env.local`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/utils.ts`

- [ ] **Step 1: Create `.env.local`**

Create the file (never commit this file):

```bash
cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
EOF
```

Then fill in real values: go to your Supabase dashboard → Project Settings → API. Copy "Project URL" and "anon public" key.

- [ ] **Step 2: Add `.env.local` to `.gitignore`**

Verify `.gitignore` has this line (create-next-app adds it automatically):

```
.env.local
```

If missing, add it manually.

- [ ] **Step 3: Create browser Supabase client**

Create `src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/database.types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 4: Create server Supabase client**

Create `src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/types/database.types'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — cookie mutations are ignored here.
            // The middleware handles session refresh.
          }
        },
      },
    }
  )
}
```

- [ ] **Step 5: Create `cn()` utility**

Create `src/lib/utils.ts`:

```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/ .env.local
git commit -m "feat: add Supabase browser/server clients and cn() utility"
```

---

## Task 6: TypeScript Types from Supabase

**Files:**
- Create: `src/types/database.types.ts`

- [ ] **Step 1: Install Supabase CLI**

```bash
npm install -D supabase
```

- [ ] **Step 2: Generate types**

Get your Project ID from Supabase dashboard → Project Settings → General → "Reference ID".

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_REFERENCE_ID --schema public > src/types/database.types.ts
```

Expected: `src/types/database.types.ts` is created with hundreds of lines defining all 120 tables.

- [ ] **Step 3: Verify the file has table types**

```bash
grep -c "Row:" src/types/database.types.ts
```

Expected: a number ≥ 100 (one `Row:` per table).

- [ ] **Step 4: Add a type re-export helper**

Append to `src/types/database.types.ts` (add at the bottom):

```typescript
// Convenience row type helpers
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T]

export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
```

- [ ] **Step 5: Commit**

```bash
git add src/types/ package.json package-lock.json
git commit -m "feat: generate Supabase TypeScript types from live schema"
```

---

## Task 7: Middleware — Session Refresh + Route Protection

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Write the middleware**

Create `middleware.ts` in the project root (same level as `src/`):

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — keeps the user logged in
  const { data: { user } } = await supabase.auth.getUser()

  // Redirect unauthenticated users to login
  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Verify middleware compiles**

```bash
npm run build 2>&1 | head -20
```

Expected: No TypeScript errors related to `middleware.ts`.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: add Supabase session middleware with route protection"
```

---

## Task 8: Login Page

**Files:**
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/login/actions.ts`
- Create: `src/app/(auth)/layout.tsx`

- [ ] **Step 1: Create auth layout (centers the login card)**

Create `src/app/(auth)/layout.tsx`:

```typescript
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Create sign-in Server Action**

Create `src/app/(auth)/login/actions.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signIn(formData: FormData) {
  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
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
```

- [ ] **Step 3: Create login page**

Create `src/app/(auth)/login/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">MMS</CardTitle>
        <CardDescription>
          Maintenance Management System — sign in to continue
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Manual test — navigate to `/login`**

```bash
npm run dev
```

Open `http://localhost:3000/login`. You should see the MMS login card on a gray background. The form should be functional (try signing in with a real Supabase user). Stop server.

- [ ] **Step 5: Commit**

```bash
git add src/app/(auth)/
git commit -m "feat: add login page with Supabase Auth"
```

---

## Task 9: TanStack Query Provider

**Files:**
- Create: `src/components/providers/QueryProvider.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create the QueryProvider wrapper**

Create `src/components/providers/QueryProvider.tsx`:

```typescript
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,       // 1 minute before refetch
            gcTime: 5 * 60 * 1000,      // 5 minutes in cache
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  )
}
```

- [ ] **Step 2: Wrap root layout**

Replace `src/app/layout.tsx` with:

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { QueryProvider } from '@/components/providers/QueryProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'MMS — Maintenance Management System',
  description: 'Internal management system for Alfaytri Maintenance',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx src/components/providers/
git commit -m "feat: add TanStack Query provider to root layout"
```

---

## Task 10: Navigation Config

**Files:**
- Create: `src/components/layout/nav-config.ts`

This file is the single source of truth for all nav items. Every module adds to it.

- [ ] **Step 1: Write the nav config**

Create `src/components/layout/nav-config.ts`:

```typescript
import {
  Database,
  ShoppingCart,
  FileText,
  Receipt,
  ShoppingBag,
  Users,
  LucideIcon,
} from 'lucide-react'

export type NavItem = {
  label: string
  href: string
  comingSoon?: boolean
}

export type NavGroup = {
  label?: string       // section header like "PURCHASE" or "SALES"
  items: NavItem[]
}

export type NavEntry = {
  label: string
  icon: LucideIcon
  comingSoon?: boolean  // entire dropdown is coming soon
  groups: NavGroup[]
}

export const NAV_ITEMS: NavEntry[] = [
  {
    label: 'Master Data',
    icon: Database,
    groups: [
      {
        items: [
          { label: 'Companies & Divisions', href: '/master-data/companies' },
          { label: 'Warehouses', href: '/master-data/warehouses' },
          { label: 'Inventory Items', href: '/master-data/inventory' },
          { label: 'Suppliers', href: '/master-data/suppliers' },
          { label: 'Users & Roles', href: '/master-data/users' },
          { label: 'Audit Trail', href: '/master-data/audit-trail' },
          { label: 'Admin', href: '/master-data/admin' },
        ],
      },
      {
        items: [
          { label: 'Service List', href: '/master-data/services', comingSoon: true },
          { label: 'Team & Employee', href: '/master-data/teams', comingSoon: true },
          { label: 'Subscription Packages', href: '/master-data/subscriptions', comingSoon: true },
          { label: 'QuickBooks', href: '/master-data/quickbooks', comingSoon: true },
          { label: 'Notification Trail', href: '/master-data/notifications', comingSoon: true },
        ],
      },
    ],
  },
  {
    label: 'Orders',
    icon: ShoppingCart,
    comingSoon: true,
    groups: [],
  },
  {
    label: 'Contracts',
    icon: FileText,
    comingSoon: true,
    groups: [],
  },
  {
    label: 'Invoices',
    icon: Receipt,
    comingSoon: true,
    groups: [],
  },
  {
    label: 'Purchase & Sales',
    icon: ShoppingBag,
    groups: [
      {
        label: 'PURCHASE',
        items: [
          { label: 'Purchase Orders', href: '/purchase/orders' },
          { label: 'Approvals', href: '/purchase/approvals' },
          { label: 'Shipments', href: '/purchase/shipments' },
          { label: 'Landed Costs', href: '/purchase/landed-costs' },
          { label: 'Dead Stock Report', href: '/purchase/dead-stock' },
          { label: 'Warehouses', href: '/purchase/warehouses' },
        ],
      },
      {
        label: 'SALES',
        items: [
          { label: 'Create Sale Order', href: '/sales/create' },
          { label: 'Sale Orders', href: '/sales/orders' },
          { label: 'Returns', href: '/sales/returns' },
        ],
      },
    ],
  },
  {
    label: 'Teams',
    icon: Users,
    comingSoon: true,
    groups: [],
  },
]
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/nav-config.ts
git commit -m "feat: add navigation config with all Phase 1 routes and coming-soon flags"
```

---

## Task 11: NavDropdown Component

**Files:**
- Create: `src/components/layout/NavDropdown.tsx`

- [ ] **Step 1: Write the dropdown component**

Create `src/components/layout/NavDropdown.tsx`:

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronDown, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NavEntry } from './nav-config'

interface NavDropdownProps {
  entry: NavEntry
}

export function NavDropdown({ entry }: NavDropdownProps) {
  const pathname = usePathname()

  // Check if current route is under this nav entry
  const isActive = entry.groups.some((group) =>
    group.items.some((item) => pathname.startsWith(item.href))
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-9 gap-1 text-sm font-medium',
            isActive
              ? 'text-primary border-b-2 border-primary rounded-none'
              : 'text-foreground hover:text-primary'
          )}
        >
          <entry.icon className="h-4 w-4" />
          {entry.label}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-52">
        {entry.comingSoon ? (
          <DropdownMenuItem disabled className="flex items-center gap-2 text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            <span>Coming Soon</span>
            <Badge variant="secondary" className="ml-auto text-xs h-4">Soon</Badge>
          </DropdownMenuItem>
        ) : (
          entry.groups.map((group, groupIndex) => (
            <div key={groupIndex}>
              {groupIndex > 0 && <DropdownMenuSeparator />}
              {group.label && (
                <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider py-1">
                  {group.label}
                </DropdownMenuLabel>
              )}
              {group.items.map((item) =>
                item.comingSoon ? (
                  <DropdownMenuItem
                    key={item.href}
                    disabled
                    className="flex items-center justify-between text-muted-foreground"
                  >
                    <span>{item.label}</span>
                    <Badge variant="outline" className="text-xs h-4 font-normal">Soon</Badge>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem key={item.href} asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        'w-full cursor-pointer',
                        pathname.startsWith(item.href) && 'text-primary font-medium'
                      )}
                    >
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                )
              )}
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/NavDropdown.tsx
git commit -m "feat: add NavDropdown component with coming-soon support"
```

---

## Task 12: UserMenu Component

**Files:**
- Create: `src/components/layout/UserMenu.tsx`

- [ ] **Step 1: Write the user menu**

Create `src/components/layout/UserMenu.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { LogOut, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface UserMenuProps {
  email: string
  name?: string
}

export function UserMenu({ email, name }: UserMenuProps) {
  const router = useRouter()
  const initials = name
    ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : email.slice(0, 2).toUpperCase()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            {name && <p className="text-sm font-medium">{name}</p>}
            <p className="text-xs text-muted-foreground truncate">{email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2">
          <User className="h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-destructive focus:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 2: Install Avatar component**

```bash
npx shadcn@latest add avatar
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/UserMenu.tsx
git commit -m "feat: add UserMenu with sign-out action"
```

---

## Task 13: DivisionFilter Component + useDivisions Hook

**Files:**
- Create: `src/hooks/useDivisions.ts`
- Create: `src/components/layout/DivisionFilter.tsx`

- [ ] **Step 1: Create useDivisions hook**

Create `src/hooks/useDivisions.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Tables } from '@/types/database.types'

export type Division = Pick<Tables<'divisions'>, 'id' | 'name' | 'short_name' | 'color'>

export function useDivisions() {
  return useQuery({
    queryKey: ['divisions'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('divisions')
        .select('id, name, short_name, color')
        .eq('is_active', true)
        .order('sort_order')

      if (error) throw error
      return data as Division[]
    },
    staleTime: 10 * 60 * 1000, // 10 min — divisions rarely change
  })
}
```

- [ ] **Step 2: Create DivisionFilter component**

Create `src/components/layout/DivisionFilter.tsx`:

```typescript
'use client'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useDivisions } from '@/hooks/useDivisions'

interface DivisionFilterProps {
  selected: string | null       // division id, null = all
  onSelect: (id: string | null) => void
}

export function DivisionFilter({ selected, onSelect }: DivisionFilterProps) {
  const { data: divisions, isLoading } = useDivisions()

  if (isLoading) {
    return (
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-6 w-24 rounded-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {divisions?.map((division) => (
        <Badge
          key={division.id}
          variant={selected === division.id ? 'default' : 'outline'}
          className={cn(
            'cursor-pointer select-none transition-colors',
            selected === division.id
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'hover:bg-muted'
          )}
          onClick={() =>
            onSelect(selected === division.id ? null : division.id)
          }
        >
          {division.short_name ?? division.name}
        </Badge>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDivisions.ts src/components/layout/DivisionFilter.tsx
git commit -m "feat: add DivisionFilter component and useDivisions hook"
```

---

## Task 14: TopNav Component

**Files:**
- Create: `src/components/layout/TopNav.tsx`

- [ ] **Step 1: Write TopNav**

Create `src/components/layout/TopNav.tsx`:

```typescript
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { NavDropdown } from './NavDropdown'
import { UserMenu } from './UserMenu'
import { NAV_ITEMS } from './nav-config'
import { Wrench } from 'lucide-react'

export async function TopNav() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // profiles links via auth_user_id, not id
  const { data: profile } = user
    ? await supabase
        .from('profiles')
        .select('full_name')
        .eq('auth_user_id', user.id)
        .single()
    : { data: null }

  return (
    <header className="sticky top-0 z-50 h-14 bg-background border-b border-border flex items-center px-4 gap-2">
      {/* Logo */}
      <Link
        href="/"
        className="flex items-center gap-2 text-primary font-bold mr-4 shrink-0"
      >
        <Wrench className="h-5 w-5" />
        <span className="text-sm">MMS</span>
      </Link>

      {/* Nav items */}
      <nav className="flex items-center gap-1 flex-1 overflow-x-auto">
        {NAV_ITEMS.map((entry) => (
          <NavDropdown key={entry.label} entry={entry} />
        ))}
      </nav>

      {/* User menu */}
      {user && (
        <UserMenu
          email={user.email ?? ''}
          name={profile?.full_name ?? undefined}
        />
      )}
    </header>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/TopNav.tsx
git commit -m "feat: add TopNav server component with all dropdowns"
```

---

## Task 15: Dashboard Layout Shell

**Files:**
- Create: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Write the dashboard layout**

Create `src/app/(dashboard)/layout.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopNav } from '@/components/layout/TopNav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <TopNav />
      <main className="flex-1 p-6">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/layout.tsx
git commit -m "feat: add dashboard layout shell with auth guard and TopNav"
```

---

## Task 16: Dashboard Page

**Files:**
- Create: `src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Write the dashboard page**

Create `src/app/(dashboard)/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DivisionFilter } from '@/components/layout/DivisionFilter'
import { ShoppingCart, Package, Receipt, AlertTriangle } from 'lucide-react'

const STAT_CARDS = [
  {
    title: 'Open Purchase Orders',
    icon: ShoppingCart,
    value: '—',
    description: 'Approved, awaiting receipt',
  },
  {
    title: 'Pending Approvals',
    icon: AlertTriangle,
    value: '—',
    description: 'POs awaiting approval',
  },
  {
    title: 'Low Stock Items',
    icon: Package,
    value: '—',
    description: 'Below reorder threshold',
  },
  {
    title: 'Outstanding Invoices',
    icon: Receipt,
    value: '—',
    description: 'Unpaid invoices',
  },
]

export default function DashboardPage() {
  const [selectedDivision, setSelectedDivision] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
      </div>

      {/* Division filter */}
      <DivisionFilter
        selected={selectedDivision}
        onSelect={setSelectedDivision}
      />

      {/* Stats grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {card.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

> **Note:** The stat values show `—` for now. They will be wired to real Supabase queries in the Master Data and Purchase plans.

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/page.tsx
git commit -m "feat: add dashboard page with stats grid and division filter"
```

---

## Task 17: Utility Tests

**Files:**
- Create: `src/lib/utils.test.ts`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Configure Vitest**

Add to `package.json` scripts section:

```json
"test": "vitest",
"test:run": "vitest run"
```

Create `vitest.config.ts` in project root:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
```

Create `src/test/setup.ts`:

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 3: Write failing test**

Create `src/lib/utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn()', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('deduplicates conflicting Tailwind classes (last wins)', () => {
    expect(cn('p-4', 'p-6')).toBe('p-6')
  })

  it('handles falsy values', () => {
    expect(cn('foo', false && 'bar', null, undefined, 'baz')).toBe('foo baz')
  })

  it('handles conditional objects', () => {
    expect(cn({ 'text-primary': true, 'text-muted': false })).toBe('text-primary')
  })
})
```

- [ ] **Step 4: Run test — expect fail (cn not imported yet)**

```bash
npm run test:run src/lib/utils.test.ts
```

Expected: PASS (cn is already implemented in Task 5). If it fails, check the import path.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts src/test/ src/lib/utils.test.ts package.json
git commit -m "test: add Vitest setup and cn() utility tests"
```

---

## Task 18: Full Integration Test and Final Cleanup

- [ ] **Step 1: Start dev server and verify the full flow**

```bash
npm run dev
```

Verify all of these manually:

| Check | Expected |
|---|---|
| `http://localhost:3000` | Redirects to `/login` (not logged in) |
| Login with wrong password | Shows error message below form |
| Login with correct Supabase credentials | Redirects to dashboard |
| Dashboard | Shows 4 stat cards + division filter badges |
| Division filter click | Badge toggles active (orange) state |
| Master Data dropdown | Shows 7 active items + 5 Coming Soon (greyed, `Soon` badge) |
| Orders dropdown | Single row: lock icon + "Coming Soon" |
| Contracts dropdown | Single row: lock icon + "Coming Soon" |
| Invoices dropdown | Single row: lock icon + "Coming Soon" |
| Purchase & Sales dropdown | Shows PURCHASE + SALES sections with all items |
| Teams dropdown | Single row: lock icon + "Coming Soon" |
| User menu | Shows email initials avatar, sign out works |
| Sign out | Redirects to `/login` |

- [ ] **Step 2: Run all tests**

```bash
npm run test:run
```

Expected: All tests pass.

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Update PROGRESS.md**

Update `PROGRESS.md` — mark Foundation as complete:

```markdown
### ✅ Completed
- [2026-04-16] Design & planning complete
- [DATE] Foundation complete — scaffold, auth, design system, TopNav, dashboard
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: foundation complete — auth, nav, design system, dashboard shell"
```

---

## What Comes Next

After Foundation is complete, the next plans (in order) are:

1. **`2026-04-16-mms-master-data.md`** — Companies, Warehouses, Inventory, Suppliers, Users, Audit Trail, Admin
2. **`2026-04-16-mms-purchase.md`** — Full Purchase module (POs, Approvals, Shipments, Landed Costs, Warehouses, Returns, Dead Stock)
3. **`2026-04-16-mms-sales.md`** — Full Sales module (Create SO, Sale Orders, Returns)
4. **`2026-04-16-mms-csv-import.md`** — CSV import tool (5 entity types)

Each plan will be written before execution begins. The `PROGRESS.md` file tracks where you are across sessions — always update it when switching accounts.
