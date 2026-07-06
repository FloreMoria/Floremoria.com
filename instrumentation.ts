import { ensureItalyProcessTimezone } from '@/lib/datetime/italyTimezone';

export async function register() {
    ensureItalyProcessTimezone();
}
