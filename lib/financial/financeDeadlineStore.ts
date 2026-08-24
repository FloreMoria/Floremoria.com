/**
 * Stato scadenze F24 / adempimenti S.r.l. — Neon SystemState (non /tmp).
 * Perché: su Vercel financial_ledger.json è effimero e si perde a ogni cold start.
 */

import prisma from '@/lib/prisma';
import type { FinancialLedger } from '@/lib/financial/types';

export const FINANCE_DEADLINES_STATE_KEY = 'finance.deadlines.state';

export type DeadlineStatus = 'PENDING' | 'DUE_SOON' | 'PAID' | 'ARCHIVED' | 'SCADUTO';

export type FinanceDeadlineState = {
    completedDeadlineIds: string[];
    deadlineStatusById: Record<string, string>;
};

const EMPTY: FinanceDeadlineState = {
    completedDeadlineIds: [],
    deadlineStatusById: {},
};

function parseState(raw: string | null | undefined): FinanceDeadlineState {
    if (!raw) return { ...EMPTY, deadlineStatusById: {} };
    try {
        const parsed = JSON.parse(raw) as Partial<FinanceDeadlineState>;
        const completedDeadlineIds = Array.isArray(parsed.completedDeadlineIds)
            ? parsed.completedDeadlineIds.map(String).filter(Boolean)
            : [];
        const deadlineStatusById =
            parsed.deadlineStatusById && typeof parsed.deadlineStatusById === 'object'
                ? Object.fromEntries(
                      Object.entries(parsed.deadlineStatusById).map(([k, v]) => [
                          String(k),
                          String(v),
                      ])
                  )
                : {};
        return { completedDeadlineIds, deadlineStatusById };
    } catch {
        return { ...EMPTY, deadlineStatusById: {} };
    }
}

export async function getFinanceDeadlineState(): Promise<FinanceDeadlineState> {
    const row = await prisma.systemState.findUnique({
        where: { key: FINANCE_DEADLINES_STATE_KEY },
    });
    return parseState(row?.value);
}

export async function saveFinanceDeadlineState(
    state: FinanceDeadlineState
): Promise<FinanceDeadlineState> {
    const payload: FinanceDeadlineState = {
        completedDeadlineIds: [...new Set(state.completedDeadlineIds.map(String).filter(Boolean))],
        deadlineStatusById: { ...state.deadlineStatusById },
    };
    await prisma.systemState.upsert({
        where: { key: FINANCE_DEADLINES_STATE_KEY },
        create: {
            key: FINANCE_DEADLINES_STATE_KEY,
            value: JSON.stringify(payload),
        },
        update: { value: JSON.stringify(payload) },
    });
    return payload;
}

/** Unisce lo stato Neon nel ledger API (senza scrivere scadenze sul file JSON). */
export function mergeDeadlineStateIntoLedger(
    ledger: FinancialLedger,
    state: FinanceDeadlineState
): FinancialLedger {
    return {
        ...ledger,
        completedDeadlineIds: state.completedDeadlineIds,
        deadlineStatusById: state.deadlineStatusById,
    };
}

/**
 * Se Neon è vuoto ma il file locale ha ancora scadenze, le migra una volta.
 * Perché: non perdere F24 già segnate prima della Fase 1.
 */
export async function migrateDeadlineStateFromLedgerFileIfNeeded(
    fileLedger: FinancialLedger
): Promise<FinanceDeadlineState> {
    const current = await getFinanceDeadlineState();
    const hasNeon =
        current.completedDeadlineIds.length > 0 ||
        Object.keys(current.deadlineStatusById).length > 0;
    if (hasNeon) return current;

    const fromFile: FinanceDeadlineState = {
        completedDeadlineIds: fileLedger.completedDeadlineIds || [],
        deadlineStatusById: fileLedger.deadlineStatusById || {},
    };
    if (
        fromFile.completedDeadlineIds.length === 0 &&
        Object.keys(fromFile.deadlineStatusById).length === 0
    ) {
        return current;
    }
    const saved = await saveFinanceDeadlineState(fromFile);
    // Pulisce le scadenze dal file JSON (persistenza solo Neon).
    try {
        const { getLedger, saveLedger } = await import('@/lib/financial/ledgerStore');
        saveLedger(getLedger());
    } catch (err) {
        console.warn('[financeDeadlineStore] strip file deadlines fallito', err);
    }
    return saved;
}

export async function toggleDeadlineCompleted(deadlineId: string): Promise<FinanceDeadlineState> {
    const state = await getFinanceDeadlineState();
    const idx = state.completedDeadlineIds.indexOf(deadlineId);
    if (idx >= 0) state.completedDeadlineIds.splice(idx, 1);
    else state.completedDeadlineIds.push(deadlineId);
    return saveFinanceDeadlineState(state);
}

export async function setDeadlineStatus(
    deadlineId: string,
    status: DeadlineStatus
): Promise<FinanceDeadlineState> {
    const state = await getFinanceDeadlineState();
    state.deadlineStatusById[deadlineId] = status;
    const idx = state.completedDeadlineIds.indexOf(deadlineId);
    if (status === 'PAID' || status === 'ARCHIVED') {
        if (idx < 0) state.completedDeadlineIds.push(deadlineId);
    } else if (idx >= 0) {
        state.completedDeadlineIds.splice(idx, 1);
    }
    return saveFinanceDeadlineState(state);
}
