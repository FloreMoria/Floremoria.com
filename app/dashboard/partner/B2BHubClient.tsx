'use client';

import { useMemo, useState, useCallback } from 'react';
import { PartnerType } from '@prisma/client';
import { Copy, KeyRound, RefreshCw, ShieldOff, Building2, Store, Flower2 } from 'lucide-react';

export type HubCredential = {
    id: string;
    label: string;
    publicId: string;
    environment: 'TEST' | 'LIVE';
    isActive: boolean;
    createdAt: string;
    revokedAt: string | null;
    regeneratedAt: string | null;
    lastUsedAt: string | null;
    partnerId: string;
};

export type HubPartner = {
    id: string;
    shopName: string;
    ownerName: string;
    uniqueCode: string | null;
    partnerType: PartnerType;
    isActive: boolean;
    masterPartnerId: string | null;
    masterPartnerName: string | null;
    commissionPercentInclusive: number | null;
    stripeConnectAccountId: string | null;
    stripeConnectChargesEnabled: boolean | null;
    stripeConnectPayoutsEnabled: boolean | null;
    stripeConnectVerifiedAt: string | null;
    agencyOrderCount: number;
    agencyOrderValueCents: number;
    lastAgencyOrderAt: string | null;
    feeMonth: {
        yearMonth: string;
        maturedCents: number;
        status: string;
        invoiceCents: number | null;
        connectCents: number | null;
    } | null;
    credentials: HubCredential[];
};

type Props = {
    masters: HubPartner[];
    agencies: HubPartner[];
    florists: HubPartner[];
};

function euro(cents: number | null | undefined): string {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format((cents ?? 0) / 100);
}

function credStatus(creds: HubCredential[]): string {
    const live = creds.filter((c) => c.environment === 'LIVE' && c.isActive);
    const test = creds.filter((c) => c.environment === 'TEST' && c.isActive);
    if (live.length) return 'attive (live)';
    if (test.length) return 'attive (solo test)';
    if (creds.some((c) => c.revokedAt)) return 'revocate';
    return 'da generare';
}

export default function B2BHubClient({ masters, agencies, florists }: Props) {
    const [toast, setToast] = useState<string | null>(null);
    const [oneShot, setOneShot] = useState<{ publicId: string; secret: string; partnerName: string } | null>(
        null
    );
    const [busy, setBusy] = useState<string | null>(null);
    const [feeDraft, setFeeDraft] = useState<Record<string, string>>({});

    const showToast = useCallback((msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3500);
    }, []);

    const copy = async (text: string, ok: string) => {
        try {
            await navigator.clipboard.writeText(text);
            showToast(ok);
        } catch {
            showToast('Copia fallita');
        }
    };

    const createCred = async (partnerId: string, environment: 'TEST' | 'LIVE', partnerName: string) => {
        setBusy(`${partnerId}-${environment}`);
        try {
            const res = await fetch('/api/dashboard/partner-api-credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    partnerId,
                    environment,
                    label: `${partnerName} ${environment}`,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                showToast(data.error || 'Creazione fallita');
                return;
            }
            setOneShot({ publicId: data.publicId, secret: data.secret, partnerName });
            showToast('Credenziale creata — copia il segreto ora');
        } finally {
            setBusy(null);
        }
    };

    const regenerate = async (credId: string, partnerName: string) => {
        setBusy(credId);
        try {
            const res = await fetch(`/api/dashboard/partner-api-credentials/${credId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'regenerate' }),
            });
            const data = await res.json();
            if (!res.ok) {
                showToast(data.error || 'Rigenerazione fallita');
                return;
            }
            setOneShot({ publicId: data.publicId, secret: data.secret, partnerName });
            showToast('Precedente invalidata — copia il nuovo segreto');
        } finally {
            setBusy(null);
        }
    };

    const revoke = async (credId: string) => {
        setBusy(credId);
        try {
            const res = await fetch(`/api/dashboard/partner-api-credentials/${credId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'revoke' }),
            });
            if (!res.ok) {
                const data = await res.json();
                showToast(data.error || 'Revoca fallita');
                return;
            }
            showToast('Credenziale revocata');
            window.location.reload();
        } finally {
            setBusy(null);
        }
    };

    const saveFee = async (partnerId: string) => {
        const raw = feeDraft[partnerId];
        if (raw == null) return;
        setBusy(`fee-${partnerId}`);
        try {
            const res = await fetch(`/api/dashboard/partners/${partnerId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ commissionPercentInclusive: Number(raw) }),
            });
            if (!res.ok) {
                showToast('Salvataggio fee fallito');
                return;
            }
            showToast('Percentuale fee aggiornata');
            window.location.reload();
        } finally {
            setBusy(null);
        }
    };

    const Section = ({
        title,
        icon,
        children,
    }: {
        title: string;
        icon: React.ReactNode;
        children: React.ReactNode;
    }) => (
        <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
                {icon}
                <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
            </div>
            <div className="space-y-4">{children}</div>
        </section>
    );

    const CredBlock = ({ p }: { p: HubPartner }) => {
        const active = p.credentials.filter((c) => c.isActive);
        const lastRegen = p.credentials
            .map((c) => c.regeneratedAt || c.createdAt)
            .sort()
            .reverse()[0];
        return (
            <div className="mt-3 border-t border-gray-100 pt-3">
                <div className="text-sm text-gray-600 mb-2">
                    Credenziali: <strong>{credStatus(p.credentials)}</strong>
                    {lastRegen ? ` · ultima: ${new Date(lastRegen).toLocaleString('it-IT')}` : null}
                </div>
                <ul className="space-y-2 text-sm">
                    {active.map((c) => (
                        <li key={c.id} className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs bg-gray-50 px-2 py-1 rounded border">
                                {c.publicId}
                            </span>
                            <span className="text-xs uppercase tracking-wide text-gray-500">{c.environment}</span>
                            <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs text-gray-700 hover:underline"
                                onClick={() => copy(c.publicId, 'Chiave pubblica copiata')}
                            >
                                <Copy className="w-3 h-3" /> copia
                            </button>
                            <button
                                type="button"
                                disabled={busy === c.id}
                                className="inline-flex items-center gap-1 text-xs text-amber-800 hover:underline"
                                onClick={() => regenerate(c.id, p.shopName)}
                            >
                                <RefreshCw className="w-3 h-3" /> rigenera
                            </button>
                            <button
                                type="button"
                                disabled={busy === c.id}
                                className="inline-flex items-center gap-1 text-xs text-red-700 hover:underline"
                                onClick={() => revoke(c.id)}
                            >
                                <ShieldOff className="w-3 h-3" /> revoca
                            </button>
                        </li>
                    ))}
                </ul>
                <p className="text-xs text-gray-500 mt-2">Il segreto non è mai visibile dopo la creazione.</p>
                <div className="flex gap-2 mt-2">
                    <button
                        type="button"
                        disabled={busy === `${p.id}-TEST`}
                        onClick={() => createCred(p.id, 'TEST', p.shopName)}
                        className="text-xs px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50"
                    >
                        Genera TEST
                    </button>
                    <button
                        type="button"
                        disabled={busy === `${p.id}-LIVE`}
                        onClick={() => createCred(p.id, 'LIVE', p.shopName)}
                        className="text-xs px-3 py-1.5 rounded bg-gray-900 text-white hover:bg-gray-800 inline-flex items-center gap-1"
                    >
                        <KeyRound className="w-3 h-3" /> Genera LIVE
                    </button>
                </div>
            </div>
        );
    };

    const masterNameById = useMemo(() => {
        const m = new Map<string, string>();
        for (const x of masters) m.set(x.id, x.shopName);
        return m;
    }, [masters]);

    return (
        <div>
            {toast && (
                <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded shadow">
                    {toast}
                </div>
            )}

            {oneShot && (
                <div className="mb-8 rounded-lg border border-amber-300 bg-amber-50 p-4">
                    <h3 className="font-semibold text-amber-950 mb-1">Segreto one-shot — {oneShot.partnerName}</h3>
                    <p className="text-sm text-amber-900 mb-3">
                        Mostrato una sola volta. Copialo ora: non sarà più recuperabile (solo rigenerazione).
                    </p>
                    <div className="space-y-2 font-mono text-sm">
                        <div className="flex items-center gap-2">
                            <span className="text-gray-600 w-24">public</span>
                            <code className="bg-white border px-2 py-1 rounded flex-1 break-all">{oneShot.publicId}</code>
                            <button type="button" onClick={() => copy(oneShot.publicId, 'Public id copiato')}>
                                <Copy className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-gray-600 w-24">secret</span>
                            <code className="bg-white border px-2 py-1 rounded flex-1 break-all">{oneShot.secret}</code>
                            <button type="button" onClick={() => copy(oneShot.secret, 'Segreto copiato')}>
                                <Copy className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="mt-3 text-xs underline text-amber-900"
                        onClick={() => {
                            setOneShot(null);
                            window.location.reload();
                        }}
                    >
                        Ho copiato — chiudi e aggiorna elenco
                    </button>
                </div>
            )}

            <Section title="Master partner (aggregatori)" icon={<Building2 className="w-5 h-5 text-gray-700" />}>
                {masters.length === 0 && <p className="text-sm text-gray-500">Nessun master.</p>}
                {masters.map((p) => (
                    <article key={p.id} className="rounded-lg border border-gray-200 bg-white p-4">
                        <div className="flex flex-wrap justify-between gap-2">
                            <div>
                                <h3 className="font-semibold text-gray-900">{p.shopName}</h3>
                                <p className="text-sm text-gray-500">{p.uniqueCode}</p>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded ${p.isActive ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>
                                {p.isActive ? 'attivo' : 'disattivo'}
                            </span>
                        </div>
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                            <label className="block">
                                <span className="text-gray-500">Fee % IVA inclusa</span>
                                <div className="flex gap-2 mt-1">
                                    <input
                                        className="border rounded px-2 py-1 w-24"
                                        defaultValue={String(p.commissionPercentInclusive ?? '')}
                                        onChange={(e) =>
                                            setFeeDraft((prev) => ({ ...prev, [p.id]: e.target.value }))
                                        }
                                    />
                                    <button
                                        type="button"
                                        className="text-xs border px-2 rounded"
                                        onClick={() => saveFee(p.id)}
                                    >
                                        Salva
                                    </button>
                                </div>
                            </label>
                            <div>
                                <div className="text-gray-500">Stripe Connect</div>
                                <div className="mt-1">
                                    {p.stripeConnectAccountId
                                        ? `${p.stripeConnectAccountId} · charges=${String(p.stripeConnectChargesEnabled)} · payouts=${String(p.stripeConnectPayoutsEnabled)}`
                                        : 'non collegato'}
                                </div>
                            </div>
                            <div>
                                <div className="text-gray-500">Fee mese {p.feeMonth?.yearMonth || '—'}</div>
                                <div className="mt-1">
                                    maturato {euro(p.feeMonth?.maturedCents)} · fattura{' '}
                                    {p.feeMonth?.invoiceCents == null ? '—' : euro(p.feeMonth.invoiceCents)} ·
                                    stato <strong>{p.feeMonth?.status || 'ATTESA'}</strong>
                                </div>
                            </div>
                        </div>
                        <CredBlock p={p} />
                    </article>
                ))}
            </Section>

            <Section title="Agenzie di onoranze funebri" icon={<Store className="w-5 h-5 text-gray-700" />}>
                {agencies.length === 0 && <p className="text-sm text-gray-500">Nessuna agenzia.</p>}
                {agencies.map((p) => (
                    <article key={p.id} className="rounded-lg border border-gray-200 bg-white p-4">
                        <div className="flex flex-wrap justify-between gap-2">
                            <div>
                                <h3 className="font-semibold text-gray-900">{p.shopName}</h3>
                                <p className="text-sm text-gray-500">
                                    {p.uniqueCode} · master:{' '}
                                    {p.masterPartnerName ||
                                        (p.masterPartnerId ? masterNameById.get(p.masterPartnerId) : null) ||
                                        '— (diretta)'}
                                </p>
                            </div>
                        </div>
                        <div className="mt-2 text-sm text-gray-700">
                            Ordini portati: <strong>{p.agencyOrderCount}</strong> · valore{' '}
                            <strong>{euro(p.agencyOrderValueCents)}</strong>
                            {p.lastAgencyOrderAt
                                ? ` · ultimo ${new Date(p.lastAgencyOrderAt).toLocaleDateString('it-IT')}`
                                : ''}
                        </div>
                        <CredBlock p={p} />
                    </article>
                ))}
            </Section>

            <Section title="Fioristi (esecutori — non canale acquisizione)" icon={<Flower2 className="w-5 h-5 text-gray-700" />}>
                <p className="text-sm text-gray-500 mb-2">
                    Categoria distinta: consegna e compensazione fiorista. Nessuna credenziale API B2B qui.
                </p>
                <div className="overflow-x-auto rounded border border-gray-200 bg-white">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-left text-gray-600">
                            <tr>
                                <th className="px-3 py-2">Negozio</th>
                                <th className="px-3 py-2">Codice</th>
                                <th className="px-3 py-2">Stato</th>
                            </tr>
                        </thead>
                        <tbody>
                            {florists.map((p) => (
                                <tr key={p.id} className="border-t border-gray-100">
                                    <td className="px-3 py-2">{p.shopName}</td>
                                    <td className="px-3 py-2 font-mono text-xs">{p.uniqueCode}</td>
                                    <td className="px-3 py-2">{p.isActive ? 'attivo' : 'disattivo'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Section>
        </div>
    );
}
