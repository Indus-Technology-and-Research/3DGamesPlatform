/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost'],
  },
  // Reduce worker threads to avoid Windows issues
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
  // Webpack configuration for Ammo.js
  webpack: (config, { isServer }) => {
    // Fixes for Ammo.js in browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      }
    }
    return config
  },
}

module.exports = nextConfig
