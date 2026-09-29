import { CloudflareEnv, jsonResponse, readSession } from '../../cloudflare/auth';

interface Context {
  request: Request;
  env: CloudflareEnv;
  data: Record<string, unknown>;
  next(): Promise<Response>;
}

export async function onRequest(context: Context): Promise<Response> {
  const path = new URL(context.request.url).pathname;
  if (path === '/api/health' || path === '/api/auth/login' || path === '/api/auth/logout') return context.next();
  if (context.request.method === 'OPTIONS') return context.next();

  if (!context.env.CHALAK_DB) return jsonResponse({ error: 'CHALAK_DB binding is not configured.' }, 503);
  const session = await readSession(context.request, context.env);
  if (!session) return jsonResponse({ error: 'Authentication required.' }, 401);
  if (path.startsWith('/api/gemini/')) {
    if (context.request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
    const contentLength = Number(context.request.headers.get('Content-Length') || '0');
    if (contentLength > 64_000) return jsonResponse({ error: 'AI request is too large.' }, 413);
    const windowKey = `rate:ai:${session.id}:${Math.floor(Date.now() / 60_000)}`;
    const currentCount = Number(await context.env.CHALAK_DB.get(windowKey) || '0');
    if (currentCount >= 20) return jsonResponse({ error: 'AI rate limit exceeded. Try again shortly.' }, 429, { 'Retry-After': '60' });
    await context.env.CHALAK_DB.put(windowKey, String(currentCount + 1), { expirationTtl: 120 });
  }
  context.data.session = session;
  return context.next();
}
