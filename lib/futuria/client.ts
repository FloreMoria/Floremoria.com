/**
 * Client HTTP Futuria CRM API v2 (LeadConnector / GHL).
 * Upsert contatti + invio messaggi su canali Email / WhatsApp.
 */
import {
    getFuturiaApiBase,
    getFuturiaApiKey,
    getFuturiaApiVersion,
    getFuturiaDeceasedFieldConfig,
    getFuturiaLocationId,
    getFuturiaBusinessWhatsAppPhone,
    isFuturiaConfigured,
} from './config';
import {
    buildDeceasedCustomFieldsPayload,
    buildDeceasedSlotKeys,
    readFuturiaCustomFieldId,
    type FuturiaCustomFieldEntry,
    type FuturiaCustomFieldWrite,
} from './deceasedContactFields';
import { resolveFuturiaCustomFieldIds } from './customFieldRegistry';
import {
    assertFuturiaContactAllowed,
    type FuturiaContactAuth,
    FuturiaContactGateError,
} from './contactGate';

export type { FuturiaContactAuth };
export { FuturiaContactGateError };

export type FuturiaMessageType = 'Email' | 'WhatsApp' | 'SMS';

export interface FuturiaUpsertContactInput {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    tags?: string[];
    /** Nome defunto ordine corrente — merge append-only sui custom field Futuria. */
    deceasedName?: string | null;
    orderNumber?: string | null;
    /** Campi personalizzati aggiuntivi passati come chiave-valore. */
    additionalCustomFields?: Record<string, string | number | null>;
}

export interface FuturiaSendEmailInput {
    contactId: string;
    emailFrom: string;
    subject: string;
    html: string;
    text?: string;
    emailBcc?: string[];
    replyTo?: string;
}

export interface FuturiaSendWhatsAppInput {
    contactId: string;
    message?: string;
    toNumber?: string;
    /** Template Meta approvato (richiesto per messaggi business-initiated fuori 24h). */
    templateId?: string;
    /** URL pubblici immagine/documento (foto testimonianza fiorista). */
    attachments?: string[];
}

/** Pulsante CTA URL WhatsApp (Meta interactive cta_url) — nasconde l'URL nel corpo. */
export interface FuturiaSendWhatsAppCtaInput {
    contactId: string;
    body: string;
    buttonText: string;
    url: string;
    footer?: string;
}

export class FuturiaApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly body?: string
    ) {
        super(message);
        this.name = 'FuturiaApiError';
    }
}

function splitFullName(fullName: string | undefined): { firstName?: string; lastName?: string } {
    const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return {};
    if (parts.length === 1) return { firstName: parts[0] };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/** Normalizza telefono italiano in E.164 per Futuria (+39...). */
export function normalizeFuturiaPhone(raw: string | null | undefined): string | null {
    let p = (raw || '').replace(/[^\d+]/g, '').trim();
    if (!p) return null;
    if (p.startsWith('00')) p = `+${p.slice(2)}`;
    if (!p.startsWith('+')) {
        if (p.startsWith('39')) p = `+${p}`;
        else p = `+39${p}`;
    }
    if (!/^\+\d{8,15}$/.test(p)) return null;
    return p;
}

/** True se il destinatario coincide con la linea WhatsApp business (Meta rifiuta l'invio). */
export function isSameAsBusinessWhatsAppPhone(raw: string | null | undefined): boolean {
    const target = normalizeFuturiaPhone(raw);
    const business = normalizeFuturiaPhone(getFuturiaBusinessWhatsAppPhone());
    if (!target || !business) return false;
    return target === business;
}

export interface FuturiaMessageRecord {
    id?: string;
    status?: string;
    error?: string;
    direction?: string;
}

/** Legge stato reale consegna messaggio (queued ≠ delivered). */
export async function getFuturiaMessage(messageId: string): Promise<FuturiaMessageRecord | null> {
    const data = await futuriaFetch<{ message?: FuturiaMessageRecord }>(
        `/conversations/messages/${messageId}`,
        { method: 'GET' }
    );
    return data.message ?? null;
}

async function waitForFuturiaMessageStatus(
    messageId: string,
    maxAttempts = 4,
    delayMs = 800
): Promise<FuturiaMessageRecord | null> {
    for (let i = 0; i < maxAttempts; i += 1) {
        const record = await getFuturiaMessage(messageId);
        if (!record) return null;
        const status = record.status?.toLowerCase();
        if (status && status !== 'pending' && status !== 'queued') {
            return record;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return getFuturiaMessage(messageId);
}

async function futuriaFetch<T>(path: string, init: RequestInit): Promise<T> {
    const apiKey = getFuturiaApiKey();
    if (!apiKey) throw new FuturiaApiError('FUTURIA_API_KEY mancante', 0);

    const res = await fetch(`${getFuturiaApiBase()}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
            Version: getFuturiaApiVersion(),
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            ...(init.headers || {}),
        },
    });

    const text = await res.text();
    if (!res.ok) {
        throw new FuturiaApiError(
            `Futuria API ${path} → HTTP ${res.status}`,
            res.status,
            text.slice(0, 800)
        );
    }

    if (!text.trim()) return {} as T;
    return JSON.parse(text) as T;
}

export interface FuturiaContactRecord {
    id: string;
    email?: string;
    phone?: string;
    customFields?: FuturiaCustomFieldEntry[];
    tags?: string[];
}

/** Interroga Futuria/GHL per contatto esistente (telefono o email). */
export async function findFuturiaDuplicateContact(params: {
    phone?: string;
    email?: string;
}): Promise<FuturiaContactRecord | null> {
    const locationId = getFuturiaLocationId();
    if (!locationId) return null;

    const qs = new URLSearchParams({ locationId });
    if (params.phone?.trim()) {
        qs.set('number', params.phone.trim());
    } else if (params.email?.trim()) {
        qs.set('email', params.email.trim().toLowerCase());
    } else {
        return null;
    }

    try {
        const data = await futuriaFetch<{ contact?: FuturiaContactRecord }>(
            `/contacts/search/duplicate?${qs.toString()}`,
            { method: 'GET' }
        );
        return data.contact?.id ? data.contact : null;
    } catch (error) {
        if (error instanceof FuturiaApiError && (error.status === 400 || error.status === 404)) {
            return null;
        }
        throw error;
    }
}

function mergeContactTags(existing?: string[], incoming?: string[]): string[] | undefined {
    if (!incoming?.length) return incoming;
    if (!existing?.length) return incoming;
    
    let merged = [...new Set([...existing, ...incoming])];
    
    const existingLower = existing.map(t => t.toLowerCase());
    const incomingLower = incoming.map(t => t.toLowerCase());
    
    const hasExistingNuovoUtente = existingLower.includes('nuovo-utente');
    const hasExistingUtenteStorico = existingLower.includes('utente-storico') || existingLower.includes('cliente-storico');
    const hasIncomingNuovoUtente = incomingLower.includes('nuovo-utente');
    const hasIncomingUtenteStorico = incomingLower.includes('utente-storico') || incomingLower.includes('cliente-storico');
    
    // Se l'incoming contiene utente-storico, O se l'incoming contiene nuovo-utente
    // ma il contatto esistente ha già nuovo-utente o utente-storico:
    // il contatto finale deve avere utente-storico e deve essere rimosso nuovo-utente.
    if (hasIncomingUtenteStorico || (hasIncomingNuovoUtente && (hasExistingNuovoUtente || hasExistingUtenteStorico))) {
        // Rimuoviamo nuovo-utente
        merged = merged.filter(t => t.toLowerCase() !== 'nuovo-utente');
        // Rimuoviamo anche cliente-storico se presente per uniformità
        merged = merged.filter(t => t.toLowerCase() !== 'cliente-storico');
        // Assicuriamo utente-storico
        if (!merged.some(t => t.toLowerCase() === 'utente-storico')) {
            merged.push('utente-storico');
        }
    } else {
        // Altrimenti, se tra i tag finali c'è utente-storico/cliente-storico, rimuoviamo nuovo-utente
        const hasFinalUtenteStorico = merged.some(t => t.toLowerCase() === 'utente-storico' || t.toLowerCase() === 'cliente-storico');
        if (hasFinalUtenteStorico) {
            merged = merged.filter(t => t.toLowerCase() !== 'nuovo-utente');
            // Rinominiamo cliente-storico in utente-storico per uniformità
            merged = merged.filter(t => t.toLowerCase() !== 'cliente-storico');
            if (!merged.some(t => t.toLowerCase() === 'utente-storico')) {
                merged.push('utente-storico');
            }
        } else if (merged.some(t => t.toLowerCase() === 'nuovo-utente')) {
            // Se c'è nuovo-utente, assicuriamo che non ci sia utente-storico
            merged = merged.filter(t => t.toLowerCase() !== 'utente-storico' && t.toLowerCase() !== 'cliente-storico');
        }
    }
    
    return merged;
}

/** Espone la logica merge defunti per script di test / dry-run. */
export async function prepareDeceasedCustomFieldsForUpsert(
    existingCustomFields: FuturiaCustomFieldEntry[] | undefined,
    deceasedName: string
): Promise<FuturiaCustomFieldWrite[]> {
    const config = getFuturiaDeceasedFieldConfig();
    const keys = [
        config.storicoKey,
        config.defuntoKey,
        config.defuntoUltimoKey,
        ...buildDeceasedSlotKeys(config),
    ];
    const fieldIdMap = await resolveFuturiaCustomFieldIds(
        keys,
        futuriaFetch,
        existingCustomFields
    );
    return buildDeceasedCustomFieldsPayload({
        existingCustomFields,
        newDeceasedName: deceasedName,
        fieldIdMap,
        config,
    }).customFields;
}

/** Crea o aggiorna un contatto nella location Futuria configurata. Richiede autorizzazione esplicita. */
export async function upsertFuturiaContact(
    input: FuturiaUpsertContactInput,
    auth: FuturiaContactAuth
): Promise<string> {
    const locationId = getFuturiaLocationId();
    if (!locationId) throw new FuturiaApiError('FUTURIA_LOCATION_ID mancante', 0);

    const existingContact = await findFuturiaDuplicateContact({
        phone: input.phone,
        email: input.email,
    });

    await assertFuturiaContactAllowed(auth, existingContact);

    let customFields: FuturiaCustomFieldWrite[] = [];
    if (input.deceasedName?.trim()) {
        customFields = await prepareDeceasedCustomFieldsForUpsert(
            existingContact?.customFields,
            input.deceasedName
        );
        if (process.env.FUTURIA_DEBUG === '1') {
            console.info('[futuria-contact] customFields upsert:', JSON.stringify(customFields));
        }
    }

    if (input.additionalCustomFields) {
        const additionalKeys = Object.keys(input.additionalCustomFields);
        const resolvedIds = await resolveFuturiaCustomFieldIds(
            additionalKeys,
            futuriaFetch,
            existingContact?.customFields
        );
        for (const [key, value] of Object.entries(input.additionalCustomFields)) {
            if (value === undefined || value === null) continue;
            const existingId = resolvedIds[key] || readFuturiaCustomFieldId(existingContact?.customFields, key);
            // Evita duplicati di chiavi
            customFields = customFields.filter(f => f.key.toLowerCase() !== key.toLowerCase());
            customFields.push({
                ...(existingId ? { id: existingId } : {}),
                key,
                field_value: String(value)
            });
        }
    }

    const nameParts = splitFullName(input.name);
    const body: Record<string, unknown> = {
        locationId,
        ...(input.email ? { email: input.email.trim().toLowerCase() } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.firstName || nameParts.firstName
            ? { firstName: input.firstName || nameParts.firstName }
            : {}),
        ...(input.lastName || nameParts.lastName
            ? { lastName: input.lastName || nameParts.lastName }
            : {}),
        ...(mergeContactTags(existingContact?.tags, input.tags)
            ? { tags: mergeContactTags(existingContact?.tags, input.tags) }
            : {}),
        ...(customFields?.length ? { customFields } : {}),
    };

    const data = await futuriaFetch<{ contact?: { id?: string }; id?: string }>(
        '/contacts/upsert',
        { method: 'POST', body: JSON.stringify(body) }
    );

    const contactId = data.contact?.id || data.id;
    if (!contactId) {
        throw new FuturiaApiError('Upsert contatto Futuria senza contactId in risposta', 200);
    }
    return contactId;
}

/** Aggiorna un contatto Futuria esistente per id (es. cambio email Caso B). */
export async function updateFuturiaContactById(
    contactId: string,
    input: Pick<FuturiaUpsertContactInput, 'email' | 'phone' | 'name'>
): Promise<void> {
    if (!contactId?.trim()) {
        throw new FuturiaApiError('contactId mancante per update Futuria', 0);
    }

    const nameParts = splitFullName(input.name);
    const body: Record<string, unknown> = {
        ...(input.email ? { email: input.email.trim().toLowerCase() } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(nameParts.firstName || input.name
            ? { firstName: nameParts.firstName || input.name?.trim() }
            : {}),
        ...(nameParts.lastName ? { lastName: nameParts.lastName } : {}),
    };

    if (Object.keys(body).length === 0) return;

    await futuriaFetch(`/contacts/${contactId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
    });
}

export async function sendFuturiaEmail(input: FuturiaSendEmailInput): Promise<{ messageId?: string }> {
    const payload: Record<string, unknown> = {
        type: 'Email',
        contactId: input.contactId,
        emailFrom: input.emailFrom,
        subject: input.subject,
        html: input.html,
        message: input.text || input.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        status: 'pending',
        ...(input.emailBcc?.length ? { emailBcc: input.emailBcc } : {}),
        ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    };

    const data = await futuriaFetch<{ messageId?: string; id?: string }>('/conversations/messages', {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    return { messageId: data.messageId || data.id };
}

export async function sendFuturiaWhatsApp(
    input: FuturiaSendWhatsAppInput
): Promise<{ messageId?: string; deliveryStatus?: string; deliveryError?: string }> {
    if (!input.templateId && !input.message?.trim() && !input.attachments?.length) {
        throw new FuturiaApiError('WhatsApp richiede message, templateId o attachments', 0);
    }

    const payload: Record<string, unknown> = {
        type: 'WhatsApp',
        contactId: input.contactId,
        ...(input.templateId ? { templateId: input.templateId } : {}),
        ...(input.message?.trim() ? { message: input.message.trim() } : {}),
        ...(input.attachments?.length ? { attachments: input.attachments } : {}),
        ...(input.toNumber ? { toNumber: input.toNumber } : {}),
    };

    const data = await futuriaFetch<{ messageId?: string; id?: string }>('/conversations/messages', {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    const messageId = data.messageId || data.id;
    if (!messageId) {
        return { messageId: undefined };
    }

    const record = await waitForFuturiaMessageStatus(messageId);
    return {
        messageId,
        deliveryStatus: record?.status,
        deliveryError: record?.error,
    };
}

/**
 * Prova invio WhatsApp con pulsante CTA URL (testo "FOTO" / "Clicca qui").
 * Futuria/GHL potrebbe non esporre l'endpoint via API — in caso di errore il chiamante fa fallback testuale.
 */
export async function sendFuturiaWhatsAppCtaUrl(
    input: FuturiaSendWhatsAppCtaInput
): Promise<{ messageId?: string; deliveryStatus?: string; deliveryError?: string }> {
    const buttonText = input.buttonText.trim().slice(0, 20) || 'FOTO';

    const payload: Record<string, unknown> = {
        type: 'WhatsApp',
        contactId: input.contactId,
        message: input.body.trim(),
        whatsapp: {
            type: 'interactive',
            interactive: {
                type: 'cta_url',
                body: { text: input.body.trim() },
                ...(input.footer?.trim() ? { footer: { text: input.footer.trim() } } : {}),
                action: {
                    name: 'cta_url',
                    parameters: {
                        display_text: buttonText,
                        url: input.url.trim(),
                    },
                },
            },
        },
    };

    const data = await futuriaFetch<{ messageId?: string; id?: string }>('/conversations/messages', {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    const messageId = data.messageId || data.id;
    if (!messageId) {
        return { messageId: undefined };
    }

    const record = await waitForFuturiaMessageStatus(messageId);
    return {
        messageId,
        deliveryStatus: record?.status,
        deliveryError: record?.error,
    };
}

export async function ensureFuturiaContactForRecipient(
    recipientEmail: string,
    displayName?: string
): Promise<string | null> {
    const existing = await findFuturiaDuplicateContact({ email: recipientEmail });
    if (!existing?.id) {
        console.warn(
            `[futuria-mail] Nessun contatto Futuria per ${recipientEmail}: email non instradata su Futuria (solo clienti paganti).`
        );
        return null;
    }
    return upsertFuturiaContact(
        {
            email: recipientEmail,
            name: displayName,
        },
        { source: 'existing_contact_update' }
    );
}

/**
 * Aggiorna un contatto Futuria già esistente (auth OTP / magic link).
 * Non crea mai nuovi contatti: ingresso cliente solo post-pagamento Stripe.
 */
export async function updateFuturiaExistingContactIfPresent(
    input: FuturiaUpsertContactInput
): Promise<string | null> {
    const existing = await findFuturiaDuplicateContact({
        phone: input.phone,
        email: input.email,
    });
    if (!existing?.id) {
        console.warn(
            '[futuria] Aggiornamento saltato: contatto assente (sincronizzazione solo post-ordine pagato).'
        );
        return null;
    }
    return upsertFuturiaContact(input, { source: 'existing_contact_update' });
}

export interface FloristSyncInput {
    shopName: string;
    ownerName: string;
    whatsappNumber: string | null;
    email?: string | null;
    pecAddress: string | null;
    order?: {
        deceasedName: string;
        cemeteryCity: string;
        gravePosition?: string | null;
        deceasedDeathDate?: Date | null;
        additionalInstructions?: string | null;
        totalPriceCents: number;
        partnerNotifyEmail?: string | null;
        items?: Array<{
            priceCents: number;
            product?: { name: string } | null;
        }> | null;
    } | null;
}

export function calculateFloristCut(order: any): number {
    const totalCustomerPrice = (order.totalPriceCents || 0) / 100;
    const COMPENSATION_MAP: Record<string, number> = {
        'Bouquet Tradizione': 32.50,
        'Corona Funebre': 97.50,
        'Cuscino Funerale': 65.00,
        'Fiori per Loculo': 26.00,
        'Lumino': 0.00,
        'Nastro': 0.00,
        'Biglietto': 0.00,
        'Cesto di Gigli': 52.00,
        'Mazzo Stagionale': 29.25
    };

    if (order.items && order.items.length > 0) {
        return order.items.reduce((sum: number, item: any) => {
            const prodName = item.product?.name || '';
            if (prodName in COMPENSATION_MAP) {
                return sum + COMPENSATION_MAP[prodName];
            }
            const itemPrice = (item.priceCents || 0) / 100;
            return sum + (itemPrice * 0.65);
        }, 0);
    }
    return totalCustomerPrice * 0.65;
}

export async function syncFloristPartnerToFuturia(input: FloristSyncInput): Promise<string | null> {
    if (!isFuturiaConfigured()) return null;
    
    const phone = normalizeFuturiaPhone(input.whatsappNumber);
    if (!phone) {
        console.warn(`[sync-florist] Telefono fiorista non valido: ${input.whatsappNumber}`);
        return null;
    }
    
    const email = input.email?.trim() || input.pecAddress || input.order?.partnerNotifyEmail || undefined;
    const name = input.shopName || input.ownerName;
    
    const tags = ['Nuovo-Fiorista'];
    
    const additionalCustomFields: Record<string, string> = {};
    
    if (input.order) {
        const costoServizio = calculateFloristCut(input.order);
        additionalCustomFields['contact.costo_servizio'] = `${costoServizio.toFixed(2)} €`;
        additionalCustomFields['contact.nome_defunto'] = input.order.deceasedName;
        additionalCustomFields['contact.comune_cimitero'] = input.order.cemeteryCity;
        additionalCustomFields['contact.posizione_tomba'] = input.order.gravePosition || 'Non specificato';
        additionalCustomFields['contact.data_decesso'] = input.order.deceasedDeathDate 
            ? new Date(input.order.deceasedDeathDate).toLocaleDateString('it-IT') 
            : 'Non specificata';
        additionalCustomFields['contact.note_logistiche'] = input.order.additionalInstructions || 'Nessuna nota';
    }
    
    return upsertFuturiaContact(
        {
            phone,
            email,
            name,
            tags,
            additionalCustomFields,
        },
        { source: 'partner_florist' }
    );
}

export { isFuturiaConfigured };
