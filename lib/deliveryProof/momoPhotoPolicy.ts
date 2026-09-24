/**
 * Policy Strada A — foto consegne (marketing / Momo / carosello homepage).
 *
 * Assunzione vincolante: la data di efficacia 2026-09-24 vale SOLO se il titolare
 * pubblica lo stesso giorno. Se il go-live scivola, aggiornare queste costanti
 * PRIMA del deploy (e allineare informativa / Iubenda).
 */

/** Inizio giorno 24/09/2026 Europe/Rome — ordini da questa data in poi eleggibili a coda Momo (con opt-out e review). */
export const MOMO_PHOTO_POLICY_EFFECTIVE_DATE = new Date('2026-09-24T00:00:00+02:00');

/**
 * Tetto carosello homepage finché non esiste la coda di approvazione:
 * solo foto di consegna con timestampAfter strettamente precedente a questo istante
 * (= fino al 24/09/2026 incluso, già controllate dal titolare). Nessuna nuova foto automatica.
 */
export const HOMEPAGE_CAROUSEL_PROOF_CUTOFF = new Date('2026-09-25T00:00:00+02:00');
