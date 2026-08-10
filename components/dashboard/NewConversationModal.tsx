'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, MessageSquarePlus, Phone, Search, Send, X } from 'lucide-react';
import { toE164 } from '@/lib/auth/phone';
import {
    PROACTIVE_CONVERSATION_TEMPLATE_ID,
    renderOperatorTemplatePreview,
    type WhatsAppTemplateDefinition,
} from '@/lib/whatsapp/approvedTemplates';
import { extractFirstName, normalizeOrderCode } from '@/lib/whatsapp/proactiveTemplateParams';

type ContactType = 'UTENTE' | 'FLORIST';

interface MessagingContact {
    type: ContactType;
    id: string;
    name: string;
    phone: string;
    sessionPhone: string;
    subtitle: string;
    initials: string;
    recipientFirstName: string;
}

interface NewConversationModalProps {
    open: boolean;
    onClose: () => void;
    onConversationStarted: (session: Record<string, unknown>) => void;
}

async function fetchLastOrderSeed(
    type: ContactType,
    id: string
): Promise<{ orderNumber: string | null; seed: Record<string, string | null> | null }> {
    if (id.startsWith('manual:')) return { orderNumber: null, seed: null };
    try {
        const res = await fetch(
            `/api/dashboard/communications/contacts/last-order?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`
        );
        const data = await res.json();
        if (!data.success) return { orderNumber: null, seed: null };
        return {
            orderNumber: typeof data.orderNumber === 'string' ? data.orderNumber : null,
            seed: data.seed && typeof data.seed === 'object' ? data.seed : null,
        };
    } catch {
        return { orderNumber: null, seed: null };
    }
}

function seedFieldValues(
    template: WhatsAppTemplateDefinition,
    contact: MessagingContact,
    orderCode: string,
    orderSeed?: Record<string, string | null> | null
): Record<string, string> {
    const values: Record<string, string> = {};
    for (const field of template.fields) {
        if (field.defaultValue) {
            values[field.key] = field.defaultValue;
        } else {
            values[field.key] = '';
        }

        const fromSeed = orderSeed?.[field.key];
        if (typeof fromSeed === 'string' && fromSeed.trim()) {
            values[field.key] = fromSeed.trim();
            continue;
        }

        if (
            field.key === 'recipientFirstName' ||
            field.key === 'userFirstName' ||
            field.key === 'buyerFirstName' ||
            field.key === 'floristFirstName'
        ) {
            values[field.key] =
                contact.recipientFirstName || extractFirstName(contact.name) || values[field.key];
            continue;
        }
        if (field.key === 'orderCode') {
            values[field.key] = orderCode || values[field.key];
        }
    }
    return values;
}

export default function NewConversationModal({
    open,
    onClose,
    onConversationStarted,
}: NewConversationModalProps) {
    const [query, setQuery] = useState('');
    const [manualPhone, setManualPhone] = useState('');
    const [results, setResults] = useState<MessagingContact[]>([]);
    const [searching, setSearching] = useState(false);
    const [selected, setSelected] = useState<MessagingContact | null>(null);
    const [requiresTemplate, setRequiresTemplate] = useState<boolean | null>(null);
    const [allTemplates, setAllTemplates] = useState<WhatsAppTemplateDefinition[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState(PROACTIVE_CONVERSATION_TEMPLATE_ID);
    const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
    const [orderSeed, setOrderSeed] = useState<Record<string, string | null> | null>(null);
    const [messageText, setMessageText] = useState('');
    const [loadingOrderCode, setLoadingOrderCode] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const templates = useMemo(() => {
        if (!selected) return allTemplates;
        const library = selected.type === 'FLORIST' ? 'FLORIST' : 'UTENTE';
        const filtered = allTemplates.filter((t) => t.library === library);
        return filtered.length ? filtered : allTemplates.filter((t) => !t.library || t.library === library);
    }, [allTemplates, selected]);

    const selectedTemplate = useMemo(
        () => templates.find((t) => t.id === selectedTemplateId) || templates[0] || null,
        [templates, selectedTemplateId]
    );

    useEffect(() => {
        if (!open) return;

        setQuery('');
        setManualPhone('');
        setResults([]);
        setSelected(null);
        setRequiresTemplate(null);
        setFieldValues({});
        setOrderSeed(null);
        setMessageText('');
        setLoadingOrderCode(false);
        setError(null);
        setSelectedTemplateId(PROACTIVE_CONVERSATION_TEMPLATE_ID);

        void (async () => {
            try {
                const res = await fetch('/api/dashboard/communications', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'getTemplates' }),
                });
                const data = await res.json();
                if (data.success && Array.isArray(data.templates) && data.templates.length) {
                    setAllTemplates(data.templates as WhatsAppTemplateDefinition[]);
                    setSelectedTemplateId(
                        (data.templates[0] as WhatsAppTemplateDefinition).id ||
                            PROACTIVE_CONVERSATION_TEMPLATE_ID
                    );
                }
            } catch {
                // Catalogo caricato al bisogno; fallback lato server su startConversation.
            }
        })();
    }, [open]);

    useEffect(() => {
        if (!selected || templates.length === 0) return;
        const stillValid = templates.some((t) => t.id === selectedTemplateId);
        if (!stillValid) {
            setSelectedTemplateId(templates[0]!.id);
        }
    }, [selected, templates, selectedTemplateId]);

    useEffect(() => {
        if (!open) return;
        const q = query.trim();
        if (q.length < 2) {
            setResults([]);
            return;
        }

        const timer = window.setTimeout(async () => {
            setSearching(true);
            try {
                const res = await fetch(`/api/dashboard/communications/contacts?q=${encodeURIComponent(q)}`);
                const data = await res.json();
                setResults(data.success ? data.results || [] : []);
            } catch {
                setResults([]);
            } finally {
                setSearching(false);
            }
        }, 280);

        return () => window.clearTimeout(timer);
    }, [open, query]);

    const applyContactSelection = async (
        contact: MessagingContact,
        templateOverride?: WhatsAppTemplateDefinition | null
    ) => {
        setSelected(contact);
        setLoadingOrderCode(true);
        const { orderNumber, seed } = await fetchLastOrderSeed(contact.type, contact.id);
        const orderCode = orderNumber ? normalizeOrderCode(orderNumber) : '';
        setOrderSeed(seed);
        setLoadingOrderCode(false);

        const library = contact.type === 'FLORIST' ? 'FLORIST' : 'UTENTE';
        const libraryTemplates = allTemplates.filter((t) => t.library === library);
        const preferred =
            templateOverride ||
            libraryTemplates[0] ||
            selectedTemplate ||
            null;
        if (preferred) {
            setSelectedTemplateId(preferred.id);
            setFieldValues(seedFieldValues(preferred, contact, orderCode, seed));
        }
    };

    const handleTemplateChange = (templateId: string) => {
        setSelectedTemplateId(templateId);
        const template = templates.find((t) => t.id === templateId) || allTemplates.find((t) => t.id === templateId);
        if (template && selected) {
            const orderCode = fieldValues.orderCode || (orderSeed?.orderNumber ? normalizeOrderCode(orderSeed.orderNumber) : '');
            setFieldValues(seedFieldValues(template, selected, orderCode, orderSeed));
        }
    };

    const resolveSelection = async (contact: MessagingContact | null, rawPhone?: string) => {
        setError(null);
        const phoneRaw = contact?.phone || rawPhone || '';
        const e164 = toE164(phoneRaw);
        const sessionPhone = e164 ? `whatsapp:${e164}` : null;

        if (!sessionPhone) {
            setError('Inserisca un numero valido in formato internazionale, es. +393331112222.');
            return;
        }

        const resolvedContact: MessagingContact =
            contact ??
            ({
                type: 'UTENTE',
                id: `manual:${sessionPhone}`,
                name: e164 || phoneRaw,
                phone: e164 || phoneRaw,
                sessionPhone,
                subtitle: 'Contatto manuale',
                initials: 'NU',
                recipientFirstName: '',
            } as MessagingContact);

        await applyContactSelection(resolvedContact);

        try {
            const res = await fetch('/api/dashboard/communications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'checkMessagingWindow',
                    phoneRaw: resolvedContact.phone,
                    userType: resolvedContact.type,
                }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'Impossibile verificare la finestra messaggistica.');
                return;
            }
            setRequiresTemplate(Boolean(data.requiresTemplate));
            if (Array.isArray(data.templates) && data.templates.length) {
                setAllTemplates((prev) => {
                    const byId = new Map(prev.map((t) => [t.id, t]));
                    for (const t of data.templates as WhatsAppTemplateDefinition[]) {
                        byId.set(t.id, t);
                    }
                    return Array.from(byId.values());
                });
            }
        } catch {
            setError('Errore di rete durante la verifica del contatto.');
        }
    };

    const handleManualPhoneContinue = async () => {
        await resolveSelection(null, manualPhone.trim());
    };

    const templateFieldsValid = useMemo(() => {
        if (!selectedTemplate) return false;
        return selectedTemplate.fields.every((field) => {
            if (!field.required) return true;
            return Boolean((fieldValues[field.key] || '').trim());
        });
    }, [selectedTemplate, fieldValues]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selected || submitting) return;

        setSubmitting(true);
        setError(null);

        try {
            const payload: Record<string, unknown> = {
                action: 'startConversation',
                phoneRaw: selected.phone,
                displayName: selected.name,
                userType: selected.type,
            };

            if (requiresTemplate) {
                payload.templateId = selectedTemplate?.id || PROACTIVE_CONVERSATION_TEMPLATE_ID;
                payload.templateFieldValues = fieldValues;
                // Retrocompat campi legacy
                payload.recipientFirstName = fieldValues.recipientFirstName || fieldValues.userFirstName;
                payload.orderCode = fieldValues.orderCode;
                payload.staffNotes = fieldValues.staffNotes;
            } else {
                payload.messageText = messageText.trim();
            }

            const res = await fetch('/api/dashboard/communications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();

            if (!data.success) {
                if (Array.isArray(data.templates) && data.templates.length) {
                    setAllTemplates((prev) => {
                        const byId = new Map(prev.map((t) => [t.id, t]));
                        for (const t of data.templates as WhatsAppTemplateDefinition[]) {
                            byId.set(t.id, t);
                        }
                        return Array.from(byId.values());
                    });
                }
                setError(data.error || 'Invio non riuscito.');
                return;
            }

            onConversationStarted(data.session);
            onClose();
        } catch {
            setError('Errore di rete durante l\'invio.');
        } finally {
            setSubmitting(false);
        }
    };

    const previewText =
        requiresTemplate && selectedTemplate
            ? renderOperatorTemplatePreview(selectedTemplate, fieldValues)
            : '';

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]">
            <div className="w-full max-w-2xl bg-white rounded-[28px] border border-[#EAE3D9] shadow-2xl overflow-hidden">
                <div className="px-6 py-5 border-b border-[#EAE3D9] bg-[#FDFCF9] flex items-center justify-between gap-4">
                    <div>
                        <h3 className="font-display text-xl font-semibold text-[#111B21] flex items-center gap-2">
                            <MessageSquarePlus className="w-5 h-5 text-[#B89F78]" />
                            Nuova conversazione
                        </h3>
                        <p className="text-sm text-[#6F6F6F] mt-1">
                            Messaggio proattivo WhatsApp · template Meta o testo libero in finestra 24h
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-[#F0EBE3] text-gray-500 transition-colors"
                        aria-label="Chiudi"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
                    {!selected ? (
                        <>
                            <div className="relative">
                                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Cerca per nome cliente, fiorista o numero..."
                                    className="w-full rounded-xl border border-[#EAE3D9] pl-9 pr-4 py-3 text-sm focus:outline-none focus:border-[#C0A062]"
                                    autoFocus
                                />
                            </div>

                            <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
                                {searching && (
                                    <div className="text-sm text-gray-500 flex items-center gap-2 px-2 py-3">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Ricerca in corso...
                                    </div>
                                )}
                                {!searching && results.length === 0 && query.trim().length >= 2 && (
                                    <p className="text-sm text-gray-400 px-2 py-3">Nessun contatto trovato nel database.</p>
                                )}
                                {results.map((contact) => (
                                    <button
                                        key={`${contact.type}-${contact.id}`}
                                        type="button"
                                        onClick={() => resolveSelection(contact)}
                                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-[#EAE3D9] hover:bg-[#FAF8F5] text-left transition-colors"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-[#EAE3D9] flex items-center justify-center font-semibold text-sm">
                                            {contact.initials}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-[#111B21] truncate">{contact.name}</span>
                                                <span
                                                    className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                                                        contact.type === 'FLORIST'
                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                                            : 'bg-blue-50 text-blue-700 border-blue-100'
                                                    }`}
                                                >
                                                    {contact.type === 'FLORIST' ? 'Fiorista' : 'Cliente'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-500 truncate">{contact.phone}</p>
                                            {contact.subtitle && (
                                                <p className="text-[11px] text-gray-400 truncate">{contact.subtitle}</p>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>

                            <div className="border-t border-[#EAE3D9] pt-5 space-y-3">
                                <label className="text-sm font-semibold text-[#2B2B2B] flex items-center gap-2">
                                    <Phone className="w-4 h-4 text-[#B89F78]" />
                                    Oppure numero manuale
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="tel"
                                        value={manualPhone}
                                        onChange={(e) => setManualPhone(e.target.value)}
                                        placeholder="+393331112222"
                                        className="flex-1 rounded-xl border border-[#EAE3D9] px-4 py-3 text-sm focus:outline-none focus:border-[#C0A062]"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleManualPhoneContinue}
                                        className="px-4 py-3 rounded-xl bg-[#2B2B2B] text-white text-sm font-semibold hover:bg-black transition-colors"
                                    >
                                        Continua
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="rounded-2xl border border-[#EAE3D9] bg-[#FAF8F5] p-4 flex items-center justify-between gap-3">
                                <div>
                                    <p className="font-semibold text-[#111B21]">{selected.name}</p>
                                    <p className="text-sm text-gray-500">{selected.phone}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelected(null);
                                        setRequiresTemplate(null);
                                        setFieldValues({});
                                        setError(null);
                                    }}
                                    className="text-xs font-semibold text-[#B89F78] hover:underline"
                                >
                                    Cambia contatto
                                </button>
                            </div>

                            {requiresTemplate === null ? (
                                <div className="text-sm text-gray-500 flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Verifica finestra WhatsApp 24h...
                                </div>
                            ) : requiresTemplate ? (
                                <div className="space-y-4">
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                        Fuori finestra 24h (o primo contatto): selezioni un Template Meta della{' '}
                                        <strong>
                                            Libreria {selected.type === 'FLORIST' ? 'Fioristi' : 'Utenti'}
                                        </strong>{' '}
                                        (Scenario A, solo testo body — senza intestazione).
                                    </div>

                                    <div>
                                        <label className="text-sm font-semibold text-[#2B2B2B] mb-1.5 block">
                                            Template Meta · {selected.type === 'FLORIST' ? 'Fioristi' : 'Utenti'}
                                        </label>
                                        <select
                                            value={selectedTemplateId}
                                            onChange={(e) => handleTemplateChange(e.target.value)}
                                            className="w-full rounded-xl border border-[#EAE3D9] px-4 py-3 text-sm bg-white focus:outline-none focus:border-[#C0A062]"
                                        >
                                            {(templates.length
                                                ? templates
                                                : [
                                                      {
                                                          id: PROACTIVE_CONVERSATION_TEMPLATE_ID,
                                                          label: 'Messaggio personalizzato fiorista (staff)',
                                                      },
                                                  ]
                                            ).map((t) => (
                                                <option key={t.id} value={t.id}>
                                                    {t.label}
                                                </option>
                                            ))}
                                        </select>
                                        {selectedTemplate?.description ? (
                                            <p className="text-[11px] text-gray-400 mt-1">
                                                {selectedTemplate.description}
                                            </p>
                                        ) : null}
                                    </div>

                                    {selectedTemplate?.fields.map((field) => (
                                        <div key={field.key}>
                                            <label className="text-sm font-semibold text-[#2B2B2B] mb-1.5 block">
                                                {field.label}
                                                {field.metaBound === false ? (
                                                    <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400 font-bold">
                                                        In nota
                                                    </span>
                                                ) : (
                                                    <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400 font-bold">
                                                        {`Body {{${field.index + 1}}}`}
                                                    </span>
                                                )}
                                            </label>
                                            {field.multiline ? (
                                                <textarea
                                                    value={fieldValues[field.key] || ''}
                                                    onChange={(e) =>
                                                        setFieldValues((prev) => ({
                                                            ...prev,
                                                            [field.key]: e.target.value,
                                                        }))
                                                    }
                                                    rows={5}
                                                    placeholder={field.placeholder}
                                                    className="w-full rounded-xl border border-[#EAE3D9] px-4 py-3 text-sm focus:outline-none focus:border-[#00A884] resize-y min-h-[120px]"
                                                />
                                            ) : (
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        value={fieldValues[field.key] || ''}
                                                        onChange={(e) =>
                                                            setFieldValues((prev) => ({
                                                                ...prev,
                                                                [field.key]: e.target.value,
                                                            }))
                                                        }
                                                        onBlur={() => {
                                                            if (field.key === 'orderCode') {
                                                                setFieldValues((prev) => ({
                                                                    ...prev,
                                                                    orderCode: normalizeOrderCode(
                                                                        prev.orderCode || ''
                                                                    ),
                                                                }));
                                                            }
                                                        }}
                                                        placeholder={field.placeholder}
                                                        className="w-full rounded-xl border border-[#EAE3D9] px-4 py-3 text-sm focus:outline-none focus:border-[#C0A062]"
                                                    />
                                                    {loadingOrderCode && field.key === 'orderCode' ? (
                                                        <Loader2 className="w-4 h-4 animate-spin text-gray-400 absolute right-3 top-3.5" />
                                                    ) : null}
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    <div>
                                        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                                            Anteprima messaggio WhatsApp
                                        </p>
                                        <div className="rounded-2xl border border-[#D1D7DB] bg-[#E5DDD5] p-4">
                                            <div className="max-w-[92%] rounded-lg rounded-tl-none bg-white shadow-sm px-3 py-2.5 text-[15px] text-[#111B21] whitespace-pre-wrap leading-relaxed">
                                                {previewText}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                                        Finestra 24h attiva: può inviare un messaggio libero dallo staff (senza template).
                                    </div>
                                    <textarea
                                        value={messageText}
                                        onChange={(e) => setMessageText(e.target.value)}
                                        rows={4}
                                        placeholder="Scriva il messaggio da inviare su WhatsApp..."
                                        className="w-full rounded-xl border border-[#EAE3D9] px-4 py-3 text-sm focus:outline-none focus:border-[#00A884]"
                                    />
                                </div>
                            )}
                        </>
                    )}

                    {error && (
                        <p className="text-sm text-red-600 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {error}
                        </p>
                    )}

                    {selected && requiresTemplate !== null && (
                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2.5 rounded-xl border border-[#EAE3D9] text-sm font-semibold text-gray-600 hover:bg-[#FAF8F5]"
                            >
                                Annulla
                            </button>
                            <button
                                type="submit"
                                disabled={
                                    submitting ||
                                    (requiresTemplate ? !templateFieldsValid : !messageText.trim())
                                }
                                className="px-5 py-2.5 rounded-xl bg-[#00A884] text-white text-sm font-semibold hover:bg-[#008f6f] disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                Avvia conversazione
                            </button>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
