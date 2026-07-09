import { getSessionRoleName } from '@/lib/superAdminAuth';
import { isDashboardAdminRole } from '@/lib/superAdmin';

export async function requireWhatsAppMediaAccess(): Promise<
    { ok: true; role: string } | { ok: false; status: 401 | 403 }
> {
    const role = await getSessionRoleName();
    if (!role) {
        return { ok: false, status: 401 };
    }
    if (!isDashboardAdminRole(role)) {
        return { ok: false, status: 403 };
    }
    return { ok: true, role };
}

export function extensionForMimeType(mimeType: string): string {
    const normalized = mimeType.toLowerCase();
    if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
    if (normalized.includes('png')) return 'png';
    if (normalized.includes('webp')) return 'webp';
    if (normalized.includes('gif')) return 'gif';
    if (normalized.includes('pdf')) return 'pdf';
    if (normalized.includes('mp4')) return 'mp4';
    if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
    if (normalized.includes('ogg')) return 'ogg';
    return 'bin';
}

export async function fetchWhatsAppMediaFromMeta(mediaId: string): Promise<{
    buffer: ArrayBuffer;
    mimeType: string;
}> {
    const apiKey = process.env.WHATSAPP_CLOUD_API_KEY?.trim();
    if (!apiKey) {
        throw new Error('WHATSAPP_CLOUD_API_KEY not configured');
    }

    const metaUrl = `https://graph.facebook.com/v21.0/${mediaId}`;
    const metaRes = await fetch(metaUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!metaRes.ok) {
        throw new Error(`metadata_fetch_failed:${metaRes.status}`);
    }

    const metadata = (await metaRes.json()) as { url?: string };
    const downloadUrl = metadata.url?.trim();
    if (!downloadUrl) {
        throw new Error('media_url_missing');
    }

    const mediaRes = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!mediaRes.ok) {
        throw new Error(`media_download_failed:${mediaRes.status}`);
    }

    const mimeType = mediaRes.headers.get('content-type') || 'application/octet-stream';
    const buffer = await mediaRes.arrayBuffer();
    return { buffer, mimeType };
}

export function buildWhatsAppMediaResponse(
    buffer: ArrayBuffer,
    mimeType: string,
    mediaId: string,
    download: boolean
): Response {
    const extension = extensionForMimeType(mimeType);
    const filename = `floremoria-whatsapp-${mediaId}.${extension}`;
    const headers: Record<string, string> = {
        'Content-Type': mimeType,
        'Cache-Control': 'private, max-age=86400',
    };

    if (download) {
        headers['Content-Disposition'] = `attachment; filename="${filename}"`;
    } else {
        headers['Content-Disposition'] = `inline; filename="${filename}"`;
    }

    return new Response(buffer, { headers });
}
