/**
 * Adapter: riconciliazione estratto conto → algoritmo in lib/financial/reconciliation.ts.
 */

import type { ParsedBankMovement, StatementMatchResult } from './types';
import {
    reconcileBankMovement,
    reconcileBankMovements,
} from '@/lib/financial/reconciliation';

export async function reconcileParsedMovement(
    movement: ParsedBankMovement
): Promise<StatementMatchResult> {
    return reconcileBankMovement(movement);
}

export async function reconcileAllMovements(
    movements: ParsedBankMovement[]
): Promise<StatementMatchResult[]> {
    return reconcileBankMovements(movements);
}
