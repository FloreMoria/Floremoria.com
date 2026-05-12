'use client';

import { useCallback, useState } from 'react';
import { Copy, KeyRound, Plus, ShieldOff } from 'lucide-react';

export type PartnerOption = { id: string; shopName: string; uniqueCode: string | null };

export type CredentialRow = {
    id: string;
    label: string;
    publicId: string;
    isActive: boolean;
    createdAt: string;
    revokedAt: string | null;
    lastUsedAt: string | null;
    partner: { id: string; shopName: string; uniqueCode: string | null };
};

type Props = {
    partners: PartnerOption[];
    initialCredentials: CredentialRow[];
};

export default function PartnerApiCredentialsClient({ partners, initialCredentials }: Props) {
    const [rows, setRows] = useState<CredentialRow[]>(initialCredentials);
    const [creating, setCreating] = useState(false);
    const [partnerId, setPartnerId] = useState(partners[0]?.id ?? '');
    const [label, setLabel] = useState('');
    const [toast, setToast] = useState<string | null>(null);
    const [newSecret, setNewSecret] = useState<{ publicId: string; secret: string } | null>(null);

    const showToast = useCallback((msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3200);
    }, []);

    const copy = async (text: string, okMsg: string) => {
        try {
            await navigator.clipboard.writeText(text);
            showToast(okMsg);
        } catch {
            showToast('Copia non riuscita: seleziona il testo manualmente.');
        }
    };

    const createCredential = async () => {
        if (!partnerId) {
            showToast('Seleziona un partner.');
            return;
        }
        setCreating(true);
        try {
            const res = await fetch('/api/dashboard/partner-api-credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ partnerId, label: label.trim() || 'Credenziale API' }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Errore');
            setNewSecret({ publicId: data.publicId, secret: data.secret });
            setRows((prev) => [
                {
                    id: data.id,
                    label: data.label,
                    publicId: data.publicId,
                    isActive: true,
                    createdAt: new Date().toISOString(),
                    revokedAt: null,
                    lastUsedAt: null,
                    partner: data.partner,
                },
                ...prev,
            ]);
            setLabel('');
            showToast('Credenziale creata.');
        } catch (e) {
            console.error(e);
            showToast('Creazione fallita.');
        } finally {
            setCreating(false);
        }
    };

    const revoke = async (id: string) => {
        if (!confirm('Revocare questa credenziale? Le chiamate API con questa chiave smetteranno di funzionare.')) return;
        try {
            const res = await fetch(`/api/dashboard/partner-api-credentials/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'revoke' }),
            });
            if (!res.ok) throw new Error();
            setRows((prev) =>
                prev.map((r) =>
                    r.id === id
                        ? { ...r, isActive: false, revokedAt: new Date().toISOString() }
                        : r
                )
            );
            showToast('Credenziale revocata.');
        } catch {
            showToast('Revoca fallita.');
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8 fade-in">
            {toast && (
                <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
                    {toast}
                </div>
            )}

            <div>
                <h1 className="text-3xl font-display font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <KeyRound className="h-8 w-8 text-fm-gold" />
                    Credenziali API partner
                </h1>
                <p className="text-gray-600 max-w-3xl">
                    Genera coppie <strong className="text-gray-800">chiave pubblica</strong> +{' '}
                    <strong className="text-gray-800">segreto</strong> per l&apos;endpoint{' '}
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">POST /api/external/order-data</code> senza
                    configurare variabili su Vercel. Il segreto è visibile <strong>una sola volta</strong> alla creazione.
                </p>
            </div>

            {partners.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    Non ci sono partner in anagrafica. Crea prima un fiorista in{' '}
                    <strong>Fioristi</strong> e assegna un <strong>codice referral (uniqueCode)</strong>.
                </div>
            ) : null}

            <div className="rounded-2xl border border-stone-200 bg-[#FDFCF9] p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Nuova credenziale</h2>
                <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
                    <label className="flex flex-col gap-1 min-w-[200px] flex-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Partner</span>
                        <select
                            value={partnerId}
                            onChange={(e) => setPartnerId(e.target.value)}
                            disabled={partners.length === 0}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 disabled:opacity-50"
                        >
                            {partners.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.shopName}
                                    {p.uniqueCode ? ` — ${p.uniqueCode}` : ' (manca referral — imposta in Fioristi)'}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1 min-w-[200px] flex-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Etichetta interna</span>
                        <input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="es. Sito agenzia Rossi"
                            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={() => void createCredential()}
                        disabled={creating || !partnerId || partners.length === 0}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-fm-cta px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-fm-cta-hover disabled:opacity-50"
                    >
                        <Plus size={18} />
                        {creating ? 'Creazione…' : 'Genera credenziale'}
                    </button>
                </div>
            </div>

            {newSecret && (
                <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/90 p-6 shadow-sm">
                    <p className="font-semibold text-amber-950 mb-3">Copia ora — il segreto non sarà più recuperabile</p>
                    <div className="space-y-3 font-mono text-sm break-all">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <span className="text-amber-900/80 shrink-0">X-Florem-Api-Key</span>
                            <div className="flex items-center gap-2">
                                <code className="rounded bg-white px-2 py-1 text-gray-900 border">{newSecret.publicId}</code>
                                <button
                                    type="button"
                                    onClick={() => void copy(newSecret.publicId, 'Chiave pubblica copiata.')}
                                    className="rounded p-1.5 text-amber-900 hover:bg-amber-100"
                                    title="Copia"
                                >
                                    <Copy size={18} />
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <span className="text-amber-900/80 shrink-0">Authorization Bearer</span>
                            <div className="flex items-center gap-2 min-w-0">
                                <code className="rounded bg-white px-2 py-1 text-gray-900 border truncate max-w-[min(100%,28rem)]">
                                    {newSecret.secret}
                                </code>
                                <button
                                    type="button"
                                    onClick={() => void copy(newSecret.secret, 'Segreto copiato.')}
                                    className="rounded p-1.5 text-amber-900 hover:bg-amber-100 shrink-0"
                                    title="Copia"
                                >
                                    <Copy size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="mt-4 text-sm font-medium text-amber-900 underline"
                        onClick={() => setNewSecret(null)}
                    >
                        Ho salvato le credenziali, chiudi
                    </button>
                </div>
            )}

            <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-sm">
                <div className="border-b border-gray-100 px-6 py-4 bg-gray-50/80">
                    <h2 className="text-lg font-semibold text-gray-900">Credenziali esistenti</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
                                <th className="px-4 py-3">Etichetta</th>
                                <th className="px-4 py-3">Partner</th>
                                <th className="px-4 py-3">Public ID</th>
                                <th className="px-4 py-3">Stato</th>
                                <th className="px-4 py-3">Ultimo uso</th>
                                <th className="px-4 py-3 w-28"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                                        Nessuna credenziale. Generane una sopra.
                                    </td>
                                </tr>
                            ) : (
                                rows.map((r) => (
                                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                                        <td className="px-4 py-3 font-medium text-gray-900">{r.label}</td>
                                        <td className="px-4 py-3 text-gray-700">
                                            {r.partner.shopName}
                                            {r.partner.uniqueCode ? (
                                                <span className="ml-1 text-gray-400">({r.partner.uniqueCode})</span>
                                            ) : null}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2 font-mono text-xs">
                                                <span className="truncate max-w-[200px]">{r.publicId}</span>
                                                {r.isActive ? (
                                                    <button
                                                        type="button"
                                                        className="text-fm-gold hover:underline shrink-0"
                                                        onClick={() => void copy(r.publicId, 'Public ID copiato.')}
                                                    >
                                                        Copia
                                                    </button>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {r.isActive ? (
                                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                                                    Attiva
                                                </span>
                                            ) : (
                                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                                                    Revocata
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 text-xs">
                                            {r.lastUsedAt
                                                ? new Date(r.lastUsedAt).toLocaleString('it-IT')
                                                : '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            {r.isActive ? (
                                                <button
                                                    type="button"
                                                    onClick={() => void revoke(r.id)}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                                                >
                                                    <ShieldOff size={14} />
                                                    Revoca
                                                </button>
                                            ) : (
                                                <span className="text-xs text-gray-400">
                                                    {r.revokedAt
                                                        ? new Date(r.revokedAt).toLocaleDateString('it-IT')
                                                        : ''}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-700">
                <p className="font-semibold text-gray-900 mb-2">Esempio richiesta (server del partner)</p>
                <pre className="overflow-x-auto text-xs leading-relaxed text-gray-800">
{`curl -X POST "https://tuodominio.it/api/external/order-data" \\
  -H "X-Florem-Api-Key: ${newSecret?.publicId ?? 'fmp_…'}" \\
  -H "Authorization: Bearer ${newSecret?.secret ?? 'fms_…'}" \\
  -H "Content-Type: application/json" \\
  -d '{"nomeDefunto":"…","cognomeDefunto":"…","codiceReferral":"${partners.find((p) => p.id === partnerId)?.uniqueCode ?? 'CODICE'}"…}'`}
                </pre>
                <p className="mt-3 text-xs text-gray-600">
                    Il <code>codiceReferral</code> nel JSON deve coincidere con il <strong>uniqueCode</strong> del partner scelto sopra.
                </p>
            </div>

            <p className="text-xs text-gray-500">
                Documentazione tecnica nel file <code className="rounded bg-gray-100 px-1">docs/PARTNER_HANDOFF.md</code> del repository.
            </p>
        </div>
    );
}
