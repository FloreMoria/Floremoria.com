'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { ProfileUserType } from '@prisma/client';
import { MAX_PLANNED_DELIVERY_DATES } from '@/lib/users/profileUserType';

const NO_COMMITMENT_BANNER =
    '💡 Le date che inserisci non comportano alcun impegno d\'acquisto! Qualche giorno prima di ogni data programmata ti invieremo un comodo link su WhatsApp: se desideri procedere ti basterà un clic per completare il pagamento, altrimenti l\'invio verrà semplicemente ignorato senza alcun costo.';

type PlannedDeliveryDatesEditorProps = {
    dates: string[];
    onChange: (dates: string[]) => void;
    bannerText?: string;
    idPrefix?: string;
    disabled?: boolean;
    /** Nasconde il banner se SUBSCRIBER. */
    userType?: ProfileUserType | null;
    showNoCommitmentBanner?: boolean;
};

export default function PlannedDeliveryDatesEditor({
    dates,
    onChange,
    bannerText = NO_COMMITMENT_BANNER,
    idPrefix = 'planned-date',
    disabled = false,
    userType = null,
    showNoCommitmentBanner,
}: PlannedDeliveryDatesEditorProps) {
    const canAdd = dates.length < MAX_PLANNED_DELIVERY_DATES;
    const showBanner =
        showNoCommitmentBanner !== undefined
            ? showNoCommitmentBanner
            : userType !== 'SUBSCRIBER';

    const updateAt = (index: number, value: string) => {
        const next = [...dates];
        next[index] = value;
        onChange(next);
    };

    const removeAt = (index: number) => {
        onChange(dates.filter((_, i) => i !== index));
    };

    const addDate = () => {
        if (!canAdd) return;
        onChange([...dates, '']);
    };

    return (
        <div className="space-y-3">
            {showBanner ? (
                <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 leading-relaxed">
                    {bannerText}
                </div>
            ) : null}

            <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Date delle future consegne ({dates.filter(Boolean).length}/{MAX_PLANNED_DELIVERY_DATES})
                </label>
                <button
                    type="button"
                    onClick={addDate}
                    disabled={disabled || !canAdd}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                    <Plus size={14} /> Aggiungi data
                </button>
            </div>

            {dates.length === 0 ? (
                <p className="text-sm text-slate-400">
                    Nessuna data programmata. Usa &quot;+ Aggiungi data&quot; per inserirne fino a{' '}
                    {MAX_PLANNED_DELIVERY_DATES}.
                </p>
            ) : (
                <ul className="space-y-2">
                    {dates.map((date, index) => (
                        <li key={`${idPrefix}-${index}`} className="flex items-center gap-2">
                            <input
                                id={`${idPrefix}-${index}`}
                                type="date"
                                value={date}
                                disabled={disabled}
                                onChange={(e) => updateAt(index, e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-sm text-slate-800 focus:ring-2 focus:ring-[#c5a880] focus:border-[#c5a880] outline-none disabled:opacity-60"
                            />
                            <button
                                type="button"
                                onClick={() => removeAt(index)}
                                disabled={disabled}
                                className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
                                aria-label={`Rimuovi data ${index + 1}`}
                            >
                                <Trash2 size={16} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export { NO_COMMITMENT_BANNER };
