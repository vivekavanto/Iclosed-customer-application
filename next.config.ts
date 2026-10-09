import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Blog cover images (and any body image an admin pastes in) are Vercel
    // Blob URLs. next/image refuses to render an external src whose hostname
    // isn't allowlisted here — with no entry at all, EVERY remote image is
    // blocked, which is why a post with a real cover_image_url renders as
    // blank while one that happens to store a data: URI still works (data:
    // URIs skip this check entirely). The store id in the hostname changes
    // whenever a Blob store is rotated or recreated (public vs private, or a
    // fresh store after a token reset), so this is a wildcard rather than one
    // fixed store id — a new store should never require touching this file
    // again.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
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
  // Fee settings are read from disk at runtime; ship them with every route.
  outputFileTracingIncludes: { "/**": ["./src/config/iclosed-fees.yaml"] },
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
