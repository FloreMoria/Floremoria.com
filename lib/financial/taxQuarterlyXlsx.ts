/**
 * Export XLSX multi-foglio per commercialista — corrispettivi, reverse charge TD17, passivo fioristi, riepilogo IVA.
 */

import type { TaxQuarterlyReport } from '@/lib/financial/taxQuarterly';
import { VAT_PCT_FLORAL, VAT_PCT_ORDINARY } from '@/lib/financial/vat';

function euroCell(cents: number): number {
    return Math.round(cents) / 100;
}

function pctLabel(rate: number): string {
    return `${rate}%`;
}

export async function buildTaxQuarterlyXlsxBuffer(report: TaxQuarterlyReport): Promise<Buffer> {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    const corrispettiviRows = report.corrispettivi.map((r) => ({
        'Data Pagamento': r.paymentDate,
        'ID Ordine': r.orderNumber,
        Gateway: r.gateway,
        'ID Transazione Gateway': r.transactionId,
        Cliente: r.buyerName,
        'CF/P.IVA Cliente': r.buyerTaxId,
        Nazione: r.buyerCountry,
        'Lordo EUR': euroCell(r.grossCents),
        'Aliquota IVA (10%)': pctLabel(r.vatRate),
        'Imponibile EUR': euroCell(r.imponibileCents),
        'IVA EUR': euroCell(r.ivaDebitoCents),
        'Fee Trattenuta Gateway EUR': euroCell(r.gatewayFeeCents),
        'Incasso Netto EUR': euroCell(r.netCents),
        'Metodo Pagamento': r.paymentMethod,
    }));

    const reverseChargeRows = report.reverseCharge.map((r) => ({
        'Mese Competenza': r.competenceMonth,
        Fornitore: r.vendorName,
        'Partita IVA / Tax ID Estero': r.vendorTaxId,
        'N. Fattura Gateway': r.gatewayInvoiceNumber,
        'Data Emissione': r.issuedAt,
        'Imponibile Fee EUR': euroCell(r.taxableFeeCents),
        'Aliquota IVA (22%)': pctLabel(VAT_PCT_ORDINARY),
        'IVA Reverse Charge EUR': euroCell(r.vatReverseChargeCents),
        'Riferimento Autofattura TD17': r.autofatturaTd17Ref,
    }));

    const floristRows = report.floristPassivo.map((r) => ({
        'ID Ordine': r.orderNumber,
        'Fiorista Partner': r.partnerName,
        'P.IVA / CF Fiorista': r.partnerTaxId || '',
        IBAN: r.partnerIban || '',
        'Compenso Pattuito EUR': euroCell(r.compensoConcordatoCents),
        'Data Bonifico Fineco': r.bonificoDate || '',
        'TRN Bonifico': r.bonificoTrn || '',
        'N. Fattura Passiva SDI': r.sdiInvoiceNumber || '',
        'Data SDI': r.sdiDate || '',
        'Imponibile Passivo': euroCell(r.imponibilePassivoCents),
        'IVA Passiva': euroCell(r.ivaPassivaCents),
        'Totale Fattura Fiorista': euroCell(r.totaleFatturaCents),
    }));

    const s = report.ivaSummary;
    const riepilogoRows = [
        { Voce: 'Totale Corrispettivi Lordi', 'Importo EUR': euroCell(s.corrispettiviLordoCents) },
        { Voce: 'Imponibile Vendite IVA 10%', 'Importo EUR': euroCell(s.imponibileVendite10Cents) },
        { Voce: 'IVA a Debito Vendite 10%', 'Importo EUR': euroCell(s.ivaDebitoVendite10Cents) },
        {
            Voce: 'Totale Autofatture Reverse Charge (Imponibile fee gateway)',
            'Importo EUR': euroCell(s.reverseChargeImponibileCents),
        },
        {
            Voce: 'IVA Reverse Charge TD17 a Debito/Credito (22%)',
            'Importo EUR': euroCell(s.reverseChargeIvaCents),
        },
        {
            Voce: 'Totale Costo Fioristi — Imponibile passivo',
            'Importo EUR': euroCell(s.floristImponibileCents),
        },
        {
            Voce: 'Totale Costo Fioristi — IVA a credito detraibile',
            'Importo EUR': euroCell(s.floristIvaCreditoCents),
        },
        {
            Voce: 'Saldo IVA stimato a Debito (+) / Credito (-)',
            'Importo EUR': euroCell(s.saldoIvaStimatoCents),
        },
    ];

    const sheets: Array<{ name: string; rows: Record<string, string | number>[] }> = [
        { name: 'Registro_Corrispettivi', rows: corrispettiviRows },
        { name: 'Reverse_Charge_SaaS_Gateway', rows: reverseChargeRows },
        { name: 'Compensi_Fioristi_Passivo', rows: floristRows },
        { name: 'Riepilogo_IVA_Periodo', rows: riepilogoRows },
    ];

    for (const sheet of sheets) {
        const ws = XLSX.utils.json_to_sheet(sheet.rows.length ? sheet.rows : [{}]);
        XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
    }

    const meta = [
        { Campo: 'Periodo', Valore: report.bounds.label },
        { Campo: 'Dal', Valore: report.bounds.start.toISOString().slice(0, 10) },
        { Campo: 'Al', Valore: report.bounds.end.toISOString().slice(0, 10) },
        { Campo: 'Generato', Valore: new Date().toISOString().slice(0, 19) },
    ];
    const wsMeta = XLSX.utils.json_to_sheet(meta);
    XLSX.utils.book_append_sheet(wb, wsMeta, '_Meta');

    const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return Buffer.from(out);
}
