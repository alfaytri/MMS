import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const CHROMIUM_FILES = ['./node_modules/@sparticuz/chromium/**/*']

const nextConfig: NextConfig = {
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core', 'exceljs'],

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
    ],
  },

};

// Wrap with Sentry. Source-map upload only runs when SENTRY_ORG / SENTRY_PROJECT
// / SENTRY_AUTH_TOKEN are set (as Vercel env vars) — otherwise it's skipped and
// the build still passes. `silent` keeps the build log clean; no tunnelRoute, so
// there's no interaction with the auth middleware.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  disableLogger: true,
});
