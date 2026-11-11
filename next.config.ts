import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets Brian upload report PDFs up to 4 MB from the admin page (Vercel caps requests at 4.5 MB).
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

export default nextConfig;
