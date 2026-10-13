import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // pino runs its transports in worker threads; bundling them breaks worker resolution.
  serverExternalPackages: ['pino', 'pino-pretty', 'thread-stream', 'rotating-file-stream', 'unpdf'],
  // Reuse visited/prefetched review pages for 30 s so J/K back and forth is instant. Decisions call router.refresh(),
  // which drops this cache; stale views from another reviewer are caught by ReviewService's guarded updates.
  experimental: { staleTimes: { dynamic: 30 } },
};

export default nextConfig;
