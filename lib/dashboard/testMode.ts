import { cookies } from 'next/headers';
import type { Prisma } from '@prisma/client';

/** Cookie HttpOnly: attiva la sandbox admin sulla dashboard. */
export const DASHBOARD_TEST_MODE_COOKIE = 'fm_dashboard_test_mode';

/** 30 giorni — preferenza admin di sessione prolungata. */
export const DASHBOARD_TEST_MODE_MAX_AGE_SEC = 60 * 60 * 24 * 30;

export function parseDashboardTestModeCookie(value: string | undefined | null): boolean {
    return value === '1' || value === 'true';
}

export async function getDashboardTestModeActive(): Promise<boolean> {
    const cookieStore = await cookies();
    return parseDashboardTestModeCookie(cookieStore.get(DASHBOARD_TEST_MODE_COOKIE)?.value);
}

export function dashboardTestOrderFilter(testModeActive: boolean): Prisma.OrderWhereInput {
    return { isTest: testModeActive };
}

export function dashboardTestUserFilter(testModeActive: boolean): Prisma.UserWhereInput {
    return { isTest: testModeActive };
}

export function dashboardTestChatFilter(testModeActive: boolean): Prisma.WhatsAppChatSessionWhereInput {
    return { isTest: testModeActive };
}
