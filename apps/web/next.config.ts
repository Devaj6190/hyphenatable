import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The employee page lives outside the /c/[companyId] shell (no owner nav or role switch for an employee),
  // but its link in the text stays /c/<id>/e/<token>.
  async rewrites() {
    return [
      { source: "/c/:companyId/e/:token", destination: "/e/:companyId/:token" },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
