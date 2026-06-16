import { isLikelySchemaDriftError } from '@/lib/dashboardSafeQuery';

type Props = {
    page: string;
    errors: string[];
};

export default function DashboardDbAlert({ page, errors }: Props) {
    if (errors.length === 0) return null;

    const schemaDrift = errors.some(isLikelySchemaDriftError);

    return (
        <div
            role="alert"
            className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
            <p className="font-semibold">
                {schemaDrift
                    ? 'Database non allineato — alcune sezioni di questa pagina non sono disponibili.'
                    : `Errore temporaneo nel caricamento di ${page}.`}
            </p>
            <p className="mt-1 text-amber-900/90">
                {schemaDrift ? (
                    <>
                        Eseguire sul database di produzione:{' '}
                        <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs">
                            npm run db:migrate:deploy
                        </code>{' '}
                        (con <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs">DATABASE_URL</code>{' '}
                        di produzione), poi ridistribuire su Vercel.
                    </>
                ) : (
                    'Riprovare tra qualche minuto. Se persiste, controllare i log server (Vercel → Functions).'
                )}
            </p>
        </div>
    );
}
