import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generatePartnerCode } from '@/lib/codeGenerator';
import { sendFloremTransactionalMail } from '@/lib/serverMail';
import crypto from 'crypto';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { id, createdAt, updatedAt, deletedAt, orders, deliveryProofs, handoffSessions, apiCredentials, ...data } = body;

        let uniqueCode = data.uniqueCode;
        if (!uniqueCode) {
            uniqueCode = await generatePartnerCode(data.province);
        }

        const partnerEmail = data.email?.trim().toLowerCase();
        let userId = null;
        if (partnerEmail) {
            let user = await prisma.user.findUnique({ where: { email: partnerEmail } });
            if (!user) {
                const activationToken = crypto.randomUUID();
                const activationTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

                user = await prisma.user.create({
                    data: {
                        email: partnerEmail,
                        name: data.ownerName || '',
                        systemRole: 'FLORIST',
                        isActive: false,
                        isActivated: false,
                        activationToken,
                        activationTokenExpires,
                    }
                });

                const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.floremoria.com';
                const activationUrl = `${baseUrl}/auth/activate?token=${activationToken}`;
                try {
                    await sendFloremTransactionalMail({
                        to: partnerEmail,
                        subject: 'Attiva il tuo account fiorista su FloreMoria',
                        html: `
                            <div style="font-family: sans-serif; padding: 20px; color: #333;">
                                <p>Gentile fiorista,</p>
                                <p>il tuo account partner è stato creato su FloreMoria.</p>
                                <p>Per attivare il tuo profilo e scegliere la tua password di accesso, clicca sul link seguente:</p>
                                <p style="margin: 24px 0;">
                                    <a href="${activationUrl}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Attiva Account</a>
                                </p>
                                <p>Il link è valido per 7 giorni.</p>
                                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                                <p style="font-size: 12px; color: #777;">Un cordiale saluto,<br>Team FloreMoria</p>
                            </div>
                        `
                    });
                } catch (emailErr) {
                    console.error('Failed to send activation email:', emailErr);
                }
            }
            userId = user.id;
        }

        const partner = await prisma.partner.create({
            data: {
                ...data,
                uniqueCode,
                activeOrders: Number(data.activeOrders || 0),
                adminRating: Number(data.adminRating || 5),
                userId
            }
        });

        return NextResponse.json(partner);
    } catch (error) {
        console.error('Error creating partner:', error);
        return NextResponse.json({ error: 'Failed to create partner' }, { status: 500 });
    }
}
