/**
 * Analisi read-only: VERA vs interventi operator (ultimi 21 giorni).
 * npx tsx scratch/analyze-vera-vs-operator.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { PrismaClient, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const DAYS = 21;

function asMeta(raw: unknown): Record<string, string> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (v == null) continue;
        out[k] = typeof v === 'string' ? v : String(v);
    }
    return out;
}

function classifyOutbound(meta: Record<string, string>): 'operator' | 'vera_auto' | 'workflow' | 'unknown' {
    const source = (meta.source || '').toLowerCase();
    const event = meta.eventType || '';
    const mode = meta.outboundMode || '';

    if (source === 'operator' || source.includes('operator') || mode === 'freetext' && source === 'operator') {
        return 'operator';
    }
    if (
        event.includes('TEMPLATE') ||
        event === 'GIFT_VOUCHER' ||
        source.includes('punto') ||
        mode.includes('punto') ||
        mode === 'template_fallback_24h' ||
        mode.includes('template')
    ) {
        return 'workflow';
    }
    if (
        source.includes('vera') ||
        source === 'deterministic' ||
        source === 'gemini' ||
        source === 'catalog' ||
        source === 'silence' ||
        meta.outboundMode === 'freetext'
    ) {
        return 'vera_auto';
    }
    return 'unknown';
}

async function main() {
    const since = new Date();
    since.setDate(since.getDate() - DAYS);

    const sessions = await prisma.whatsAppChatSession.findMany({
        where: {
            updatedAt: { gte: since },
        },
        include: {
            messages: {
                where: { createdAt: { gte: since } },
                orderBy: { createdAt: 'asc' },
            },
        },
        orderBy: { updatedAt: 'desc' },
        take: 120,
    });

    const sourceCounts: Record<string, number> = {};
    const classCounts = { operator: 0, vera_auto: 0, workflow: 0, unknown: 0, inbound: 0 };
    const humanSessions: Array<{
        name: string;
        phone: string;
        userType: string;
        status: string;
        isTest: boolean;
        operator: number;
        vera_auto: number;
        workflow: number;
        inbound: number;
    }> = [];

    type Moment = {
        name: string;
        phone: string;
        userType: string;
        isTest: boolean;
        at: string;
        operatorBody: string;
        prevInbound?: string;
        prevAuto?: string;
        prevAutoClass?: string;
        hoursAfterPrevInbound?: number;
    };
    const moments: Moment[] = [];

    for (const s of sessions) {
        let operator = 0;
        let vera_auto = 0;
        let workflow = 0;
        let inbound = 0;

        for (const m of s.messages) {
            if (m.direction === 'INBOUND') {
                inbound++;
                classCounts.inbound++;
                continue;
            }
            const meta = asMeta(m.metadata);
            const key = meta.source || meta.eventType || meta.outboundMode || 'unknown';
            sourceCounts[key] = (sourceCounts[key] || 0) + 1;
            const cls = classifyOutbound(meta);
            classCounts[cls]++;
            if (cls === 'operator') operator++;
            if (cls === 'vera_auto') vera_auto++;
            if (cls === 'workflow') workflow++;
        }

        if (operator > 0) {
            humanSessions.push({
                name: s.name,
                phone: s.phone,
                userType: s.userType,
                status: s.status,
                isTest: s.isTest,
                operator,
                vera_auto,
                workflow,
                inbound,
            });
        }

        for (let i = 0; i < s.messages.length; i++) {
            const m = s.messages[i];
            if (m.direction !== 'OUTBOUND') continue;
            const meta = asMeta(m.metadata);
            if (classifyOutbound(meta) !== 'operator') continue;

            let prevInbound: string | undefined;
            let prevInboundAt: Date | undefined;
            let prevAuto: string | undefined;
            let prevAutoClass: string | undefined;
            for (let j = i - 1; j >= Math.max(0, i - 12); j--) {
                const p = s.messages[j];
                const pm = asMeta(p.metadata);
                if (!prevInbound && p.direction === 'INBOUND') {
                    prevInbound = p.body;
                    prevInboundAt = p.createdAt;
                }
                if (!prevAuto && p.direction === 'OUTBOUND' && classifyOutbound(pm) !== 'operator') {
                    prevAuto = p.body;
                    prevAutoClass = classifyOutbound(pm);
                }
                if (prevInbound && prevAuto) break;
            }

            moments.push({
                name: s.name,
                phone: s.phone,
                userType: s.userType,
                isTest: s.isTest,
                at: m.createdAt.toISOString(),
                operatorBody: m.body,
                prevInbound: prevInbound?.slice(0, 600),
                prevAuto: prevAuto?.slice(0, 600),
                prevAutoClass,
                hoursAfterPrevInbound: prevInboundAt
                    ? Math.round(((m.createdAt.getTime() - prevInboundAt.getTime()) / 36e5) * 10) / 10
                    : undefined,
            });
        }
    }

    // Escalation: HUMAN_INTERVENTION sessions
    const escalated = sessions.filter((s) => s.status === 'HUMAN_INTERVENTION');

    // Heuristic themes on operator replies
    const themes: Record<string, number> = {
        foto_consegna: 0,
        link_miniapp_giardino: 0,
        scusa_disguido: 0,
        conferma_orari_data: 0,
        tomba_indicazioni: 0,
        pagamento_compenso: 0,
        template_o_nuova_conversazione: 0,
        cortesia_chiusura: 0,
        correzione_dato: 0,
        altro: 0,
    };
    for (const m of moments) {
        const t = m.operatorBody.toLowerCase();
        let hit = false;
        if (/foto|photo|immagine|webp|jpeg|posa/.test(t)) {
            themes.foto_consegna++;
            hit = true;
        }
        if (/giardino|mini-app|mini app|floremoria\.com\/f\/|consegna/.test(t) && /link|http/.test(t)) {
            themes.link_miniapp_giardino++;
            hit = true;
        }
        if (/scus|dispiac|disguid|omaggio|buono|carolina10/.test(t)) {
            themes.scusa_disguido++;
            hit = true;
        }
        if (/orari|domani|oggi|luglio|agosto|consegna il|alle \d|30 luglio/.test(t)) {
            themes.conferma_orari_data++;
            hit = true;
        }
        if (/tomba|loculo|fila|campo|indicazioni|cimitero/.test(t)) {
            themes.tomba_indicazioni++;
            hit = true;
        }
        if (/compenso|€|euro|pagamento|bonifico|iban/.test(t)) {
            themes.pagamento_compenso++;
            hit = true;
        }
        if (/template|24h|finestra|nuova conversazione/.test(t)) {
            themes.template_o_nuova_conversazione++;
            hit = true;
        }
        if (/grazie|buon lavoro|a disposizione|cordiali|🌹|restiamo/.test(t) && t.length < 180) {
            themes.cortesia_chiusura++;
            hit = true;
        }
        if (/non è|corregg|anzi|errore|sbagliato|defunto|nome/.test(t)) {
            themes.correzione_dato++;
            hit = true;
        }
        if (!hit) themes.altro++;
    }

    // Pull a few full threads with most operator msgs for emblematic cases
    const topPhones = humanSessions
        .sort((a, b) => b.operator - a.operator)
        .slice(0, 12)
        .map((h) => h.phone);

    const emblematic = [];
    for (const phone of topPhones) {
        const s = sessions.find((x) => x.phone === phone);
        if (!s) continue;
        const transcript = s.messages.map((m) => {
            const meta = asMeta(m.metadata);
            return {
                at: m.createdAt.toISOString(),
                dir: m.direction,
                class: m.direction === 'INBOUND' ? 'inbound' : classifyOutbound(meta),
                source: meta.source || meta.eventType || '',
                body: m.body.slice(0, 800),
                hasMedia: Boolean(m.mediaUrl),
            };
        });
        emblematic.push({
            name: s.name,
            phone: s.phone,
            userType: s.userType,
            status: s.status,
            isTest: s.isTest,
            transcript,
        });
    }

    // Raw SQL backup: count operator vs others if metadata sparse
    const rawCounts = await prisma.$queryRaw<Array<{ bucket: string; n: bigint }>>`
      SELECT
        CASE
          WHEN direction = 'INBOUND' THEN 'inbound'
          WHEN metadata->>'source' = 'operator' THEN 'operator'
          WHEN metadata->>'eventType' IS NOT NULL THEN 'workflow_event'
          WHEN COALESCE(metadata->>'source','') ILIKE '%vera%' THEN 'vera_source'
          WHEN COALESCE(metadata->>'source','') IN ('deterministic','gemini','catalog') THEN 'vera_source'
          ELSE 'outbound_other'
        END AS bucket,
        COUNT(*)::bigint AS n
      FROM whatsapp_chat_messages
      WHERE created_at >= ${since}
      GROUP BY 1
      ORDER BY n DESC
    `;

    const report = {
        generatedAt: new Date().toISOString(),
        windowDays: DAYS,
        since: since.toISOString(),
        sessionsAnalyzed: sessions.length,
        classCounts,
        rawCounts: rawCounts.map((r) => ({ bucket: r.bucket, n: Number(r.n) })),
        sourceCounts: Object.entries(sourceCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 40),
        humanInterventionSessions: humanSessions.sort((a, b) => b.operator - a.operator),
        escalatedCount: escalated.length,
        escalatedNames: escalated.slice(0, 20).map((s) => ({
            name: s.name,
            userType: s.userType,
            isTest: s.isTest,
        })),
        operatorThemes: themes,
        operatorMoments: moments
            .filter((m) => !m.isTest)
            .sort((a, b) => b.at.localeCompare(a.at))
            .slice(0, 60),
        emblematicThreads: emblematic.filter((e) => !e.isTest).slice(0, 8),
    };

    const outPath = path.join(process.cwd(), 'scratch', 'vera-vs-operator-analysis.json');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log('Wrote', outPath);
    console.log(
        JSON.stringify(
            {
                classCounts: report.classCounts,
                rawCounts: report.rawCounts,
                humanSessions: report.humanInterventionSessions.length,
                themes: report.operatorThemes,
                topHuman: report.humanInterventionSessions.slice(0, 15),
            },
            null,
            2
        )
    );
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
