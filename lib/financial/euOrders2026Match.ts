/**
 * Dataset verificato vendite floremoria.eu 2026 (T1–T3) + match gateway (sola logica).
 * Spec: METODO §8 — corrispettivo = lordo gateway quando abbinato; lista solo identifica.
 */

import fs from 'fs';
import path from 'path';

export type EuOrder2026 = {
    id: string;
    date: string;
    quarter: 1 | 2 | 3 | 4;
    customerName: string;
    email: string;
    phone: string;
    deceased: string | null;
    products: Array<{ qty: number; name: string; lineTotalEuro: number }>;
    listinoEuro: number;
    scontoEuro: number;
    /** Importo lista di origine (identificazione). Non prevale sul gateway. */
    incassatoRealeEuro: number;
    listinoCents: number;
    scontoCents: number;
    incassatoRealeCents: number;
    /**
     * Diretto = vendita .eu senza fiorista partner sul .com.
     * Partner = ordine con fiorista partner (cliente paga comunque FloreMoria al lordo).
     */
    canale: 'Diretto' | 'Partner';
    alreadyOnCom: boolean;
    note: string | null;
};

export type EuOrdersDataset = {
    meta: Record<string, unknown>;
    orders: EuOrder2026[];
};

let cached: EuOrdersDataset | null = null;

export function loadEuOrders2026Dataset(): EuOrdersDataset {
    if (cached) return cached;
    const p = path.join(process.cwd(), 'scripts/data/floremoria-eu-orders-2026.json');
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as EuOrdersDataset;
    cached = raw;
    return raw;
}

/** Invalida cache (test / dopo riscrittura fixture). */
export function clearEuOrders2026Cache() {
    cached = null;
}

export function normPersonName(v: string | null | undefined): string {
    return (v || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function namesOverlap(a: string, b: string): boolean {
    const na = normPersonName(a);
    const nb = normPersonName(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    const ta = new Set(na.split(' ').filter((t) => t.length >= 3));
    const tb = new Set(nb.split(' ').filter((t) => t.length >= 3));
    if (ta.size === 0 || tb.size === 0) return false;
    let hit = 0;
    for (const t of ta) if (tb.has(t)) hit += 1;
    return hit >= 2 || (hit >= 1 && (ta.size === 1 || tb.size === 1));
}

export function daysApartIso(a: string, b: string): number {
    const da = Date.parse(`${a.slice(0, 10)}T12:00:00.000Z`);
    const db = Date.parse(`${b.slice(0, 10)}T12:00:00.000Z`);
    return Math.abs(da - db) / (1000 * 60 * 60 * 24);
}

/**
 * Conferma importo vs lista (tolleranza stretta).
 * Non usata per valorizzare: se match nome+data, vince comunque il gateway.
 */
export function amountConfirmsList(
    gatewayCents: number,
    listCents: number,
    toleranceCents = 2
): boolean {
    return Math.abs(Math.abs(gatewayCents) - Math.abs(listCents)) <= toleranceCents;
}

export type GatewayMatchProbe = {
    key: string;
    paymentDateIso: string;
    grossCents: number;
    payerName: string | null;
    email: string | null;
};

export type EuGatewayMatch = {
    order: EuOrder2026;
    gatewayKey: string;
    score: 'name_date_amount' | 'name_date' | 'date_amount_unique';
    daysDelta: number;
    /** Delta lista − gateway (centesimi). 0 se coincidono. */
    listMinusGatewayCents: number;
    /** Lordo da usare in registro = sempre gateway. */
    gatewayGrossCents: number;
};

/**
 * Match 1:1 gateway ↔ ordine .eu.
 * Identificazione: nome+data±3 (importo conferma); oppure data+importo lista se unico.
 * Valorizzazione: sempre `gatewayGrossCents` (§8.2).
 */
export function matchGatewaysToEuOrders(
    probes: GatewayMatchProbe[],
    orders: EuOrder2026[],
    windowDays = 3
): EuGatewayMatch[] {
    const usedOrders = new Set<string>();
    const usedGw = new Set<string>();
    const matches: EuGatewayMatch[] = [];

    const push = (g: GatewayMatchProbe, o: EuOrder2026, score: EuGatewayMatch['score']) => {
        usedOrders.add(o.id);
        usedGw.add(g.key);
        matches.push({
            order: o,
            gatewayKey: g.key,
            score,
            daysDelta: daysApartIso(g.paymentDateIso, o.date),
            listMinusGatewayCents: o.incassatoRealeCents - Math.abs(g.grossCents),
            gatewayGrossCents: g.grossCents,
        });
    };

    // Pass 1 — nome/email + data ±3; importo lista conferma se presente
    for (const g of probes) {
        if (usedGw.has(g.key)) continue;
        const inWindow = orders.filter((o) => {
            if (usedOrders.has(o.id)) return false;
            if (daysApartIso(g.paymentDateIso, o.date) > windowDays) return false;
            const nameOk =
                (g.payerName && namesOverlap(g.payerName, o.customerName)) ||
                (g.email &&
                    o.email &&
                    g.email.trim().toLowerCase() === o.email.trim().toLowerCase());
            return Boolean(nameOk);
        });
        if (inWindow.length === 0) continue;
        const withAmount = inWindow.filter((o) =>
            amountConfirmsList(g.grossCents, o.incassatoRealeCents)
        );
        const pick =
            withAmount.length === 1 ? withAmount[0] : inWindow.length === 1 ? inWindow[0] : null;
        if (!pick) continue;
        push(
            g,
            pick,
            amountConfirmsList(g.grossCents, pick.incassatoRealeCents)
                ? 'name_date_amount'
                : 'name_date'
        );
    }

    // Pass 2 — data + importo lista unici (Stripe EU spesso senza nome)
    for (const g of probes) {
        if (usedGw.has(g.key)) continue;
        const candidates = orders.filter((o) => {
            if (usedOrders.has(o.id)) return false;
            if (!amountConfirmsList(g.grossCents, o.incassatoRealeCents)) return false;
            return daysApartIso(g.paymentDateIso, o.date) <= windowDays;
        });
        if (candidates.length !== 1) continue;
        push(g, candidates[0], 'date_amount_unique');
    }

    return matches;
}

/** Totale .eu valorizzato: gateway se match, altrimenti lista. */
export function totalEuIncassatoPreferGateway(
    orders: EuOrder2026[],
    matches: EuGatewayMatch[]
): { listCents: number; gatewayPreferredCents: number; deltas: EuGatewayMatch[] } {
    const byOrder = new Map(matches.map((m) => [m.order.id, m]));
    let listCents = 0;
    let gatewayPreferredCents = 0;
    const deltas: EuGatewayMatch[] = [];
    for (const o of orders) {
        listCents += o.incassatoRealeCents;
        const m = byOrder.get(o.id);
        if (m) {
            gatewayPreferredCents += Math.abs(m.gatewayGrossCents);
            if (m.listMinusGatewayCents !== 0) deltas.push(m);
        } else {
            gatewayPreferredCents += o.incassatoRealeCents;
        }
    }
    return { listCents, gatewayPreferredCents, deltas };
}
