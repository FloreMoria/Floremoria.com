import { sendFloremTransactionalMail } from '@/lib/serverMail';

export interface SendMagicLinkEmailParams {
    email: string;
    setupLink: string;
}

/** Genera il template HTML per l'email del link magico */
export function buildMagicLinkHtml(setupLink: string): string {
    return `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Accedi a FloreMoria</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #f8fafc;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
            line-height: 1.6;
        }
        .wrapper {
            width: 100%;
            background-color: #f8fafc;
            padding: 40px 0;
        }
        .container {
            max-width: 580px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.02);
            border: 1px solid #e2e8f0;
        }
        .header {
            background-color: #0f172a;
            padding: 32px;
            text-align: center;
            border-bottom: 3px solid #c5a880;
        }
        .logo-text {
            color: #ffffff;
            font-size: 24px;
            font-weight: 700;
            letter-spacing: 2px;
            text-transform: uppercase;
            margin: 0;
        }
        .logo-sub {
            color: #c5a880;
            font-size: 11px;
            letter-spacing: 3px;
            text-transform: uppercase;
            margin: 4px 0 0 0;
        }
        .content {
            padding: 40px 32px;
        }
        .greeting {
            font-size: 18px;
            font-weight: 600;
            color: #0f172a;
            margin-top: 0;
            margin-bottom: 20px;
        }
        .description {
            font-size: 15px;
            color: #475569;
            margin-bottom: 30px;
        }
        .button-container {
            text-align: center;
            margin: 35px 0;
        }
        .btn-setup {
            display: inline-block;
            background-color: #0f172a;
            color: #ffffff !important;
            text-decoration: none;
            padding: 14px 30px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 15px;
            letter-spacing: 0.5px;
            transition: background-color 0.2s;
            border-bottom: 2px solid #c5a880;
        }
        .footer {
            background-color: #f8fafc;
            padding: 24px 32px;
            text-align: center;
            border-top: 1px solid #e2e8f0;
            font-size: 12px;
            color: #64748b;
        }
        .footer-link {
            color: #c5a880;
            text-decoration: none;
        }
        .raw-link {
            font-size: 12px;
            color: #94a3b8;
            word-break: break-all;
            margin-top: 25px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <div class="logo-text">FloreMoria</div>
                <div class="logo-sub">Ricordo e Devozione</div>
            </div>
            <div class="content">
                <div class="greeting">Gentile Utente,</div>
                <div class="description">
                    Ha richiesto un accesso rapido e sicuro senza password alla Sua bacheca personale di <strong>FloreMoria</strong>.
                    <br><br>
                    Clicchi sul pulsante sottostante per effettuare l'accesso ed entrare direttamente nella Sua area riservata per tracciare i Suoi ordini.
                </div>
                
                <div class="button-container">
                    <a href="${setupLink}" target="_blank" class="btn-setup">Accedi a FloreMoria</a>
                </div>

                <div class="description" style="font-size: 13px; color: #64748b;">
                    <em>Nota di sicurezza: Questo collegamento è valido esclusivamente per i prossimi 15 minuti. Se non ha richiesto questo accesso, può ignorare questa comunicazione in tutta sicurezza.</em>
                </div>

                <div class="raw-link">
                    Se il pulsante non funziona, copi e incolli questo indirizzo nel browser:<br>
                    <a href="${setupLink}" style="color: #64748b;">${setupLink}</a>
                </div>
            </div>
            <div class="footer">
                <strong>FloreMoria Assistance</strong><br>
                Al tuo servizio tutti i giorni dalle 8:00 alle 22:00<br>
                <a href="mailto:assistenza@floremoria.com" class="footer-link">assistenza@floremoria.com</a> • <a href="https://www.floremoria.com" class="footer-link">www.floremoria.com</a>
            </div>
        </div>
    </div>
</body>
</html>
    `.trim();
}

/**
 * Invia l'email con il link magico per accedere.
 */
export async function sendMagicLinkEmail(params: SendMagicLinkEmailParams): Promise<{ ok: boolean; error?: string }> {
    const html = buildMagicLinkHtml(params.setupLink);
    
    const plainText = `
Gentile Utente,
Ha richiesto l'accesso senza password a FloreMoria.
Clicchi su questo collegamento entro 15 minuti per accedere alla Sua bacheca personale:
${params.setupLink}

Firma:
FloreMoria Assistance
assistenza@floremoria.com
    `.trim();

    return await sendFloremTransactionalMail({
        to: params.email,
        subject: 'Accedi a FloreMoria — Collegamento di accesso rapido',
        html,
        text: plainText,
    });
}
