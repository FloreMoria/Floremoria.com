import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET() {
    try {
        const partnerId = 'f067beff-e351-4484-81b2-5b16bdf27801';
        
        console.log('→ Upserting B2B Partner in cloud db...');
        const partner = await prisma.partner.upsert({
            where: { id: partnerId },
            update: {
                shopName: 'Annunci Funebri',
                ownerName: 'Referral Partner',
                uniqueCode: 'ANNUNCI_FUNEBRI',
                isActive: true,
            },
            create: {
                id: partnerId,
                shopName: 'Annunci Funebri',
                ownerName: 'Referral Partner',
                uniqueCode: 'ANNUNCI_FUNEBRI',
                address: 'Milano',
                province: 'MI',
                whatsappNumber: '393111111111',
                isActive: true,
            },
        });

        const testPublicId = 'fmp_test_annuncifunebri_2026';
        const secretHash = '049b7999c979ad8ec9da3c7806e734a1:0e85217c6948ba35c8a6a91206885315b1a65a7bf9eb5649b417e2b41cf31849332dac2a659d1d4666e19c919d1c923573463baddbb62a9cf68219fed3571d25';

        console.log('→ Upserting Partner API Credential in cloud db...');
        const credential = await prisma.partnerApiCredential.upsert({
            where: { publicId: testPublicId },
            update: {
                partnerId,
                isActive: true,
            },
            create: {
                partnerId,
                label: 'Test Annunci Funebri',
                publicId: testPublicId,
                secretHash,
                isActive: true,
            },
        });

        return NextResponse.json({
            success: true,
            message: 'Database aligned successfully in cloud production!',
            partnerId: partner.id,
            partnerShopName: partner.shopName,
            credentialPublicId: credential.publicId
        });
    } catch (error: any) {
        console.error('Error during cloud seed:', error);
        return NextResponse.json({
            success: false,
            error: error.message || error
        }, { status: 500 });
    }
}
