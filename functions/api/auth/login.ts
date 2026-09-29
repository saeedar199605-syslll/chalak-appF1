import {
  AuthSession,
  CloudflareEnv,
  createSessionToken,
  jsonResponse,
  normalizeUsername,
  sessionCookie,
  SESSION_TTL_SECONDS,
  verifyPassword,
} from '../../../cloudflare/auth';

interface EmployeeRecord {
  id: string;
  name: string;
  username: string;
  code: string;
  role: AuthSession['role'];
  profileId?: string;
  unit?: string;
  supervisorId?: string;
  permissions?: string[];
}

interface Context { request: Request; env: CloudflareEnv }

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  if (!env.CHALAK_DB) return jsonResponse({ error: 'پایگاه داده ابری پیکربندی نشده است.' }, 503);
  if (!request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) {
    return jsonResponse({ error: 'نوع محتوای درخواست معتبر نیست.' }, 415);
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'درخواست ورود معتبر نیست.' }, 400);
  }
  const username = normalizeUsername(body.username);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password || password.length > 256) return jsonResponse({ error: 'نام کاربری یا کلمه عبور نامعتبر است.' }, 401);
  const clientAddress = (request.headers.get('CF-Connecting-IP') || 'unknown').replace(/[^a-fA-F0-9:.-]/g, '').slice(0, 64);
  const loginRateKey = `rate:login:${clientAddress}:${username}`;
  const failedAttempts = Number(await env.CHALAK_DB.get(loginRateKey) || '0');
  if (failedAttempts >= 10) {
    return jsonResponse({ error: 'تلاش‌های ورود بیش از حد مجاز است؛ ده دقیقه دیگر دوباره تلاش کنید.' }, 429, { 'Retry-After': '600' });
  }

  let employee: EmployeeRecord | undefined;
  let valid = false;
  if (username === 'admin') {
    if (!env.ADMIN_PASSWORD) return jsonResponse({ error: 'ADMIN_PASSWORD در Cloudflare تنظیم نشده است.' }, 503);
    const stored = await env.CHALAK_DB.get('credential:admin');
    valid = stored ? await verifyPassword(password, stored) : password === env.ADMIN_PASSWORD;
    employee = { id: 'emp-admin', name: 'مدیریت ارشد', username: 'admin', code: 'ADMIN-001', role: 'admin', profileId: 'prof-3', unit: 'دفتر مرکزی' };
  } else {
    const rawState = await env.CHALAK_DB.get('app_state');
    const state = rawState ? JSON.parse(rawState) as Record<string, unknown> : {};
    const employees = Array.isArray(state.pe_employees) ? state.pe_employees as EmployeeRecord[] : [];
    employee = employees.find(item => normalizeUsername(item.username) === username || String(item.code || '').toLowerCase() === username);
    if (employee && employee.role !== 'admin') {
      const lockedUsers = Array.isArray(state.pe_locked_users) ? state.pe_locked_users.map(String) : [];
      if (lockedUsers.includes(employee.id) || lockedUsers.includes(normalizeUsername(employee.username))) {
        return jsonResponse({ error: 'این حساب توسط مدیریت مسدود شده است.' }, 403);
      }
      const stored = await env.CHALAK_DB.get(`credential:${normalizeUsername(employee.username)}`);
      valid = stored ? await verifyPassword(password, stored) : password === employee.code;
    }
  }

  if (!valid || !employee) {
    await env.CHALAK_DB.put(loginRateKey, String(failedAttempts + 1), { expirationTtl: 600 });
    return jsonResponse({ error: 'نام کاربری یا کلمه عبور نامعتبر است.' }, 401);
  }
  await env.CHALAK_DB.delete(loginRateKey);
  const normalizedEmployeeUsername = normalizeUsername(employee.username);
  const authVersion = Number(await env.CHALAK_DB.get(`credential_version:${normalizedEmployeeUsername}`) || '0');
  const token = createSessionToken();
  const session: AuthSession = {
    id: employee.id,
    name: employee.name,
    username: normalizedEmployeeUsername,
    role: employee.role,
    authVersion,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };
  await env.CHALAK_DB.put(`session:${token}`, JSON.stringify(session), { expirationTtl: SESSION_TTL_SECONDS });
  return jsonResponse({ user: employee }, 200, { 'Set-Cookie': sessionCookie(token, SESSION_TTL_SECONDS, new URL(request.url).protocol === 'https:') });
}

export function onRequest(): Response {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
}
