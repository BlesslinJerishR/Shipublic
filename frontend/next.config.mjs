/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Built-in gzip; Netlify/CDN can also compress on top.
  compress: true,
  // Keep production bundles lean.
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  // Improve tree-shaking for icon / utility packs.
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  compiler: {
    // Strip console.* (except errors/warns) from client bundles in prod.
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 7,
  },
  async headers() {
    return [
      {
        // Aggressively cache hashed static assets.
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/landing.html',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    return [
      { source: '/api/:path*', destination: `${api}/api/:path*` },
    ];
  },
};

export default nextConfig;
