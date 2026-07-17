'use client';

import { useState, useCallback } from 'react';
import { Partner, PaymentStatus } from '@prisma/client';
import { 
    Building2, UserCircle2, X, Check, Globe, MessageCircle, Mail, 
    FileText, CreditCard, Filter, Star, Edit2, ShieldAlert, KeyRound, 
    Plus, Copy, ShieldOff, Eye, ArrowUpRight 
} from 'lucide-react';
import Link from 'next/link';

export type ExtendedPartner = Partner & { orders?: any[] };
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

interface Props {
    initialPartners: ExtendedPartner[];
    initialCredentials: CredentialRow[];
}

export default function ClientB2BPartnersTable({ initialPartners, initialCredentials }: Props) {
    const [partners, setPartners] = useState<ExtendedPartner[]>(initialPartners);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [activeTab, setActiveTab] = useState<'PARTNERS' | 'CREDENTIALS'>('PARTNERS');

    // API credentials state
    const [creds, setCreds] = useState<CredentialRow[]>(initialCredentials);
    const [creatingCred, setCreatingCred] = useState(false);
    const [credPartnerId, setCredPartnerId] = useState(partners[0]?.id ?? '');
    const [credLabel, setCredLabel] = useState('');
    const [toast, setToast] = useState<string | null>(null);
    const [newSecret, setNewSecret] = useState<{ publicId: string; secret: string } | null>(null);

    // Filters state
    const [filterSearch, setFilterSearch] = useState('');

    const [formData, setFormData] = useState<ExtendedPartner>({
        id: '',
        shopName: '',
        ownerName: '',
        uniqueCode: '',
        province: 'RM', // Default for referral code generation if empty
        coverageArea: '',
        whatsappNumber: '',
        address: '',
        iban: '',
        vatNumber: '',
        taxCode: '',
        sdiCode: '',
        pecAddress: '',
        email: '',
        activeOrders: 0,
        adminRating: 5.0,
        internalNotes: '',
        isActive: true,
        isB2B: true,
        paymentStatus: 'UNPAID',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        userId: null,
        orders: [],
    });

    const showToast = useCallback((msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3200);
    }, []);

    const copyToClipboard = async (text: string, okMsg: string) => {
        try {
            await navigator.clipboard.writeText(text);
            showToast(okMsg);
        } catch {
            showToast('Copia fallita, seleziona il testo manualmente.');
        }
    };

    const openDrawer = (partner?: ExtendedPartner) => {
        if (partner) {
            setFormData(partner);
        } else {
            setFormData({
                id: '',
                shopName: '',
                ownerName: '',
                uniqueCode: '',
                province: 'RM',
                coverageArea: '',
                whatsappNumber: '',
                address: '',
                iban: '',
                vatNumber: '',
                taxCode: '',
                sdiCode: '',
                pecAddress: '',
                email: '',
                activeOrders: 0,
                adminRating: 5.0,
                internalNotes: '',
                isActive: true,
                isB2B: true,
                paymentStatus: 'UNPAID',
                createdAt: new Date(),
                updatedAt: new Date(),
                deletedAt: null,
                userId: null,
                orders: [],
            });
        }
        setIsDrawerOpen(true);
    };

    const closeDrawer = () => setIsDrawerOpen(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const isUpdate = formData.id !== '';
        const url = isUpdate ? `/api/dashboard/partners/${formData.id}` : '/api/dashboard/partners';
        const method = isUpdate ? 'PUT' : 'POST';

        try {
            const submitData = { ...formData, isB2B: true };
            if (!isUpdate) delete (submitData as any).id;

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(submitData)
            });

            if (res.ok) {
                const savedItem = await res.json();
                if (isUpdate) {
                    setPartners((prev) => prev.map(p => p.id === savedItem.id ? savedItem : p));
                } else {
                    setPartners((prev) => [savedItem, ...prev]);
                    setFormData((prev) => ({ ...prev, id: savedItem.id }));
                }
                setIsSuccess(true);
                setTimeout(() => {
                    setIsSuccess(false);
                    closeDrawer();
                }, 1500);
            } else {
                alert('Errore di salvataggio del Partner B2B.');
            }
        } catch (e) {
            alert('Errore di rete. Controllare la connessione.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleInlineState = async (partner: Partner, e: React.MouseEvent) => {
        e.stopPropagation();
        const newActiveState = !partner.isActive;
        setPartners((prev) => prev.map(p => p.id === partner.id ? { ...p, isActive: newActiveState } : p));

        try {
            await fetch(`/api/dashboard/partners/${partner.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: newActiveState })
            });
        } catch {
            setPartners((prev) => prev.map(p => p.id === partner.id ? { ...p, isActive: !newActiveState } : p));
        }
    };

    const createCredential = async () => {
        if (!credPartnerId) {
            showToast('Seleziona un partner.');
            return;
        }
        setCreatingCred(true);
        try {
            const res = await fetch('/api/dashboard/partner-api-credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ partnerId: credPartnerId, label: credLabel.trim() || 'Credenziale API B2B' }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Errore');
            setNewSecret({ publicId: data.publicId, secret: data.secret });
            setCreds((prev) => [
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
            setCredLabel('');
            showToast('Credenziale B2B generata.');
        } catch (e) {
            console.error(e);
            showToast('Generazione fallita.');
        } finally {
            setCreatingCred(false);
        }
    };

    const revokeCredential = async (id: string) => {
        if (!confirm('Revocare questa credenziale? Le chiamate API con questa chiave smetteranno immediatamente di funzionare.')) return;
        try {
            const res = await fetch(`/api/dashboard/partner-api-credentials/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'revoke' }),
            });
            if (!res.ok) throw new Error();
            setCreds((prev) =>
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

    const filteredPartners = partners.filter(p => 
        p.shopName.toLowerCase().includes(filterSearch.toLowerCase()) || 
        p.ownerName.toLowerCase().includes(filterSearch.toLowerCase()) ||
        (p.uniqueCode || '').toLowerCase().includes(filterSearch.toLowerCase())
    );

    return (
        <div className="space-y-6">
            {toast && (
                <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-gray-900 px-5 py-3 text-sm text-white shadow-xl animate-in fade-in slide-in-from-bottom-2">
                    {toast}
                </div>
            )}

            {/* Unified Hub Navigation Tabs */}
            <div className="flex border-b border-gray-200 uppercase tracking-widest text-xs font-bold gap-6 pb-px">
                <button 
                    onClick={() => setActiveTab('PARTNERS')} 
                    className={`pb-3 border-b-2 font-display transition-colors ${activeTab === 'PARTNERS' ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-gray-700'}`}
                >
                    Anagrafica Partner ({partners.length})
                </button>
                <button 
                    onClick={() => setActiveTab('CREDENTIALS')} 
                    className={`pb-3 border-b-2 font-display transition-colors ${activeTab === 'CREDENTIALS' ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-gray-700'}`}
                >
                    Credenziali API ({creds.length})
                </button>
            </div>

            {/* VIEW: ANAGRAFICA PARTNER */}
            {activeTab === 'PARTNERS' && (
                <div className="space-y-4">
                    {/* Action Bar */}
                    <div className="flex justify-between items-center">
                        <div className="relative w-72">
                            <input 
                                type="text" 
                                placeholder="Cerca partner per nome o codice..." 
                                value={filterSearch} 
                                onChange={e => setFilterSearch(e.target.value)} 
                                className="w-full border-gray-200 rounded-full text-xs py-2 px-4 outline-none focus:ring-2 focus:ring-black bg-white shadow-sm"
                            />
                        </div>
                        <button
                            onClick={() => openDrawer()}
                            className="flex items-center gap-2 bg-black text-white px-5 py-2 rounded-full text-xs font-semibold tracking-wide shadow-md hover:scale-105 transition-all"
                        >
                            <Building2 size={14} /> Registra Partner B2B
                        </button>
                    </div>

                    {/* Table */}
                    <div className="bg-white border text-left border-gray-200 rounded-3xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto w-full custom-scrollbar">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50/50 border-b border-gray-100 text-gray-500">
                                        <th className="font-semibold py-4 px-6 uppercase text-[11px] tracking-wider">Codice Referral</th>
                                        <th className="font-semibold py-4 px-6 uppercase text-[11px] tracking-wider">Ragione Sociale / Nome</th>
                                        <th className="font-semibold py-4 px-6 uppercase text-[11px] tracking-wider">Referente</th>
                                        <th className="font-semibold py-4 px-6 uppercase text-[11px] tracking-wider">Dati Fiscali</th>
                                        <th className="font-semibold py-4 px-6 uppercase text-[11px] tracking-wider text-center">Ordini Ricevuti</th>
                                        <th className="font-semibold py-4 px-6 uppercase text-[11px] tracking-wider text-center">Stato</th>
                                        <th className="font-semibold py-4 px-6 uppercase text-[11px] tracking-wider text-right w-24">Azioni</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredPartners.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="p-8 text-center text-gray-400 font-medium">
                                                Nessun partner commerciale B2B trovato. Clicca "Registra Partner B2B".
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredPartners.map(partner => (
                                            <tr key={partner.id} onClick={() => openDrawer(partner)} className="hover:bg-gray-50/50 transition-colors group cursor-pointer border-b border-dashed border-gray-100 last:border-0">
                                                <td className="py-4 px-6">
                                                    <div className="font-mono text-xs font-bold bg-gray-100 px-3 py-1.5 rounded-lg text-gray-700 whitespace-nowrap inline-block">
                                                        {partner.uniqueCode || '—'}
                                                    </div>
                                                </td>
                                                <td className="py-4 px-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center shrink-0">
                                                            <Globe size={18} className="text-stone-500" />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <div className="font-bold text-gray-900 text-sm">{partner.shopName}</div>
                                                            {partner.pecAddress && (
                                                                <div className="text-[11px] text-gray-400 font-mono">{partner.pecAddress}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-6">
                                                    <div className="font-medium text-gray-800">{partner.ownerName}</div>
                                                </td>
                                                <td className="py-4 px-6 text-xs text-gray-500 space-y-0.5">
                                                    {partner.vatNumber && <div><span className="font-semibold">P.IVA:</span> {partner.vatNumber}</div>}
                                                    {partner.taxCode && <div><span className="font-semibold">CF:</span> {partner.taxCode}</div>}
                                                    {partner.sdiCode && <div><span className="font-semibold">SDI:</span> {partner.sdiCode}</div>}
                                                </td>
                                                <td className="py-4 px-6 text-center">
                                                    <div className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-stone-100 text-stone-700 font-bold border border-stone-200 text-xs">
                                                        {(partner.orders || []).length} ordini
                                                    </div>
                                                </td>
                                                <td className="py-4 px-6 text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={(e) => toggleInlineState(partner, e)}
                                                            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${partner.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`}
                                                            role="switch"
                                                            aria-checked={partner.isActive}
                                                        >
                                                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${partner.isActive ? 'translate-x-4' : 'translate-x-0'}`} />
                                                        </button>
                                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${partner.isActive ? 'text-emerald-600' : 'text-gray-400'}`}>
                                                            {partner.isActive ? 'Attivo' : 'Sospeso'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-6 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button onClick={(e) => { e.stopPropagation(); openDrawer(partner); }} className="p-2 text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-colors">
                                                            <Edit2 size={15} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* VIEW: CREDENZIALI API PARTNER */}
            {activeTab === 'CREDENTIALS' && (
                <div className="space-y-6">
                    {/* Generatore Credenziali */}
                    <div className="rounded-3xl border border-stone-200 bg-[#FDFCF9] p-6 shadow-sm">
                        <h2 className="text-md font-bold text-gray-900 mb-2 flex items-center gap-2">
                            <KeyRound className="h-5 w-5 text-fm-gold" /> Nuova Coppia Chiavi API B2B
                        </h2>
                        <p className="text-xs text-gray-500 mb-6">
                            Genera chiavi di autenticazione per consentire l'inoltro automatico degli ordini dai gestionali esterni partner.
                        </p>
                        
                        <div className="flex flex-col gap-4 md:flex-row md:items-end">
                            <label className="flex flex-col gap-1.5 flex-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Partner B2B Abbinato</span>
                                <select
                                    value={credPartnerId}
                                    onChange={(e) => setCredPartnerId(e.target.value)}
                                    disabled={partners.length === 0}
                                    className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs text-gray-900 disabled:opacity-50 outline-none focus:ring-2 focus:ring-black"
                                >
                                    <option value="">Seleziona Partner...</option>
                                    {partners.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.shopName} {p.uniqueCode ? `(${p.uniqueCode})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            
                            <label className="flex flex-col gap-1.5 flex-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Etichetta Descrittiva</span>
                                <input
                                    value={credLabel}
                                    onChange={(e) => setCredLabel(e.target.value)}
                                    placeholder="Es. Endpoint Integrazione Principale"
                                    className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs text-gray-900 outline-none focus:ring-2 focus:ring-black"
                                />
                            </label>
                            
                            <button
                                type="button"
                                onClick={() => void createCredential()}
                                disabled={creatingCred || !credPartnerId || partners.length === 0}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-black text-white px-5 py-2.5 text-xs font-semibold hover:bg-stone-800 disabled:opacity-50 h-[38px] transition-colors"
                            >
                                <Plus size={16} />
                                {creatingCred ? 'Generazione...' : 'Genera Credenziali'}
                            </button>
                        </div>
                    </div>

                    {/* Mostra Segreto Appena Generato */}
                    {newSecret && (
                        <div className="rounded-3xl border-2 border-amber-300 bg-amber-50/80 p-6 shadow-sm animate-in zoom-in-95">
                            <p className="font-bold text-amber-950 mb-2 flex items-center gap-2">
                                <ShieldAlert className="text-amber-600 shrink-0" size={18} /> Copia ora le credenziali B2B
                            </p>
                            <p className="text-xs text-amber-900/80 mb-4">
                                Per motivi di sicurezza crittografica, il segreto non sarà mai più mostrato o recuperabile.
                            </p>
                            <div className="space-y-3 font-mono text-xs break-all">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between bg-white/60 p-3 rounded-xl border border-amber-100">
                                    <span className="text-amber-900 font-bold shrink-0">X-Partner-Key</span>
                                    <div className="flex items-center gap-2">
                                        <code className="text-gray-900 font-bold">{newSecret.publicId}</code>
                                        <button
                                            type="button"
                                            onClick={() => void copyToClipboard(newSecret.publicId, 'X-Partner-Key copiata.')}
                                            className="rounded p-1 hover:bg-amber-100 text-amber-900"
                                            title="Copia"
                                        >
                                            <Copy size={16} />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between bg-white/60 p-3 rounded-xl border border-amber-100">
                                    <span className="text-amber-900 font-bold shrink-0">Authorization Bearer</span>
                                    <div className="flex items-center gap-2">
                                        <code className="text-gray-900 font-bold">{newSecret.secret}</code>
                                        <button
                                            type="button"
                                            onClick={() => void copyToClipboard(newSecret.secret, 'Bearer Token copiato.')}
                                            className="rounded p-1 hover:bg-amber-100 text-amber-900"
                                            title="Copia"
                                        >
                                            <Copy size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="mt-4 text-xs font-bold text-amber-950 underline"
                                onClick={() => setNewSecret(null)}
                            >
                                Ho custodito le credenziali, chiudi questo box
                            </button>
                        </div>
                    )}

                    {/* Tabella Credenziali Esistenti */}
                    <div className="rounded-3xl border border-stone-200 bg-white overflow-hidden shadow-sm">
                        <div className="border-b border-gray-100 px-6 py-4 bg-gray-50/80">
                            <h2 className="text-sm font-bold text-gray-900">Chiavi API B2B Autorizzate</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                        <th className="px-6 py-3.5">Etichetta</th>
                                        <th className="px-6 py-3.5">Partner Commerciale</th>
                                        <th className="px-6 py-3.5">Public ID (X-Partner-Key)</th>
                                        <th className="px-6 py-3.5">Stato</th>
                                        <th className="px-6 py-3.5">Ultimo Impiego</th>
                                        <th className="px-6 py-3.5 w-28">Azioni</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {creds.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-8 text-center text-gray-400 font-medium">
                                                Nessuna credenziale API attiva. Generane una nel pannello superiore.
                                            </td>
                                        </tr>
                                    ) : (
                                        creds.map((r) => (
                                            <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/30">
                                                <td className="px-6 py-4 font-semibold text-gray-900">{r.label}</td>
                                                <td className="px-6 py-4 text-gray-700 font-medium">
                                                    {r.partner.shopName}
                                                    {r.partner.uniqueCode ? (
                                                        <span className="ml-1.5 text-xs text-gray-400 font-mono">({r.partner.uniqueCode})</span>
                                                    ) : null}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2 font-mono text-xs">
                                                        <span className="font-bold">{r.publicId}</span>
                                                        {r.isActive && (
                                                            <button
                                                                type="button"
                                                                className="text-stone-400 hover:text-black shrink-0"
                                                                onClick={() => void copyToClipboard(r.publicId, 'Chiave copiata.')}
                                                                title="Copia Chiave"
                                                            >
                                                                <Copy size={13} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {r.isActive ? (
                                                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 border border-emerald-100">
                                                            Attiva
                                                        </span>
                                                    ) : (
                                                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 border border-gray-200">
                                                            Revocata
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-gray-500 text-xs">
                                                    {r.lastUsedAt
                                                        ? new Date(r.lastUsedAt).toLocaleString('it-IT')
                                                        : 'Mai utilizzata'}
                                                </td>
                                                <td className="px-6 py-4">
                                                    {r.isActive ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => void revokeCredential(r.id)}
                                                            className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-white px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 hover:border-red-300 transition-colors"
                                                        >
                                                            <ShieldOff size={13} />
                                                            Revoca
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-gray-400 font-medium">
                                                            Revocata il {r.revokedAt ? new Date(r.revokedAt).toLocaleDateString('it-IT') : ''}
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
                </div>
            )}

            {/* OVERLAY BACKDROP FOR DETAIL DRAWER */}
            {isDrawerOpen && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-40 transition-opacity" onClick={closeDrawer} />
            )}

            {/* DETAIL DRAWER FOR PARTNER FORM */}
            <div className={`fixed top-14 right-0 w-[45vw] h-[calc(100vh-3.5rem)] bg-white shadow-2xl z-50 overflow-y-auto transform transition-transform duration-300 ease-in-out border-l border-gray-200 flex flex-col ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-stone-50/50 shrink-0">
                    <div>
                        <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">
                            {formData.id ? `Anagrafica Partner / ${formData.uniqueCode || 'B2B'}` : 'Nuovo Partner Commerciale'}
                        </div>
                        <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
                            <Building2 size={18} className="text-fm-gold" /> {formData.shopName || 'Dettagli Partner'}
                        </h2>
                    </div>

                    <div className="flex items-center gap-2.5">
                        <button
                            type="submit"
                            form="b2bPartnerForm"
                            disabled={isSubmitting || isSuccess}
                            className={`!bg-black !text-white !font-bold py-2 px-5 rounded-full transition-all text-xs flex items-center gap-2 shadow-sm hover:bg-stone-850 ${isSubmitting ? 'opacity-70 cursor-wait' : ''}`}
                        >
                            {isSubmitting ? 'Salvataggio...' : isSuccess ? 'Salvato!' : 'Salva'}
                        </button>
                        <button type="button" onClick={closeDrawer} className="p-2 bg-stone-100 rounded-full text-stone-500 hover:text-black hover:bg-stone-200 transition-colors">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Form */}
                <form id="b2bPartnerForm" onSubmit={handleSubmit} className="flex-1 p-6 space-y-6 overflow-y-auto bg-stone-50/20 text-xs">
                    
                    {/* Anagrafica Base */}
                    <div className="space-y-4">
                        <h3 className="font-bold text-gray-800 uppercase tracking-wide border-b pb-1.5 flex items-center gap-1.5">
                            <UserCircle2 size={14} className="text-gray-400" /> Profilo Aziendale B2B
                        </h3>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Ragione Sociale</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.shopName || ''}
                                    onChange={e => setFormData({ ...formData, shopName: e.target.value })}
                                    placeholder="Es. Annunci Funebri S.r.l."
                                    className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black text-sm font-semibold"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Referente Tecnico / Account</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.ownerName || ''}
                                    onChange={e => setFormData({ ...formData, ownerName: e.target.value })}
                                    placeholder="Es. Mario Rossi"
                                    className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black text-sm"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Codice Referral (uniqueCode)</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.uniqueCode || ''}
                                    onChange={e => setFormData({ ...formData, uniqueCode: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                                    placeholder="Es. annunci_funebri"
                                    className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black text-sm font-mono font-bold"
                                />
                                <p className="mt-1 text-[9px] text-gray-400 font-medium">Codice identificativo univoco passato tramite API o handoff.</p>
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">PEC Aziendale</label>
                                <input
                                    type="email"
                                    value={formData.pecAddress || ''}
                                    onChange={e => setFormData({ ...formData, pecAddress: e.target.value })}
                                    placeholder="Es. amministrazione@pec.it"
                                    className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Dati Fiscali */}
                    <div className="space-y-4 bg-stone-100/50 p-4 rounded-2xl border border-stone-200/50">
                        <h3 className="font-bold text-stone-800 uppercase tracking-wide border-b border-stone-200 pb-1.5 flex items-center gap-1.5">
                            <FileText size={14} className="text-stone-500" /> Fatturazione Elettronica
                        </h3>

                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Partita IVA</label>
                                <input
                                    type="text"
                                    maxLength={11}
                                    value={formData.vatNumber || ''}
                                    onChange={e => setFormData({ ...formData, vatNumber: e.target.value.replace(/\D/g, '') })}
                                    placeholder="Es. 01234567890"
                                    className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black font-mono text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Codice SDI</label>
                                <input
                                    type="text"
                                    maxLength={7}
                                    value={formData.sdiCode || ''}
                                    onChange={e => setFormData({ ...formData, sdiCode: e.target.value.toUpperCase() })}
                                    placeholder="Es. M5UXCR1"
                                    className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black font-mono text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Codice Fiscale</label>
                                <input
                                    type="text"
                                    maxLength={16}
                                    value={formData.taxCode || ''}
                                    onChange={e => setFormData({ ...formData, taxCode: e.target.value.toUpperCase() })}
                                    placeholder="Codice Fiscale Società"
                                    className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black font-mono text-sm uppercase"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Note Interne */}
                    <div className="space-y-4">
                        <h3 className="font-bold text-gray-800 uppercase tracking-wide border-b pb-1.5">
                            Annotazioni Interne
                        </h3>
                        <div>
                            <textarea
                                value={formData.internalNotes || ''}
                                onChange={e => setFormData({ ...formData, internalNotes: e.target.value })}
                                placeholder="Patti commerciali, note sull'accordo d'integrazione o altro..."
                                className="w-full border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black min-h-[100px] resize-none text-sm bg-white"
                            />
                        </div>
                    </div>

                </form>
            </div>
        </div>
    );
}
