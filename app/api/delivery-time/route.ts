import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    // Ora corrente in Italia
    const nowItalyStr = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Rome',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(new Date());

    // converto la stringa MM/DD/YYYY, HH:MM:SS in oggetto Date locale del server 
    // (usiamo match per parsarlo correttamente senza incastri del timezone)
    const [datePart, timePart] = nowItalyStr.split(', ');
    const [month, day, year] = datePart.split('/');
    const [hour, min, sec] = timePart.split(':');

    // Creiamo una data "isolata" che rappresenta l'ora esatta in Italia 
    // (i calcoli matematici sottostanti useranno la timezone del server, ma con i valori numerici di Roma)
    const nowItaly = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(min), Number(sec));

    let minDateFT = new Date(nowItaly);
    minDateFT.setHours(minDateFT.getHours() + 48);

    // Gestione weekend e orari non validi per FT -> portiamo eventuale ora notturna alle 09:00
    if (minDateFT.getHours() < 9) {
        minDateFT.setHours(9, 0, 0, 0);
    } else if (minDateFT.getHours() >= 17) {
        minDateFT.setDate(minDateFT.getDate() + 1);
        minDateFT.setHours(9, 0, 0, 0);
    }

    let minDateFF = new Date(nowItaly);
    minDateFF.setHours(minDateFF.getHours() + 4);

    if (minDateFF.getHours() < 9) {
        minDateFF.setHours(9, 0, 0, 0);
    } else if (minDateFF.getHours() >= 17) {
        minDateFF.setDate(minDateFF.getDate() + 1);
        minDateFF.setHours(9, 0, 0, 0);
    }

    // Funzione helper per formattare a YYYY-MM-DDThh:mm (input datetime-local compatibile UTC-agnostico)
    const formatForInput = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dayStr = String(d.getDate()).padStart(2, '0');
        const h = String(d.getHours()).padStart(2, '0');
        const minStr = String(d.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${dayStr}T${h}:${minStr}`;
    };

    return NextResponse.json({
        nowItalyIso: formatForInput(nowItaly),
        minDateFTText: formatForInput(minDateFT),
        minDateFFText: formatForInput(minDateFF)
    }, { status: 200 });
}
