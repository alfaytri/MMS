import type { NextConfig } from "next";

const CHROMIUM_FILES = ['./node_modules/@sparticuz/chromium/**/*']

const nextConfig: NextConfig = {
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],

  outputFileTracingIncludes: {
    '/api/**/pdf':                                  CHROMIUM_FILES,
    '/api/**/pdf/**':                               CHROMIUM_FILES,
    '/api/**/*-pdf':                                CHROMIUM_FILES,
    '/api/**/*-pdf/**':                             CHROMIUM_FILES,
    '/api/warehouse/reports':                       CHROMIUM_FILES,
    '/api/quotations/preview-html':                 CHROMIUM_FILES,
    '/api/notifications/send-booking-confirmations': CHROMIUM_FILES,
  },

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
