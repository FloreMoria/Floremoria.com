import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import ClientSupplierDossier from './ClientSupplierDossier';

export async function generateMetadata({ params }: { params: { id: string } }) {
    const { id } = await params;
    const supplier = await prisma.supplier.findUnique({
        where: { id },
        select: { companyName: true },
    });
    return {
        title: supplier?.companyName ? `Scheda Fornitore (${supplier.companyName})` : 'Scheda Fornitore',
    };
}

export default async function SupplierDossierPage({ params }: { params: { id: string } }) {
    const { id } = await params;

    const supplier = await prisma.supplier.findUnique({
        where: { id },
        include: {
            invoices: {
                orderBy: {
                    invoiceDate: 'desc'
                }
            }
        }
    });

    if (!supplier) {
        notFound();
    }

    return (
        <div className="w-full px-4 md:px-8 pb-32 space-y-8 py-10 fade-in">
            <ClientSupplierDossier supplier={supplier} initialInvoices={supplier.invoices} />
        </div>
    );
}
