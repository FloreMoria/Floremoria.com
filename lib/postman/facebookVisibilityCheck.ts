/**
 * Diagnostica visibilità post Facebook Page.
 * I post pubblicati da un'app Meta in Development Mode risultano is_published=true
 * e privacy EVERYONE via Graph, ma il permalink pubblico risponde
 * "Questo contenuto non è al momento disponibile".
 */
const META_GRAPH_VERSION = 'v21.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export type FacebookVisibilityDiagnosis = {
  ok: boolean;
  pageId: string | null;
  pageName: string | null;
  tokenAppId: string | null;
  envMetaAppId: string | null;
  appIdMismatch: boolean;
  envAppDeletedOrInvalid: boolean;
  samplePostId: string | null;
  samplePermalink: string | null;
  graphSaysPublished: boolean | null;
  graphPrivacy: string | null;
  publicPermalinkLikelyBroken: boolean;
  recommendations: string[];
};

async function metaGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${META_GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok || payload.error) {
    throw new Error(payload.error?.message || `Meta GET ${path} failed (${res.status})`);
  }
  return payload;
}

export async function diagnoseFacebookPostVisibility(): Promise<FacebookVisibilityDiagnosis> {
  const recommendations: string[] = [];
  const userToken = process.env.META_ACCESS_TOKEN?.trim() || null;
  const pageId = process.env.FB_PAGE_ID?.trim() || null;
  const envMetaAppId = process.env.META_APP_ID?.trim() || null;

  if (!userToken || !pageId) {
    return {
      ok: false,
      pageId,
      pageName: null,
      tokenAppId: null,
      envMetaAppId,
      appIdMismatch: false,
      envAppDeletedOrInvalid: false,
      samplePostId: null,
      samplePermalink: null,
      graphSaysPublished: null,
      graphPrivacy: null,
      publicPermalinkLikelyBroken: true,
      recommendations: ['Configura META_ACCESS_TOKEN e FB_PAGE_ID.'],
    };
  }

  let tokenAppId: string | null = null;
  try {
    const dbg = await metaGet<{ data?: { app_id?: string } }>(
      `/debug_token?input_token=${encodeURIComponent(userToken)}`,
      userToken
    );
    tokenAppId = dbg.data?.app_id || null;
  } catch {
    recommendations.push('Impossibile fare debug_token sul META_ACCESS_TOKEN.');
  }

  const appIdMismatch = Boolean(envMetaAppId && tokenAppId && envMetaAppId !== tokenAppId);
  if (appIdMismatch) {
    recommendations.push(
      `META_APP_ID (${envMetaAppId}) ≠ app del token (${tokenAppId}). Allinea env Vercel all'app che pubblica davvero.`
    );
  }

  let envAppDeletedOrInvalid = false;
  if (envMetaAppId && process.env.META_APP_SECRET?.trim()) {
    const appToken = `${envMetaAppId}|${process.env.META_APP_SECRET.trim()}`;
    try {
      await metaGet<{ id?: string }>(`/${envMetaAppId}?fields=id,name`, appToken);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/deleted|Invalid OAuth|validating application/i.test(msg)) {
        envAppDeletedOrInvalid = true;
        recommendations.push(
          'META_APP_ID/META_APP_SECRET puntano a un’app eliminata o invalida. Aggiorna i secret con l’app Live "FloreMoria Social Media Dept.".'
        );
      }
    }
  }

  const page = await metaGet<{ name?: string; access_token?: string }>(
    `/${pageId}?fields=name,access_token`,
    userToken
  );
  const pageToken = page.access_token || userToken;

  const posts = await metaGet<{
    data?: Array<{
      id: string;
      permalink_url?: string;
      is_published?: boolean;
      privacy?: { value?: string };
      application?: { id?: string; name?: string };
    }>;
  }>(
    `/${pageId}/posts?fields=id,permalink_url,is_published,privacy,application&limit=5`,
    pageToken
  );

  const apiPost =
    posts.data?.find((p) => p.application?.id) || posts.data?.[0] || null;

  const samplePermalink = apiPost?.permalink_url || null;
  let publicPermalinkLikelyBroken = false;
  if (samplePermalink) {
    try {
      const res = await fetch(samplePermalink, {
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      const html = await res.text();
      publicPermalinkLikelyBroken =
        /Questo contenuto non è al momento disponibile|This content isn't available/i.test(
          html
        );
    } catch {
      publicPermalinkLikelyBroken = true;
    }
  }

  if (publicPermalinkLikelyBroken) {
    recommendations.push(
      'Permalink pubblici non accessibili: tipico di app Meta in Development Mode. Su developers.facebook.com passa l’app a Live e richiedi Advanced Access per pages_manage_posts.'
    );
    recommendations.push(
      'Finché l’app non è Live, Graph può dire published + EVERYONE ma solo admin/tester vedono i post.'
    );
  }

  if (apiPost?.application?.id && !publicPermalinkLikelyBroken) {
    recommendations.push('Permalink campione accessibile: pubblicazione Facebook OK.');
  }

  return {
    ok: !publicPermalinkLikelyBroken && !envAppDeletedOrInvalid,
    pageId,
    pageName: page.name || null,
    tokenAppId,
    envMetaAppId,
    appIdMismatch,
    envAppDeletedOrInvalid,
    samplePostId: apiPost?.id || null,
    samplePermalink,
    graphSaysPublished: apiPost?.is_published ?? null,
    graphPrivacy: apiPost?.privacy?.value || null,
    publicPermalinkLikelyBroken,
    recommendations,
  };
}
