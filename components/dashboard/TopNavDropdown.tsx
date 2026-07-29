'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

interface DropdownItem {
    href: string;
    label: string;
}

export default function TopNavDropdown({ 
    label, 
    items 
}: { 
    label: string; 
    items: DropdownItem[]; 
}) {
    const pathname = usePathname() || '';
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Chiudi la tendina se si clicca fuori
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Determina se uno dei sottomenu è attivo per evidenziare il bottone padre
    const isAnyChildActive = items.some(item => pathname.startsWith(item.href));

    return (
        <div className="relative inline-block text-left" ref={containerRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 outline-none select-none ${
                    isAnyChildActive
                        ? 'bg-black text-white shadow-sm font-semibold'
                        : isOpen
                        ? 'text-black bg-gray-100'
                        : 'text-gray-600 hover:text-black hover:bg-gray-100'
                }`}
            >
                {label}
                <ChevronDown size={13} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute left-0 mt-1.5 w-48 rounded-xl border border-slate-200/60 bg-white/95 backdrop-blur-md p-1.5 shadow-lg focus:outline-none z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                    {items.map((item) => {
                        const active = pathname.startsWith(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setIsOpen(false)}
                                className={`block px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors ${
                                    active
                                        ? 'bg-black text-white'
                                        : 'text-slate-700 hover:bg-slate-100/70 hover:text-black'
                                }`}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
