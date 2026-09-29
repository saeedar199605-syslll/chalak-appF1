export interface KvNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface CloudflareEnv {
  CHALAK_DB: KvNamespace;
  GEMINI_API_KEY?: string;
  ADMIN_PASSWORD?: string;
}

export interface AuthSession {
  id: string;
  name: string;
  username: string;
  role: 'admin' | 'supervisor' | 'employee';
  authVersion?: number;
  expiresAt: number;
}

export const SESSION_COOKIE = 'chalak_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const encoder = new TextEncoder();

export function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export function getCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('Cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === name) {
      try {
        return decodeURIComponent(rawValue.join('='));
      } catch {
        // Malformed percent-encoding is an invalid cookie, not an auth error.
        return null;
      }
    }
  }
  return null;
}

export function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function sessionCookie(token: string, maxAge = SESSION_TTL_SECONDS, secure = true): string {
  const secureAttribute = secure ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly${secureAttribute}; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export async function readSession(request: Request, env: CloudflareEnv): Promise<AuthSession | null> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const raw = await env.CHALAK_DB.get(`session:${token}`);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as AuthSession;
    if (!session.expiresAt || session.expiresAt <= Date.now()) {
      await env.CHALAK_DB.delete(`session:${token}`);
      return null;
    }
    const currentAuthVersion = Number(await env.CHALAK_DB.get(`credential_version:${normalizeUsername(session.username)}`) || '0');
    if ((session.authVersion ?? 0) !== currentAuthVersion) {
      await env.CHALAK_DB.delete(`session:${token}`);
      return null;
    }
    if (session.username !== 'admin') {
      const rawState = await env.CHALAK_DB.get('app_state');
      const state = rawState ? JSON.parse(rawState) as Record<string, unknown> : {};
      const employees = Array.isArray(state.pe_employees) ? state.pe_employees as Array<Record<string, unknown>> : [];
      const employee = employees.find(item => String(item.id) === session.id && normalizeUsername(item.username) === session.username);
      const lockedUsers = Array.isArray(state.pe_locked_users) ? state.pe_locked_users.map(String) : [];
      if (!employee || employee.role !== session.role || lockedUsers.includes(session.id) || lockedUsers.includes(session.username)) {
        await env.CHALAK_DB.delete(`session:${token}`);
        return null;
      }
    }
    return session;
  } catch {
    await env.CHALAK_DB.delete(`session:${token}`);
    return null;
  }
}

interface PasswordRecord {
  salt: string;
  hash: string;
  iterations: number;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    256
  );
  return new Uint8Array(bits);
}

export const CURRENT_PBKDF2_ITERATIONS = 100_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt, CURRENT_PBKDF2_ITERATIONS);
  return JSON.stringify({ salt: bytesToBase64(salt), hash: bytesToBase64(hash), iterations: CURRENT_PBKDF2_ITERATIONS } satisfies PasswordRecord);
}

export async function verifyPassword(password: string, serialized: string): Promise<boolean> {
  try {
    const record = JSON.parse(serialized) as PasswordRecord;
    if (!record.salt || !record.hash || !Number.isInteger(record.iterations)) return false;
    // Cloudflare Workers KV runtime caps PBKDF2 iterations at 100000.
    // If a legacy hash used a higher count, verification cannot complete on
    // the production runtime — treat it as failed (not crash-worthy).
    if (record.iterations > CURRENT_PBKDF2_ITERATIONS) return false;
    const expected = base64ToBytes(record.hash);
    const actual = await derivePassword(password, base64ToBytes(record.salt), record.iterations);
    if (actual.length !== expected.length) return false;
    let mismatch = 0;
    for (let i = 0; i < actual.length; i += 1) mismatch |= actual[i] ^ expected[i];
    return mismatch === 0;
  } catch {
    return false;
  }
}

export function normalizeUsername(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '') : '';
}
