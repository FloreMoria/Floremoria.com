import React from 'react';
import Link from 'next/link';

export default function AnimalBanner() {
    return (
        <section className="mt-5 md:mt-7 max-w-3xl mx-auto px-4">
            <Link href="/per-animali-domestici" className="block group">
                <div className="bg-gradient-to-r from-gray-50 to-[#F5F7F5] rounded-[20px] p-4 sm:p-5 md:p-6 border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4 relative overflow-hidden shadow-sm group-hover:shadow-md group-hover:border-[#e6ede7] transition-all duration-300 cursor-pointer">
                    
                    {/* SVG Icon (Paw -> Leaf stylized shadow) - Ridotta del 25% (180px), più visibile e realistica (4 dita) */}
                    <div className="absolute right-0 md:right-3 bottom-[-16px] opacity-[0.09] pointer-events-none transform -rotate-12 transition-transform duration-500 group-hover:scale-105 group-hover:-rotate-6">
                        <svg width="130" height="130" viewBox="0 0 100 100" fill="currentColor" className="text-[#3b5e40]">
                            {/* Paw base stylized as a leaf */}
                            <path d="M50 85 C30 75, 20 50, 35 35 C45 25, 55 25, 65 35 C80 50, 70 75, 50 85 Z" />
                            {/* 4 little paw pads */}
                            <circle cx="28" cy="30" r="8" />
                            <circle cx="42" cy="15" r="9" />
                            <circle cx="58" cy="15" r="9" />
                            <circle cx="72" cy="30" r="8" />
                        </svg>
                    </div>

                    <div className="relative z-10 text-center md:text-left space-y-1 max-w-lg">
                        <p className="text-[16px] sm:text-[18px] md:text-[19px] font-display font-medium text-gray-700 tracking-tight leading-snug group-hover:text-gray-900 transition-colors">
                            Per gli amici che hanno lasciato un&apos;impronta sul cuore.
                        </p>
                    </div>
                    
                    <div className="relative z-10 shrink-0">
                        {/* Span invece di Link per evitare l'annidamento illegale dei tag <a> */}
                        <span 
                            className="inline-block bg-white/60 group-hover:bg-white text-gray-700 group-hover:text-gray-900 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full transition-all text-[13px] sm:text-[14px] font-medium shadow-[0_2px_10px_rgba(0,0,0,0.02)] group-hover:shadow-[0_4px_15px_rgba(0,0,0,0.05)]"
                        >
                            Scopri il servizio Piccoli Amici
                        </span>
                    </div>
                </div>
            </Link>
        </section>
    );
}
