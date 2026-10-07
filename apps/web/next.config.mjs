import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Docker image sets NEXT_OUTPUT=standalone; `pnpm start` uses the normal build.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  // Trace from the monorepo root so the standalone build includes workspace packages.
  outputFileTracingRoot: root,
  transpilePackages: ['@sceneos/shared'],
  // In development the browser talks to Next and Next forwards /api to the Node API.
  // In production nginx sends /api straight to the API. API_URL is read at build time.
  async rewrites() {
    const api = process.env.API_URL ?? 'http://localhost:4000';
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};
export default nextConfig;
