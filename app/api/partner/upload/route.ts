import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Endpoint riservato a upload partner (es. foto ordine).
 * File mantenuto come modulo valido per TypeScript / build; logica da collegare quando attiva.
 */
export async function POST() {
    return NextResponse.json(
        { error: 'Endpoint upload partner non ancora implementato su questa route.' },
        { status: 501 }
    );
}

