import prisma from '@/lib/prisma';

export async function generatePartnerCode(province: string): Promise<string> {
    const rawProv = (province || '').trim().toUpperCase();
    const prov = rawProv.length >= 2 ? rawProv.substring(0, 2) : 'XX';
    const prefix = `FS-${prov}-`;

    const partners = await prisma.partner.findMany({
        where: { uniqueCode: { startsWith: prefix } },
        select: { uniqueCode: true }
    });

    let maxNum = 0;
    for (const p of partners) {
        if (!p.uniqueCode) continue;
        const parts = p.uniqueCode.split('-');
        if (parts.length >= 3) {
            const num = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(num) && num > maxNum) {
                maxNum = num;
            }
        }
    }

    const nextNum = (maxNum + 1).toString().padStart(3, '0');
    return `${prefix}${nextNum}`;
}

export async function generateSupplierCode(countryCode: string = 'IT'): Promise<string> {
    const rawCc = (countryCode || 'IT').trim().toUpperCase();
    const cc = rawCc.length >= 2 ? rawCc.substring(0, 2) : 'IT';
    const prefix = `FN-${cc}-`;

    const suppliers = await prisma.supplier.findMany({
        where: { uniqueCode: { startsWith: prefix } },
        select: { uniqueCode: true }
    });

    let maxNum = 0;
    for (const s of suppliers) {
        if (!s.uniqueCode) continue;
        const parts = s.uniqueCode.split('-');
        if (parts.length >= 3) {
            const num = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(num) && num > maxNum) {
                maxNum = num;
            }
        }
    }

    const nextNum = (maxNum + 1).toString().padStart(3, '0');
    return `${prefix}${nextNum}`;
}

