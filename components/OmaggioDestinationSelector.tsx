'use client';

import type { FloremOrderDestination } from '@/lib/floremDualDestination';

type Props = {
    value: FloremOrderDestination;
    onChange: (next: FloremOrderDestination) => void;
    idPrefix?: string;
    className?: string;
};

/**
 * Selettore destinazione omaggio per piante a destinazione mista (FT/FF).
 * Perché: un solo SKU catalogo, due flussi checkout distinti.
 */
export default function OmaggioDestinationSelector({
    value,
    onChange,
    idPrefix = 'dest',
    className = '',
}: Props) {
    return (
        <fieldset className={`space-y-3 ${className}`.trim()}>
            <legend className="text-sm font-semibold text-fm-text mb-1">Destinazione omaggio:</legend>
            <label
                htmlFor={`${idPrefix}-ft`}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-all ${
                    value === 'FT'
                        ? 'border-fm-gold bg-yellow-50/50 ring-1 ring-fm-gold/25'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
            >
                <input
                    id={`${idPrefix}-ft`}
                    type="radio"
                    name={`${idPrefix}-omaggio`}
                    checked={value === 'FT'}
                    onChange={() => onChange('FT')}
                    className="mt-1 h-4 w-4 border-gray-300 text-fm-gold focus:ring-fm-gold/40"
                />
                <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-900">
                        Consegna sulla Tomba al Cimitero
                    </span>
                    <span className="mt-0.5 block text-xs text-fm-muted leading-snug">
                        Posa al cimitero — non è richiesta data e ora del funerale.
                    </span>
                </span>
            </label>
            <label
                htmlFor={`${idPrefix}-ff`}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-all ${
                    value === 'FF'
                        ? 'border-fm-gold bg-yellow-50/50 ring-1 ring-fm-gold/25'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
            >
                <input
                    id={`${idPrefix}-ff`}
                    type="radio"
                    name={`${idPrefix}-omaggio`}
                    checked={value === 'FF'}
                    onChange={() => onChange('FF')}
                    className="mt-1 h-4 w-4 border-gray-300 text-fm-gold focus:ring-fm-gold/40"
                />
                <span className="min-w-0">
                    <span className="block text-sm font-semibold text-gray-900">
                        Per Cerimonia Funebre
                    </span>
                    <span className="mt-0.5 block text-xs text-fm-muted leading-snug">
                        Consegna in chiesa, camera ardente o luogo del rito — con data e ora della cerimonia.
                    </span>
                </span>
            </label>
        </fieldset>
    );
}
