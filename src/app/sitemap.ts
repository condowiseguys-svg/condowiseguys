import type { MetadataRoute } from "next";

const BASE = "https://condowiseguys.com";

/** Public pages for search engines. Order, admin and API pages stay out (see robots.ts). */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/about", "/sample-report", "/for-realtors", "/privacy"].map((path) => ({
    url: `${BASE}${path}`,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.6,
  }));
}
