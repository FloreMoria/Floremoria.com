/**
 * PDF leggibile autofattura estera (layout stile foglio SDI / DocuM).
 * Non sostituisce l'XML FatturaPA: è solo anteprima/stampa per umani.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { FLOREMORIA_LEGAL_ENTITY } from '@/lib/financial/companyBankDetails';
import type { AutofatturaDocType, ForeignVendorPreset } from '@/lib/financial/generateAutofatturaXml';

export type AutofatturaPdfInput = {
    docType: AutofatturaDocType;
    documentNumber: string;
    autofatturaDate: string; // YYYY-MM-DD
    foreignInvoiceNumber: string;
    foreignInvoiceDate: string;
    imponibileCents: number;
    vatCents: number;
    totaleCents: number;
    descrizioneLinea: string;
    vendor: Pick<
        ForeignVendorPreset,
        'denominazione' | 'idPaese' | 'idCodice' | 'indirizzo' | 'cap' | 'comune' | 'nazione'
    >;
};

function euro(cents: number): string {
    return (Math.abs(cents) / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function itDate(iso: string): string {
    const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso;
    return `${m[3]}/${m[2]}/${m[1]}`;
}

/** WinAnsi-safe: evita glifi non supportati da Helvetica standard. */
function safe(s: string): string {
    return String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7E€]/g, '?')
        .replace(/€/g, 'EUR ');
}

function titleForDocType(docType: AutofatturaDocType): string {
    if (docType === 'TD18') {
        return 'INTEGRAZIONE/AUTOFATTURA ACQUISTO DI BENI INTRACOMUNITARI (TD18)';
    }
    return 'INTEGRAZIONE/AUTOFATTURA ACQUISTO DI SERVIZI ESTERO (TD17)';
}

function drawBox(
    page: PDFPage,
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    lines: string[],
    font: PDFFont,
    fontBold: PDFFont
) {
    page.drawRectangle({
        x,
        y: y - h,
        width: w,
        height: h,
        borderColor: rgb(0.55, 0.55, 0.55),
        borderWidth: 0.8,
        color: rgb(1, 1, 1),
    });
    page.drawRectangle({
        x,
        y: y - 16,
        width: w,
        height: 16,
        color: rgb(0.93, 0.93, 0.95),
        borderColor: rgb(0.55, 0.55, 0.55),
        borderWidth: 0.8,
    });
    page.drawText(safe(title), {
        x: x + 6,
        y: y - 12,
        size: 8,
        font: fontBold,
        color: rgb(0.15, 0.15, 0.2),
    });
    let ty = y - 28;
    for (const line of lines) {
        if (!line) continue;
        page.drawText(safe(line).slice(0, 78), {
            x: x + 6,
            y: ty,
            size: 8,
            font,
            color: rgb(0.1, 0.1, 0.1),
        });
        ty -= 11;
    }
}

/**
 * Genera PDF A4 leggibile dell'autofattura (buffer bytes).
 */
export async function generateAutofatturaPdf(input: AutofatturaPdfInput): Promise<{
    bytes: Uint8Array;
    fileName: string;
}> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]); // A4
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const { width, height } = page.getSize();
    const margin = 36;
    let y = height - margin;

    // Intestazione
    page.drawText(safe(titleForDocType(input.docType)), {
        x: margin,
        y,
        size: 11,
        font: fontBold,
        color: rgb(0.12, 0.12, 0.18),
        maxWidth: width - margin * 2,
    });
    y -= 18;
    page.drawText(safe(`Foglio di stile — anteprima leggibile (non e' il file XML SDI)`), {
        x: margin,
        y,
        size: 7,
        font,
        color: rgb(0.45, 0.45, 0.5),
    });
    y -= 22;

    const boxW = (width - margin * 2 - 12) / 2;
    const boxH = 92;
    const taxId = `${input.vendor.idPaese}${input.vendor.idCodice.replace(
        new RegExp(`^${input.vendor.idPaese}`, 'i'),
        ''
    )}`;

    drawBox(
        page,
        margin,
        y,
        boxW,
        boxH,
        'CEDENTE / PRESTATORE (Fornitore estero)',
        [
            input.vendor.denominazione,
            `P.IVA / Tax ID: ${taxId}`,
            input.vendor.indirizzo,
            `${input.vendor.cap} ${input.vendor.comune}`,
            `Paese: ${input.vendor.nazione}`,
        ],
        font,
        fontBold
    );

    drawBox(
        page,
        margin + boxW + 12,
        y,
        boxW,
        boxH,
        'CESSIONARIO / COMMITTENTE',
        [
            'FLOREMORIA SRL',
            `C.F. / P.IVA: ${FLOREMORIA_LEGAL_ENTITY.vatNumber}`,
            'VIA BELLINZONA 82/B',
            '22100 COMO (CO)',
            `Codice Destinatario: ${FLOREMORIA_LEGAL_ENTITY.sdiCode}`,
        ],
        font,
        fontBold
    );
    y -= boxH + 16;

    // Dati documento
    drawBox(
        page,
        margin,
        y,
        width - margin * 2,
        52,
        'DATI DOCUMENTO',
        [
            `Numero documento: ${input.documentNumber}    Data documento: ${itDate(input.autofatturaDate)}    Valuta: EUR`,
            `Tipo documento: ${input.docType}    Regime: reverse charge / integrazione IVA`,
        ],
        font,
        fontBold
    );
    y -= 68;

    // Tabella prodotti
    const tableX = margin;
    const tableW = width - margin * 2;
    const col = [0.42, 0.08, 0.16, 0.18, 0.16].map((r) => r * tableW);
    const headers = ['Descrizione', 'Q.ta', 'P.U. EUR', 'Imponibile', 'Aliq. IVA'];
    const rowH = 18;
    page.drawRectangle({
        x: tableX,
        y: y - rowH,
        width: tableW,
        height: rowH,
        color: rgb(0.9, 0.9, 0.93),
        borderColor: rgb(0.5, 0.5, 0.55),
        borderWidth: 0.7,
    });
    let cx = tableX + 4;
    for (let i = 0; i < headers.length; i++) {
        page.drawText(safe(headers[i]!), {
            x: cx,
            y: y - 12,
            size: 7,
            font: fontBold,
        });
        cx += col[i]!;
    }
    y -= rowH;

    const cells = [
        input.descrizioneLinea || 'SERVIZI',
        '1',
        euro(input.imponibileCents),
        euro(input.imponibileCents),
        '22%',
    ];
    page.drawRectangle({
        x: tableX,
        y: y - rowH,
        width: tableW,
        height: rowH,
        borderColor: rgb(0.5, 0.5, 0.55),
        borderWidth: 0.7,
    });
    cx = tableX + 4;
    for (let i = 0; i < cells.length; i++) {
        page.drawText(safe(String(cells[i])).slice(0, i === 0 ? 48 : 16), {
            x: cx,
            y: y - 12,
            size: 8,
            font,
        });
        cx += col[i]!;
    }
    y -= rowH + 16;

    // Fatture collegate
    drawBox(
        page,
        margin,
        y,
        width - margin * 2,
        48,
        'DATI FATTURE COLLEGATE (fattura estera originale)',
        [
            `Riferimento N. fattura: ${input.foreignInvoiceNumber}`,
            `Data fattura originale: ${itDate(input.foreignInvoiceDate)}`,
        ],
        font,
        fontBold
    );
    y -= 64;

    // Riepilogo
    drawBox(
        page,
        margin,
        y,
        width - margin * 2,
        64,
        'RIEPILOGO IVA E TOTALE DOCUMENTO',
        [
            `Imponibile: EUR ${euro(input.imponibileCents)}`,
            `Imposta IVA 22%: EUR ${euro(input.vatCents)}`,
            `Totale Documento (Imponibile + IVA): EUR ${euro(input.totaleCents)}`,
        ],
        font,
        fontBold
    );
    y -= 80;

    page.drawText(
        safe(
            'Nota: documento generato da FloreMoria Contabilita per consultazione. ' +
                'Per YouDoox / SDI usare esclusivamente il file XML FatturaPA FPR12.'
        ),
        {
            x: margin,
            y: Math.max(margin, y),
            size: 7,
            font,
            color: rgb(0.4, 0.4, 0.45),
            maxWidth: width - margin * 2,
        }
    );

    const bytes = await doc.save();
    const fileName = `Autofattura_${input.documentNumber.replace(/[^\w.-]+/g, '_')}.pdf`;
    return { bytes, fileName };
}
