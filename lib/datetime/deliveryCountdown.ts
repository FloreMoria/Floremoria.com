/**
 * Calcolo del tempo residuo per la consegna di un ordine e stato urgenza.
 * Regole countdown:
 * - Verde: > 12h alla consegna
 * - Arancione: tra 6h e 12h alla consegna
 * - Rosso con "URGENTE": < 6h alla consegna o scaduto
 */

export type DeliveryCountdownVariant = 'green' | 'orange' | 'red' | 'neutral';

export interface DeliveryCountdownResult {
    hoursLeft: number;
    diffMinutes: number;
    variant: DeliveryCountdownVariant;
    label: string;
    isUrgent: boolean;
    isOverdue: boolean;
    deadline: Date;
    badgeClasses: string;
}

const TZ = 'Europe/Rome';

function toValidDate(value: Date | string | null | undefined): Date | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Converte una data grezza nella deadline effettiva.
 * Se la data è a mezzanotte (date-only standard), imposta le 12:00 Europe/Rome come scadenza di riferimento.
 */
export function getEffectiveDeliveryDeadline(rawDate: Date | string | null | undefined): Date | null {
    const d = toValidDate(rawDate);
    if (!d) return null;

    try {
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: TZ,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).formatToParts(d);

        const getPart = (type: Intl.DateTimeFormatPartTypes) =>
            parts.find((p) => p.type === type)?.value || '0';

        const hour = Number(getPart('hour'));
        const minute = Number(getPart('minute'));

        // Se mezzanotte esatta (data senza ora inserita dall'utente), consideriamo la scadenza alle 12:00 del giorno
        if (hour === 0 && minute === 0) {
            const day = getPart('day');
            const month = getPart('month');
            const year = getPart('year');
            const noonIso = `${year}-${month}-${day}T12:00:00+02:00`;
            const noonDate = new Date(noonIso);
            if (!Number.isNaN(noonDate.getTime())) {
                return noonDate;
            }
        }
    } catch {
        // Fallback al Date originale se Intl fallisce
    }

    return d;
}

/**
 * Calcola il countdown di consegna per un ordine.
 */
export function calculateDeliveryCountdown(
    deliveryDate: Date | string | null | undefined,
    status?: string | null,
    now: Date = new Date()
): DeliveryCountdownResult | null {
    const deadline = getEffectiveDeliveryDeadline(deliveryDate);
    if (!deadline) return null;

    const isTerminalStatus =
        status === 'COMPLETED' ||
        status === 'DELIVERED' ||
        status === 'DELIVERED_UNPAID' ||
        status === 'DELIVERED_REFUNDED' ||
        status === 'CANCELLED';

    const diffMs = deadline.getTime() - now.getTime();
    const diffMinutes = Math.round(diffMs / (60 * 1000));
    const hoursLeft = diffMs / (60 * 60 * 1000);

    if (isTerminalStatus) {
        return {
            hoursLeft,
            diffMinutes,
            variant: 'neutral',
            label: status === 'CANCELLED' ? 'Annullato' : 'Consegnato',
            isUrgent: false,
            isOverdue: false,
            deadline,
            badgeClasses: 'bg-gray-100 text-gray-600 border-gray-200',
        };
    }

    // Scaduto
    if (diffMinutes < 0) {
        const absMinutes = Math.abs(diffMinutes);
        const absHours = Math.abs(Math.round(hoursLeft));
        const absDays = Math.abs(Math.floor(hoursLeft / 24));

        let overdueText = '';
        if (absMinutes < 60) {
            overdueText = `Scaduto da ${absMinutes}m`;
        } else if (absHours < 24) {
            overdueText = `Scaduto da ${absHours}h`;
        } else {
            overdueText = `Scaduto da ${absDays}g`;
        }

        return {
            hoursLeft,
            diffMinutes,
            variant: 'red',
            label: `${overdueText} (URGENTE)`,
            isUrgent: true,
            isOverdue: true,
            deadline,
            badgeClasses: 'bg-rose-100 text-rose-800 border-rose-300 font-bold animate-pulse',
        };
    }

    // Meno di 6 ore (< 6h): Rosso URGENTE
    if (hoursLeft < 6) {
        let remainingText = '';
        if (diffMinutes < 60) {
            remainingText = `${diffMinutes}m rimasti`;
        } else {
            const h = Math.floor(hoursLeft);
            const m = diffMinutes % 60;
            remainingText = m > 0 ? `${h}h ${m}m rimaste` : `${h}h rimaste`;
        }

        return {
            hoursLeft,
            diffMinutes,
            variant: 'red',
            label: `${remainingText} (URGENTE)`,
            isUrgent: true,
            isOverdue: false,
            deadline,
            badgeClasses: 'bg-rose-50 text-rose-700 border-rose-300 font-bold',
        };
    }

    // Tra 6h e 12h: Arancione
    if (hoursLeft <= 12) {
        const h = Math.round(hoursLeft);
        return {
            hoursLeft,
            diffMinutes,
            variant: 'orange',
            label: `${h}h rimaste`,
            isUrgent: false,
            isOverdue: false,
            deadline,
            badgeClasses: 'bg-amber-50 text-amber-700 border-amber-300 font-medium',
        };
    }

    // Più di 12h: Verde
    if (hoursLeft <= 48) {
        const h = Math.round(hoursLeft);
        return {
            hoursLeft,
            diffMinutes,
            variant: 'green',
            label: `${h}h rimaste`,
            isUrgent: false,
            isOverdue: false,
            deadline,
            badgeClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-medium',
        };
    }

    const days = Math.round(hoursLeft / 24);
    return {
        hoursLeft,
        diffMinutes,
        variant: 'green',
        label: `${days}g rimasti`,
        isUrgent: false,
        isOverdue: false,
        deadline,
        badgeClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-medium',
    };
}
