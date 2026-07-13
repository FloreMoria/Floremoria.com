/** Verifica dominio TikTok (URL prefix) — file root /tiktokjRsHK4w8bRtjCo7HGlmCbNvw2s6Ou9z4.txt */
export const TIKTOK_DOMAIN_VERIFICATION_CODE = 'jRsHK4w8bRtjCo7HGlmCbNvw2s6Ou9z4';

export const TIKTOK_DOMAIN_VERIFICATION_LINE = `tiktok-developers-site-verification=${TIKTOK_DOMAIN_VERIFICATION_CODE}`;

/** Origine verificata su TikTok Developer per PULL_FROM_URL. */
export const TIKTOK_VERIFIED_SITE_ORIGIN = 'https://www.floremoria.com';

export function getTikTokVerifiedSiteOrigin(): string {
  return TIKTOK_VERIFIED_SITE_ORIGIN;
}
