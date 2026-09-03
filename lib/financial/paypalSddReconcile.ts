/**
 * Riconciliazione incrociata SDD Fineco ↔ Transazioni PayPal/Stripe gateway.
 *
 * Perché: quando PayPal addebita una spesa SaaS (es. Aruba), genera una riga
 * PAYPAL_MOVEMENT in uscita. Fineco poi esegue un SDD "Paypal Europe S.a.r.l."
 * per la stessa cifra con 1-5 gg di ritardo, producendo una BANK_LINE in uscita.
 * Senza riconciliazione, la Prima Nota espone la stessa spesa DUE VOLTE.
 *
 * Strategia:
 *   1. Identifica ogni BANK_LINE debit con causale SDD/SEPA verso "Paypal Europe"
 *      (o Stripe equivalente).
 *   2. Cerca un PAYPAL_MOVEMENT (o STRIPE_MOVEMENT) outflow di pari importo
 *      nei 5 giorni lavorativi precedenti.
 *   3. Se match: sopprimi la riga PayPal (gateway = duplicato transitorio),
 *      conserva la BANK_LINE ma con counterpartyName = fornitore reale dal PayPal.
 *   4. Se il gateway è un Payout (PayPal/Stripe → Fineco), entrambe le righe
 *      sono giroconti a somma zero: sopprimi la riga gateway.
 *
 * Non persiste: opera in lettura (come paypalStateMachine).
 */

import type { FiscalDedupableEntry } from '@/lib/financial/fiscalAuthorityDedupe';

// ---------- configurazione ----------

/** Finestra massima (giorni calendario) entro cui cercare il match PayPal. */
const SDD_MATCH_WINDOW_DAYS = 7;

/** Regex che identifica un addebito SDD Fineco verso PayPal Europe. */
const FINECO_PAYPAL_SDD_RE =
    /PAYPAL\s*EUROPE\b.*\b(SDD|SEPA|ADDEBITO|FATTURA)\b|\b(SDD|SEPA|ADDEBITO)\b.*PAYPAL\s*EUROPE/i;

/** Regex che identifica un addebito SDD Fineco verso Stripe. */
const FINECO_STRIPE_SDD_RE =
    /STRIPE\b.*\b(SDD|SEPA|ADDEBITO|FATTURA)\b|\b(SDD|SEPA|ADDEBITO)\b.*STRIPE/i;

/** Nomi piattaforma gateway che NON sono fornitori reali. */
const GATEWAY_PLATFORM_NAMES_RE =
    /^(paypal|paypal\s*\(europe\)|paypal\s+europe\s+s\.?a\.?r\.?l|stripe|stripe\s+payments)/i;

// ---------- helpers ----------

function dayKey(d: Date | string | null | undefined): string {
    if (d == null || d === '') return '';
    const iso = d instanceof Date ? d.toISOString() : String(d);
    return iso.slice(0, 10);
}

function dayMs(d: Date | string | null | undefined): number | null {
    const key = dayKey(d);
    if (!key) return null;
    const t = Date.parse(key);
    return Number.isFinite(t) ? t : null;
}

function withinWindow(
    bankDate: Date | string | null | undefined,
    gatewayDate: Date | string | null | undefined,
    maxDays: number,
): boolean {
    const b = dayMs(bankDate);
    const g = dayMs(gatewayDate);
    if (b == null || g == null) return false;
    const delta = b - g; // bank date – gateway date
    // Il gateway registra prima, l'SDD Fineco arriva dopo (delta >= 0 e ≤ window).
    // Ammettiamo anche delta leggermente negativo (−1 giorno) per sfasamenti timezone.
    return delta >= -1 * 86_400_000 && delta <= maxDays * 86_400_000;
}

function absAmountMatch(a: number, b: number): boolean {
    return Math.abs(Math.abs(a) - Math.abs(b)) < 2; // tolleranza ≤1 cent
}

function textBlob(row: FiscalDedupableEntry): string {
    const meta =
        row.metadataJson && typeof row.metadataJson === 'object'
            ? JSON.stringify(row.metadataJson)
            : '';
    return `${row.description || ''} ${row.counterpartyName || ''} ${row.sourceKey || ''} ${meta}`.toUpperCase();
}

/** Estrae il nome fornitore reale dalla riga PayPal (non "PayPal" stesso). */
function extractRealVendor(row: FiscalDedupableEntry): string | null {
    const cp = (row.counterpartyName || '').trim();
    if (cp && !GATEWAY_PLATFORM_NAMES_RE.test(cp)) return cp;
    // Prova nella description
    const desc = (row.description || '').trim();
    if (desc && !GATEWAY_PLATFORM_NAMES_RE.test(desc)) {
        // Prendi la prima parte significativa
        const m = desc.match(/^([^|·\n]{3,40})/);
        return m ? m[1].trim() : desc.slice(0, 40);
    }
    return null;
}

function isBankLineSdd(row: FiscalDedupableEntry): 'paypal' | 'stripe' | null {
    if (row.sourceType !== 'BANK_LINE' && row.sourceType !== 'BANK_LINE_MANUAL') return null;
    if (row.totalCents >= 0) return null; // solo addebiti (outflow)
    const blob = textBlob(row);
    if (FINECO_PAYPAL_SDD_RE.test(blob)) return 'paypal';
    if (FINECO_STRIPE_SDD_RE.test(blob)) return 'stripe';
    return null;
}

function gatewayLabel(row: FiscalDedupableEntry): string {
    const cp = (row.counterpartyName || '').trim();
    if (cp && !GATEWAY_PLATFORM_NAMES_RE.test(cp)) return cp;
    const desc = (row.description || '').trim();
    return desc.slice(0, 60) || row.sourceType;
}

function isGatewayOutflow(row: FiscalDedupableEntry, gateway: 'paypal' | 'stripe'): boolean {
    if (row.totalCents >= 0) return false;
    if (gateway === 'paypal') return row.sourceType === 'PAYPAL_MOVEMENT';
    return row.sourceType === 'STRIPE_MOVEMENT';
}

// ---------- modulo pubblico ----------

export type SddReconcileResult<T extends FiscalDedupableEntry> = {
    /** Righe risultanti dopo la riconciliazione. */
    rows: T[];
    /** Match trovati (per logging/audit). */
    matches: Array<{
        bankLineId: string;
        gatewayRowId: string;
        amountCents: number;
        realVendor: string | null;
        gateway: 'paypal' | 'stripe';
    }>;
};

/**
 * Riconcilia addebiti SDD Fineco ↔ transazioni gateway PayPal/Stripe.
 *
 * Per ogni BANK_LINE SDD "Paypal Europe" / "Stripe" con importo −X:
 *   - Cerca un PAYPAL_MOVEMENT / STRIPE_MOVEMENT outflow di −X entro 7 gg prima.
 *   - Se trovato: SOPPRIMI la riga gateway, ARRICCHISCI la BANK_LINE con il
 *     fornitore reale (es. "Aruba S.p.A.") e annota "Addebito Fineco via PayPal".
 *
 * Ritorna le righe filtrate.
 */
export function reconcileSddGatewayDuplicates<T extends FiscalDedupableEntry>(
    rows: T[],
): SddReconcileResult<T> {
    const matches: SddReconcileResult<T>['matches'] = [];

    // Indice rapido: gateway outflow per importo assoluto
    const gatewayByAmount = new Map<number, T[]>();
    for (const r of rows) {
        if (r.sourceType === 'PAYPAL_MOVEMENT' || r.sourceType === 'STRIPE_MOVEMENT') {
            if (r.totalCents < 0) {
                const abs = Math.abs(r.totalCents);
                let bucket = gatewayByAmount.get(abs);
                if (!bucket) {
                    bucket = [];
                    gatewayByAmount.set(abs, bucket);
                }
                bucket.push(r);
            }
        }
    }

    const suppressedGatewayIds = new Set<string>();
    const enrichedBankLines = new Map<
        string,
        {
            counterpartyName: string;
            description: string;
            drillDown?: {
                gateway: 'paypal' | 'stripe';
                kind: 'sdd_debit';
                lines: Array<{
                    id: string;
                    sourceType: string;
                    label: string;
                    amountCents: number;
                    accountingDate: string | null;
                }>;
                netCents: number;
            };
        }
    >();

    // Passa 1: trova match SDD ↔ gateway
    for (const bankRow of rows) {
        const gateway = isBankLineSdd(bankRow);
        if (!gateway) continue;

        const bankId = bankRow.id || bankRow.sourceKey || bankRow.sourceId || '';
        const absAmount = Math.abs(bankRow.totalCents);
        const candidates = gatewayByAmount.get(absAmount) || [];

        // Cerca anche con tolleranza ±1 cent
        if (candidates.length === 0) {
            for (const delta of [-1, 1]) {
                const alt = gatewayByAmount.get(absAmount + delta);
                if (alt?.length) {
                    candidates.push(...alt);
                    break;
                }
            }
        }

        let bestMatch: T | null = null;
        let bestDelta = Infinity;

        for (const gw of candidates) {
            if (suppressedGatewayIds.has(gw.id || gw.sourceKey || gw.sourceId || '')) continue;
            if (!isGatewayOutflow(gw, gateway)) continue;
            if (!absAmountMatch(bankRow.totalCents, gw.totalCents)) continue;
            if (!withinWindow(bankRow.accountingDate, gw.accountingDate, SDD_MATCH_WINDOW_DAYS)) continue;

            const bMs = dayMs(bankRow.accountingDate);
            const gMs = dayMs(gw.accountingDate);
            const delta = bMs != null && gMs != null ? Math.abs(bMs - gMs) : Infinity;
            if (delta < bestDelta) {
                bestDelta = delta;
                bestMatch = gw;
            }
        }

        if (bestMatch) {
            const gwId = bestMatch.id || bestMatch.sourceKey || bestMatch.sourceId || '';
            suppressedGatewayIds.add(gwId);

            const realVendor = extractRealVendor(bestMatch);
            const drillDownLine = {
                id: gwId,
                sourceType: bestMatch.sourceType,
                label: realVendor || gatewayLabel(bestMatch),
                amountCents: bestMatch.totalCents,
                accountingDate:
                    bestMatch.accountingDate instanceof Date
                        ? bestMatch.accountingDate.toISOString().slice(0, 10)
                        : bestMatch.accountingDate
                          ? String(bestMatch.accountingDate).slice(0, 10)
                          : null,
            };
            if (realVendor) {
                const origDesc = (bankRow.description || '').trim();
                enrichedBankLines.set(bankId, {
                    counterpartyName: realVendor,
                    description: realVendor + (origDesc ? ` · Addebito Fineco via PayPal` : ''),
                    drillDown: {
                        gateway,
                        kind: 'sdd_debit' as const,
                        lines: [drillDownLine],
                        netCents: Math.abs(bankRow.totalCents),
                    },
                });
            } else {
                enrichedBankLines.set(bankId, {
                    counterpartyName: bankRow.counterpartyName || '',
                    description: bankRow.description || '',
                    drillDown: {
                        gateway,
                        kind: 'sdd_debit' as const,
                        lines: [drillDownLine],
                        netCents: Math.abs(bankRow.totalCents),
                    },
                });
            }

            matches.push({
                bankLineId: bankId,
                gatewayRowId: gwId,
                amountCents: Math.abs(bankRow.totalCents),
                realVendor,
                gateway,
            });

            console.info(
                `[sdd-reconcile] ${gateway.toUpperCase()} SDD match: Fineco ${bankId} €${(Math.abs(bankRow.totalCents) / 100).toFixed(2)} ` +
                `↔ ${bestMatch.sourceType} ${gwId} (${realVendor || 'n/a'}) — gateway row suppressed`,
            );
        }
    }

    // Passa 2: filtra righe
    const result: T[] = [];
    for (const r of rows) {
        const rowId = r.id || r.sourceKey || r.sourceId || '';

        // Sopprimi riga gateway duplicata
        if (suppressedGatewayIds.has(rowId)) continue;

        // Arricchisci bank line con fornitore reale + drill-down gateway
        const enrichment = enrichedBankLines.get(rowId);
        if (enrichment) {
            const prevMeta =
                r.metadataJson && typeof r.metadataJson === 'object'
                    ? (r.metadataJson as Record<string, unknown>)
                    : {};
            result.push({
                ...r,
                counterpartyName: enrichment.counterpartyName,
                description: enrichment.description,
                metadataJson: {
                    ...prevMeta,
                    ...(enrichment.drillDown
                        ? {
                              finecoGatewayDrillDown: enrichment.drillDown,
                              finecoMasterKind: 'sdd_debit',
                          }
                        : {}),
                },
            });
            continue;
        }

        result.push(r);
    }

    if (matches.length > 0) {
        console.info(
            `[sdd-reconcile] Totale: ${matches.length} duplicati SDD-gateway collassati, ` +
            `${rows.length} → ${result.length} righe`,
        );
    }

    return { rows: result, matches };
}
