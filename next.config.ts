import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/stampa/stampa/volantino-b2b',
        destination: '/stampa/volantino-b2b',
        permanent: false,
      },
      {
        source: '/stampa/volantino-b2b-bologna',
        destination: '/stampa/volantino-b2b',
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com'
      },
      {
        protocol: 'https',
        hostname: 'www.floremoria.com'
      },
      {
        protocol: 'https',
        hostname: 'floremoria.com'
      },
      {
        protocol: 'https',
        hostname: 'api.qrserver.com'
      }
    ]
  }
};

export default nextConfig;
