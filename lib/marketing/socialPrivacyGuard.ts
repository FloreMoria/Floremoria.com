/**
 * Regola primaria social FloreMoria (SOFIA + BARBARA + ALMA):
 * nelle foto/servizi pubblicati su social NON devono comparire
 * nome, cognome o foto riconoscibile del defunto — solo i fiori / la composizione.
 *
 * Le foto private di consegna restano nel canale privato;
 * sui social si usano esclusivamente asset /social-ready/ (crop + blur sfondo).
 */

import { isPrivateDeliveryProofUrl, isSocialReadyProofUrl } from '@/lib/deliveryProof/storagePaths';

export const SOCIAL_PRIVACY_PRIMARY_RULE =
  'Sui social: solo fiori/composizione. Vietati nome, cognome e foto riconoscibile del defunto.';

function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Token anagrafici utili al match (nome/cognome ≥ 3 caratteri). */
export function extractIdentityTokens(fullName: string | null | undefined): string[] {
  if (!fullName?.trim()) return [];
  return normalizeForMatch(fullName)
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

export function copyContainsDeceasedIdentity(
  copy: string,
  deceasedName: string | null | undefined
): string | null {
  const haystack = normalizeForMatch(copy);
  if (!haystack) return null;

  const full = normalizeForMatch(deceasedName || '');
  if (full.length >= 5 && haystack.includes(full)) {
    return deceasedName!.trim();
  }

  for (const token of extractIdentityTokens(deceasedName)) {
    const re = new RegExp(`(?:^|\\s)${token}(?:\\s|$)`, 'i');
    if (re.test(haystack)) return token;
  }
  return null;
}

/**
 * Blocca pubblicazione social di foto servizio se viola la regola primaria.
 * - imageUrl deve essere /social-ready/ (mai privato)
 * - copy non deve contenere pezzi di anagrafica defunto
 */
export function assertDeliveryServiceSocialPrivacy(input: {
  imageUrl: string;
  copy: string;
  deceasedName?: string | null;
  context?: string;
}): void {
  const ctx = input.context ? ` (${input.context})` : '';

  if (isPrivateDeliveryProofUrl(input.imageUrl)) {
    throw new Error(
      `${SOCIAL_PRIVACY_PRIMARY_RULE} Foto consegna privata bloccata${ctx}: usare solo /social-ready/.`
    );
  }

  if (input.imageUrl.includes('floremoria-blob-foto-consegne') && !isSocialReadyProofUrl(input.imageUrl)) {
    throw new Error(
      `${SOCIAL_PRIVACY_PRIMARY_RULE} Asset consegna non social-ready bloccato${ctx}.`
    );
  }

  const leak = copyContainsDeceasedIdentity(input.copy, input.deceasedName);
  if (leak) {
    throw new Error(
      `${SOCIAL_PRIVACY_PRIMARY_RULE} Copy contiene riferimento anagrafico «${leak}»${ctx}.`
    );
  }
}
