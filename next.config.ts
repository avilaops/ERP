import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local UI tests and SSH tunnels use the loopback IP as well as localhost.
  allowedDevOrigins: ["127.0.0.1"],
  // Self-contained server for the production image (deploy/): no node_modules install on the server.
  output: "standalone",
  // The validator starts its own Node worker and locates its WASM next to the package.
  serverExternalPackages: ["xmllint-wasm"],
  outputFileTracingIncludes: {
    "/*": ["./src/lib/fiscal/schemas/**/*", "./node_modules/xmllint-wasm/**/*"],
  },
  // A form may carry a photo: the photo layer has its own limit (15 MB) and normalizes what it stores.
  experimental: { serverActions: { bodySizeLimit: "16mb" } },
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
