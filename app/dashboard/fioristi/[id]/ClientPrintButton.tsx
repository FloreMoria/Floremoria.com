'use client';

import { Download } from 'lucide-react';

export default function ClientPrintButton() {
    return (
        <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-full text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors shadow-sm print:hidden"
        >
            <Download size={15} className="text-gray-500" /> Scarica Scheda
        </button>
    );
}
