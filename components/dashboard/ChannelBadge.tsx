import React from 'react';

export function ChannelBadge({ channel }: { channel: string | null }) {
    if (!channel) {
        return (
            <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500">
                —
            </span>
        );
    }

    const norm = channel.toLowerCase();

    // 1. Diretta FloreMoria
    if (norm.includes('floremoria') || norm.includes('dirett')) {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-gradient-to-r from-emerald-500/15 via-rose-500/10 to-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-950 dark:text-emerald-200 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {channel}
            </span>
        );
    }

    // 2. Annunci Funebri / AF
    if (norm.includes('af') || norm.includes('annunci')) {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                {channel}
            </span>
        );
    }

    // 3. Fiorista Convenzionato / Segnalazione
    if (norm.includes('fiorista') || norm.includes('segnalazion') || norm.includes('convenzion')) {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {channel}
            </span>
        );
    }

    // 4. API Esterna / Altri Partner
    return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-purple-500/30 bg-purple-500/15 px-2.5 py-0.5 text-xs font-semibold text-purple-700 dark:text-purple-300 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            {channel}
        </span>
    );
}
