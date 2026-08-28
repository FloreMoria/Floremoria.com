import type { ReactNode } from 'react';

/** Classi condivise: scroll orizzontale isolato per tabelle dashboard su mobile. */
export const DASHBOARD_TABLE_SCROLL_CLASS =
    'dashboard-table-scroll w-full max-w-full overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 custom-scrollbar';

type Props = {
    children: ReactNode;
    className?: string;
};

/**
 * Contenitore scrollabile per tabelle larghe — evita overflow della viewport su iPhone.
 */
export default function DashboardTableScroll({ children, className = '' }: Props) {
    return <div className={`${DASHBOARD_TABLE_SCROLL_CLASS} ${className}`.trim()}>{children}</div>;
}
