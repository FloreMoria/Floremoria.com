/** Mittenti di sistema (bounce, daemon) da non elaborare con POSTMAN. */
const SYSTEM_SENDER_PATTERNS: RegExp[] = [
    /^mailer-daemon@/i,
    /^mail-daemon@/i,
    /^postmaster@/i,
    /^noreply@/i,
    /^no-reply@/i,
    /^bounce\+/i,
];

export function isSystemEmailSender(fromEmail: string): boolean {
    const email = fromEmail.trim().toLowerCase();
    if (!email) return false;
    return SYSTEM_SENDER_PATTERNS.some((pattern) => pattern.test(email));
}
