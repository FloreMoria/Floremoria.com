import * as fs from 'fs';
import * as path from 'path';

export interface ChatMessage {
    id: string;
    direction: 'INBOUND' | 'OUTBOUND';
    body: string;
    mediaUrl?: string;
    metadata?: Record<string, string>;
    timestamp: string;
}

export interface ChatSession {
    phone: string;
    name: string;
    userType: 'UTENTE' | 'FLORIST' | 'UNKNOWN';
    status: 'AI_ACTIVE' | 'HUMAN_INTERVENTION' | 'CLOSED';
    welcomeSent?: boolean;
    lastMessage: string;
    hasPhoto?: boolean;
    date: string;
    time: string;
    initials: string;
    messages: ChatMessage[];
    updatedAt: string;
}

const dbPath = path.join(process.cwd(), 'chats_database.json');
type PersistenceMode = 'disk' | 'memory';
let persistenceMode: PersistenceMode = 'disk';
let memoryStore: Record<string, ChatSession> | null = null;

function cloneSessions(source: Record<string, ChatSession>): Record<string, ChatSession> {
    return JSON.parse(JSON.stringify(source)) as Record<string, ChatSession>;
}

function getMemoryStore(): Record<string, ChatSession> {
    if (!memoryStore) {
        memoryStore = cloneSessions(defaultSessions);
    }
    return memoryStore;
}

function switchToMemoryStore(candidate?: Record<string, ChatSession>): Record<string, ChatSession> {
    persistenceMode = 'memory';
    memoryStore = candidate ? cloneSessions(candidate) : getMemoryStore();
    return memoryStore;
}

// Initialize with nice mock data if file does not exist
const defaultSessions: Record<string, ChatSession> = {
    'whatsapp:+393331112222': {
        phone: 'whatsapp:+393331112222',
        name: 'Cesaroni Isabella',
        userType: 'UTENTE',
        status: 'AI_ACTIVE',
        welcomeSent: true,
        lastMessage: 'Ne siamo sempre felici 🌹',
        date: 'sabato',
        time: '10:30',
        initials: 'CI',
        messages: [
            { id: 'm1', direction: 'INBOUND', body: 'Buongiorno, desideravo sapere se il bouquet di rose gialle è stato consegnato al cimitero.', timestamp: '10:15' },
            { id: 'm2', direction: 'OUTBOUND', body: 'Gentile Isabella, sono Vito l\'assistente FloreMoria. Sì, le confermo che il fiorista partner ha completato la posa con la massima cura. Ecco la foto prova per lei!', timestamp: '10:20' },
            { id: 'm3', direction: 'INBOUND', body: 'Ne siamo sempre felici 🌹', timestamp: '10:30' }
        ],
        updatedAt: new Date().toISOString()
    },
    'whatsapp:+393444222333': {
        phone: 'whatsapp:+393444222333',
        name: 'Medda Gabriele',
        userType: 'FLORIST',
        status: 'HUMAN_INTERVENTION', // Richiede l'attenzione dell'amministratore
        welcomeSent: true,
        lastMessage: 'Ecco la foto di controllo per l\'ordine FT-RM-26-001',
        date: 'oggi',
        time: '11:44',
        initials: 'MG',
        hasPhoto: true,
        messages: [
            { id: 'm4', direction: 'INBOUND', body: 'Buongiorno, qui fiorista Medda Gabriele. Sto completando la consegna al cimitero.', timestamp: '11:40' },
            { id: 'm5', direction: 'INBOUND', body: 'Ecco la foto di controllo per l\'ordine FT-RM-26-001', mediaUrl: 'https://www.floremoria.com/images/products/fiori-sulle-tombe/Bouquet Rose/bouquet-rose-giallo-classico-cimitero-consegna-ferrara.webp', timestamp: '11:44' }
        ],
        updatedAt: new Date().toISOString()
    }
};

export function getChatStore(): Record<string, ChatSession> {
    if (persistenceMode === 'memory') {
        return getMemoryStore();
    }

    try {
        if (!fs.existsSync(dbPath)) {
            const initial = cloneSessions(defaultSessions);
            try {
                fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2), 'utf-8');
                return initial;
            } catch (writeErr) {
                console.warn('Chat store file not writable, using in-memory fallback', writeErr);
                return switchToMemoryStore(initial);
            }
        }
        const data = fs.readFileSync(dbPath, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        console.error('Error loading chat store, using in-memory fallback', e);
        return switchToMemoryStore();
    }
}

export function saveChatStore(store: Record<string, ChatSession>) {
    if (persistenceMode === 'memory') {
        memoryStore = cloneSessions(store);
        return;
    }

    try {
        fs.writeFileSync(dbPath, JSON.stringify(store, null, 2), 'utf-8');
    } catch (e) {
        console.error('Error saving chat store, switching to memory mode', e);
        switchToMemoryStore(store);
    }
}

export function getSession(phone: string): ChatSession {
    const store = getChatStore();
    if (!store[phone]) {
        // Create new session
        const initials = phone.replace(/[^\d]/g, '').slice(-2);
        store[phone] = {
            phone,
            name: phone.replace('whatsapp:', ''),
            userType: 'UNKNOWN',
            status: 'AI_ACTIVE',
            welcomeSent: false,
            lastMessage: '',
            date: 'oggi',
            time: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
            initials: initials || 'UT',
            messages: [],
            updatedAt: new Date().toISOString()
        };
        saveChatStore(store);
    }
    return store[phone];
}

export function addMessage(
    phone: string,
    direction: 'INBOUND' | 'OUTBOUND',
    body: string,
    mediaUrl?: string,
    metadata?: Record<string, string>
): ChatSession {
    const store = getChatStore();
    const session = store[phone] || getSession(phone);

    const now = new Date();
    const timeStr = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    
    const newMessage: ChatMessage = {
        id: 'msg-' + Math.random().toString(36).substr(2, 9),
        direction,
        body,
        mediaUrl,
        metadata,
        timestamp: timeStr
    };

    session.messages.push(newMessage);
    session.lastMessage = body;
    if (mediaUrl) {
        session.hasPhoto = true;
    }
    session.time = timeStr;
    session.date = 'oggi';
    session.updatedAt = now.toISOString();

    store[phone] = session;
    saveChatStore(store);
    return session;
}

export function setSessionStatus(phone: string, status: 'AI_ACTIVE' | 'HUMAN_INTERVENTION' | 'CLOSED'): ChatSession {
    const store = getChatStore();
    const session = store[phone] || getSession(phone);
    session.status = status;
    session.updatedAt = new Date().toISOString();
    store[phone] = session;
    saveChatStore(store);
    return session;
}

export function updateSessionProfile(
    phone: string,
    updates: Partial<Pick<ChatSession, 'name' | 'userType' | 'status' | 'initials' | 'lastMessage' | 'hasPhoto' | 'welcomeSent'>>
): ChatSession {
    const store = getChatStore();
    const session = store[phone] || getSession(phone);

    const nextSession: ChatSession = {
        ...session,
        ...updates,
        updatedAt: new Date().toISOString(),
    };

    store[phone] = nextSession;
    saveChatStore(store);
    return nextSession;
}
