const path = require('path')
const fs = require('fs')

// Read OPENAI_API_KEY / CLAUDE_API_KEY from backend/.env at build time so
// iOS builds can use them as the default provider config without the user
// pasting a key into the app. Anything baked here ends up in the JS bundle
// shipped to every device — only enable for your personal dev simulator.
//
// Override with explicit NEXT_PUBLIC_DEFAULT_OPENAI_KEY env vars at build
// time if you want a different value than backend/.env.
function readBackendEnvKey(name) {
  if (process.env[`NEXT_PUBLIC_DEFAULT_${name}`]) {
    return process.env[`NEXT_PUBLIC_DEFAULT_${name}`]
  }
  try {
    const envPath = path.join(__dirname, '..', 'backend', '.env')
    const contents = fs.readFileSync(envPath, 'utf8')
    const re = new RegExp(`^${name}=(.*)$`, 'm')
    const m = contents.match(re)
    return m ? m[1].trim() : ''
  } catch {
    return ''
  }
}

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
    NEXT_PUBLIC_DEFAULT_OPENAI_KEY: readBackendEnvKey('OPENAI_API_KEY'),
    NEXT_PUBLIC_DEFAULT_CLAUDE_KEY: readBackendEnvKey('CLAUDE_API_KEY'),
  },
}

module.exports = nextConfig
