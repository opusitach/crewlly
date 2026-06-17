/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    const apiProxyTarget = process.env.API_PROXY_TARGET || process.env.NEXT_PUBLIC_API_BASE_URL
    if (!apiProxyTarget) return []
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
