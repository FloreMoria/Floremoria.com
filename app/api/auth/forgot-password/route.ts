import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import crypto from 'crypto';
import { sendFloremTransactionalMail } from '@/lib/serverMail';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

        if (!email) {
            return NextResponse.json({ success: false, message: 'Email obbligatoria.' }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (user) {
            const resetPasswordToken = crypto.randomUUID();
            const resetPasswordTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 ora

            await prisma.user.update({
                where: { id: user.id },
                data: {
                    resetPasswordToken,
                    resetPasswordTokenExpires
                }
            });

            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.floremoria.com';
            const resetUrl = `${baseUrl}/auth/reset-password?token=${resetPasswordToken}`;

            try {
                await sendFloremTransactionalMail({
                    to: email,
                    subject: 'Recupero Password FloreMoria',
                    html: `
                        <div style="font-family: sans-serif; padding: 20px; color: #333;">
                            <p>Gentile utente,</p>
                            <p>abbiamo ricevuto una richiesta di ripristino della password per il tuo account su FloreMoria.</p>
                            <p>Per impostare una nuova password, clicca sul link seguente:</p>
                            <p style="margin: 24px 0;">
                                <a href="${resetUrl}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Reimposta Password</a>
                            </p>
                            <p>Il link è valido per 1 ora. Se non hai effettuato tu la richiesta, puoi ignorare questo messaggio.</p>
                            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                            <p style="font-size: 12px; color: #777;">Un cordiale saluto,<br>Team FloreMoria</p>
                        </div>
                    `
                });
            } catch (emailErr) {
                console.error('Failed to send reset password email:', emailErr);
            }
        }

        return NextResponse.json({
            success: true,
            message: "Se l'indirizzo email inserito è associato a un account, riceverai a breve il link per reimpostare la tua password."
        });
    } catch (error) {
        console.error('[forgot-password] Errore:', error);
        return NextResponse.json({ success: false, message: 'Errore interno del server.' }, { status: 500 });
    }
}
