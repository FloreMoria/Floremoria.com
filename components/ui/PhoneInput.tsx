'use client';

import React, { useState, useEffect, useMemo } from 'react';

export interface CountryOption {
    code: string;
    name: string;
    dialCode: string;
    flag: string;
}

export const POPULAR_COUNTRIES: CountryOption[] = [
    { code: 'IT', name: 'Italia', dialCode: '+39', flag: '🇮🇹' },
    { code: 'CH', name: 'Svizzera', dialCode: '+41', flag: '🇨🇭' },
    { code: 'FR', name: 'Francia', dialCode: '+33', flag: '🇫🇷' },
    { code: 'DE', name: 'Germania', dialCode: '+49', flag: '🇩🇪' },
    { code: 'GB', name: 'Regno Unito', dialCode: '+44', flag: '🇬🇧' },
    { code: 'US', name: 'Stati Uniti', dialCode: '+1', flag: '🇺🇸' },
    { code: 'AT', name: 'Austria', dialCode: '+43', flag: '🇦🇹' },
    { code: 'ES', name: 'Spagna', dialCode: '+34', flag: '🇪🇸' },
    { code: 'BE', name: 'Belgio', dialCode: '+32', flag: '🇧🇪' },
    { code: 'NL', name: 'Paesi Bassi', dialCode: '+31', flag: '🇳🇱' },
    { code: 'SM', name: 'San Marino', dialCode: '+378', flag: '🇸🇲' },
    { code: 'VA', name: 'Vaticano', dialCode: '+379', flag: '🇻🇦' },
    { code: 'RO', name: 'Romania', dialCode: '+40', flag: '🇷🇴' },
    { code: 'PL', name: 'Polonia', dialCode: '+48', flag: '🇵🇱' },
    { code: 'AL', name: 'Albania', dialCode: '+355', flag: '🇦🇱' },
    { code: 'UA', name: 'Ucraina', dialCode: '+380', flag: '🇺🇦' },
    { code: 'PT', name: 'Portogallo', dialCode: '+351', flag: '🇵🇹' },
    { code: 'GR', name: 'Grecia', dialCode: '+30', flag: '🇬🇷' },
    { code: 'IE', name: 'Irlanda', dialCode: '+353', flag: '🇮🇪' },
    { code: 'SE', name: 'Svezia', dialCode: '+46', flag: '🇸🇪' },
    { code: 'NO', name: 'Norvegia', dialCode: '+47', flag: '🇳🇴' },
    { code: 'DK', name: 'Danimarca', dialCode: '+45', flag: '🇩🇰' },
    { code: 'FI', name: 'Finlandia', dialCode: '+358', flag: '🇫🇮' },
    { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦' },
    { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺' },
    { code: 'BR', name: 'Brasile', dialCode: '+55', flag: '🇧🇷' },
    { code: 'AR', name: 'Argentina', dialCode: '+54', flag: '🇦🇷' },
    { code: 'MX', name: 'Messico', dialCode: '+52', flag: '🇲🇽' },
    { code: 'CN', name: 'Cina', dialCode: '+86', flag: '🇨🇳' },
    { code: 'JP', name: 'Giappone', dialCode: '+81', flag: '🇯🇵' },
    { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳' },
    { code: 'AE', name: 'Emirati Arabi', dialCode: '+971', flag: '🇦🇪' },
];

/**
 * Smonta un numero E.164 o raw nei due componenti: prefisso e numero locale.
 */
export function parsePhoneToPrefixAndLocal(rawPhone: string | null | undefined): {
    dialCode: string;
    localNumber: string;
} {
    const str = String(rawPhone || '').trim();
    if (!str) return { dialCode: '+39', localNumber: '' };

    // Se inizia con '+'
    if (str.startsWith('+')) {
        // Cerca tra i prefissi conosciuti ordinati per lunghezza decrescente (+378 prima di +37)
        const sortedCountries = [...POPULAR_COUNTRIES].sort(
            (a, b) => b.dialCode.length - a.dialCode.length
        );
        for (const country of sortedCountries) {
            if (str.startsWith(country.dialCode)) {
                return {
                    dialCode: country.dialCode,
                    localNumber: str.slice(country.dialCode.length).replace(/^0+/, ''),
                };
            }
        }
        // Prefisso generico +XX
        const match = str.match(/^(\+\d{1,4})(.*)$/);
        if (match) {
            return { dialCode: match[1]!, localNumber: match[2]!.replace(/^0+/, '') };
        }
    }

    // Se non ha prefisso o inizia con 0039 / 39
    if (str.startsWith('0039')) {
        return { dialCode: '+39', localNumber: str.slice(4).replace(/^0+/, '') };
    }
    if (str.startsWith('39') && str.length >= 11) {
        return { dialCode: '+39', localNumber: str.slice(2) };
    }

    // Default Italia +39
    return { dialCode: '+39', localNumber: str.replace(/^0+/, '') };
}

/**
 * Concatena prefisso e numero locale restituendo il formato E.164 pulito (es. +393401234567).
 */
export function formatToE164(dialCode: string, localNumber: string): string {
    const cleanDigits = localNumber.replace(/\D/g, '').replace(/^0+/, '');
    if (!cleanDigits) return '';
    const cleanDial = dialCode.startsWith('+') ? dialCode : `+${dialCode.replace(/\D/g, '')}`;
    return `${cleanDial}${cleanDigits}`;
}

export interface PhoneInputProps {
    value: string;
    onChange: (fullE164: string) => void;
    placeholder?: string;
    id?: string;
    name?: string;
    required?: boolean;
    disabled?: boolean;
    className?: string;
    autoComplete?: string;
}

export default function PhoneInput({
    value,
    onChange,
    placeholder = 'Cellulare *',
    id,
    name,
    required = false,
    disabled = false,
    className = '',
    autoComplete = 'tel',
}: PhoneInputProps) {
    const parsed = useMemo(() => parsePhoneToPrefixAndLocal(value), [value]);

    const [dialCode, setDialCode] = useState<string>(parsed.dialCode);
    const [localNumber, setLocalNumber] = useState<string>(parsed.localNumber);

    // Sincronizza lo stato locale se la prop `value` cambia dall'esterno
    useEffect(() => {
        const nextParsed = parsePhoneToPrefixAndLocal(value);
        setDialCode(nextParsed.dialCode);
        setLocalNumber(nextParsed.localNumber);
    }, [value]);

    const handleDialCodeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newCode = e.target.value;
        setDialCode(newCode);
        const full = formatToE164(newCode, localNumber);
        onChange(full);
    };

    const handleLocalNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const rawVal = e.target.value;

        // Se l'utente incolla un numero completo con prefisso (es. "+33 6 12 34 56 78")
        if (rawVal.trim().startsWith('+')) {
            const pastedParsed = parsePhoneToPrefixAndLocal(rawVal);
            setDialCode(pastedParsed.dialCode);
            setLocalNumber(pastedParsed.localNumber);
            const full = formatToE164(pastedParsed.dialCode, pastedParsed.localNumber);
            onChange(full);
            return;
        }

        // Altrimenti rimuove caratteri non numerici mantenendo cifre
        const cleanDigits = rawVal.replace(/[^\d\s-]/g, '');
        setLocalNumber(cleanDigits);
        const full = formatToE164(dialCode, cleanDigits);
        onChange(full);
    };

    return (
        <div
            className={`relative flex items-center bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm transition-all focus-within:ring-2 focus-within:ring-fm-gold/50 focus-within:border-fm-gold ${disabled ? 'opacity-60 cursor-not-allowed bg-gray-50' : ''} ${className}`}
        >
            {/* Selettore Prefisso Internazionale */}
            <div className="flex-shrink-0 bg-gray-50 border-r border-gray-200">
                <select
                    value={dialCode}
                    onChange={handleDialCodeChange}
                    disabled={disabled}
                    aria-label="Prefisso internazionale paese"
                    className="h-full bg-transparent pl-3 pr-2 py-2.5 text-sm font-semibold text-gray-800 cursor-pointer focus:outline-none hover:bg-gray-100 transition-colors"
                >
                    {POPULAR_COUNTRIES.map((c) => (
                        <option key={`${c.code}-${c.dialCode}`} value={c.dialCode}>
                            {c.flag} {c.dialCode} ({c.code})
                        </option>
                    ))}
                </select>
            </div>

            {/* Campo Numero Locale */}
            <input
                type="tel"
                id={id}
                name={name}
                value={localNumber}
                onChange={handleLocalNumberChange}
                placeholder={placeholder}
                required={required}
                disabled={disabled}
                autoComplete={autoComplete}
                className="w-full bg-transparent px-3.5 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none text-sm font-medium"
            />
        </div>
    );
}
