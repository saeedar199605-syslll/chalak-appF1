import {
  AuthSession,
  CloudflareEnv,
  hashPassword,
  jsonResponse,
  normalizeUsername,
  sessionCookie,
  verifyPassword,
} from '../../../cloudflare/auth';

interface Context {
  request: Request;
  env: CloudflareEnv;
  data: { session?: AuthSession };
}

type EmployeeRecord = { id: string; username?: string; code?: string };

async function readEmployees(env: CloudflareEnv): Promise<EmployeeRecord[]> {
  try {
    const raw = await env.CHALAK_DB.get('app_state');
    const state = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    return Array.isArray(state.pe_employees) ? state.pe_employees as EmployeeRecord[] : [];
  } catch {
    return [];
  }
}

async function bumpCredentialVersion(env: CloudflareEnv, username: string): Promise<number> {
  const key = `credential_version:${username}`;
  const next = Number(await env.CHALAK_DB.get(key) || '0') + 1;
  await env.CHALAK_DB.put(key, String(next));
  return next;
}

export async function onRequestGet({ env, data }: Context): Promise<Response> {
  if (data.session?.role !== 'admin') return jsonResponse({ error: 'دسترسی مدیریت لازم است.' }, 403);
  // Credential keys are authoritative. A shared read-modify-write index is
  // unsafe under overlapping requests because KV has no compare-and-swap.
  const employees = await readEmployees(env);
  const statuses = await Promise.all(employees.map(async employee => {
    const username = normalizeUsername(employee.username);
    return [username, username ? Boolean(await env.CHALAK_DB.get(`credential:${username}`)) : false] as const;
  }));
  const customUsernames = statuses.filter(([, exists]) => exists).map(([username]) => username);
  return jsonResponse({ customUsernames });
}

// Audit log entry — records every credential mutation for traceability.
interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorUsername: string;
  action: 'bulk_delete' | 'credential_create' | 'credential_delete' | 'credential_rename' | 'reset_all';
  detail: Record<string, unknown>;
  timestamp: string;
}

async function appendAuditLog(
  env: CloudflareEnv,
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
): Promise<number> {
  const logEntry: AuditLogEntry = {
    ...entry,
    id: `audit-${Date.now()}-${crypto.randomUUID()}`,
    timestamp: new Date().toISOString(),
  };
  try {
    // The unique event key is the durable record. Concurrent operations never
    // overwrite each other's audit entry even if the legacy summary races.
    await env.CHALAK_DB.put(`audit_event:${logEntry.id}`, JSON.stringify(logEntry));
  } catch { return 0; }
  try {
    const key = 'audit_log';
    const existing = await env.CHALAK_DB.get(key);
    const logs: AuditLogEntry[] = existing ? JSON.parse(existing) as AuditLogEntry[] : [];
    // Cap at 5000 entries to prevent unbounded KV growth
    const trimmed = logs.length > 5000 ? logs.slice(logs.length - 4999) : logs;
    trimmed.unshift(logEntry);
    await env.CHALAK_DB.put(key, JSON.stringify(trimmed));
    return 2;
  } catch {
    // Legacy summary is a read-modify-write cache; the unique event remains.
    return 1;
  }
}

// Bulk credential deletion — single request removes multiple user credentials.
// Prevents the request-storm that would occur from N individual DELETE calls
// when bulk-deleting employees.
//
// SEMANTICS: CONTROLLED PARTIAL SUCCESS (not atomic). Per-username successes,
// failures, skips, and duplicates are returned independently. Already-absent
// credentials are successful no-ops, making retries safe.
//
// Payload guard: maximum 1000 usernames per request to prevent abuse and
// Cloudflare Worker request-body limits.
const MAX_BULK_DELETE_USERNAMES = 1000;
async function handleBulkCredentialDelete(
  env: CloudflareEnv,
  usernames: string[],
  session: AuthSession
): Promise<{ requested: number; succeeded: string[]; failed: { username: string; reason: string }[]; skipped: { username: string; reason: string }[]; duplicate: string[]; serverMutationCount: number }> {
  // Payload size guard
  if (usernames.length > MAX_BULK_DELETE_USERNAMES) {
    return { requested: usernames.length, succeeded: [], failed: [], skipped: [{ username: '', reason: `تعداد ورودی بیش از سقف مجاز ${MAX_BULK_DELETE_USERNAMES} است.` }], duplicate: [], serverMutationCount: 0 };
  }

  // Validate every value before mutating anything. Duplicate values are
  // reported separately and malformed entries never become apparent success.
  const seen = new Set<string>();
  const rawInput: string[] = [];
  const failed: { username: string; reason: string }[] = [];
  const skipped: { username: string; reason: string }[] = [];
  const duplicate: string[] = [];
  for (let index = 0; index < usernames.length; index++) {
    const u = usernames[index];
    if (typeof u !== 'string') { failed.push({ username: `[${index}]`, reason: 'نام کاربری باید متن باشد.' }); continue; }
    const trimmed = u.trim().toLowerCase();
    if (trimmed && !/^[a-z0-9._-]{1,64}$/.test(trimmed)) { failed.push({ username: u, reason: 'قالب نام کاربری معتبر نیست.' }); continue; }
    const normalized = normalizeUsername(trimmed);
    if (!normalized) { failed.push({ username: u, reason: 'نام کاربری خالی یا نامعتبر است.' }); continue; }
    if (normalized === 'admin') { skipped.push({ username: normalized, reason: 'حساب مدیریت قابل حذف گروهی نیست.' }); continue; }
    if (seen.has(normalized)) { duplicate.push(normalized); continue; }
    seen.add(normalized);
    rawInput.push(normalized);
  }

  const employees = await readEmployees(env);
  const validUsernames = rawInput.filter(username => {
    const exists = employees.some(e => normalizeUsername(e.username) === username);
    if (!exists) skipped.push({ username, reason: 'کارمند متناظر وجود ندارد.' });
    return exists;
  });

  // KV has no transaction/CAS primitive. Per-username mutations are independent;
  // credential keys are authoritative and the legacy index is only removed.
  const succeeded: string[] = [];
  let serverMutationCount = 0;
  await Promise.all(validUsernames.map(async username => {
    try {
      const credKey = `credential:${username}`;
      const credential = await env.CHALAK_DB.get(credKey);
      if (credential !== null) {
        // Revoke extant sessions before removing the credential. If deletion
        // fails, the retained index and failure result make retry safe.
        await bumpCredentialVersion(env, username);
        serverMutationCount += 1;
        await env.CHALAK_DB.delete(credKey);
        serverMutationCount += 1;
        if (await env.CHALAK_DB.get(credKey) !== null) throw new Error('credential remained after deletion');
      }
      succeeded.push(username);
    } catch (err) {
      failed.push({ username, reason: err instanceof Error ? err.message : 'خطای نامشخص در حذف اعتبارنامه.' });
    }
  }));

  // Remove the legacy cache key. No route reads or rewrites it, so concurrent
  // requests cannot lose a username through a stale index snapshot.
  try {
    await env.CHALAK_DB.delete('credential_index');
    serverMutationCount += 1;
  } catch (err) {
    failed.push({ username: '[index]', reason: `حذف نمایه قدیمی ناموفق بود: ${err instanceof Error ? err.message : 'خطای نامشخص'}` });
  }

  // Audit log
  const auditMutationCount = await appendAuditLog(env, {
    actorId: session.id,
    actorName: session.name,
    actorUsername: session.username,
    action: 'bulk_delete',
    detail: {
      requested: usernames.length,
      validUsernames: validUsernames.length,
      succeeded: succeeded.length,
      failed: failed.length,
      skipped: skipped.length,
      duplicates: duplicate.length,
      serverMutationCountBeforeAudit: serverMutationCount,
    },
  });

  serverMutationCount += auditMutationCount;
  if (auditMutationCount === 0) failed.push({ username: '[audit]', reason: 'ثبت رویداد ممیزی ناموفق بود.' });
  succeeded.sort((a, b) => a.localeCompare(b));
  failed.sort((a, b) => a.username.localeCompare(b.username));
  skipped.sort((a, b) => a.username.localeCompare(b.username));
  return { requested: usernames.length, succeeded, failed, skipped, duplicate, serverMutationCount };
}

export async function onRequestPost({ request, env, data }: Context): Promise<Response> {
  if (data.session?.role !== 'admin') return jsonResponse({ error: 'دسترسی مدیریت لازم است.' }, 403);
  const origin = request.headers.get('Origin');
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) return jsonResponse({ error: 'مبدأ درخواست معتبر نیست.' }, 403);
    } catch { return jsonResponse({ error: 'مبدأ درخواست معتبر نیست.' }, 403); }
  }
  const declaredLength = Number(request.headers.get('Content-Length') || '0');
  if (declaredLength > 64_000) return jsonResponse({ error: 'حجم درخواست بیش از حد مجاز است.' }, 413);
  let body: { action?: unknown; username?: unknown; oldUsername?: unknown; password?: unknown; currentPassword?: unknown; usernames?: unknown };
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 64_000) return jsonResponse({ error: 'حجم درخواست بیش از حد مجاز است.' }, 413);
    body = JSON.parse(rawBody);
  }
  catch { return jsonResponse({ error: 'درخواست تغییر رمز معتبر نیست.' }, 400); }

  const employees = await readEmployees(env);

  if (body.action === 'reset_all') {
    const usernames = employees
      .map(employee => normalizeUsername(employee.username))
      .filter(username => username && username !== 'admin');
    await Promise.all(usernames.map(async username => {
      await env.CHALAK_DB.delete(`credential:${username}`);
      await bumpCredentialVersion(env, username);
    }));
    await env.CHALAK_DB.delete('credential_index');
    return jsonResponse({ success: true, resetCount: usernames.length });
  }

  if (body.action === 'bulk_delete') {
    if (!Array.isArray(body.usernames)) return jsonResponse({ error: 'فهرست نام‌های کاربری باید آرایه باشد.' }, 400);
    if (body.usernames.some(item => typeof item !== 'string')) {
      return jsonResponse({ error: 'تمام اعضای فهرست باید نام کاربری متنی باشند.' }, 400);
    }
    const usernames = body.usernames as string[];
    if (usernames.length > MAX_BULK_DELETE_USERNAMES) {
      return jsonResponse({ error: `حداکثر ${MAX_BULK_DELETE_USERNAMES} نام کاربری در هر درخواست مجاز است.`, requested: usernames.length }, 413);
    }
    const result = await handleBulkCredentialDelete(env, usernames, data.session!);
    return jsonResponse({ success: result.failed.length === 0 && result.skipped.length === 0, ...result }, result.failed.length || result.skipped.length ? 207 : 200);
  }

  if (body.action === 'rename') {
    const oldUsername = normalizeUsername(body.oldUsername);
    const newUsername = normalizeUsername(body.username);
    if (!oldUsername || !newUsername || oldUsername === 'admin' || newUsername === 'admin') {
      return jsonResponse({ error: 'نام کاربری قدیم یا جدید معتبر نیست.' }, 400);
    }
    const oldCredential = await env.CHALAK_DB.get(`credential:${oldUsername}`);
    if (oldCredential) await env.CHALAK_DB.put(`credential:${newUsername}`, oldCredential);
    await env.CHALAK_DB.delete(`credential:${oldUsername}`);
    await Promise.all([bumpCredentialVersion(env, oldUsername), bumpCredentialVersion(env, newUsername)]);
    await env.CHALAK_DB.delete('credential_index');
    return jsonResponse({ success: true, credentialMoved: Boolean(oldCredential) });
  }

  const username = normalizeUsername(body.username);
  const password = typeof body.password === 'string' ? body.password.trim() : '';
  const minimumLength = 8;
  if (!username || password.length < minimumLength || password.length > 256) {
    return jsonResponse({ error: `کلمه عبور باید بین ${minimumLength} تا ۲۵۶ نویسه باشد.` }, 400);
  }

  if (username === 'admin') {
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const stored = await env.CHALAK_DB.get('credential:admin');
    if (!stored && !env.ADMIN_PASSWORD) {
      return jsonResponse({ error: 'متغیر امن ADMIN_PASSWORD در Cloudflare تنظیم نشده است.' }, 503);
    }
    const currentValid = stored
      ? await verifyPassword(currentPassword, stored)
      : currentPassword === env.ADMIN_PASSWORD;
    if (!currentValid) return jsonResponse({ error: 'کلمه عبور فعلی مدیریت نادرست است.' }, 401);
  } else if (!employees.some(employee => normalizeUsername(employee.username) === username)) {
    return jsonResponse({ error: 'کاربر مورد نظر در پایگاه داده وجود ندارد.' }, 404);
  }

  await env.CHALAK_DB.put(`credential:${username}`, await hashPassword(password));
  await bumpCredentialVersion(env, username);
  await env.CHALAK_DB.delete('credential_index');
  if (username === 'admin') {
    return jsonResponse(
      { success: true, reauthenticationRequired: true },
      200,
      { 'Set-Cookie': sessionCookie('', 0, new URL(request.url).protocol === 'https:') }
    );
  }
  return jsonResponse({ success: true });
}

export async function onRequestDelete({ request, env, data }: Context): Promise<Response> {
  if (data.session?.role !== 'admin') return jsonResponse({ error: 'دسترسی مدیریت لازم است.' }, 403);
  let body: { username?: unknown };
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'درخواست بازنشانی رمز معتبر نیست.' }, 400); }
  const username = normalizeUsername(body.username);
  if (!username || username === 'admin') return jsonResponse({ error: 'حساب مورد نظر قابل بازنشانی نیست.' }, 400);
  const employees = await readEmployees(env);
  if (!employees.some(employee => normalizeUsername(employee.username) === username)) {
    return jsonResponse({ error: 'کاربر مورد نظر در پایگاه داده وجود ندارد.' }, 404);
  }
  await env.CHALAK_DB.delete(`credential:${username}`);
  await bumpCredentialVersion(env, username);
  await env.CHALAK_DB.delete('credential_index');
  return jsonResponse({ success: true });
}

export function onRequest(): Response {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST, DELETE' });
}
