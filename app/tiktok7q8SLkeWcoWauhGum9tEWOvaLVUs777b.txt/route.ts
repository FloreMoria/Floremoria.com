import { TIKTOK_DOMAIN_VERIFICATION_LINE_V2 } from '@/lib/tiktokDomainVerification';

/**
 * Verifica TikTok Developers: file alla root senza redirect.
 * URL: https://www.floremoria.com/tiktok7q8SLkeWcoWauhGum9tEWOvaLVUs777b.txt
 */
export function GET() {
  return new Response(TIKTOK_DOMAIN_VERIFICATION_LINE_V2, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=60, must-revalidate',
    },
  });
}
