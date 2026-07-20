'use client';

/**
 * Embed ufficiale Iubenda sulla pagina nativa /privacy.
 * Perché: i crawler Pinterest/social richiedono informativa sul dominio floremoria.com;
 * lo script iubenda.js (già in layout) attiva badge/overlay; l'iframe mostra il testo legale completo.
 * Assunzione: documento Iubenda ID 18115980 (stesso già in footer); API HTML non disponibile sul piano attuale.
 */

import { useEffect } from 'react';

export const IUBENDA_PRIVACY_POLICY_ID = '18115980';
export const IUBENDA_PRIVACY_URL = `https://www.iubenda.com/privacy-policy/${IUBENDA_PRIVACY_POLICY_ID}`;
export const IUBENDA_PRIVACY_IFRAME_URL = `${IUBENDA_PRIVACY_URL}/legal?iframe=true`;

function ensureIubendaScript(): void {
    if (typeof document === 'undefined') return;
    if (document.querySelector('script[src="https://cdn.iubenda.com/iubenda.js"]')) return;
    const s = document.createElement('script');
    s.src = 'https://cdn.iubenda.com/iubenda.js';
    s.async = true;
    document.body.appendChild(s);
}

export default function IubendaPrivacyEmbed() {
    useEffect(() => {
        ensureIubendaScript();
        // Re-inizializza i widget se lo script era già caricato dal layout
        const w = window as Window & { _iub?: { reload?: () => void } };
        if (typeof w._iub?.reload === 'function') {
            w._iub.reload();
        }
    }, []);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-4 text-sm">
                <a
                    href={IUBENDA_PRIVACY_URL}
                    className="iubenda-white iubenda-noiframe iubenda-embed iub-legal-only text-fm-gold hover:underline"
                    title="Privacy Policy"
                >
                    Apri Privacy Policy Iubenda
                </a>
                <a
                    href={`${IUBENDA_PRIVACY_URL}/cookie-policy`}
                    className="iubenda-white iubenda-noiframe iubenda-embed text-fm-gold hover:underline"
                    title="Cookie Policy"
                >
                    Cookie Policy
                </a>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <iframe
                    title="Privacy Policy FloreMoria — documento legale Iubenda"
                    src={IUBENDA_PRIVACY_IFRAME_URL}
                    className="w-full border-0 bg-white"
                    style={{ minHeight: '1100px' }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                />
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
                Se l&apos;anteprima non si carica, consulta il documento completo su{' '}
                <a
                    href={IUBENDA_PRIVACY_URL}
                    className="text-fm-gold hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    iubenda.com/privacy-policy/{IUBENDA_PRIVACY_POLICY_ID}
                </a>
                .
            </p>
        </div>
    );
}
