'use client';

/**
 * Drawer laterale con analisi completa FatturaPA (SDI passive).
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ExternalLink, Loader2, X } from 'lucide-react';
import type { UploadInvoiceDetailExtended } from '@/lib/financial/invoiceUploadHistory';

type Props = {
    invoice: UploadInvoiceDetailExtended | null;
    loading: boolean;
    open: boolean;
    onClose: () => void;
    onDelete?: (expenseId: string) => void;
};

function formatItDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return iso;
}

function euro(cents: number): string {
    return (Math.abs(cents) / 100).toLocaleString('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function euroFromEuros(value: number | null | undefined): string {
    if (value == null || Number.isNaN(value)) return '—';
    return value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function partyLabel(p: {
    denominazione: string | null;
    nome: string | null;
    cognome: string | null;
}): string {
    return (
        p.denominazione ||
        [p.nome, p.cognome].filter(Boolean).join(' ') ||
        '—'
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-2">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</h3>
            {children}
        </section>
    );
}

export default function SdiInvoiceDetailDrawer({
    invoice,
    loading,
    open,
    onClose,
    onDelete,
}: Props) {
    const [mounted, setMounted] = useState(false);
    const [chromeOffset, setChromeOffset] = useState('3.5rem');

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!open) return;
        const shell = document.querySelector('.dashboard-shell');
        const chromeH =
            shell && getComputedStyle(shell).getPropertyValue('--dashboard-chrome-h').trim();
        if (chromeH) setChromeOffset(chromeH);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!mounted || !open) return null;

    const detail = invoice?.fatturaPaDetail;

    return createPortal(
        <>
            <div
                className="fixed inset-0 z-[84] bg-slate-900/35"
                style={{ top: chromeOffset }}
                onClick={onClose}
                aria-hidden
            />
            <aside
                className="fixed right-0 z-[85] w-full max-w-xl bg-white border-l border-slate-200 shadow-2xl flex flex-col"
                style={{ top: chromeOffset, bottom: 0 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="sdi-invoice-drawer-title"
            >
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                    <div className="min-w-0 pr-3">
                        <p
                            id="sdi-invoice-drawer-title"
                            className="text-sm font-semibold text-slate-900 truncate"
                        >
                            {invoice?.vendorName || 'Dettaglio fattura SDI'}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                            {invoice?.invoiceNumber
                                ? `n. ${invoice.invoiceNumber}`
                                : 'Documento passivo'}
                            {invoice?.expenseDate
                                ? ` · ${formatItDate(invoice.expenseDate)}`
                                : ''}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800"
                    >
                        <X size={16} />
                        Chiudi
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5 text-xs">
                    {loading || !invoice ? (
                        <p className="text-slate-400 flex items-center gap-2 py-12 justify-center">
                            <Loader2 size={16} className="animate-spin" /> Caricamento…
                        </p>
                    ) : (
                        <>
                            <Section title="Dati generali">
                                <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                                    <div>
                                        <dt className="text-[10px] text-slate-400">Tipo documento</dt>
                                        <dd className="font-mono font-semibold">
                                            {detail?.generali.tipoDocumento ||
                                                invoice.tipoDocumento ||
                                                '—'}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] text-slate-400">Numero</dt>
                                        <dd className="font-mono font-semibold">
                                            {detail?.generali.numero || invoice.invoiceNumber || '—'}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] text-slate-400">Data</dt>
                                        <dd>{formatItDate(detail?.generali.data || invoice.expenseDate)}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-[10px] text-slate-400">Divisa</dt>
                                        <dd>{detail?.generali.divisa || 'EUR'}</dd>
                                    </div>
                                    <div className="col-span-2">
                                        <dt className="text-[10px] text-slate-400">Importo totale</dt>
                                        <dd className="font-mono font-semibold text-base">
                                            €
                                            {detail?.generali.importoTotale != null
                                                ? euroFromEuros(detail.generali.importoTotale)
                                                : euro(invoice.totalCents)}
                                        </dd>
                                    </div>
                                    {(detail?.generali.causale || invoice.description) && (
                                        <div className="col-span-2">
                                            <dt className="text-[10px] text-slate-400">Causale / Note</dt>
                                            <dd className="text-slate-600">
                                                {detail?.generali.causale || invoice.description}
                                            </dd>
                                        </div>
                                    )}
                                </dl>
                            </Section>

                            <Section title="Cedente / Prestatore (Fornitore)">
                                {detail ? (
                                    <dl className="space-y-1 text-slate-700">
                                        <div>
                                            <span className="font-semibold">
                                                {partyLabel(detail.cedente)}
                                            </span>
                                        </div>
                                        {detail.cedente.partitaIva && (
                                            <div>P.IVA: {detail.cedente.partitaIva}</div>
                                        )}
                                        {detail.cedente.codiceFiscale && (
                                            <div>CF: {detail.cedente.codiceFiscale}</div>
                                        )}
                                        {detail.cedente.regimeFiscale && (
                                            <div>Regime: {detail.cedente.regimeFiscale}</div>
                                        )}
                                        {(detail.cedente.sede.indirizzo ||
                                            detail.cedente.sede.comune) && (
                                            <div className="text-slate-500">
                                                {[
                                                    detail.cedente.sede.indirizzo,
                                                    detail.cedente.sede.cap,
                                                    detail.cedente.sede.comune,
                                                    detail.cedente.sede.provincia,
                                                    detail.cedente.sede.nazione,
                                                ]
                                                    .filter(Boolean)
                                                    .join(', ')}
                                            </div>
                                        )}
                                    </dl>
                                ) : (
                                    <p>
                                        {invoice.vendorName}
                                        {invoice.vendorVat ? ` · P.IVA ${invoice.vendorVat}` : ''}
                                    </p>
                                )}
                            </Section>

                            <Section title="Cessionario / Committente">
                                {detail ? (
                                    <dl className="space-y-1 text-slate-700">
                                        <div className="font-semibold">
                                            {partyLabel(detail.cessionario)}
                                        </div>
                                        {detail.cessionario.partitaIva && (
                                            <div>P.IVA: {detail.cessionario.partitaIva}</div>
                                        )}
                                        {detail.cessionario.codiceFiscale && (
                                            <div>CF: {detail.cessionario.codiceFiscale}</div>
                                        )}
                                    </dl>
                                ) : (
                                    <p className="text-slate-500">FloreMoria S.r.l.</p>
                                )}
                            </Section>

                            {detail && detail.pagamenti.length > 0 && (
                                <Section title="Dati di pagamento">
                                    <div className="space-y-3">
                                        {detail.pagamenti.map((p) => (
                                            <div
                                                key={`${p.modalita || ''}|${p.importo ?? ''}|${p.iban || ''}`}
                                                className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 space-y-1"
                                            >
                                                <p className="font-semibold">
                                                    {p.modalitaLabel || p.modalita || 'Pagamento'}
                                                </p>
                                                {p.dataScadenza && (
                                                    <p>Scadenza: {formatItDate(p.dataScadenza)}</p>
                                                )}
                                                {p.importo != null && (
                                                    <p className="font-mono">
                                                        Importo: €{euroFromEuros(p.importo)}
                                                    </p>
                                                )}
                                                {p.iban && (
                                                    <p className="font-mono text-indigo-800 break-all">
                                                        IBAN: {p.iban}
                                                    </p>
                                                )}
                                                {p.istituto && <p>Banca: {p.istituto}</p>}
                                                {p.beneficiario && (
                                                    <p>Beneficiario: {p.beneficiario}</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </Section>
                            )}

                            {(detail?.righe.length || invoice.lineDescriptions.length) > 0 && (
                                <Section title="Righe beni / servizi">
                                    {detail && detail.righe.length > 0 ? (
                                        <div className="overflow-x-auto rounded-xl border border-slate-100">
                                            <table className="w-full text-[10px] min-w-[480px]">
                                                <thead className="bg-slate-50 text-slate-400 uppercase">
                                                    <tr>
                                                        <th className="px-2 py-1.5 text-left">Descr.</th>
                                                        <th className="px-2 py-1.5 text-right">Q.tà</th>
                                                        <th className="px-2 py-1.5 text-right">P.U.</th>
                                                        <th className="px-2 py-1.5 text-right">Tot.</th>
                                                        <th className="px-2 py-1.5 text-right">IVA%</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {detail.righe.map((r) => (
                                                        <tr
                                                            key={`${r.numeroLinea || ''}|${r.descrizione}|${r.prezzoTotale ?? ''}`}
                                                            className="border-t border-slate-50"
                                                        >
                                                            <td className="px-2 py-1.5">{r.descrizione}</td>
                                                            <td className="px-2 py-1.5 text-right font-mono">
                                                                {r.quantita ?? '—'}
                                                            </td>
                                                            <td className="px-2 py-1.5 text-right font-mono">
                                                                {r.prezzoUnitario != null
                                                                    ? euroFromEuros(r.prezzoUnitario)
                                                                    : '—'}
                                                            </td>
                                                            <td className="px-2 py-1.5 text-right font-mono">
                                                                {r.prezzoTotale != null
                                                                    ? euroFromEuros(r.prezzoTotale)
                                                                    : '—'}
                                                            </td>
                                                            <td className="px-2 py-1.5 text-right font-mono">
                                                                {r.aliquotaIva ?? '—'}
                                                                {r.natura ? ` (${r.natura})` : ''}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <ul className="list-disc pl-4 space-y-1 text-slate-600">
                                            {invoice.lineDescriptions.map((line, i) => (
                                                <li key={i}>{line}</li>
                                            ))}
                                        </ul>
                                    )}
                                </Section>
                            )}

                            {detail && detail.riepilogoIva.length > 0 && (
                                <Section title="Riepilogo IVA">
                                    <div className="overflow-x-auto rounded-xl border border-slate-100">
                                        <table className="w-full text-[10px]">
                                            <thead className="bg-slate-50 text-slate-400 uppercase">
                                                <tr>
                                                    <th className="px-2 py-1.5 text-left">Aliquota</th>
                                                    <th className="px-2 py-1.5 text-right">Imponibile</th>
                                                    <th className="px-2 py-1.5 text-right">IVA</th>
                                                    <th className="px-2 py-1.5 text-left">Natura</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {detail.riepilogoIva.map((r) => (
                                                    <tr
                                                        key={`${r.aliquota ?? ''}|${r.imponibile}|${r.imposta}`}
                                                        className="border-t border-slate-50"
                                                    >
                                                        <td className="px-2 py-1.5 font-mono">
                                                            {r.aliquota ?? 0}%
                                                        </td>
                                                        <td className="px-2 py-1.5 text-right font-mono">
                                                            €{euroFromEuros(r.imponibile)}
                                                        </td>
                                                        <td className="px-2 py-1.5 text-right font-mono">
                                                            €{euroFromEuros(r.imposta)}
                                                        </td>
                                                        <td className="px-2 py-1.5">{r.natura || '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </Section>
                            )}

                            <Section title="Importi contabili">
                                <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
                                    <div>
                                        <p className="text-[10px] text-slate-400 uppercase">Imponibile</p>
                                        <p className="font-mono font-semibold">€{euro(invoice.netCents)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 uppercase">
                                            IVA{invoice.vatRate != null ? ` ${invoice.vatRate}%` : ''}
                                        </p>
                                        <p className="font-mono font-semibold">€{euro(invoice.vatCents)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 uppercase">Totale</p>
                                        <p className="font-mono font-semibold">€{euro(invoice.totalCents)}</p>
                                    </div>
                                </div>
                            </Section>

                            <Section title="Allegati / Metadati SDI">
                                <dl className="space-y-1 text-slate-600">
                                    {invoice.sdiIdentificativo && (
                                        <div>Identificativo SDI: {invoice.sdiIdentificativo}</div>
                                    )}
                                    {invoice.sdiDataRicezione && (
                                        <div>
                                            Data ricezione SDI:{' '}
                                            {formatItDate(invoice.sdiDataRicezione)}
                                        </div>
                                    )}
                                    {invoice.archiveFileName && (
                                        <div>File: {invoice.archiveFileName}</div>
                                    )}
                                    <div>
                                        Fineco:{' '}
                                        <span
                                            className={
                                                invoice.reconciled
                                                    ? 'text-emerald-700 font-bold'
                                                    : 'text-amber-700 font-bold'
                                            }
                                        >
                                            {invoice.reconciled ? 'Abbinato' : 'Non abbinato'}
                                        </span>
                                    </div>
                                </dl>
                                {invoice.blobUrl && (
                                    <div className="flex flex-wrap gap-3 pt-2">
                                        <a
                                            href={invoice.blobUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-indigo-700 font-bold hover:underline"
                                        >
                                            <ExternalLink size={12} />
                                            Visualizza XML
                                        </a>
                                        <a
                                            href={invoice.blobUrl}
                                            download={
                                                invoice.archiveFileName ||
                                                `${invoice.invoiceNumber || 'fattura'}.xml`
                                            }
                                            className="inline-flex items-center gap-1 text-slate-700 font-bold hover:underline"
                                        >
                                            <Download size={12} />
                                            Scarica XML
                                        </a>
                                    </div>
                                )}
                            </Section>
                        </>
                    )}
                </div>

                {invoice && onDelete && (
                    <div className="px-4 py-3 border-t border-slate-100 flex justify-end shrink-0">
                        <button
                            type="button"
                            onClick={() => onDelete(invoice.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700"
                        >
                            Elimina fattura
                        </button>
                    </div>
                )}
            </aside>
        </>,
        document.body
    );
}
