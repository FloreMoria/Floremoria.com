/**
 * Diagnostics Endpoint per VERA WhatsApp System.
 * Verifica configurazione, testa connessioni, simula invio.
 * 
 * Accesso: /api/admin/vera-diagnostics
 * Richiede: Super Admin
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireSuperAdminApi } from '@/lib/superAdminAuth';
import {
    isMetaCloudConfigured,
    getWhatsAppConnectionState,
} from '@/lib/whatsapp/metaCloudApiClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DiagnosticCheckResult {
    name: string;
    status: 'ok' | 'warning' | 'error';
    message: string;
    details?: Record<string, string | number | boolean>;
}

interface VeraDiagnostics {
    timestamp: string;
    checks: DiagnosticCheckResult[];
    overallStatus: 'healthy' | 'degraded' | 'critical';
    recommendations: string[];
}

function checkEnvVar(name: string, required: boolean = true): DiagnosticCheckResult {
    const value = process.env[name]?.trim();
    const isSet = Boolean(value);

    if (!required && !isSet) {
        return {
            name: `Environment: ${name}`,
            status: 'ok',
            message: 'Optional variable not set (OK)',
        };
    }

    if (!isSet && required) {
        return {
            name: `Environment: ${name}`,
            status: 'error',
            message: `Required environment variable is missing`,
            details: { 'Set in': '.env.local or production env' },
        };
    }

    return {
        name: `Environment: ${name}`,
        status: 'ok',
        message: 'Configuration found',
        details: {
            'Length': String(value?.length || 0),
            'First chars': `${value?.slice(0, 10) || ''}...`,
        },
    };
}

async function checkMetaConnection(): Promise<DiagnosticCheckResult> {
    try {
        const state = await getWhatsAppConnectionState();
        if (!state.ok) {
            return {
                name: 'Meta Cloud API Connection',
                status: 'error',
                message: `Connection test failed: ${state.error}`,
                details: {
                    'State': state.state || 'unknown',
                    'Missing vars': (state.missingEnv || []).join(', ') || 'none',
                },
            };
        }

        return {
            name: 'Meta Cloud API Connection',
            status: 'ok',
            message: 'Connected to Meta Cloud API',
            details: {
                'Phone Number': state.displayPhoneNumber || 'N/A',
                'Provider': state.provider || 'meta_cloud',
            },
        };
    } catch (e) {
        return {
            name: 'Meta Cloud API Connection',
            status: 'error',
            message: `Connection check failed: ${e instanceof Error ? e.message : String(e)}`,
        };
    }
}

async function checkGeminiConnection(): Promise<DiagnosticCheckResult> {
    const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
    
    if (!apiKey) {
        return {
            name: 'Google Gemini API',
            status: 'error',
            message: 'GEMINI_API_KEY not configured',
            details: {
                'Impact': 'VERA will only use deterministic rules, no LLM fallback',
            },
        };
    }

    try {
        const model = process.env.POSTMAN_GEMINI_MODEL?.trim() || 'gemini-2.0-flash';
        const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(testUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
                generationConfig: { maxOutputTokens: 10 },
            }),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
            return {
                name: 'Google Gemini API',
                status: 'ok',
                message: 'Gemini API is responding',
                details: { 'Model': model },
            };
        } else if (res.status === 429) {
            return {
                name: 'Google Gemini API',
                status: 'warning',
                message: 'Gemini API quota exceeded (HTTP 429)',
                details: {
                    'Impact': 'VERA responses will be generic fallback',
                    'Recovery': 'Wait for quota reset (typically hourly)',
                },
            };
        } else {
            return {
                name: 'Google Gemini API',
                status: 'error',
                message: `Gemini API returned HTTP ${res.status}`,
                details: { 'Model': model },
            };
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
            name: 'Google Gemini API',
            status: 'error',
            message: `Connection test failed: ${msg}`,
            details: {
                'Impact': 'VERA will only use deterministic rules',
            },
        };
    }
}

function checkWebhookConfiguration(): DiagnosticCheckResult {
    const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET?.trim();
    const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();

    if (!webhookSecret && !appSecret) {
        return {
            name: 'Webhook Configuration',
            status: 'error',
            message: 'Neither WHATSAPP_WEBHOOK_SECRET nor WHATSAPP_APP_SECRET is set',
            details: {
                'Risk': 'Webhook will accept any incoming requests (INSECURE)',
            },
        };
    }

    if (!webhookSecret) {
        return {
            name: 'Webhook Configuration',
            status: 'warning',
            message: 'WHATSAPP_WEBHOOK_SECRET not set (GET verification will fail)',
            details: {
                'Impact': 'Meta webhook verification might fail',
            },
        };
    }

    if (!appSecret) {
        return {
            name: 'Webhook Configuration',
            status: 'warning',
            message: 'WHATSAPP_APP_SECRET not set (signature verification disabled)',
            details: {
                'Risk': 'Webhook accepts any POST without verification',
                'Recommendation': 'Set WHATSAPP_APP_SECRET in production',
            },
        };
    }

    return {
        name: 'Webhook Configuration',
        status: 'ok',
        message: 'Both webhook secrets are configured',
    };
}

export async function GET(request: NextRequest) {
    const denied = await requireSuperAdminApi();
    if (denied) return denied;

    const checks: DiagnosticCheckResult[] = [];

    // Environment checks
    checks.push(checkEnvVar('WHATSAPP_CLOUD_API_KEY', true));
    checks.push(checkEnvVar('WHATSAPP_PHONE_NUMBER_ID', true));
    checks.push(checkEnvVar('WHATSAPP_WEBHOOK_SECRET', true));
    checks.push(checkEnvVar('WHATSAPP_APP_SECRET', true));
    checks.push(checkEnvVar('GEMINI_API_KEY', false));
    checks.push(checkEnvVar('POSTMAN_GEMINI_MODEL', false));

    // Connection checks
    checks.push(await checkMetaConnection());
    checks.push(await checkGeminiConnection());
    checks.push(checkWebhookConfiguration());

    // Determine overall status
    const hasError = checks.some((c) => c.status === 'error');
    const hasWarning = checks.some((c) => c.status === 'warning');
    const overallStatus = hasError ? 'critical' : hasWarning ? 'degraded' : 'healthy';

    // Generate recommendations
    const recommendations: string[] = [];
    if (!isMetaCloudConfigured()) {
        recommendations.push('Configure WHATSAPP_CLOUD_API_KEY and WHATSAPP_PHONE_NUMBER_ID');
    }
    if (!process.env.GEMINI_API_KEY?.trim()) {
        recommendations.push('Add GEMINI_API_KEY for LLM responses (currently only deterministic rules)');
    }
    if (!process.env.WHATSAPP_APP_SECRET?.trim()) {
        recommendations.push('Add WHATSAPP_APP_SECRET for webhook signature verification (security)');
    }
    if (hasError) {
        recommendations.push('Fix errors above before VERA can function');
    }

    const diagnostics: VeraDiagnostics = {
        timestamp: new Date().toISOString(),
        checks,
        overallStatus,
        recommendations,
    };

    return NextResponse.json(diagnostics);
}
