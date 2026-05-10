const path = require('path')
const nextConfig = {
  // Static export — required for Tauri to serve from frontendDist without a Node server.
  // Output goes to frontend/out/.
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    config.resolve.alias['@/components'] = path.resolve('./components')
    config.resolve.alias['@/lib'] = path.resolve('./lib')
    return config
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
  },
}

module.exports = nextConfig
