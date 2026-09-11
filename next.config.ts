import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root so Next stops picking up the unrelated
    // D:\package-lock.json (a different project) as the root directory.
    root: __dirname,
  },
  // nodemailer (the SMTP email provider) is a CJS package that resolves
  // ./lib/well-known/services.json and its own package.json by relative path,
  // and requires node builtins conditionally. It is not in Next's default
  // externals list, so without this the bundler pulls it into every function
  // that can reach the email module. Leaving it external eliminates a class of
  // build-succeeds/runtime-fails divergence you would only find in production.
  serverExternalPackages: ["nodemailer"],
  // Proxy PostHog through our origin so tracker blockers don't drop the data.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
    ];
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
