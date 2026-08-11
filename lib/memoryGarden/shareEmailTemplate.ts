/**
 * Template HTML Quiet Luxury per condivisione Giardino della Memoria via email.
 * Tono: SOFIA (dignità) + ALMA (empatia) — nessuna urgenza commerciale.
 */

function esc(s: string | null | undefined): string {
    if (s == null || s === '') return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export type MemorialShareEmailInput = {
    gardenUrl: string;
    deceasedName: string;
    senderName: string;
    customMessage?: string | null;
};

export function buildMemorialShareEmailSubject(deceasedName: string, senderName: string): string {
    const who = deceasedName.trim() || 'un caro ricordo';
    const from = senderName.trim();
    if (from) return `${from} Le condivide il Giardino della Memoria di ${who}`;
    return `Un invito al Giardino della Memoria di ${who} — FloreMoria`;
}

export function buildMemorialShareEmailText(input: MemorialShareEmailInput): string {
    const deceased = input.deceasedName.trim() || 'un caro';
    const sender = input.senderName.trim() || 'Qualcuno che Le vuole bene';
    const custom = input.customMessage?.trim();
    const lines = [
        `Gentile destinatario,`,
        ``,
        `${sender} desidera condividere con Lei il Giardino della Memoria dedicato a ${deceased}.`,
    ];
    if (custom) {
        lines.push(``, `Messaggio personale:`, custom);
    }
    lines.push(
        ``,
        `Visiti il Giardino della Memoria:`,
        input.gardenUrl,
        ``,
        `Con cura,`,
        `FloreMoria — I Fiori della Memoria`
    );
    return lines.join('\n');
}

export function buildMemorialShareEmailHtml(input: MemorialShareEmailInput): string {
    const deceased = esc(input.deceasedName.trim() || 'un caro');
    const sender = esc(input.senderName.trim() || 'Qualcuno che Le vuole bene');
    const gardenUrl = esc(input.gardenUrl.trim());
    const custom = input.customMessage?.trim()
        ? esc(input.customMessage.trim()).replace(/\n/g, '<br />')
        : '';

    return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Giardino della Memoria — FloreMoria</title>
</head>
<body style="margin:0;padding:0;background-color:#f7f4ef;font-family:Georgia,'Times New Roman',serif;color:#2c2416;line-height:1.6;">
  <div style="width:100%;padding:40px 16px;background-color:#f7f4ef;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #eadfce;box-shadow:0 8px 30px rgba(44,36,22,0.06);">
      <div style="background:#1a1510;padding:36px 28px;text-align:center;border-bottom:3px solid #c5a880;">
        <p style="margin:0;color:#ffffff;font-size:22px;letter-spacing:3px;text-transform:uppercase;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-weight:700;">FloreMoria</p>
        <p style="margin:8px 0 0;color:#c5a880;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Giardino della Memoria Infinita</p>
      </div>
      <div style="padding:40px 32px;">
        <p style="margin:0 0 18px;font-size:18px;color:#1a1510;">Gentile destinatario,</p>
        <p style="margin:0 0 18px;font-size:15px;color:#5c5346;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <strong style="color:#1a1510;">${sender}</strong> desidera condividere con Lei lo spazio dedicato a
          <em style="color:#8a7048;">${deceased}</em> — un luogo quieto dove i gesti d&apos;affetto restano custoditi nel tempo.
        </p>
        ${
            custom
                ? `<div style="margin:24px 0;padding:18px 20px;background:#faf7f2;border-left:3px solid #c5a880;border-radius:0 12px 12px 0;">
            <p style="margin:0 0 6px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#a08960;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-weight:700;">Messaggio personale</p>
            <p style="margin:0;font-size:15px;color:#3d3428;font-style:italic;">${custom}</p>
          </div>`
                : ''
        }
        <div style="text-align:center;margin:36px 0 28px;">
          <a href="${gardenUrl}" style="display:inline-block;background:#1a1510;color:#ffffff !important;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:600;font-size:15px;letter-spacing:0.3px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;border-bottom:2px solid #c5a880;">
            Visita il Giardino della Memoria
          </a>
        </div>
        <p style="margin:0;font-size:12px;color:#94a3b8;word-break:break-all;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          Se il pulsante non funziona, apra questo link:<br />
          <a href="${gardenUrl}" style="color:#c5a880;text-decoration:none;">${gardenUrl}</a>
        </p>
      </div>
      <div style="background:#faf7f2;padding:22px 28px;text-align:center;border-top:1px solid #eadfce;font-size:12px;color:#7a7164;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <p style="margin:0 0 6px;">Con cura e discrezione — FloreMoria</p>
        <p style="margin:0;"><a href="https://www.floremoria.com" style="color:#c5a880;text-decoration:none;">www.floremoria.com</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}
