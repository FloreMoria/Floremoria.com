import React from 'react';
import Link from 'next/link';

export default function PrivacyPolicyPage() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-16 md:py-24 space-y-8">
            <h1 className="text-4xl font-display font-bold text-gray-900">Privacy Policy</h1>
            <div className="prose prose-lg text-gray-600">
                <p>
                    Informativa sul trattamento dei dati personali (Art. 13 D.Lgs. 196/2003 e Regolamento UE 2016/679 - GDPR).
                </p>
                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 mt-8 space-y-3">
                    <p className="text-sm">
                        <em>[Area riservata all&apos;integrazione automatica tramite script (es. Iubenda). Il testo legale completo verrà caricato qui.]</em>
                    </p>
                    <p className="text-xs text-gray-500 leading-relaxed">
                        In produzione potete puntare il footer del sito direttamente al documento Iubenda impostando{' '}
                        <code className="rounded bg-white px-1 py-0.5 text-gray-700">NEXT_PUBLIC_LEGAL_PRIVACY_URL</code> nel file{' '}
                        <code className="rounded bg-white px-1 py-0.5 text-gray-700">.env</code> (vedi <code className="rounded bg-white px-1 py-0.5 text-gray-700">.env.example</code>).
                    </p>
                </div>
                <div className="pt-2 text-sm">
                    <p className="font-semibold text-gray-700 mb-2">Documenti correlati</p>
                    <div className="flex flex-wrap gap-4">
                        <Link href="/cookie" className="text-fm-gold hover:underline">
                            Cookie Policy
                        </Link>
                        <Link href="/termini-condizioni" className="text-fm-gold hover:underline">
                            Termini e Condizioni
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
