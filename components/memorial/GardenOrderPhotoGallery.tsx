/**
 * Galleria prove visive per timeline Giardino della Memoria.
 * Mostra tutte le foto Prima/Dopo (nessun limite a [0]).
 */
'use client';

import Image from 'next/image';

type Props = {
    deceasedName: string;
    before: string[];
    after: string[];
    deliveredLabel?: string | null;
};

export default function GardenOrderPhotoGallery({
    deceasedName,
    before,
    after,
    deliveredLabel,
}: Props) {
    const all = [...before, ...after];
    if (all.length === 0) return null;

    const hero = after[0] ?? before[0]!;

    return (
        <div className="mt-4 space-y-4">
            <a
                href={hero}
                target="_blank"
                rel="noopener noreferrer"
                className="relative block h-48 w-full rounded-xl overflow-hidden"
            >
                <Image
                    src={hero}
                    alt={`Testimonianza per ${deceasedName}`}
                    fill
                    className="object-cover transition-transform hover:scale-105 duration-700"
                    unoptimized
                />
            </a>

            {before.length > 0 ? (
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-fm-muted mb-2">
                        Prima della posa
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {before.map((url, i) => (
                            <a
                                key={`before-${url}-${i}`}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-fm-rose-soft/40"
                            >
                                <Image
                                    src={url}
                                    alt={`Prima della posa ${i + 1}`}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                />
                            </a>
                        ))}
                    </div>
                </div>
            ) : null}

            {after.length > 0 ? (
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-fm-muted mb-2">
                        Dopo la posa
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {after.map((url, i) => (
                            <a
                                key={`after-${url}-${i}`}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="relative shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-fm-rose-soft/40"
                            >
                                <Image
                                    src={url}
                                    alt={`Dopo la posa ${i + 1}`}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                />
                            </a>
                        ))}
                    </div>
                </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
                <p className="text-[13px] text-green-700 font-medium flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                        />
                    </svg>
                    Consegna verificata
                    {deliveredLabel ? ` il ${deliveredLabel}` : ''}
                    <span className="text-fm-muted font-normal">
                        {' '}
                        · {all.length} {all.length === 1 ? 'foto' : 'foto'}
                    </span>
                </p>
                <a
                    href={hero}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] font-semibold text-fm-gold underline underline-offset-2 hover:opacity-80"
                >
                    Apri galleria
                </a>
            </div>
        </div>
    );
}
