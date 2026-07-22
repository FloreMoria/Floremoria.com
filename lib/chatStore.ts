import * as fs from 'fs';
import * as path from 'path';
import prisma from './prisma';
import { formatItalyTime } from '@/lib/datetime/italyTimezone';

export interface ChatMessage {
    id: string;
    direction: 'INBOUND' | 'OUTBOUND';
    body: string;
    mediaUrl?: string;
    metadata?: Record<string, string>;
    timestamp: string;
    createdAt?: string;
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
// Perché: valutato a runtime (non a import) così dotenv/script possono impostare DATABASE_URL
// prima di addMessage. Script locali senza NODE_ENV=production altrimenti scrivevano solo JSON
// mentre WhatsApp reale partiva e la dashboard (Neon) restava vuota.
// Override: FLOREM_CHAT_USE_JSON=1 forza il file locale anche con DATABASE_URL.
function useDatabasePersistence(): boolean {
    if (process.env.FLOREM_CHAT_USE_JSON === '1') return false;
    if (process.env.FLOREM_CHAT_USE_DB === '1') return true;
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') return true;
    return Boolean(process.env.DATABASE_URL?.trim());
}
type PersistenceMode = 'disk' | 'memory';
let persistenceMode: PersistenceMode = 'disk';
let memoryStore: Record<string, ChatSession> | null = null;

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
        status: 'HUMAN_INTERVENTION',
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

function nowTimeLabel(): string {
    return formatItalyTime();
}

function asUserType(value: string): 'UTENTE' | 'FLORIST' | 'UNKNOWN' {
    if (value === 'UTENTE' || value === 'FLORIST') return value;
    return 'UNKNOWN';
}

function asStatus(value: string): 'AI_ACTIVE' | 'HUMAN_INTERVENTION' | 'CLOSED' {
    if (value === 'HUMAN_INTERVENTION' || value === 'CLOSED') return value;
    return 'AI_ACTIVE';
}

function mapDbSessionToChatSession(session: {
    phone: string;
    name: string;
    userType: string;
    status: string;
    welcomeSent: boolean;
    lastMessage: string;
    hasPhoto: boolean;
    dateLabel: string;
    timeLabel: string;
    initials: string;
    updatedAt: Date;
    messages: Array<{
        id: string;
        direction: string;
        body: string;
        mediaUrl: string | null;
        metadata: unknown;
        timestampLabel: string;
        createdAt: Date;
    }>;
}): ChatSession {
    return {
        phone: session.phone,
        name: session.name,
        userType: asUserType(session.userType),
        status: asStatus(session.status),
        welcomeSent: session.welcomeSent,
        lastMessage: session.lastMessage || '',
        hasPhoto: session.hasPhoto || undefined,
        date: session.dateLabel || 'oggi',
        time: session.timeLabel || nowTimeLabel(),
        initials: session.initials || 'UT',
        messages: session.messages.map((msg) => ({
            id: msg.id,
            direction: msg.direction === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND',
            body: msg.body,
            mediaUrl: msg.mediaUrl || undefined,
            metadata: typeof msg.metadata === 'object' && msg.metadata ? (msg.metadata as Record<string, string>) : undefined,
            timestamp: msg.timestampLabel || nowTimeLabel(),
            createdAt: msg.createdAt.toISOString(),
        })),
        updatedAt: session.updatedAt.toISOString(),
    };
}

async function ensureDbSession(phone: string, isTest = false): Promise<ChatSession> {
    const existing = await prisma.whatsAppChatSession.findUnique({
        where: { phone },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (existing) return mapDbSessionToChatSession(existing);

    const initials = phone.replace(/[^\d]/g, '').slice(-2) || 'UT';
    const created = await prisma.whatsAppChatSession.create({
        data: {
            phone,
            name: phone.replace('whatsapp:', ''),
            userType: 'UNKNOWN',
            status: 'AI_ACTIVE',
            welcomeSent: false,
            lastMessage: '',
            hasPhoto: false,
            dateLabel: 'oggi',
            timeLabel: nowTimeLabel(),
            initials,
            isTest,
        },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    return mapDbSessionToChatSession(created);
}

export type GetChatStoreOptions = {
    isTest?: boolean;
};

export async function markChatSessionAsTest(phone: string): Promise<void> {
    if (!useDatabasePersistence()) return;
    await ensureDbSession(phone);
    await prisma.whatsAppChatSession.update({
        where: { phone },
        data: { isTest: true },
    });
}

export async function getChatStore(options?: GetChatStoreOptions): Promise<Record<string, ChatSession>> {
    if (useDatabasePersistence()) {
        const sessions = await prisma.whatsAppChatSession.findMany({
            where: options?.isTest !== undefined ? { isTest: options.isTest } : undefined,
            orderBy: { updatedAt: 'desc' },
            include: { messages: { orderBy: { createdAt: 'asc' } } },
        });
        return sessions.reduce<Record<string, ChatSession>>((acc, session) => {
            const mapped = mapDbSessionToChatSession(session);
            acc[mapped.phone] = mapped;
            return acc;
        }, {});
    }

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

export async function saveChatStore(store: Record<string, ChatSession>) {
    if (useDatabasePersistence()) {
        return;
    }
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

export async function getSession(phone: string): Promise<ChatSession> {
    if (useDatabasePersistence()) {
        return ensureDbSession(phone);
    }

    const store = await getChatStore();
    if (!store[phone]) {
        const initials = phone.replace(/[^\d]/g, '').slice(-2);
        store[phone] = {
            phone,
            name: phone.replace('whatsapp:', ''),
            userType: 'UNKNOWN',
            status: 'AI_ACTIVE',
            welcomeSent: false,
            lastMessage: '',
            date: 'oggi',
            time: nowTimeLabel(),
            initials: initials || 'UT',
            messages: [],
            updatedAt: new Date().toISOString()
        };
        await saveChatStore(store);
    }
    return store[phone];
}

export async function addMessage(
    phone: string,
    direction: 'INBOUND' | 'OUTBOUND',
    body: string,
    mediaUrl?: string,
    metadata?: Record<string, string>
): Promise<ChatSession> {
    if (useDatabasePersistence()) {
        const session = await ensureDbSession(phone);
        const timeStr = nowTimeLabel();
        const updated = await prisma.whatsAppChatSession.update({
            where: { phone },
            data: {
                lastMessage: body,
                hasPhoto: mediaUrl ? true : session.hasPhoto || false,
                dateLabel: 'oggi',
                timeLabel: timeStr,
                messages: {
                    create: {
                        direction,
                        body,
                        mediaUrl: mediaUrl || null,
                        metadata: metadata || undefined,
                        timestampLabel: timeStr,
                    },
                },
            },
            include: { messages: { orderBy: { createdAt: 'asc' } } },
        });
        return mapDbSessionToChatSession(updated);
    }

    const store = await getChatStore();
    const session = store[phone] || (await getSession(phone));
    const now = new Date();
    const timeStr = formatItalyTime(now);
    const newMessage: ChatMessage = {
        id: 'msg-' + Math.random().toString(36).substr(2, 9),
        direction,
        body,
        mediaUrl,
        metadata,
        timestamp: timeStr,
        createdAt: now.toISOString(),
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
    await saveChatStore(store);
    return session;
}

export async function setSessionStatus(phone: string, status: 'AI_ACTIVE' | 'HUMAN_INTERVENTION' | 'CLOSED'): Promise<ChatSession> {
    if (useDatabasePersistence()) {
        await ensureDbSession(phone);
        const updated = await prisma.whatsAppChatSession.update({
            where: { phone },
            data: { status },
            include: { messages: { orderBy: { createdAt: 'asc' } } },
        });
        return mapDbSessionToChatSession(updated);
    }

    const store = await getChatStore();
    const session = store[phone] || (await getSession(phone));
    session.status = status;
    session.updatedAt = new Date().toISOString();
    store[phone] = session;
    await saveChatStore(store);
    return session;
}

export async function updateSessionProfile(
    phone: string,
    updates: Partial<Pick<ChatSession, 'name' | 'userType' | 'status' | 'initials' | 'lastMessage' | 'hasPhoto' | 'welcomeSent'>>
): Promise<ChatSession> {
    if (useDatabasePersistence()) {
        await ensureDbSession(phone);
        const updated = await prisma.whatsAppChatSession.update({
            where: { phone },
            data: {
                ...(updates.name !== undefined ? { name: updates.name } : {}),
                ...(updates.userType !== undefined ? { userType: updates.userType } : {}),
                ...(updates.status !== undefined ? { status: updates.status } : {}),
                ...(updates.initials !== undefined ? { initials: updates.initials } : {}),
                ...(updates.lastMessage !== undefined ? { lastMessage: updates.lastMessage } : {}),
                ...(updates.hasPhoto !== undefined ? { hasPhoto: updates.hasPhoto } : {}),
                ...(updates.welcomeSent !== undefined ? { welcomeSent: updates.welcomeSent } : {}),
            },
            include: { messages: { orderBy: { createdAt: 'asc' } } },
        });
        return mapDbSessionToChatSession(updated);
    }

    const store = await getChatStore();
    const session = store[phone] || (await getSession(phone));
    const nextSession: ChatSession = {
        ...session,
        ...updates,
        updatedAt: new Date().toISOString(),
    };
    store[phone] = nextSession;
    await saveChatStore(store);
    return nextSession;
}
