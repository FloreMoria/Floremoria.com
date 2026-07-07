import { after } from 'next/server';
import { triggerPostmanBackgroundSync } from '@/lib/postman/triggerBackgroundSync';

/** Debounce globale: piggyback sync IMAP POSTMAN sul traffico del sito. */
export default function PostmanSyncHeartbeat() {
    after(() => {
        void triggerPostmanBackgroundSync();
    });
    return null;
}
