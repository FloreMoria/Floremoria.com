/**
 * Fase 1 — Report doppioni certificati (sola lettura).
 * Uso: npx tsx scripts/audit-finance-duplicates-fase1.ts
 *
 * Non modifica dati Neon. Conta gruppi con count > 1.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import prisma from '../lib/prisma';
import {
    buildCanonicalDocumentKey,
    normalizeCanonicalVat,
} from '../lib/financial/canonicalDocumentKey';

type DupGroup = {
    key: string;
    count: number;
    ids: string[];
};

function summarize(groups: DupGroup[]) {
    const duplicateGroups = groups.filter((g) => g.count > 1);
    const duplicateRows = duplicateGroups.reduce((acc, g) => acc + g.count, 0);
    const excessRows = duplicateGroups.reduce((acc, g) => acc + (g.count - 1), 0);
    return {
        groupsWithDupes: duplicateGroups.length,
        rowsInDupGroups: duplicateRows,
        excessRowsBeyondFirst: excessRows,
        top: duplicateGroups
            .sort((a, b) => b.count - a.count)
            .slice(0, 15)
            .map((g) => ({ key: g.key, count: g.count, sampleIds: g.ids.slice(0, 3) })),
    };
}

function groupByKey(items: Array<{ id: string; key: string }>): DupGroup[] {
    const map = new Map<string, DupGroup>();
    for (const item of items) {
        const cur = map.get(item.key);
        if (!cur) {
            map.set(item.key, { key: item.key, count: 1, ids: [item.id] });
        } else {
            cur.count += 1;
            cur.ids.push(item.id);
        }
    }
    return Array.from(map.values());
}

async function auditManualFinanceExpenses() {
    const rows = await prisma.manualFinanceExpense.findMany({
        where: {
            docType: { in: ['FATTURA', 'NOTA_CREDITO', 'RICEVUTA', 'SCONTRINO', 'AUTOFATTURA'] },
        },
        select: {
            id: true,
            docType: true,
            expenseDate: true,
            vendorName: true,
            metadataJson: true,
            notes: true,
        },
        take: 20000,
    });

    const items = rows.map((r) => {
        const meta = (r.metadataJson || {}) as Record<string, unknown>;
        const supplierVat =
            (typeof meta.vendorVat === 'string' && meta.vendorVat) ||
            (typeof meta.cedenteVat === 'string' && meta.cedenteVat) ||
            null;
        const recipientVat =
            (typeof meta.cessionarioVat === 'string' && meta.cessionarioVat) || null;
        const docNumber =
            (typeof meta.invoiceNumber === 'string' && meta.invoiceNumber) ||
            (typeof meta.documentNumber === 'string' && meta.documentNumber) ||
            null;
        const docType =
            (typeof meta.tipoDocumento === 'string' && meta.tipoDocumento) ||
            (typeof meta.autofatturaType === 'string' && meta.autofatturaType) ||
            r.docType ||
            null;
        const docDate =
            (typeof meta.invoiceDate === 'string' && meta.invoiceDate) ||
            r.expenseDate.toISOString().slice(0, 10);

        // Preferisci dedupeKey già canonica se a 5 segmenti; altrimenti ricostruisci.
        let key =
            typeof meta.dedupeKey === 'string' && meta.dedupeKey.split('|').length >= 5
                ? meta.dedupeKey
                : buildCanonicalDocumentKey({
                      recipientVat,
                      supplierVat,
                      docType,
                      docNumber,
                      docDate,
                  });

        // Se manca numero → chiave debole: non certificare come doppio documento fiscale
        if (!docNumber && !(typeof meta.dedupeKey === 'string' && meta.dedupeKey.includes('|'))) {
            key = `__WEAK__:${r.id}`;
        }

        return { id: r.id, key };
    });

    const certifiable = items.filter((i) => !i.key.startsWith('__WEAK__:'));
    return {
        scanned: rows.length,
        certifiableKeys: certifiable.length,
        ...summarize(groupByKey(certifiable)),
    };
}

async function auditSaasForeignInvoices() {
    const rows = await prisma.saasForeignInvoice.findMany({
        select: {
            id: true,
            vendorName: true,
            invoiceDate: true,
            eurAmountCents: true,
        },
        take: 10000,
    });

    const items = rows.map((r) => {
        const vendor = r.vendorName.trim().toUpperCase().replace(/\s+/g, ' ');
        const date = r.invoiceDate.toISOString().slice(0, 10);
        const key = `${vendor}|${date}|${r.eurAmountCents}`;
        return { id: r.id, key };
    });

    return {
        scanned: rows.length,
        ...summarize(groupByKey(items)),
    };
}

async function auditFinancialLedgerEntries() {
    const rows = await prisma.financialLedgerEntry.findMany({
        where: { reversedAt: null },
        select: {
            id: true,
            sourceKey: true,
            sourceType: true,
            sourceId: true,
            bankLineId: true,
            orderId: true,
            metadataJson: true,
        },
        take: 50000,
    });

    const bankLineKeys: Array<{ id: string; key: string }> = [];
    const orderKeys: Array<{ id: string; key: string }> = [];
    const stripeKeys: Array<{ id: string; key: string }> = [];

    for (const r of rows) {
        const sk = (r.sourceKey || '').trim();
        const meta = (r.metadataJson || {}) as Record<string, unknown>;

        // Stessa riga bancaria: sourceKey BANK_LINE:<id> o bankLineId
        const blFromKey = sk.match(/^BANK_LINE(?:_MANUAL)?:(.+)$/i)?.[1]?.trim();
        const blId = (r.bankLineId || blFromKey || '').trim();
        if (blId) {
            bankLineKeys.push({ id: r.id, key: `BANK_LINE:${blId}` });
        }

        // Stesso ordine
        const orderId = (r.orderId || (r.sourceType === 'ORDER' ? r.sourceId : '') || '').trim();
        if (orderId) {
            orderKeys.push({ id: r.id, key: `ORDER:${orderId}` });
        }

        // Stripe id (sourceKey STRIPE_* o metadata)
        const stripeFromKey = sk.match(/^STRIPE_[A-Z_]+:(.+)$/i)?.[1]?.trim();
        const stripeMeta =
            (typeof meta.stripeTransactionId === 'string' && meta.stripeTransactionId) ||
            (typeof meta.stripeId === 'string' && meta.stripeId) ||
            null;
        const stripeId = (stripeFromKey || stripeMeta || '').trim();
        if (stripeId) {
            stripeKeys.push({ id: r.id, key: `STRIPE:${stripeId}` });
        }
    }

    return {
        scanned: rows.length,
        bankLineSameId: summarize(groupByKey(bankLineKeys)),
        orderSameId: summarize(groupByKey(orderKeys)),
        stripeSameId: summarize(groupByKey(stripeKeys)),
        note:
            'bankLineSameId/orderSameId/stripeSameId contano scritture non-reversed che condividono lo stesso id tecnico (possibile doppia rappresentazione legittima ENTRATA+FEE; i gruppi count>1 sono segnali da ispezionare).',
    };
}

async function main() {
    console.log('[audit-fase1] Avvio misurazione doppioni (read-only)…');

    const [manual, saas, ledger] = await Promise.all([
        auditManualFinanceExpenses(),
        auditSaasForeignInvoices(),
        auditFinancialLedgerEntries(),
    ]);

    const report = {
        generatedAt: new Date().toISOString(),
        manualFinanceExpenses: {
            description:
                'Chiave: recipientVat|supplierVat|docType|docNumber|docDate (canonicalDocumentKey)',
            ...manual,
        },
        saasForeignInvoices: {
            description: 'Chiave: vendorName|invoiceDate|eurAmountCents',
            ...saas,
        },
        financialLedgerEntries: ledger,
        vatSample: normalizeCanonicalVat('01234567890'),
    };

    console.log(JSON.stringify(report, null, 2));
    console.log('[audit-fase1] done');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
