import type { NextConfig } from 'next'

// HYDRATE_BUILD_TARGET=desktop switches to a static export that Tauri wraps (M7).
const isDesktop = process.env.HYDRATE_BUILD_TARGET === 'desktop'

const nextConfig: NextConfig = {
  transpilePackages: ['@hydrate/shared'],
  // We lint via Turbo (eslint) as its own gate; don't double-run during build.
  eslint: { ignoreDuringBuilds: true },
  ...(isDesktop ? { output: 'export', images: { unoptimized: true } } : {}),
}

export default nextConfig
