import { CloudflareEnv, jsonResponse } from '../../cloudflare/auth';

interface Context { env: CloudflareEnv }

export async function onRequestGet({ env }: Context): Promise<Response> {
  if (!env.CHALAK_DB) {
    return jsonResponse({ status: 'error', storage: 'unconfigured', error: 'CHALAK_DB binding is missing.' }, 503);
  }
  try {
    const meta = await env.CHALAK_DB.get('app_state_meta');
    let revision = 0;
    try { revision = Number(meta ? JSON.parse(meta).revision : 0) || 0; } catch { revision = 0; }
    return jsonResponse({
      status: 'ok',
      runtime: 'cloudflare-pages',
      storage: 'workers-kv',
      storageConfigured: true,
      revision,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return jsonResponse({ status: 'error', storage: 'workers-kv', storageConfigured: false }, 503);
  }
}

export function onRequest(): Response {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
}
