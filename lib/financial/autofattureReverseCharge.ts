/**
 * Autofatture TD17 reverse charge — IVA letta dai documenti, non assunta bilanciata.
 * Credito detraibile solo fino al debito registrato; sbilanci → lista di lavoro.
 */
export type ArcLedgerSide = {
    id: string;
    sourceKey: string | null;
    sourceId: string | null;
    documentRef: string | null;
    direction: string | null;
    totalCents: number;
    vatCents: number;
    description?: string | null;
    accountingDate?: Date | null;
    counterpartyName?: string | null;
};

export type ArcEventBalance = {
    eventKey: string;
    vendor: string;
    date: string | null;
    ivaDebitoCents: number;
    ivaCreditoCents: number;
    /** Credito ammissibile in detrazione (= min debito, credito). */
    ivaCreditoDetraibileCents: number;
    saldoCents: number;
    balanced: boolean;
    missingDebito: boolean;
    missingCredito: boolean;
    workListReason: string | null;
    entrataKeys: string[];
    uscitaKeys: string[];
};

export function arcEventKey(r: {
    sourceKey: string | null;
    sourceId: string | null;
    documentRef: string | null;
    id: string;
}): string {
    const m = (r.sourceKey || '').match(/:(cmt[a-z0-9]+)/i);
    if (m?.[1]) return m[1];
    const doc = (r.documentRef || '').trim();
    if (doc && doc !== 'TD17') return doc;
    return r.sourceId || r.id;
}

function vatAmount(r: { vatCents: number; totalCents: number }): number {
    // Documento RC: se vatCents valorizzato e plausibile lo usiamo; altrimenti |total|.
    const vat = Math.abs(r.vatCents || 0);
    const tot = Math.abs(r.totalCents);
    if (vat > 0 && vat <= tot * 2) return vat;
    return tot;
}

/**
 * Raggruppa righe ARC per evento e calcola debito/credito documentali.
 */
export function balanceAutofattureReverseCharge(
    rows: ArcLedgerSide[]
): ArcEventBalance[] {
    const groups = new Map<
        string,
        { ent: ArcLedgerSide[]; usc: ArcLedgerSide[] }
    >();
    for (const r of rows) {
        const ek = arcEventKey(r);
        if (!groups.has(ek)) groups.set(ek, { ent: [], usc: [] });
        const g = groups.get(ek)!;
        if (r.direction === 'ENTRATA' || r.totalCents > 0) g.ent.push(r);
        else g.usc.push(r);
    }

    const out: ArcEventBalance[] = [];
    for (const [eventKey, g] of groups) {
        const ivaDebitoCents = g.ent.length
            ? Math.max(...g.ent.map(vatAmount))
            : 0;
        const ivaCreditoCents = g.usc.length
            ? Math.max(...g.usc.map(vatAmount))
            : 0;
        const ivaCreditoDetraibileCents = Math.min(ivaDebitoCents, ivaCreditoCents);
        const saldoCents = ivaDebitoCents - ivaCreditoCents;
        const missingDebito = g.ent.length === 0 && ivaCreditoCents > 0;
        const missingCredito = g.usc.length === 0 && ivaDebitoCents > 0;
        const balanced = ivaDebitoCents > 0 && ivaDebitoCents === ivaCreditoCents;
        let workListReason: string | null = null;
        if (missingDebito) {
            workListReason = `Manca IVA a debito (credito €${(ivaCreditoCents / 100).toFixed(2)} non detraibile)`;
        } else if (missingCredito) {
            workListReason = `Manca IVA a credito a fronte di debito €${(ivaDebitoCents / 100).toFixed(2)}`;
        } else if (saldoCents !== 0) {
            workListReason = `Squilibrio reverse charge Δ€${(saldoCents / 100).toFixed(2)} (debito ${(ivaDebitoCents / 100).toFixed(2)} / credito ${(ivaCreditoCents / 100).toFixed(2)})`;
        }
        const sample = g.ent[0] || g.usc[0];
        const vendor =
            sample?.counterpartyName ||
            (sample?.description || '').replace(/^Autofattura TD17[^—]*—\s*/i, '').split('(')[0].trim() ||
            eventKey;
        out.push({
            eventKey,
            vendor,
            date: sample?.accountingDate
                ? sample.accountingDate.toISOString().slice(0, 10)
                : null,
            ivaDebitoCents,
            ivaCreditoCents,
            ivaCreditoDetraibileCents,
            saldoCents,
            balanced,
            missingDebito,
            missingCredito,
            workListReason,
            entrataKeys: g.ent.map((r) => r.sourceKey || r.id),
            uscitaKeys: g.usc.map((r) => r.sourceKey || r.id),
        });
    }
    return out.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

export function summarizeArcBalances(balances: ArcEventBalance[]) {
    return {
        events: balances.length,
        balanced: balances.filter((b) => b.balanced).length,
        workList: balances.filter((b) => b.workListReason),
        ivaDebitoCents: balances.reduce((s, b) => s + b.ivaDebitoCents, 0),
        ivaCreditoDetraibileCents: balances.reduce(
            (s, b) => s + b.ivaCreditoDetraibileCents,
            0
        ),
        ivaCreditoRawCents: balances.reduce((s, b) => s + b.ivaCreditoCents, 0),
    };
}
