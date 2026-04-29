import React from 'react';

export default function PrivacyPolicyPage() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-16 md:py-24 space-y-8">
            <h1 className="text-4xl font-display font-bold text-gray-900">Privacy Policy</h1>
            <div className="prose prose-lg text-gray-600">
                <p>
                    Informativa sul trattamento dei dati personali (Art. 13 D.Lgs. 196/2003 e Regolamento UE 2016/679 - GDPR).
                </p>
                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 mt-8">
                    <p className="text-sm">
                        <em>[Area riservata all'integrazione automatica tramite script (es. Iubenda o LegalBlink). Il testo legale completo verrà caricato qui.]</em>
                    </p>
                </div>
            </div>
        </div>
    );
}
