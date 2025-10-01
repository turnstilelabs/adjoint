import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: isDev,
  },
  eslint: {
    ignoreDuringBuilds: isDev,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
