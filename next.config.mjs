import { BUILD_ID } from './app/lib/build-info.js';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  deploymentId: BUILD_ID,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  outputFileTracingExcludes: { "*": ["**/*"] },
};

export default nextConfig;
