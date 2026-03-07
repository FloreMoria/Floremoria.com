import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateSupplierCode } from '@/lib/codeGenerator';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { id, createdAt, updatedAt, deletedAt, ...data } = body;

        let uniqueCode = data.uniqueCode;
        if (!uniqueCode) {
            uniqueCode = await generateSupplierCode();
        }

        const supplier = await prisma.supplier.create({
            data: {
                ...data,
                uniqueCode
            }
        });

        return NextResponse.json(supplier);
    } catch (error) {
        console.error('Error creating supplier:', error);
        return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 });
    }
}
