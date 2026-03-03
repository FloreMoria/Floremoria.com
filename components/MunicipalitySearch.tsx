'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface MunicipalitySearchProps {
    showButton?: boolean;
    buttonText?: string;
    placeholder?: string;
}

export default function MunicipalitySearch({ showButton = false, buttonText = 'Cerca', placeholder = 'Es. Como (CO), Milano (MI)…' }: MunicipalitySearchProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Array<{ name: string; province: string; slug: string }>>([]);
    const [isOpen, setIsOpen] = useState(false);
    const router = useRouter();
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (query.length < 2) {
            setResults([]);
            setIsOpen(false);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/municipalities?q=${encodeURIComponent(query)}`);
                const data = await res.json();
                setResults(data);
                setIsOpen(true);
            } catch (err) {
                console.error('Error fetching municipalities', err);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (slug: string) => {
        setIsOpen(false);
        setQuery('');
        router.push(`/consegna-fiori-cimitero/${slug}`);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (results.length > 0) {
            handleSelect(results[0].slug);
        }
    };

    return (
        <div className="max-w-md mx-auto mt-8 relative" ref={wrapperRef}>
            <form onSubmit={handleSubmit} className={`flex flex-col sm:flex-row gap-4 items-center w-full`}>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={placeholder}
                    className="w-full h-[48px] px-[14px] rounded-[10px] border border-gray-200 bg-white font-body text-fm-text shadow-sm focus:outline-none focus:ring-2 focus:ring-fm-gold/30 focus:border-fm-gold transition-all"
                />
                {showButton && (
                    <button type="submit" className="w-full sm:w-auto h-[48px] px-8 bg-fm-gold text-white font-semibold rounded-[10px] whitespace-nowrap hover:brightness-110 transition-all shadow-sm">
                        {buttonText}
                    </button>
                )}
            </form>
            {isOpen && (
                <ul className="absolute z-10 w-full mt-2 bg-white border border-fm-rose-soft/30 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                    {results.length > 0 ? results.map((m) => (
                        <li
                            key={m.slug}
                            onClick={() => handleSelect(m.slug)}
                            className="px-4 py-3 hover:bg-fm-section cursor-pointer text-left text-fm-text flex justify-between items-center border-b border-fm-rose-soft/30 font-body last:border-0"
                        >
                            <span className="font-semibold whitespace-nowrap overflow-hidden text-ellipsis mr-2">{m.name} ({m.province})</span>
                        </li>
                    )) : (
                        <li className="px-4 py-3 text-fm-muted font-body text-center text-sm">Nessun comune trovato</li>
                    )}
                </ul>
            )}
        </div>
    );
}
