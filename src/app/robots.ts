import type { MetadataRoute } from "next";

/** Keeps search engines away from private order links, the admin area and the API. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/order/", "/api/"] }],
    sitemap: "https://condowiseguys.com/sitemap.xml",
  };
}
