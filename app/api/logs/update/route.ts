import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { syncVerbaleToFloremoriaLog } from '@/lib/verbali/syncVerbaleToFloremoriaLog';
import { docsVerbaleRel } from '@/lib/verbali/paths';

const prisma = new PrismaClient();

const BARBARA_VERBALE_TAG =
    /^#BARBARA_VERBALE_(GIORNO|CONSOLIDATO)_(\d{4}-\d{2}-\d{2})$/;

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    const apiKeyHeader = request.headers.get('x-api-key');
    const API_KEY = process.env.FLOREMORIA_WEBHOOK_KEY;
    
    // Authorization check
    let authorized = false;
    if (API_KEY) {
      if (authHeader && authHeader.replace(/^Bearer\s/i, '') === API_KEY) {
        authorized = true;
      } else if (apiKeyHeader && apiKeyHeader === API_KEY) {
        authorized = true;
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized. Invalid or missing API Key.' }, { status: 401 });
    }

    // Process payload
    let data;
    try {
      data = await request.json();
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
    }

    const { date, agent_name, status, log_content } = data;

    if (!agent_name || !log_content) {
      return NextResponse.json(
        { error: 'Missing required fields: agent_name and log_content must be provided.' },
        { status: 400 }
      );
    }

    // Automatically craft a tag based on the agent name if not explicitly provided
    let tagString = data.tag;
    if (!tagString) {
      tagString = `#${agent_name.toUpperCase().replace(/\s+/g, '_')}`;
    }

    const barbaraMatch = tagString.match(BARBARA_VERBALE_TAG);
    if (data.upsert === true && barbaraMatch) {
      const iso = barbaraMatch[2];
      const result = await syncVerbaleToFloremoriaLog(prisma, {
        iso,
        bodyMarkdown: log_content,
        sourceRelPath:
          typeof data.source_rel === 'string' && data.source_rel.trim()
            ? data.source_rel.trim()
            : docsVerbaleRel(iso),
        keyPrompt: typeof data.key_prompt === 'string' ? data.key_prompt : undefined,
      });
      return NextResponse.json(
        {
          success: true,
          message: 'Verbale BARBARA upserted via WebHook.',
          upserted: true,
          log_id: result.id,
          action: result.action,
        },
        { status: result.action === 'created' ? 201 : 200 }
      );
    }

    // Transform payload to database fields
    const sessionDate = date ? new Date(date) : new Date();

    // Set topic to the status line provided
    const topic = status || `Update by ${agent_name}`;

    // Craft short summary from the content
    const rawText = log_content.replace(/[#*_~`\[\]]/g, ''); // Crude markdown strip
    const shortSummary = rawText.length > 200 ? rawText.slice(0, 197) + '...' : rawText;

    // Use the parsed structured format if the user passed sections, 
    // otherwise dump everything into "discussedPoints".
    const logData: any = {
      sessionDate,
      tag: tagString,
      topic: topic,
      shortSummary: shortSummary,
      fullText: log_content,
      discussedPoints: log_content,
      achievedResults: data.achieved_results || null,
      pendingTasks: data.pending_tasks || null,
      criticalAlarms: data.critical_alarms || null,
      keyPrompt: data.key_prompt || null,
    };

    // Store in DB
    const newLog = await prisma.floremoriaLog.create({
      data: logData,
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Log successfully ingested via WebHook.',
      log_id: newLog.id
    }, { status: 201 });

  } catch (error) {
    console.error('API /api/logs/update Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
