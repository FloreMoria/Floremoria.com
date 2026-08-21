'use client';

/**
 * Elenco compatto file già caricati (SDI o report XLSX).
 */

import { CheckCircle2 } from 'lucide-react';

export type UploadedFileRow = {
    id: string;
    fileName: string;
    uploadedAt: string;
    sizeBytes: number;
    invoiceCount: number;
};

function formatBytes(n: number): string {
    if (!n || n < 0) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatItDateTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function UploadedInvoicesFileList({
    uploads,
    emptyHint,
}: {
    uploads: UploadedFileRow[];
    emptyHint?: string;
}) {
    if (!uploads.length) {
        return (
            <p className="text-[11px] text-slate-400">
                {emptyHint || 'Nessun file caricato ancora in questa sezione.'}
            </p>
        );
    }

    return (
        <div className="rounded-xl border border-slate-100 overflow-hidden">
            <table className="w-full text-[11px]">
                <thead>
                    <tr className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-400">
                        <th className="px-2.5 py-1.5 font-bold">File</th>
                        <th className="px-2.5 py-1.5 font-bold whitespace-nowrap">Caricato</th>
                        <th className="px-2.5 py-1.5 font-bold text-right">Size</th>
                        <th className="px-2.5 py-1.5 font-bold text-right">Fatture</th>
                        <th className="px-2.5 py-1.5 font-bold text-right">Stato</th>
                    </tr>
                </thead>
                <tbody>
                    {uploads.map((u) => (
                        <tr key={u.id} className="border-t border-slate-50">
                            <td className="px-2.5 py-1.5 max-w-[160px] truncate font-medium text-slate-800" title={u.fileName}>
                                {u.fileName}
                            </td>
                            <td className="px-2.5 py-1.5 whitespace-nowrap text-slate-500">
                                {formatItDateTime(u.uploadedAt)}
                            </td>
                            <td className="px-2.5 py-1.5 text-right font-mono text-slate-600">
                                {formatBytes(u.sizeBytes)}
                            </td>
                            <td className="px-2.5 py-1.5 text-right font-mono text-slate-700">
                                {u.invoiceCount}
                            </td>
                            <td className="px-2.5 py-1.5 text-right">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold">
                                    <CheckCircle2 size={11} />
                                    Caricato
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
