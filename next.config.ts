import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer is ESM-only and ships its own reconciler. Webpack with
  // transpilePackages is the SUPPORTED config for server-side rendering via
  // `renderToBuffer` (in `src/lib/orders/generate-confirmation-pdf.tsx`).
  //
  // DO NOT run `next dev --turbopack` against this package — Turbopack
  // mis-bundles the reconciler and rendering dies with "Cannot read properties
  // of undefined (reading 'S')" at `createRenderer`. Use `next dev` (webpack).
  //
  // Externalising via `serverExternalPackages` is also wrong here: it makes
  // Node load a second React instance, producing React error #31 because the
  // element symbols don't match between the route's React and React-PDF's.
  transpilePackages: ['@react-pdf/renderer'],

  // Speed up dev + prod by tree-shaking barrel exports from heavy libraries.
  // Without this, `import { X } from 'lucide-react'` pulls the entire index on compile.
  experimental: {
    viewTransition: true,
    optimizePackageImports: [
      'lucide-react',
      '@tanstack/react-query',
      '@tanstack/react-table',
      'date-fns',
      'recharts',
    ],
  },

  // Skip ESLint during next build (we run lint separately). Saves ~5–15s per build.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
