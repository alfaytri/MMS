import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import bundleAnalyzer from "@next/bundle-analyzer";

// Bundle analyzer — inert unless `ANALYZE=true` is set for the build, so normal
// dev/prod builds are unaffected. Run: `ANALYZE=true npm run build`.
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
  analyzerMode: "json",
});

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
// the build still passes. `silent` keeps the build log clean.
//
// tunnelRoute routes browser error envelopes through this same-origin path
// instead of sentry.io, so ad blockers (which block Sentry's ingest domains by
// default) can't silently drop them — without it, an error hitting an
// ad-blocker user never reaches Sentry. The path is a fixed string (not `true`,
// which would randomize per build) so it can be allow-listed in middleware.ts,
// where the tunnel POSTs skip the Supabase auth refresh.
export default withBundleAnalyzer(withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  disableLogger: true,
  tunnelRoute: '/monitoring',
  // Sentry generates source maps so IT can show readable stack traces, uploads
  // them privately, then deletes them from the build so they are NEVER served
  // to the public (no one can download and read our original source). Explicit
  // here so the intent survives a future SDK default change.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
}));
