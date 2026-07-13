import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // TikTok (e altri crawler) non seguono redirect: servire /path e /path/ senza 308.
  skipTrailingSlashRedirect: true,
  transpilePackages: ["swagger-ui-react"],
  experimental: {
    // Foto multi-foto da iPhone: evita 413 sul POST /api/partner/order/upload-proof
    proxyClientMaxBodySize: '12mb',
  },
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
      },
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com'
      }
    ]
  }
};

export default nextConfig;
