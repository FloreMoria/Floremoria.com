import prisma from '@/lib/prisma';
import ClientSuppliersTable from './ClientSuppliersTable';
export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
    const suppliers = await prisma.supplier.findMany({
        where: { deletedAt: null },
        orderBy: { companyName: 'asc' },
    });

    return (
        <div className="max-w-7xl mx-auto px-6 py-10 pb-20 fade-in">
            <div className="mb-8">
                <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Fornitori</h1>
                <p className="text-gray-500 font-medium">
                    Gestisci la rubrica dei fornitori di materiali, software e consulenze.
                </p>
            </div>

            <ClientSuppliersTable initialSuppliers={suppliers} />
        </div>
    );
}
