import type { PublicFaqItem } from '@/lib/seo/publicFaq';

function FaqChevron() {
    return (
        <span className="text-fm-gold flex-shrink-0 mt-1 md:mt-0 ml-4 transition-transform duration-300">
            <svg className="block group-open:hidden" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
            </svg>
            <svg className="hidden group-open:block" fill="none" height="24" viewBox="0 0 24 24" width="24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12H4" />
            </svg>
        </span>
    );
}

function FaqDetails({ item, compact }: { item: PublicFaqItem; compact?: boolean }) {
    return (
        <details
            name="faqGroup"
            className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md overflow-hidden open:ring-1 open:ring-fm-gold/30 open:bg-[#FAF9F6]/80 transition-all duration-300"
        >
            <summary
                className={`flex items-start md:items-center justify-between cursor-pointer font-display font-semibold text-gray-900 list-none select-none ${
                    compact ? 'p-4 sm:p-5 text-base sm:text-lg' : 'p-6 text-lg'
                }`}
            >
                <span className="pr-4 leading-snug">{item.question}</span>
                <FaqChevron />
            </summary>
            <div
                className={`pt-0 text-gray-600 font-body border-t border-fm-gold/10 leading-relaxed ${
                    compact ? 'p-4 sm:p-5 text-[15px] sm:text-base' : 'p-6 text-[17px]'
                }`}
            >
                {item.answer}
            </div>
        </details>
    );
}

type PublicFaqAccordionProps = {
    items: PublicFaqItem[];
    /** Due colonne come assistenza; altrimenti lista singola compatta */
    layout?: 'two-column' | 'single';
    className?: string;
};

/**
 * Accordion FAQ pubblico — stesso pattern visivo di /assistenza, testo da fonte unica AEO.
 */
export default function PublicFaqAccordion({
    items,
    layout = 'single',
    className = '',
}: PublicFaqAccordionProps) {
    if (layout === 'two-column') {
        const colA = items.filter((i) => i.column !== 'B');
        const colB = items.filter((i) => i.column === 'B');
        return (
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5 text-left items-start ${className}`}>
                <div className="space-y-4">
                    {colA.map((item) => (
                        <FaqDetails key={item.id} item={item} compact={item.id === colA[0]?.id} />
                    ))}
                </div>
                <div className="space-y-4">
                    {colB.map((item) => (
                        <FaqDetails key={item.id} item={item} />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className={`space-y-3 max-w-3xl mx-auto ${className}`}>
            {items.map((item) => (
                <FaqDetails key={item.id} item={item} compact />
            ))}
        </div>
    );
}
