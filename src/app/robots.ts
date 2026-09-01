import type { MetadataRoute } from 'next'

/**
 * Serves /robots.txt. This is a private, login-gated internal ERP — there is
 * nothing here for search engines to index, so we disallow all crawling. (A
 * sitemap would be the opposite of what we want and is intentionally omitted.)
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  }
}
