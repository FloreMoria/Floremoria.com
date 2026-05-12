import React from 'react';
import Link from 'next/link';

export default function CookiePolicyPage() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-16 md:py-24 space-y-8">
            <h1 className="text-4xl font-display font-bold text-gray-900">Cookie Policy</h1>
            <div className="prose prose-lg text-gray-600">
                <p>
                    Informativa estesa sull'utilizzo dei Cookie (Provvedimento Garante Privacy dell'8 maggio 2014 e successivi aggiornamenti).
                </p>
                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 mt-8 space-y-3">
                    <p className="text-sm">
                        <em>[Area riservata all&apos;integrazione automatica tramite script (es. Iubenda). Il banner e il testo di dettaglio verranno generati dinamicamente.]</em>
                    </p>
                    <p className="text-xs text-gray-500 leading-relaxed">
                        Per il link &quot;Cookie Policy&quot; nel footer usate{' '}
                        <code className="rounded bg-white px-1 py-0.5 text-gray-700">NEXT_PUBLIC_LEGAL_COOKIE_URL</code> quando avrete l&apos;URL definitivo Iubenda (vedi{' '}
                        <code className="rounded bg-white px-1 py-0.5 text-gray-700">.env.example</code>).
                    </p>
                </div>
                <div className="pt-2 text-sm">
                    <p className="font-semibold text-gray-700 mb-2">Documenti correlati</p>
                    <div className="flex flex-wrap gap-4">
                        <Link href="/privacy" className="text-fm-gold hover:underline">
                            Privacy Policy
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
