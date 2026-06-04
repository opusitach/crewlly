/** @type {import('next').NextConfig} */
// Admin app Next.js config. Kept deliberately small.
//
// `transpilePackages` is unused — shared modules are TypeScript files under ../lib,
// pulled in via tsconfig paths and Next's external dir support via `experimental`.

import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Apply baseline security headers at the framework level too — middleware.ts
  // sets the same headers, but having them here keeps them on cached static files
  // served directly by Next.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ]
  },
  // Allow importing files from outside this app's directory (../lib, ../prisma).
  // We share code with the main crewlly.com app via tsconfig path mapping.
  experimental: {
    externalDir: true,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@/lib": path.join(repoRoot, "lib"),
      "@": path.join(repoRoot),
    }
    return config
  },
}

export default nextConfig
