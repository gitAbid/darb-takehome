import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // pino runs its transports in worker threads; bundling them breaks worker resolution.
  serverExternalPackages: ['pino', 'pino-pretty', 'thread-stream', 'rotating-file-stream'],
};

export default nextConfig;
