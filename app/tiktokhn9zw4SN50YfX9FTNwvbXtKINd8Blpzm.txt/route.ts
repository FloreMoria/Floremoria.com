import { TIKTOK_DOMAIN_VERIFICATION_LINE_V3 } from '@/lib/tiktokDomainVerification';

/**
 * Verifica TikTok Developers: file alla root senza redirect.
 * URL: https://www.floremoria.com/tiktokhn9zw4SN50YfX9FTNwvbXtKINd8Blpzm.txt
 */
export function GET() {
  return new Response(TIKTOK_DOMAIN_VERIFICATION_LINE_V3, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=60, must-revalidate',
    },
  });
}
