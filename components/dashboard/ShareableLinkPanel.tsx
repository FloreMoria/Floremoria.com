'use client';

import { useState } from 'react';
import { Check, Copy, MessageCircle, ExternalLink, Mail } from 'lucide-react';
import GardenSharePanel from '@/components/memorial/GardenSharePanel';

type Props = {
    label: string;
    url: string;
    hint?: string;
    /** Numero WhatsApp (es. +39…) per invio diretto del link. */
    whatsappPhone?: string | null;
    whatsappIntro?: string;
    /** Abilita condivisione email del Giardino (staff / utenti). */
    enableEmailShare?: boolean;
    deceasedName?: string;
    senderName?: string;
};

function normalizeWhatsAppPhone(phone: string): string {
    return phone.replace(/[^\d]/g, '');
}

export default function ShareableLinkPanel({
    label,
    url,
    hint,
    whatsappPhone,
    whatsappIntro,
    enableEmailShare = false,
    deceasedName = 'un caro',
    senderName = '',
}: Props) {
    const [copied, setCopied] = useState(false);
    const [showEmail, setShowEmail] = useState(false);

    const copyUrl = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2200);
        } catch {
            window.prompt('Copia il link:', url);
        }
    };

    const waDigits = whatsappPhone?.trim() ? normalizeWhatsAppPhone(whatsappPhone) : '';
    const waText = whatsappIntro ? `${whatsappIntro}\n\n${url}` : url;
    const whatsappHref = waDigits
        ? `https://wa.me/${waDigits}?text=${encodeURIComponent(waText)}`
        : null;

    return (
        <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
            <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
                {hint ? <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{hint}</p> : null}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
                <input
                    type="text"
                    readOnly
                    value={url}
                    className="flex-1 min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800 font-mono"
                    onFocus={(e) => e.target.select()}
                />
                <div className="flex shrink-0 gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={() => void copyUrl()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                        {copied ? 'Copiato' : 'Copia'}
                    </button>
                    {whatsappHref ? (
                        <a
                            href={whatsappHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        >
                            <MessageCircle size={14} />
                            WhatsApp
                        </a>
                    ) : null}
                    {enableEmailShare ? (
                        <button
                            type="button"
                            onClick={() => setShowEmail((v) => !v)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#c5a880]/50 bg-[#c5a880]/10 px-3 py-2 text-xs font-semibold text-[#8a7048] hover:bg-[#c5a880]/20"
                        >
                            <Mail size={14} />
                            Email
                        </button>
                    ) : null}
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                        title="Apri link"
                    >
                        <ExternalLink size={14} />
                    </a>
                </div>
            </div>
            {enableEmailShare && showEmail ? (
                <GardenSharePanel
                    gardenUrl={url}
                    deceasedName={deceasedName}
                    senderName={senderName}
                    variant="admin"
                    showWhatsApp={false}
                    openEmailOnMount
                    hideActionButtons
                />
            ) : null}
        </div>
    );
}
