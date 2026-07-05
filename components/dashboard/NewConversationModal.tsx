'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, Loader2, MessageSquarePlus, Phone, Search, Send, X } from 'lucide-react';
import { toE164 } from '@/lib/auth/phone';
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

interface ProactiveTemplateConfig {
    metaName: string;
    bodyTemplate: string;
    parameterLabels: string[];
}

interface NewConversationModalProps {
    open: boolean;
    onClose: () => void;
    onConversationStarted: (session: Record<string, unknown>) => void;
}

function renderTemplatePreview(
    bodyTemplate: string,
    recipientFirstName: string,
    orderCode: string,
    staffNotes: string
): string {
    const firstName = extractFirstName(recipientFirstName);
    const code = normalizeOrderCode(orderCode);
    return bodyTemplate
        .replace(/\{\{1\}\}/g, firstName || '{{1}}')
        .replace(/\{\{2\}\}/g, code || '{{2}}')
        .replace(/\{\{3\}\}/g, staffNotes.trim() || '{{3}}');
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
    const [templateConfig, setTemplateConfig] = useState<ProactiveTemplateConfig | null>(null);
    const [recipientFirstName, setRecipientFirstName] = useState('');
    const [orderCode, setOrderCode] = useState('');
    const [staffNotes, setStaffNotes] = useState('');
    const [messageText, setMessageText] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;

        setQuery('');
        setManualPhone('');
        setResults([]);
        setSelected(null);
        setRequiresTemplate(null);
        setRecipientFirstName('');
        setOrderCode('');
        setStaffNotes('');
        setMessageText('');
        setError(null);

        fetch('/api/dashboard/communications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'getTemplates' }),
        })
            .then((res) => res.json())
            .then((data) => {
                const template = data.template ?? data.templates?.[0];
                if (data.success && template) {
                    setTemplateConfig({
                        metaName: template.metaName,
                        bodyTemplate: template.bodyTemplate,
                        parameterLabels: template.parameterLabels ?? [],
                    });
                }
            })
            .catch(() => {
                /* fallback silenzioso */
            });
    }, [open]);

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

    const applyContactSelection = (contact: MessagingContact) => {
        setSelected(contact);
        setRecipientFirstName(contact.recipientFirstName || extractFirstName(contact.name));
        setOrderCode('');
        setStaffNotes('');
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

        applyContactSelection(resolvedContact);

        try {
            const res = await fetch('/api/dashboard/communications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'checkMessagingWindow',
                    phoneRaw: resolvedContact.phone,
                }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'Impossibile verificare la finestra messaggistica.');
                return;
            }
            setRequiresTemplate(Boolean(data.requiresTemplate));
        } catch {
            setError('Errore di rete durante la verifica del contatto.');
        }
    };

    const handleManualPhoneContinue = async () => {
        await resolveSelection(null, manualPhone.trim());
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selected || submitting) return;

        setSubmitting(true);
        setError(null);

        const normalizedOrderCode = normalizeOrderCode(orderCode);
        const normalizedFirstName = extractFirstName(recipientFirstName);

        try {
            const payload: Record<string, unknown> = {
                action: 'startConversation',
                phoneRaw: selected.phone,
                displayName: selected.name,
                userType: selected.type,
            };

            if (requiresTemplate) {
                payload.recipientFirstName = normalizedFirstName;
                payload.orderCode = normalizedOrderCode;
                payload.staffNotes = staffNotes.trim();
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
        templateConfig && requiresTemplate
            ? renderTemplatePreview(templateConfig.bodyTemplate, recipientFirstName, orderCode, staffNotes)
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
                            Template: <span className="font-mono text-xs">floremoria_messaggio_personalizzato_fiorista</span>
                            {' · '}
                            <span className="text-xs">{'{{1}}'} nome · {'{{2}}'} ordine · {'{{3}}'} note</span>
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
                                        setRecipientFirstName('');
                                        setOrderCode('');
                                        setStaffNotes('');
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
                                        Chat proattiva: il template Meta userà <strong>{'{{1}}'}</strong> come incipit
                                        (nome), senza &quot;Gentile Cliente&quot; fisso.
                                    </div>

                                    <div>
                                        <label className="text-sm font-semibold text-[#2B2B2B] mb-1.5 block">
                                            Nome <span className="text-gray-400 font-normal">(variabile {'{{1}}'})</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={recipientFirstName}
                                            onChange={(e) => setRecipientFirstName(e.target.value)}
                                            placeholder="Es. Carlo"
                                            className="w-full rounded-xl border border-[#EAE3D9] px-4 py-3 text-sm focus:outline-none focus:border-[#C0A062]"
                                        />
                                        <p className="text-[11px] text-gray-400 mt-1">
                                            Pre-compilato dal DB: nome del fiorista o del cliente.
                                        </p>
                                    </div>

                                    <div>
                                        <label className="text-sm font-semibold text-[#2B2B2B] mb-1.5 block">
                                            Codice ordine <span className="text-gray-400 font-normal">(variabile {'{{2}}'})</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={orderCode}
                                            onChange={(e) => setOrderCode(e.target.value)}
                                            onBlur={() => setOrderCode(normalizeOrderCode(orderCode))}
                                            placeholder="Es. FF-PN-26-004"
                                            className="w-full rounded-xl border border-[#EAE3D9] px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#C0A062]"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-sm font-semibold text-[#2B2B2B] mb-1.5 block">
                                            Note dello Staff <span className="text-gray-400 font-normal">(variabile {'{{3}}'})</span>
                                        </label>
                                        <textarea
                                            value={staffNotes}
                                            onChange={(e) => setStaffNotes(e.target.value)}
                                            rows={6}
                                            placeholder="Testo libero del messaggio personalizzato..."
                                            className="w-full rounded-xl border border-[#EAE3D9] px-4 py-3 text-sm focus:outline-none focus:border-[#00A884] resize-y min-h-[140px]"
                                        />
                                    </div>

                                    {previewText && (
                                        <div>
                                            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                                                Anteprima messaggio WhatsApp
                                            </p>
                                            <div className="rounded-xl border border-[#EAE3D9] bg-white p-4 text-sm text-[#111B21] whitespace-pre-wrap leading-relaxed">
                                                {previewText}
                                            </div>
                                        </div>
                                    )}
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
                                    (requiresTemplate
                                        ? !extractFirstName(recipientFirstName) ||
                                          !normalizeOrderCode(orderCode) ||
                                          !staffNotes.trim()
                                        : !messageText.trim())
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
