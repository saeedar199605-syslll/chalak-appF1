import { CloudflareEnv, getCookie, jsonResponse, SESSION_COOKIE, sessionCookie } from '../../../cloudflare/auth';

interface Context { request: Request; env: CloudflareEnv }

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) await env.CHALAK_DB.delete(`session:${token}`);
  return jsonResponse({ success: true }, 200, { 'Set-Cookie': sessionCookie('', 0, new URL(request.url).protocol === 'https:') });
}
