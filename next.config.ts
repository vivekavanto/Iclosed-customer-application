import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root so Next stops picking up the unrelated
    // D:\package-lock.json (a different project) as the root directory.
    root: __dirname,
  },
  async headers() {
    return [
      {
        // Allow admin portal (any localhost port) to call /api/admin/* routes
        source: "/api/admin/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,PATCH,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },
};

export default nextConfig;
