import prisma from '@/lib/prisma';

export async function generatePartnerCode(province: string): Promise<string> {
    const prov = (province || 'XX').substring(0, 2).toUpperCase();
    const prefix = `FS-${prov}-`;

    const lastPartner = await prisma.partner.findFirst({
        where: { uniqueCode: { startsWith: prefix } },
        orderBy: { uniqueCode: 'desc' }
    });

    if (!lastPartner || !lastPartner.uniqueCode) {
        return `${prefix}001`;
    }

    const parts = lastPartner.uniqueCode.split('-');
    if (parts.length === 3) {
        const lastNum = parseInt(parts[2], 10);
        if (!isNaN(lastNum)) {
            const nextNum = (lastNum + 1).toString().padStart(3, '0');
            return `${prefix}${nextNum}`;
        }
    }

    return `${prefix}001`;
}

export async function generateSupplierCode(countryCode: string = 'IT'): Promise<string> {
    const cc = (countryCode || 'IT').substring(0, 2).toUpperCase();
    const prefix = `FN-${cc}-`;

    const lastSupplier = await prisma.supplier.findFirst({
        where: { uniqueCode: { startsWith: prefix } },
        orderBy: { uniqueCode: 'desc' }
    });

    if (!lastSupplier || !lastSupplier.uniqueCode) {
        return `${prefix}001`;
    }

    const parts = lastSupplier.uniqueCode.split('-');
    if (parts.length === 3) {
        const lastNum = parseInt(parts[2], 10);
        if (!isNaN(lastNum)) {
            const nextNum = (lastNum + 1).toString().padStart(3, '0');
            return `${prefix}${nextNum}`;
        }
    }

    return `${prefix}001`;
}
