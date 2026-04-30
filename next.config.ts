import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer is ESM-only — webpack cannot bundle it without transpilation.
  transpilePackages: ['@react-pdf/renderer'],

  // Speed up dev + prod by tree-shaking barrel exports from heavy libraries.
  // Without this, `import { X } from 'lucide-react'` pulls the entire index on compile.
  experimental: {
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
