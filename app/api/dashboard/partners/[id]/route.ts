import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generatePartnerCode } from '@/lib/codeGenerator';
import { sendFloremTransactionalMail } from '@/lib/serverMail';
import crypto from 'crypto';

export async function PUT(request: Request, context: any) {
    try {
        const { id } = await context.params;
        const body = await request.json();

        // Remove structural properties that Prisma doesn't need for updates
        const { id: _, createdAt, updatedAt, deletedAt, orders, deliveryProofs, handoffSessions, apiCredentials, ...updateData } = body;

        let uniqueCode = updateData.uniqueCode;

        // Fetch original to compare province if we need to regenerate
        const original = await prisma.partner.findUnique({ where: { id } });

        if (!original) {
            return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
        }

        if (!uniqueCode && !original.uniqueCode) {
            uniqueCode = await generatePartnerCode(updateData.province || original.province);
        } else if (updateData.province && original.province !== updateData.province) {
            // Re-generate if province changes
            uniqueCode = await generatePartnerCode(updateData.province);
        }

        const newEmail = updateData.email?.trim().toLowerCase();
        let userId = original.userId;

        if (newEmail && original.email !== newEmail) {
            let user = await prisma.user.findUnique({ where: { email: newEmail } });
            if (!user) {
                const activationToken = crypto.randomUUID();
                const activationTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

                user = await prisma.user.create({
                    data: {
                        email: newEmail,
                        name: updateData.ownerName || original.ownerName,
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
                        to: newEmail,
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
            } else {
                // If user exists, ensure they are linked to the partner
                if (user.systemRole !== 'FLORIST') {
                    await prisma.user.update({
                        where: { id: user.id },
                        data: { systemRole: 'FLORIST' }
                    });
                }
            }
            userId = user.id;
        }

        const dataToUpdate = {
            ...updateData,
            activeOrders: Number(updateData.activeOrders ?? 0),
            adminRating: Number(updateData.adminRating ?? 5),
            userId
        };

        if (uniqueCode) {
            dataToUpdate.uniqueCode = uniqueCode;
        }

        const partner = await prisma.partner.update({
            where: { id },
            data: dataToUpdate
        });

        return NextResponse.json(partner);
    } catch (error) {
        console.error('Error updating partner:', error);
        return NextResponse.json({ error: 'Failed to update partner' }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: any) {
    try {
        const { id } = await context.params;

        await prisma.partner.update({
            where: { id },
            data: { deletedAt: new Date() }
        });

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error('Error deleting partner:', error);
        return NextResponse.json({ error: 'Failed to delete partner' }, { status: 500 });
    }
}
