import { normalizeOrderCategory } from '@/lib/orders/orderNumber';
import { formatDeceasedName } from '@/lib/utils/formatDeceasedName';

/** Nome/ricordo per {{2}} del template conferma, per categoria ordine FF/FT/FA/FP. */
export function resolveCustomerConfirmSubjectName(
    orderCategory: string | null | undefined,
    deceasedName?: string | null
): string {
    const trimmed = deceasedName?.trim();
    if (trimmed) return formatDeceasedName(trimmed);

    switch (normalizeOrderCategory(orderCategory)) {
        case 'FA':
            return 'chi amate';
        case 'FP':
            return 'il vostro omaggio';
        case 'FF':
            return 'chi ama';
        case 'FT':
        default:
            return 'chi ama';
    }
}

/** Contesto per warm thought / copy conferma per categoria. */
export function customerConfirmCategoryPrompt(orderCategory: string | null | undefined): {
    contextLine: string;
    example: string;
} {
    switch (normalizeOrderCategory(orderCategory)) {
        case 'FF':
            return {
                contextLine: 'omaggio floreale funebre commemorativo',
                example: 'Le invieremo la foto della posa appena completata.',
            };
        case 'FA':
            return {
                contextLine: 'omaggio floreale per animali d\'affezione',
                example: 'Le invieremo la foto della posa appena completata.',
            };
        case 'FP':
            return {
                contextLine: 'pianta in vaso consegnata con cura',
                example: 'Le invieremo la foto della consegna appena completata.',
            };
        case 'FT':
        default:
            return {
                contextLine: 'omaggio floreale commemorativo sulla tomba',
                example: 'Le invieremo la foto della posa appena completata.',
            };
    }
}
