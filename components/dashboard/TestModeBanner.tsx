export default function TestModeBanner() {
    return (
        <div
            className="bg-amber-500 text-amber-950 text-center text-sm font-semibold py-2 px-4 shrink-0 print:hidden"
            role="status"
        >
            ⚠️ Modalità Test Attiva — solo dati sandbox in dashboard; VERA e messaggi attivi
        </div>
    );
}
