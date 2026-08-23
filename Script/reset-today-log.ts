/**
 * Svuota docs/verbali/.today_log.txt a 0 byte.
 * Uso: npm run log:verbale:reset-today
 */
import { resetTodayLog, todayLogPath } from '../lib/verbali/todayLog';

resetTodayLog();
console.log(`Reset OK: ${todayLogPath()} (0 byte).`);
