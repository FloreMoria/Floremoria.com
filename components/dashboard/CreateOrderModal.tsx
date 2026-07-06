'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import {
    buildEmptyOrderDraft,
    joinDeliveryDatetime,
    orderToDuplicateDraft,
    splitDeliveryDatetime,
    type DuplicateOrderDraft,
} from '@/lib/orders/duplicateOrderDraft';
import {
    orderCategoryToCatalogSlug,
    productRequiresCustomMessage,
} from '@/lib/orders/productCustomText';
import {
    filterDashboardAccessories,
    filterDashboardMainProducts,
} from '@/lib/orders/dashboardProductRole';
import { compareByRecentActivity, compareBySurname } from '@/lib/dashboard/sortDashboardLists';

type FloristOption = { id: string; shopName: string; ownerName: string | null };
type ProductOption = {
    id: string;
    name: string;
    basePriceCents: number;
    slug?: string;
    isBouquet?: boolean;
    category?: { slug: string } | null;
};
type UserOption = {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
};
type DeceasedOption = {
    id: string;
    fullName: string;
    cemeteryCity: string;
    cemeteryName: string | null;
    updatedAt?: string | Date;
    createdAt?: string | Date;
};

const CATEGORY_OPTIONS = [
    { value: 'FT', label: 'FT — Tombe / Cimitero' },
    { value: 'FF', label: 'FF — Funerale' },
    { value: 'FA', label: 'FA — Animali' },
    { value: 'FP', label: 'FP — Altro' },
];

const STATUS_OPTIONS = [
    { value: 'ACCEPTED', label: 'Ricevuto (ACCEPTED)' },
    { value: 'IN_PROGRESS', label: 'In lavorazione' },
    { value: 'DELIVERING', label: 'In consegna' },
    { value: 'COMPLETED', label: 'Completato' },
    { value: 'PENDING', label: 'In attesa' },
];

type Props = {
    open: boolean;
    onClose: () => void;
    onCreated: (order: Record<string, unknown>) => void;
    florists: FloristOption[];
    products: ProductOption[];
    users: UserOption[];
    deceasedProfiles: DeceasedOption[];
    /** Precompila il form duplicando un ordine esistente (nuovo codice al salvataggio). */
    duplicateFrom?: Record<string, unknown> | null;
};

type FormPanelProps = Omit<Props, 'open' | 'duplicateFrom'> & {
    initialDraft: DuplicateOrderDraft | null;
};

export default function CreateOrderModal({
    open,
    duplicateFrom,
    ...panelProps
}: Props) {
    const duplicateId = (duplicateFrom as { id?: string } | null)?.id ?? 'new';
    const [formInstance, setFormInstance] = useState(0);

    useEffect(() => {
        if (open) {
            setFormInstance((n) => n + 1);
        }
    }, [open, duplicateId]);

    if (!open) return null;

    const initialDraft = duplicateFrom ? orderToDuplicateDraft(duplicateFrom) : null;

    return (
        <CreateOrderFormPanel
            key={formInstance}
            initialDraft={initialDraft}
            {...panelProps}
        />
    );
}

function CreateOrderFormPanel({
    initialDraft,
    onClose,
    onCreated,
    florists,
    products,
    users,
    deceasedProfiles,
}: FormPanelProps) {
    const draft = initialDraft ?? buildEmptyOrderDraft(products);
    const initialDelivery = splitDeliveryDatetime(draft.deliveryDate);

    const [duplicateSourceLabel] = useState(initialDraft?.sourceOrderNumber ?? null);
    const [orderCategory, setOrderCategory] = useState(draft.orderCategory);
    const [deliveryProvince, setDeliveryProvince] = useState(draft.deliveryProvince);
    const [codePreview, setCodePreview] = useState('');
    const [loadingPreview, setLoadingPreview] = useState(false);

    const [buyerFullName, setBuyerFullName] = useState(draft.buyerFullName);
    const [buyerEmail, setBuyerEmail] = useState(draft.buyerEmail);
    const [buyerPhone, setBuyerPhone] = useState(draft.buyerPhone);
    const [userId, setUserId] = useState(draft.userId);
    const [deceasedProfileId, setDeceasedProfileId] = useState(draft.deceasedProfileId);

    const [deceasedName, setDeceasedName] = useState(draft.deceasedName);
    const [deceasedBirthDate, setDeceasedBirthDate] = useState(draft.deceasedBirthDate);
    const [deceasedDeathDate, setDeceasedDeathDate] = useState(draft.deceasedDeathDate);
    const [cemeteryName, setCemeteryName] = useState(draft.cemeteryName);
    const [cemeteryCity, setCemeteryCity] = useState(draft.cemeteryCity);
    const [gravePosition, setGravePosition] = useState(draft.gravePosition);

    const [deliveryDatePart, setDeliveryDatePart] = useState(initialDelivery.date);
    const [deliveryTimePart, setDeliveryTimePart] = useState(initialDelivery.time);
    const [productId, setProductId] = useState(draft.productId || products[0]?.id || '');
    const [priceCents, setPriceCents] = useState<number | ''>(draft.priceCents);
    const [quantity, setQuantity] = useState(draft.quantity);
    const [partnerId, setPartnerId] = useState(draft.partnerId);
    const [status, setStatus] = useState(draft.status);
    const [partnerPaymentStatus, setPartnerPaymentStatus] = useState(draft.partnerPaymentStatus);
    const [isRecurring, setIsRecurring] = useState(draft.isRecurring);
    const [additionalInstructions, setAdditionalInstructions] = useState(draft.additionalInstructions);
    const [selectedAccessoryIds, setSelectedAccessoryIds] = useState<string[]>(draft.selectedAccessoryIds);
    const [ticketMessage, setTicketMessage] = useState(draft.ticketMessage);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const mainProducts = filterDashboardMainProducts(products);
    const availableAccessories = filterDashboardAccessories(products, orderCategory);

    const sortedUsers = [...users].sort((a, b) => compareBySurname(a.name, b.name));
    const sortedDeceasedProfiles = [...deceasedProfiles].sort(compareByRecentActivity);
    const showCustomTextField = selectedAccessoryIds.some((id) => {
        const p = products.find((x) => x.id === id);
        return productRequiresCustomMessage(p?.slug);
    });

    const estimatedTotalCents =
        (priceCents === '' ? 0 : Number(priceCents) || 0) * quantity +
        selectedAccessoryIds.reduce((sum, id) => {
            const p = products.find((x) => x.id === id);
            return sum + (p?.basePriceCents ?? 0);
        }, 0);

    const refreshCodePreview = useCallback(async () => {
        const prov = deliveryProvince.trim().toUpperCase().slice(0, 2) || 'XX';
        setLoadingPreview(true);
        try {
            const params = new URLSearchParams({
                orderCategory,
                deliveryProvince: prov,
            });
            const res = await fetch(`/api/dashboard/orders?${params.toString()}`);
            const data = (await res.json()) as { preview?: string; error?: string };
            if (res.ok && data.preview) {
                setCodePreview(data.preview);
            } else {
                setCodePreview('—');
            }
        } catch {
            setCodePreview('—');
        } finally {
            setLoadingPreview(false);
        }
    }, [deliveryProvince, orderCategory]);

    useEffect(() => {
        const t = setTimeout(() => {
            void refreshCodePreview();
        }, 250);
        return () => clearTimeout(t);
    }, [refreshCodePreview]);

    useEffect(() => {
        if (!productId && mainProducts[0]?.id) {
            setProductId(mainProducts[0].id);
        }
    }, [mainProducts, productId]);

    useEffect(() => {
        const slug = orderCategoryToCatalogSlug(orderCategory);
        setSelectedAccessoryIds((prev) =>
            prev.filter((id) => {
                const p = products.find((x) => x.id === id);
                return p?.isBouquet === false && (!slug || p.category?.slug === slug);
            })
        );
    }, [orderCategory, products]);

    const toggleAccessory = (id: string) => {
        setSelectedAccessoryIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    const handleUserPick = (id: string) => {
        setUserId(id);
        const user = users.find((u) => u.id === id);
        if (!user) return;
        setBuyerFullName(user.name || '');
        setBuyerEmail(user.email.includes('@phone.floremoria.local') ? '' : user.email);
        setBuyerPhone(user.phone || '');
    };

    const handleDeceasedPick = (id: string) => {
        setDeceasedProfileId(id);
        const profile = deceasedProfiles.find((d) => d.id === id);
        if (!profile) return;
        setDeceasedName(profile.fullName);
        setCemeteryCity(profile.cemeteryCity);
        setCemeteryName(profile.cemeteryName || '');
    };

    const handleProductChange = (id: string) => {
        setProductId(id);
        const product = products.find((p) => p.id === id);
        if (product) setPriceCents(product.basePriceCents);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);

        const deliveryDate = joinDeliveryDatetime(deliveryDatePart, deliveryTimePart);

        try {
            if (showCustomTextField && !ticketMessage.trim()) {
                throw new Error('Inserisci il testo per Messaggio o Nastro commemorativo.');
            }

            const res = await fetch('/api/dashboard/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderCategory,
                    deliveryProvince: deliveryProvince.trim().toUpperCase().slice(0, 2),
                    buyerFullName,
                    buyerEmail: buyerEmail || null,
                    buyerPhone: buyerPhone || null,
                    userId: userId || null,
                    deceasedProfileId: deceasedProfileId || null,
                    deceasedName,
                    deceasedBirthDate: deceasedBirthDate || null,
                    deceasedDeathDate: deceasedDeathDate || null,
                    cemeteryName,
                    cemeteryCity,
                    gravePosition: gravePosition || null,
                    deliveryDate: deliveryDate || null,
                    productId,
                    quantity,
                    priceCents: priceCents === '' ? null : Number(priceCents),
                    partnerId: partnerId || null,
                    status,
                    partnerPaymentStatus,
                    isRecurring,
                    additionalInstructions: additionalInstructions || null,
                    accessories: selectedAccessoryIds.map((accId) => ({ productId: accId, quantity: 1 })),
                    ticketMessage: ticketMessage.trim() || null,
                }),
            });

            const data = (await res.json()) as { ok?: boolean; order?: Record<string, unknown>; error?: string };
            if (!res.ok || !data.ok || !data.order) {
                throw new Error(data.error || 'Creazione ordine non riuscita.');
            }

            onCreated(data.order);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Errore imprevisto.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900">
                            {duplicateSourceLabel ? 'Duplica ordine' : 'Nuovo ordine manuale'}
                        </h2>
                        <p className="text-sm text-gray-500 mt-0.5">
                            {duplicateSourceLabel && (
                                <span className="block text-amber-700 font-medium mb-0.5">
                                    Copia da {duplicateSourceLabel} — nuovo codice al salvataggio
                                </span>
                            )}
                            Codice prossimo:{' '}
                            <span className="font-mono font-semibold text-black">
                                {loadingPreview ? '…' : codePreview || '—'}
                            </span>
                            <span className="text-gray-400 ml-1">(assegnato al salvataggio)</span>
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
                    {error && (
                        <div className="rounded-xl bg-red-50 border border-red-100 text-red-800 text-sm px-4 py-3">
                            {error}
                        </div>
                    )}

                    <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
                                Categoria
                            </label>
                            <select
                                value={orderCategory}
                                onChange={(e) => setOrderCategory(e.target.value)}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                            >
                                {CATEGORY_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
                                Provincia (2 lettere)
                            </label>
                            <input
                                value={deliveryProvince}
                                onChange={(e) => setDeliveryProvince(e.target.value.toUpperCase().slice(0, 2))}
                                maxLength={2}
                                required
                                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm uppercase font-mono"
                                placeholder="MI"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
                                    Data consegna
                                </label>
                                <input
                                    type="date"
                                    value={deliveryDatePart}
                                    onChange={(e) => setDeliveryDatePart(e.target.value)}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">
                                    Ora
                                </label>
                                <input
                                    type="time"
                                    step={60}
                                    value={deliveryTimePart}
                                    onChange={(e) => setDeliveryTimePart(e.target.value)}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                                />
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Cliente</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-xs text-gray-500 mb-1">Collega utente esistente</label>
                                <select
                                    value={userId}
                                    onChange={(e) => handleUserPick(e.target.value)}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                                >
                                    <option value="">— Nuovo / compila sotto —</option>
                                    {sortedUsers.map((u) => (
                                        <option key={u.id} value={u.id}>
                                            {u.name || u.email} · {u.phone || 'no tel'}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <input
                                placeholder="Nome e cognome cliente"
                                value={buyerFullName}
                                onChange={(e) => setBuyerFullName(e.target.value)}
                                className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                            />
                            <input
                                type="email"
                                placeholder="Email"
                                value={buyerEmail}
                                onChange={(e) => setBuyerEmail(e.target.value)}
                                className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                            />
                            <input
                                placeholder="Telefono"
                                value={buyerPhone}
                                onChange={(e) => setBuyerPhone(e.target.value)}
                                className="border border-gray-200 rounded-xl px-3 py-2 text-sm md:col-span-2"
                            />
                        </div>
                    </section>

                    <section>
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Defunto & luogo</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-xs text-gray-500 mb-1">Profilo defunto esistente</label>
                                <select
                                    value={deceasedProfileId}
                                    onChange={(e) => handleDeceasedPick(e.target.value)}
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                                >
                                    <option value="">— Nuovo / compila sotto —</option>
                                    {sortedDeceasedProfiles.map((d) => (
                                        <option key={d.id} value={d.id}>
                                            {d.fullName} · {d.cemeteryCity}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <input
                                required
                                placeholder="Nome defunto *"
                                value={deceasedName}
                                onChange={(e) => setDeceasedName(e.target.value)}
                                className="border border-gray-200 rounded-xl px-3 py-2 text-sm md:col-span-2"
                            />
                            <input
                                type="date"
                                value={deceasedBirthDate}
                                onChange={(e) => setDeceasedBirthDate(e.target.value)}
                                className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                            />
                            <input
                                type="date"
                                value={deceasedDeathDate}
                                onChange={(e) => setDeceasedDeathDate(e.target.value)}
                                className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                            />
                            <input
                                required
                                placeholder="Cimitero *"
                                value={cemeteryName}
                                onChange={(e) => setCemeteryName(e.target.value)}
                                className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                            />
                            <input
                                required
                                placeholder="Comune *"
                                value={cemeteryCity}
                                onChange={(e) => setCemeteryCity(e.target.value)}
                                className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                            />
                            <input
                                placeholder="Loculo / posizione"
                                value={gravePosition}
                                onChange={(e) => setGravePosition(e.target.value)}
                                className="border border-gray-200 rounded-xl px-3 py-2 text-sm md:col-span-2"
                            />
                        </div>
                    </section>

                    <section>
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">Prodotto & operatività</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <select
                                required
                                value={productId}
                                onChange={(e) => handleProductChange(e.target.value)}
                                className="border border-gray-200 rounded-xl px-3 py-2 text-sm md:col-span-2"
                            >
                                {mainProducts.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name} — €{(p.basePriceCents / 100).toFixed(2)}
                                    </option>
                                ))}
                            </select>
                            <input
                                type="number"
                                min={1}
                                value={quantity}
                                onChange={(e) => setQuantity(Number(e.target.value) || 1)}
                                className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                            />
                            <input
                                type="number"
                                min={0}
                                step={1}
                                placeholder="Prezzo (centesimi)"
                                value={priceCents}
                                onChange={(e) =>
                                    setPriceCents(e.target.value === '' ? '' : Number(e.target.value))
                                }
                                className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                            />
                            <select
                                value={partnerId}
                                onChange={(e) => setPartnerId(e.target.value)}
                                className="border border-gray-200 rounded-xl px-3 py-2 text-sm md:col-span-2"
                            >
                                <option value="">— Fiorista —</option>
                                {florists.map((f) => (
                                    <option key={f.id} value={f.id}>
                                        {f.shopName}
                                        {f.ownerName ? ` (${f.ownerName})` : ''}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                            >
                                {STATUS_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={partnerPaymentStatus}
                                onChange={(e) => setPartnerPaymentStatus(e.target.value)}
                                className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                            >
                                <option value="PAID">Pagato (import / manuale)</option>
                                <option value="UNPAID">Non pagato</option>
                            </select>
                            <label className="flex items-center gap-2 text-sm text-gray-700 md:col-span-2">
                                <input
                                    type="checkbox"
                                    checked={isRecurring}
                                    onChange={(e) => setIsRecurring(e.target.checked)}
                                />
                                Abbonamento / ricorrente (flag informativo)
                            </label>
                            <textarea
                                placeholder="Note interne (opzionale)"
                                value={additionalInstructions}
                                onChange={(e) => setAdditionalInstructions(e.target.value)}
                                rows={2}
                                className="border border-gray-200 rounded-xl px-3 py-2 text-sm md:col-span-2"
                            />
                        </div>

                        {availableAccessories.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                                    Accessori
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {availableAccessories.map((acc) => (
                                        <label
                                            key={acc.id}
                                            className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
                                                selectedAccessoryIds.includes(acc.id)
                                                    ? 'border-amber-300 bg-amber-50/60'
                                                    : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedAccessoryIds.includes(acc.id)}
                                                onChange={() => toggleAccessory(acc.id)}
                                                className="mt-0.5"
                                            />
                                            <span className="text-sm text-gray-800">
                                                <span className="font-medium block">{acc.name}</span>
                                                <span className="text-gray-500 text-xs">
                                                    €{(acc.basePriceCents / 100).toFixed(2)}
                                                </span>
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {showCustomTextField && (
                            <div className="mt-4 pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-top-1">
                                <label className="block text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1.5">
                                    Testo messaggio / nastro <span className="text-red-600">*</span>
                                </label>
                                <textarea
                                    required
                                    placeholder="Scrivi qui il pensiero da stampare sul biglietto o sul nastro..."
                                    value={ticketMessage}
                                    onChange={(e) => setTicketMessage(e.target.value)}
                                    rows={3}
                                    className="w-full border border-amber-200 rounded-xl px-3 py-2 text-sm bg-amber-50/30 focus:outline-none focus:ring-2 focus:ring-amber-200"
                                />
                            </div>
                        )}

                        {estimatedTotalCents > 0 && (
                            <p className="mt-3 text-sm text-gray-600">
                                Totale stimato:{' '}
                                <span className="font-semibold text-gray-900">
                                    €{(estimatedTotalCents / 100).toFixed(2)}
                                </span>
                            </p>
                        )}
                    </section>

                    <p className="text-xs text-gray-500">
                        Nessun WhatsApp verrà inviato automaticamente. Le foto possono essere caricate dopo dal
                        pannello admin o dal fiorista via mini-app.
                    </p>
                </form>

                <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-full text-sm font-semibold text-gray-600 hover:bg-gray-100"
                    >
                        Annulla
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        onClick={handleSubmit}
                        className="px-5 py-2 rounded-full text-sm font-semibold bg-black text-white hover:bg-gray-800 disabled:opacity-60 flex items-center gap-2"
                    >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                        {duplicateSourceLabel ? 'Crea duplicato' : 'Crea ordine'}
                    </button>
                </div>
            </div>
        </div>
    );
}
