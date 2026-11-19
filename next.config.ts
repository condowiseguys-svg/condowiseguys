import type { NextConfig } from "next";

/**
 * Security headers sent with every page. They stop other sites from framing ours
 * (clickjacking), stop browsers guessing file types, and keep full URLs (which contain
 * order upload links) out of the Referer header sent to other sites.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  // Lets Brian upload report PDFs up to 4 MB from the admin page (Vercel caps requests at 4.5 MB).
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  // Never publish source maps: they would let anyone rebuild the original front-end code.
  productionBrowserSourceMaps: false,
  // Don't advertise the framework in an "X-Powered-By" header.
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Order and admin pages hold private links; keep them out of search engines and caches.
      {
        source: "/order/:id/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
