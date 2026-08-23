/**
 * Buffer giornaliero Cursor → verbale: filtro per data ISO e reset post-sync.
 * Formato riga: [YYYY-MM-DD HH:mm] sintesi
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function todayLogPath(cwd = process.cwd()): string {
    return resolve(cwd, 'docs/verbali/.today_log.txt');
}

/** Prefisso data in riga log: `[YYYY-MM-DD` (con spazio o `]` dopo). */
export function lineMatchesIsoDate(line: string, iso: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const trimmed = line.trimStart();
    return trimmed.startsWith(`[${iso} `) || trimmed.startsWith(`[${iso}]`);
}

export type TodayLogFilterResult = {
    iso: string;
    kept: string[];
    discarded: string[];
};

/**
 * Estrae dal buffer solo le righe della giornata `iso`; scarta date precedenti/altre.
 */
export function filterTodayLogByIso(
    raw: string,
    iso: string
): TodayLogFilterResult {
    const kept: string[] = [];
    const discarded: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
        if (!line.trim()) continue;
        if (!/[a-zA-Z0-9]/.test(line)) continue;
        if (lineMatchesIsoDate(line, iso)) kept.push(line);
        else discarded.push(line);
    }
    return { iso, kept, discarded };
}

export function readAndFilterTodayLog(
    iso: string,
    cwd = process.cwd()
): TodayLogFilterResult {
    const path = todayLogPath(cwd);
    if (!existsSync(path)) {
        return { iso, kept: [], discarded: [] };
    }
    return filterTodayLogByIso(readFileSync(path, 'utf8'), iso);
}

/** Svuota il buffer a 0 byte (pronto per il giorno successivo). */
export function resetTodayLog(cwd = process.cwd()): void {
    writeFileSync(todayLogPath(cwd), '', 'utf8');
}
