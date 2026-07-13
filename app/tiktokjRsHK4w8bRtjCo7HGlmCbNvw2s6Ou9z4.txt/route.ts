import { TIKTOK_DOMAIN_VERIFICATION_LINE } from '@/lib/tiktokDomainVerification';

/** Fallback route: TikTok verifica il file alla root senza redirect. */
export function GET() {
  return new Response(TIKTOK_DOMAIN_VERIFICATION_LINE, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=60, must-revalidate',
    },
  });
}
