import { sendFloremTransactionalMail } from '@/lib/serverMail';

export interface SendInviteEmailParams {
    email: string;
    name?: string | null;
    setupLink: string;
    role: string;
}

/** Traduce i ruoli interni del database in etichette eleganti per il destinatario */
function getRoleLabel(role: string): string {
    const r = role.toUpperCase().trim();
    switch (r) {
        case 'ADMIN':
            return 'Amministratore';
        case 'SUPER_ADMIN':
            return 'Super Amministratore';
        case 'OPERATOR':
            return 'Staff di Supporto (Operatore)';
        case 'FLORIST':
            return 'Fiorista Partner';
        case 'AGENCY':
            return 'Agenzia Partner';
        case 'ACCOUNTANT':
            return 'Consulente Fiscale (Commercialista)';
        case 'STAKEHOLDER':
            return 'Socio / Partner Strategico';
        case 'MUNICIPALITY':
            return 'Referente Comunale';
        default:
            return 'Collaboratore';
    }
}

/** Genera il template HTML per l'email di invito */
export function buildInviteHtml(name: string, setupLink: string, roleLabel: string): string {
    return `
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Benvenuto in FloreMoria</title>
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
        .role-badge {
            display: inline-block;
            background-color: #f1f5f9;
            color: #0f172a;
            font-size: 12px;
            font-weight: 700;
            padding: 6px 14px;
            border-radius: 9999px;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 12px;
            border: 1px solid #e2e8f0;
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
                <div class="greeting">Gentile ${name},</div>
                <div class="description">
                    È stato predisposto il Suo account personale sul portale operativo di <strong>FloreMoria</strong>.
                    <br><br>
                    Profilo e ruolo assegnato:
                    <br>
                    <div style="margin-top: 12px; margin-bottom: 4px;">
                        <span class="role-badge">${roleLabel}</span>
                    </div>
                    Per completare l'attivazione ed impostare la Sua password di sicurezza personale, La invitiamo a cliccare sul collegamento sottostante.
                </div>
                
                <div class="button-container">
                    <a href="${setupLink}" target="_blank" class="btn-setup">Attiva il mio Account</a>
                </div>

                <div class="description" style="font-size: 13px; color: #64748b;">
                    <em>Nota di sicurezza: Questo collegamento è strettamente riservato ed è valido per le prossime 48 ore. Se non ha richiesto questo account, può ignorare questa comunicazione.</em>
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
 * Invia l'email con il link di invito per impostare la password.
 */
export async function sendInviteEmail(params: SendInviteEmailParams): Promise<{ ok: boolean; error?: string }> {
    const name = params.name || 'Collaboratore';
    const roleLabel = getRoleLabel(params.role);
    const html = buildInviteHtml(name, params.setupLink, roleLabel);
    
    const plainText = `
Gentile ${name},
È stato creato il Suo account personale su FloreMoria come ${roleLabel}.
Per completare l'attivazione e impostare la Sua password, visiti questo collegamento entro 48 ore:
${params.setupLink}

Firma:
FloreMoria Assistance
assistenza@floremoria.com
    `.trim();

    return await sendFloremTransactionalMail({
        to: params.email,
        subject: `Benvenuto in FloreMoria — Attiva il tuo account come ${roleLabel}`,
        html,
        text: plainText,
    });
}
