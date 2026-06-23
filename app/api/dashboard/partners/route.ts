import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generatePartnerCode } from '@/lib/codeGenerator';
import { isFuturiaConfigured, syncFloristPartnerToFuturia } from '@/lib/futuria/client';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { id, createdAt, updatedAt, deletedAt, orders, deliveryProofs, handoffSessions, apiCredentials, ...data } = body;

        let uniqueCode = data.uniqueCode;
        if (!uniqueCode) {
            uniqueCode = await generatePartnerCode(data.province);
        }

        const partner = await prisma.partner.create({
            data: {
                ...data,
                uniqueCode,
                activeOrders: Number(data.activeOrders || 0),
                adminRating: Number(data.adminRating || 5)
            }
        });

        if (isFuturiaConfigured() && partner.whatsappNumber) {
            syncFloristPartnerToFuturia({
                shopName: partner.shopName,
                ownerName: partner.ownerName,
                whatsappNumber: partner.whatsappNumber,
                email: partner.email,
                pecAddress: partner.pecAddress,
            }).catch((err) => {
                console.error('[partners-post] Error syncing new partner to Futuria:', err);
            });
        }

        return NextResponse.json(partner);
    } catch (error) {
        console.error('Error creating partner:', error);
        return NextResponse.json({ error: 'Failed to create partner' }, { status: 500 });
    }
}
