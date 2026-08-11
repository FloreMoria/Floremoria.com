/** Verifica dominio TikTok (URL prefix) — file root alla radice del sito. */

/** Codice storico (già verificato). */
export const TIKTOK_DOMAIN_VERIFICATION_CODE = 'jRsHK4w8bRtjCo7HGlmCbNvw2s6Ou9z4';
export const TIKTOK_DOMAIN_VERIFICATION_LINE = `tiktok-developers-site-verification=${TIKTOK_DOMAIN_VERIFICATION_CODE}`;

/** Codice verifica — /tiktok7q8SLkeWcoWauhGum9tEWOvaLVUs777b.txt */
export const TIKTOK_DOMAIN_VERIFICATION_CODE_V2 = '7q8SLkeWcoWauhGum9tEWOvaLVUs777b';
export const TIKTOK_DOMAIN_VERIFICATION_LINE_V2 = `tiktok-developers-site-verification=${TIKTOK_DOMAIN_VERIFICATION_CODE_V2}`;

/** Codice verifica (ago 2026) — /tiktokhn9zw4SN50YfX9FTNwvbXtKINd8Blpzm.txt */
export const TIKTOK_DOMAIN_VERIFICATION_CODE_V3 = 'hn9zw4SN50YfX9FTNwvbXtKINd8Blpzm';
export const TIKTOK_DOMAIN_VERIFICATION_LINE_V3 = `tiktok-developers-site-verification=${TIKTOK_DOMAIN_VERIFICATION_CODE_V3}`;

/** Origine verificata su TikTok Developer per PULL_FROM_URL. */
export const TIKTOK_VERIFIED_SITE_ORIGIN = 'https://www.floremoria.com';

export function getTikTokVerifiedSiteOrigin(): string {
  return TIKTOK_VERIFIED_SITE_ORIGIN;
}
